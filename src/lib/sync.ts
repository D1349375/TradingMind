import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import {
  getClosedPnl,
  type BybitCredentials,
  type ClosedPnlItem,
} from "@/lib/bybit";

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

export async function syncBybitTrades(userId: string): Promise<SyncResult> {
  const conn = await prisma.bybitConnection.findUnique({
    where: { userId },
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
    // bybitOrderId 有 unique 約束,重跑同步不會產生重複紀錄
    const existing = await prisma.trade.findUnique({
      where: { bybitOrderId: item.orderId },
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
        bybitOrderId: item.orderId,
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

  await prisma.bybitConnection.update({
    where: { userId },
    data: { lastSyncedAt: new Date() },
  });

  return { fetched: items.length, created, skipped, pages };
}
