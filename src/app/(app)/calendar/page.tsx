import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CalendarView, type CalTrade } from "@/components/calendar/calendar-view";

export const metadata: Metadata = {
  title: "日曆視圖 · TradeMind",
};

export default async function CalendarPage() {
  const user = await getCurrentUser();

  const rows = await prisma.trade.findMany({
    where: { userId: user!.id },
    select: {
      id: true,
      symbol: true,
      direction: true,
      closedAt: true,
      realizedPnl: true,
    },
    orderBy: { closedAt: "asc" },
  });

  const trades: CalTrade[] = rows.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    direction: t.direction,
    closedAt: t.closedAt?.toISOString() ?? null,
    realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
  }));

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">日曆視圖</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            每日盈虧一覽 · 點日期看當天交易
          </p>
        </div>
        <CalendarView trades={trades} />
      </div>
    </div>
  );
}
