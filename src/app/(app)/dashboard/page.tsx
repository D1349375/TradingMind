import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import type { NamedTradePoint } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Dashboard · TradeMind",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const [rows, conn, goal] = await Promise.all([
    prisma.trade.findMany({
      where: { userId: user!.id },
      select: {
        symbol: true,
        closedAt: true,
        realizedPnl: true,
        rMultiple: true,
        positionSize: true,
        leverage: true,
        direction: true,
        entryPrice: true,
        exitPrice: true,
        fee: true,
        fundingFee: true,
      },
      orderBy: { closedAt: "asc" },
    }),
    prisma.bybitConnection.findUnique({
      where: { userId: user!.id },
      select: { lastSyncedAt: true },
    }),
    prisma.goal.findUnique({ where: { userId: user!.id } }),
  ]);

  const goals = {
    lossLimitMode: goal?.lossLimitMode ?? "FIXED",
    dailyLossFixed: goal?.dailyLossFixed ? Number(goal.dailyLossFixed) : null,
    dailyLossPercent: goal?.dailyLossPercent
      ? Number(goal.dailyLossPercent)
      : null,
    totalCapital: goal?.totalCapital ? Number(goal.totalCapital) : null,
    profitTargetAmount: goal?.profitTargetAmount
      ? Number(goal.profitTargetAmount)
      : null,
  };

  // Decimal / Date 不能直接送進 client component
  const trades: NamedTradePoint[] = rows.map((t) => ({
    symbol: t.symbol,
    closedAt: t.closedAt?.toISOString() ?? null,
    realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
    rMultiple: t.rMultiple === null ? null : Number(t.rMultiple),
    positionSize: Number(t.positionSize),
    leverage: t.leverage === null ? null : Number(t.leverage),
    direction: t.direction,
    entryPrice: Number(t.entryPrice),
    exitPrice: t.exitPrice === null ? null : Number(t.exitPrice),
    fee: Number(t.fee),
    fundingFee: t.fundingFee === null ? null : Number(t.fundingFee),
  }));

  // 在伺服器端(固定 UTC 時區)格式化成字串再傳給 client component,
  // 避免把 Date 物件丟進去在瀏覽器端重新格式化導致 hydration 不一致。
  const lastSyncedText = conn?.lastSyncedAt
    ? `上次同步:${conn.lastSyncedAt.toLocaleString("zh-TW", { timeZone: "UTC" })} (UTC)`
    : "尚未同步";

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <DashboardView trades={trades} goals={goals} lastSyncedText={lastSyncedText} />
      </div>
    </div>
  );
}
