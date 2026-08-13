import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import type { TradePoint } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Dashboard · TradeMind",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const [rows, conn] = await Promise.all([
    prisma.trade.findMany({
      where: { userId: user!.id },
      select: { closedAt: true, realizedPnl: true, rMultiple: true },
      orderBy: { closedAt: "asc" },
    }),
    prisma.bybitConnection.findUnique({
      where: { userId: user!.id },
      select: { lastSyncedAt: true },
    }),
  ]);

  // Decimal / Date 不能直接送進 client component
  const trades: TradePoint[] = rows.map((t) => ({
    closedAt: t.closedAt?.toISOString() ?? null,
    realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
    rMultiple: t.rMultiple === null ? null : Number(t.rMultiple),
  }));

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">Dashboard</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            {conn?.lastSyncedAt
              ? `上次同步:${conn.lastSyncedAt.toLocaleString("zh-TW", { timeZone: "UTC" })} (UTC)`
              : "尚未同步"}
          </p>
        </div>
        <DashboardView trades={trades} />
      </div>
    </div>
  );
}
