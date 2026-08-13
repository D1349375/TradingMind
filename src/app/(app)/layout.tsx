import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/shell/sidebar";
import { countPendingReview } from "@/lib/notifications";

// 登入後的共用外框(對應 prototype 的 .shell)。
// 所有需要登入的頁面都放在這個 route group 底下。
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [balance, reviewTrades, recentTrades, goal] = await Promise.all([
    prisma.creditBalance.findUnique({
      where: { userId: user.id },
      select: { balance: true },
    }),
    prisma.trade.findMany({
      where: { userId: user.id },
      select: { closedAt: true, grade: true, reflectionNote: true },
    }),
    // 「今日虧損」是本地時區概念,查最近 3 天當緩衝,由 Sidebar 在瀏覽器端
    // 篩出真正的「今天」——跟 Dashboard 的今日/本月計算同一個理由。
    prisma.trade.findMany({
      where: {
        userId: user.id,
        closedAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      },
      select: { closedAt: true, realizedPnl: true },
    }),
    prisma.goal.findUnique({ where: { userId: user.id } }),
  ]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        email={user.email}
        credits={balance?.balance ?? 0}
        pendingReview={countPendingReview(
          reviewTrades.map((t) => ({
            ...t,
            closedAt: t.closedAt?.toISOString() ?? null,
          })),
        )}
        recentTrades={recentTrades.map((t) => ({
          closedAt: t.closedAt?.toISOString() ?? null,
          realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
        }))}
        goal={{
          lossLimitMode: goal?.lossLimitMode ?? "FIXED",
          dailyLossFixed: goal?.dailyLossFixed ? Number(goal.dailyLossFixed) : null,
          dailyLossPercent: goal?.dailyLossPercent ? Number(goal.dailyLossPercent) : null,
          totalCapital: goal?.totalCapital ? Number(goal.totalCapital) : null,
        }}
      />
      <main className="flex-1 overflow-y-auto bg-canvas">{children}</main>
    </div>
  );
}
