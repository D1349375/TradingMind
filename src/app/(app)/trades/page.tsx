import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TradesView, type TradeDto } from "@/components/trades/trades-view";

export const metadata: Metadata = {
  title: "交易記錄 · TradeMind",
};

export default async function TradesPage() {
  const user = await getCurrentUser();

  // 目前一次載入全部。筆數變多之後要改成分頁或虛擬捲動,
  // 現階段(數十筆)這樣最單純。
  const rows = await prisma.trade.findMany({
    where: { userId: user!.id },
    orderBy: { closedAt: "desc" },
  });

  // Decimal 與 Date 不能直接傳給 client component,轉成字串
  const trades: TradeDto[] = rows.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    direction: t.direction,
    openedAt: t.openedAt?.toISOString() ?? null,
    closedAt: t.closedAt?.toISOString() ?? null,
    entryPrice: t.entryPrice.toString(),
    exitPrice: t.exitPrice?.toString() ?? null,
    positionSize: t.positionSize.toString(),
    leverage: t.leverage?.toString() ?? null,
    fee: t.fee.toString(),
    realizedPnl: t.realizedPnl?.toString() ?? null,
    rMultiple: t.rMultiple?.toString() ?? null,
    grade: t.grade,
    reflectionNote: t.reflectionNote,
    source: t.source,
  }));

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[1.4rem] font-semibold">交易記錄</h1>
            <p className="mt-0.5 text-[0.84rem] text-text-secondary">
              自動同步 + 手動補充欄位 · 共 {trades.length} 筆
            </p>
          </div>
        </div>
        <TradesView trades={trades} />
      </div>
    </div>
  );
}
