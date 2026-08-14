import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcRMultiple } from "@/lib/r-multiple";

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
