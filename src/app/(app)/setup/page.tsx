import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SetupView, type AnalysisTrade } from "@/components/analysis/setup-view";

export const metadata: Metadata = {
  title: "Setup 分析 · TradeMind",
};

export default async function SetupPage() {
  const user = await getCurrentUser();

  const [rows, fieldDefs] = await Promise.all([
    prisma.trade.findMany({
      where: { userId: user!.id },
      select: {
        symbol: true,
        closedAt: true,
        realizedPnl: true,
        rMultiple: true,
        setup: { select: { name: true } },
        customValues: {
          select: { value: true, field: { select: { key: true } } },
        },
      },
    }),
    prisma.customFieldDefinition.findMany({
      where: { userId: user!.id },
      select: { key: true },
    }),
  ]);

  const trades: AnalysisTrade[] = rows.map((t) => ({
    symbol: t.symbol,
    closedAt: t.closedAt?.toISOString() ?? null,
    realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
    rMultiple: t.rMultiple === null ? null : Number(t.rMultiple),
    setupName: t.setup?.name ?? null,
    fieldsByKey: Object.fromEntries(
      t.customValues.map((v) => [v.field.key, v.value]),
    ),
  }));

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">Setup 分析</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            哪個策略最賺錢、哪個維度表現最穩定
          </p>
        </div>
        <SetupView
          trades={trades}
          enabledFieldKeys={fieldDefs.map((f) => f.key)}
        />
      </div>
    </div>
  );
}
