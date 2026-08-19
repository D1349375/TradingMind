import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedAccount } from "@/lib/accounts";
import { prisma } from "@/lib/prisma";
import { calcRMultiple } from "@/lib/r-multiple";
import { canStoreMoreTrades, FREE_STORED_TRADES } from "@/lib/tier-limits";

const DIRECTIONS = ["LONG", "SHORT"];

function requiredNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 手動新增交易。只收「已平倉」的交易——app 其他地方(統計/日曆/分析)
// 全部以已實現損益為準,還沒建立「未平倉部位」這個概念,不要在這裡先開一個
// 半套的口子,之後真的要做未平倉追蹤時再整體設計。
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  // FREE 方案的儲存上限(見 lib/tier-limits.ts)——這裡擋的是手動新增,
  // 不是交易所自動同步,同步一律照常寫入不受這個限制。
  if (!(await canStoreMoreTrades(user.id, user.subscriptionTier, 1))) {
    return NextResponse.json(
      { error: `FREE 方案最多能儲存 ${FREE_STORED_TRADES} 筆交易,升級訂閱方案即可繼續新增` },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const direction = body.direction as string;
  const entryPrice = requiredNum(body.entryPrice);
  const positionSize = requiredNum(body.positionSize);
  const realizedPnl = requiredNum(body.realizedPnl);
  const closedAt = typeof body.closedAt === "string" ? new Date(body.closedAt) : null;

  if (!symbol) {
    return NextResponse.json({ error: "商品名稱不能空白" }, { status: 400 });
  }
  if (!DIRECTIONS.includes(direction)) {
    return NextResponse.json({ error: "交易方向只能是 LONG 或 SHORT" }, { status: 400 });
  }
  if (entryPrice === null || entryPrice <= 0) {
    return NextResponse.json({ error: "入場價必須是正數" }, { status: 400 });
  }
  if (positionSize === null || positionSize <= 0) {
    return NextResponse.json({ error: "倉位大小必須是正數" }, { status: 400 });
  }
  if (!closedAt || Number.isNaN(closedAt.getTime())) {
    return NextResponse.json({ error: "平倉時間不能空白" }, { status: 400 });
  }
  if (realizedPnl === null) {
    return NextResponse.json({ error: "已實現損益不能空白" }, { status: 400 });
  }
  const stopLossPrice = requiredNum(body.stopLossPrice);
  if (stopLossPrice === null || stopLossPrice <= 0) {
    return NextResponse.json({ error: "止損價必須是正數" }, { status: 400 });
  }

  // 只有 1 個帳戶模板時自動歸戶,不用使用者選;超過 1 個模板時前端會顯示
  // 選擇器並帶 accountId 過來,這裡驗證擁有權。
  let accountId: string | null = null;
  if (typeof body.accountId === "string" && body.accountId) {
    const owned = await getOwnedAccount(user.id, body.accountId);
    if (!owned) {
      return NextResponse.json({ error: "找不到這個帳戶模板" }, { status: 404 });
    }
    accountId = owned.id;
  } else {
    const accounts = await prisma.tradingAccount.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    if (accounts.length === 1) accountId = accounts[0].id;
  }

  const openedAtRaw = typeof body.openedAt === "string" ? body.openedAt : "";
  const openedAt = openedAtRaw ? new Date(openedAtRaw) : null;
  const exitPrice = requiredNum(body.exitPrice);
  const takeProfitPrice = requiredNum(body.takeProfitPrice);
  const leverage = requiredNum(body.leverage);
  const fee = requiredNum(body.fee) ?? 0;
  const rMultiple = calcRMultiple(
    direction as "LONG" | "SHORT",
    entryPrice,
    exitPrice,
    stopLossPrice,
  );

  const trade = await prisma.trade.create({
    data: {
      userId: user.id,
      accountId,
      symbol,
      direction: direction as "LONG" | "SHORT",
      entryPrice,
      positionSize,
      closedAt,
      realizedPnl,
      openedAt: openedAt && !Number.isNaN(openedAt.getTime()) ? openedAt : null,
      exitPrice,
      stopLossPrice,
      takeProfitPrice,
      rMultiple,
      leverage,
      fee,
      source: "MANUAL",
    },
  });

  return NextResponse.json({ trade });
}
