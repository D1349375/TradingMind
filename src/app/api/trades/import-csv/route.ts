import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseBybitCsv } from "@/lib/bybit-csv";

const CLOSE_TOLERANCE = 0.005; // 浮點/CSV 轉出時的四捨五入誤差容許範圍

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: { csvText?: unknown; utcOffsetMinutes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  if (typeof body.csvText !== "string" || !body.csvText.trim()) {
    return NextResponse.json({ error: "沒有收到 CSV 內容" }, { status: 400 });
  }
  const utcOffsetMinutes = typeof body.utcOffsetMinutes === "number" ? body.utcOffsetMinutes : 0;

  const { rows, errors } = parseBybitCsv(body.csvText, utcOffsetMinutes);

  let imported = 0;
  let skippedDuplicates = 0;

  for (const row of rows) {
    // CSV 沒有唯一訂單 ID(跟 API 同步的 bybitOrderId 不一樣),用「同商品+
    // 同平倉時間+進出場價+損益都吻合」判斷是不是已經匯入過(或已經被 API
    // 同步過)——見 lib/bybit-csv.ts 開頭說明。
    const candidates = await prisma.trade.findMany({
      where: { userId: user.id, symbol: row.symbol, closedAt: row.closedAt },
      select: { entryPrice: true, exitPrice: true, realizedPnl: true },
    });
    const isDuplicate = candidates.some(
      (c) =>
        Math.abs(Number(c.entryPrice) - row.entryPrice) < CLOSE_TOLERANCE &&
        Math.abs(Number(c.exitPrice ?? 0) - row.exitPrice) < CLOSE_TOLERANCE &&
        Math.abs(Number(c.realizedPnl ?? 0) - row.realizedPnl) < CLOSE_TOLERANCE,
    );
    if (isDuplicate) {
      skippedDuplicates++;
      continue;
    }

    await prisma.trade.create({
      data: {
        userId: user.id,
        symbol: row.symbol,
        direction: row.direction,
        entryPrice: row.entryPrice,
        exitPrice: row.exitPrice,
        positionSize: row.positionSize,
        fee: row.fee,
        realizedPnl: row.realizedPnl,
        closedAt: row.closedAt,
        source: "CSV_IMPORT",
      },
    });
    imported++;
  }

  return NextResponse.json({ imported, skippedDuplicates, errors });
}
