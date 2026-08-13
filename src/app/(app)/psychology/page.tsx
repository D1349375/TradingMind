import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PsychologyView,
  type PsychTrade,
} from "@/components/analysis/psychology-view";

export const metadata: Metadata = {
  title: "心態分析 · TradeMind",
};

export default async function PsychologyPage() {
  const user = await getCurrentUser();

  const rows = await prisma.trade.findMany({
    where: { userId: user!.id },
    select: { closedAt: true, realizedPnl: true, grade: true },
    orderBy: { closedAt: "asc" },
  });

  const trades: PsychTrade[] = rows.map((t) => ({
    closedAt: t.closedAt?.toISOString() ?? null,
    realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
    grade: t.grade,
  }));

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">心態分析</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            情緒、紀律與行為模式
          </p>
        </div>
        <PsychologyView trades={trades} />
      </div>
    </div>
  );
}
