import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAccountScope } from "@/lib/account-filter";
import { resolveGoalState } from "@/lib/page-cache";
import { PlaybookView, type SetupWithTrades } from "@/components/playbook/playbook-view";

export const metadata: Metadata = {
  title: "Playbook · TradeMind",
};

export default async function PlaybookPage() {
  const user = await getCurrentUser();
  const scope = await resolveAccountScope(user!.id);

  const [rows, goals] = await Promise.all([
    prisma.setup.findMany({
      where: { userId: user!.id },
      orderBy: { createdAt: "asc" },
      include: {
        // 沒有主動篩選時不加 accountId 條件,才會包含模板被刪除後留下的
        // 「未分類」交易——見 lib/page-cache.ts 開頭說明。
        trades: {
          where: {
            accountId: scope.isFiltered ? { in: scope.accountIds } : undefined,
          },
          select: { realizedPnl: true, rMultiple: true, closedAt: true },
        },
      },
    }),
    prisma.goal.findMany({ where: { accountId: { in: scope.accountIds } } }),
  ]);
  const totalCapital = resolveGoalState(goals, scope.accountIds.length)?.totalCapital ?? null;

  const setups: SetupWithTrades[] = rows.map((s) => ({
    id: s.id,
    name: s.name,
    entryLogic: s.entryLogic,
    economicRationale: s.economicRationale,
    registered: s.registeredAt !== null,
    trades: s.trades.map((t) => ({
      realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
      rMultiple: t.rMultiple === null ? null : Number(t.rMultiple),
      closedAt: t.closedAt?.toISOString() ?? null,
    })),
  }));

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">Playbook</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            已登記的 Setup 假設,依實際交易數據驗證
          </p>
        </div>
        <PlaybookView setups={setups} totalCapital={totalCapital} />
      </div>
    </div>
  );
}
