import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import {
  getClosedPnl,
  type BybitCredentials,
  type ClosedPnlItem,
} from "@/lib/bybit";
import {
  getClosedPositionsHistory,
  type OkxCredentials,
  type ClosedPositionItem,
} from "@/lib/okx";

// Bybit closed-pnl 單次查詢區間上限 7 天(endTime - startTime <= 7 days)。
// 目前只同步最近 7 天把管線跑通;回補更長歷史要以 7 天為單位往前切,
// 那是之後的獨立功能,不在這裡硬塞。
const SYNC_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 100;
const MAX_PAGES = 20; // 防止 cursor 異常導致無限迴圈

export type SyncResult = {
  fetched: number; // 從 Bybit 取回幾筆
  created: number; // 實際新增幾筆
  skipped: number; // 已存在而跳過幾筆
  pages: number;
};

// side 是平倉委託方向,要反過來才是持倉方向(見 bybit.ts 的註解)
function toDirection(side: string): "LONG" | "SHORT" {
  return side === "Sell" ? "LONG" : "SHORT";
}

// Bybit 回傳的數字都是字串,空字串/undefined 要當成 null 而不是 0——
// 0 會讓之後的統計把「沒有資料」誤算成「數值是零」。
function toDecimal(value: string | undefined): Prisma.Decimal | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(value);
}

function toDecimalOrZero(value: string | undefined): Prisma.Decimal {
  return toDecimal(value) ?? new Prisma.Decimal(0);
}

// 依連線的 provider 分派到對應交易所的同步邏輯——每家交易所的 API 形狀
// 差太多(Bybit cursor 分頁 vs OKX before/after、side需反轉 vs
// direction直接可用、closedPnl vs pnl語意),不勉強套同一份程式碼,
// 只共用 ExchangeConnection 這張表跟這支 dispatcher。
export async function syncExchangeTrades(
  accountId: string,
  userId: string,
): Promise<SyncResult> {
  const conn = await prisma.exchangeConnection.findUnique({ where: { accountId } });
  if (!conn) {
    throw new Error("尚未連接交易所,請先到設定頁完成連線");
  }
  if (conn.provider === "OKX") {
    return syncOkxTrades(accountId, userId);
  }
  return syncBybitTrades(accountId, userId);
}

async function syncBybitTrades(
  accountId: string,
  userId: string,
): Promise<SyncResult> {
  const conn = await prisma.exchangeConnection.findUnique({
    where: { accountId },
  });
  if (!conn) {
    throw new Error("尚未連接 Bybit,請先到設定頁完成連線");
  }

  const creds: BybitCredentials = {
    apiKey: decrypt(conn.apiKeyCipher),
    apiSecret: decrypt(conn.apiSecretCipher),
  };

  const endTime = Date.now();
  const startTime = endTime - SYNC_WINDOW_MS;

  const items: ClosedPnlItem[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const page = await getClosedPnl(creds, {
      category: "linear",
      startTime,
      endTime,
      limit: PAGE_LIMIT,
      cursor,
    });
    items.push(...(page.list ?? []));
    cursor = page.nextPageCursor || undefined;
    pages += 1;
  } while (cursor && pages < MAX_PAGES);

  let created = 0;
  let skipped = 0;

  for (const item of items) {
    // exchangeOrderId 有 unique 約束,重跑同步不會產生重複紀錄
    const existing = await prisma.trade.findUnique({
      where: { exchangeOrderId: item.orderId },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const openFee = toDecimalOrZero(item.openFee);
    const closeFee = toDecimalOrZero(item.closeFee);

    await prisma.trade.create({
      data: {
        userId,
        accountId,
        exchangeOrderId: item.orderId,
        source: "BYBIT_SYNC",
        symbol: item.symbol,
        direction: toDirection(item.side),
        // 不要把 createdTime 當開倉時間——實測那是「平倉委託建立時間」
        // (市價平倉時與 updatedTime 只差幾毫秒),詳見 schema.prisma 的說明。
        openedAt: null,
        closedAt: new Date(Number(item.updatedTime)),
        entryPrice: toDecimalOrZero(item.avgEntryPrice),
        exitPrice: toDecimal(item.avgExitPrice),
        positionSize: toDecimalOrZero(item.qty),
        leverage: toDecimal(item.leverage),
        // 規劃書 4.2 的「手續費」定義是開倉+平倉合計
        fee: openFee.plus(closeFee),
        realizedPnl: toDecimal(item.closedPnl),
      },
    });
    created += 1;
  }

  await prisma.exchangeConnection.update({
    where: { accountId },
    data: { lastSyncedAt: new Date() },
  });

  return { fetched: items.length, created, skipped, pages };
}

// OKX closed-positions 分頁是 before/after cursor(用 posId),不是 Bybit
// 那種 nextPageCursor token。單次查詢範圍官方文件是近 3 個月,同步窗口先
// 跟 Bybit 一樣抓最近 7 天,把管線跑通,回補更長歷史留給之後的獨立功能。
async function syncOkxTrades(accountId: string, userId: string): Promise<SyncResult> {
  const conn = await prisma.exchangeConnection.findUnique({ where: { accountId } });
  if (!conn) {
    throw new Error("尚未連接 OKX,請先到設定頁完成連線");
  }
  if (!conn.apiPassphraseCipher) {
    throw new Error("這組 OKX 連線缺少 Passphrase,請重新連接");
  }

  const creds: OkxCredentials = {
    apiKey: decrypt(conn.apiKeyCipher),
    apiSecret: decrypt(conn.apiSecretCipher),
    passphrase: decrypt(conn.apiPassphraseCipher),
  };

  const cutoff = Date.now() - SYNC_WINDOW_MS;
  const items: ClosedPositionItem[] = [];
  let after: string | undefined;
  let pages = 0;

  do {
    const page = await getClosedPositionsHistory(creds, {
      instType: "SWAP",
      limit: PAGE_LIMIT,
      after,
    });
    if (page.length === 0) break;
    items.push(...page);
    // 拿到比同步窗口更舊的資料就停止翻頁,不用抓滿整個歷史
    const oldestInPage = Math.min(...page.map((p) => Number(p.uTime)));
    after = page[page.length - 1]?.posId;
    pages += 1;
    if (oldestInPage < cutoff) break;
  } while (after && pages < MAX_PAGES);

  const inWindow = items.filter((item) => Number(item.uTime) >= cutoff);

  let created = 0;
  let skipped = 0;

  for (const item of inWindow) {
    const existing = await prisma.trade.findUnique({
      where: { exchangeOrderId: item.posId },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.trade.create({
      data: {
        userId,
        accountId,
        exchangeOrderId: item.posId,
        source: "OKX_SYNC",
        symbol: item.instId,
        // OKX direction 直接就是持倉方向("long"/"short"),不像 Bybit
        // 的 side 是平倉委託方向需要反轉。
        direction: item.direction === "long" ? "LONG" : "SHORT",
        // ⚠️ 未用真實成交資料驗證過(測試帳號沒有真的已平倉部位)——OKX
        // 這支端點回的是「部位」物件不是「委託單」物件,cTime/uTime 語意上
        // 應該就是建倉/平倉時間,跟 Bybit 當初 createdTime 其實是平倉委託
        // 建立時間(不是開倉時間)那個坑是不同資料模型,但沒有真實資料
        // 交叉比對過就不能完全確定。等有真實 OKX 交易資料時,應該比照
        // Bybit 當初的做法(對照 /v5/execution/list 等價的
        // /api/v5/trade/fills-history)驗證一次,驗證前這裡先照文件字面
        // 意思填,不要當成已驗證的事實。
        openedAt: new Date(Number(item.cTime)),
        closedAt: new Date(Number(item.uTime)),
        entryPrice: toDecimalOrZero(item.openAvgPx),
        exitPrice: toDecimal(item.closeAvgPx),
        positionSize: toDecimalOrZero(item.closeTotalPos),
        leverage: toDecimal(item.lever),
        // OKX fee 通常回傳負值(扣款),存進 Trade.fee 前取絕對值,
        // 跟 Bybit openFee/closeFee 兩者都是正值、規劃書 4.2「手續費」
        // 定義為正數金額的慣例一致。
        fee: toDecimalOrZero(item.fee).abs(),
        fundingFee: toDecimal(item.fundingFee),
        // 用 pnl(已扣fee+fundingFee的最終淨損益),不是 realizedPnl
        // (那是只看價格變動的毛損益)——見 lib/okx.ts 的欄位說明。
        realizedPnl: toDecimal(item.pnl),
      },
    });
    created += 1;
  }

  await prisma.exchangeConnection.update({
    where: { accountId },
    data: { lastSyncedAt: new Date() },
  });

  return { fetched: inWindow.length, created, skipped, pages };
}
