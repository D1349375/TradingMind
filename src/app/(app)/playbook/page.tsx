import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlaybookView, type SetupWithTrades } from "@/components/playbook/playbook-view";

export const metadata: Metadata = {
  title: "Playbook · TradeMind",
};

export default async function PlaybookPage() {
  const user = await getCurrentUser();

  const rows = await prisma.setup.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: "asc" },
    include: {
      trades: {
        select: { realizedPnl: true, rMultiple: true },
      },
    },
  });

  const setups: SetupWithTrades[] = rows.map((s) => ({
    id: s.id,
    name: s.name,
    entryLogic: s.entryLogic,
    economicRationale: s.economicRationale,
    registered: s.registeredAt !== null,
    trades: s.trades.map((t) => ({
      realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
      rMultiple: t.rMultiple === null ? null : Number(t.rMultiple),
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
        <PlaybookView setups={setups} />
      </div>
    </div>
  );
}
