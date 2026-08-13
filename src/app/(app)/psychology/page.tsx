import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PsychologyView,
  type PsychTrade,
} from "@/components/analysis/psychology-view";
import { DETECTION_DEFS } from "@/lib/behavior-presets";

export const metadata: Metadata = {
  title: "心態分析 · TradeMind",
};

export default async function PsychologyPage() {
  const user = await getCurrentUser();

  const [rows, fieldDefs, ruleCount, behaviorRows, goal] = await Promise.all([
    prisma.trade.findMany({
      where: { userId: user!.id },
      select: {
        closedAt: true,
        openedAt: true,
        realizedPnl: true,
        positionSize: true,
        entryPrice: true,
        grade: true,
        customValues: {
          select: { value: true, field: { select: { key: true } } },
        },
        ruleChecks: { select: { checked: true } },
      },
      orderBy: { closedAt: "asc" },
    }),
    prisma.customFieldDefinition.findMany({
      where: { userId: user!.id },
      select: { key: true },
    }),
    prisma.disciplineRule.count({ where: { userId: user!.id, active: true } }),
    prisma.behaviorDetectionSetting.findMany({ where: { userId: user!.id } }),
    prisma.goal.findUnique({ where: { userId: user!.id } }),
  ]);

  const trades: PsychTrade[] = rows.map((t) => {
    const byKey = Object.fromEntries(
      t.customValues.map((v) => [v.field.key, v.value]),
    );
    return {
      closedAt: t.closedAt?.toISOString() ?? null,
      openedAt: t.openedAt?.toISOString() ?? null,
      realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
      positionSize: t.positionSize === null ? null : Number(t.positionSize),
      entryPrice: t.entryPrice === null ? null : Number(t.entryPrice),
      grade: t.grade,
      emotion: typeof byKey.emotion === "string" ? byKey.emotion : null,
      ruleChecks: t.ruleChecks.map((c) => c.checked),
    };
  });

  const keys = new Set(fieldDefs.map((f) => f.key));

  const byKind = new Map(behaviorRows.map((r) => [r.kind, r]));
  const behaviorSettings = DETECTION_DEFS.map((def) => {
    const row = byKind.get(def.kind);
    return {
      kind: def.kind,
      enabled: row?.enabled ?? def.defaultEnabled,
      threshold:
        (row?.threshold as Record<string, number> | null) ?? def.defaultThreshold,
    };
  });

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">心態分析</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            情緒、紀律與行為模式
          </p>
        </div>
        <PsychologyView
          trades={trades}
          hasEmotionField={keys.has("emotion")}
          ruleCount={ruleCount}
          behaviorSettings={behaviorSettings}
          totalCapital={goal?.totalCapital ? Number(goal.totalCapital) : null}
        />
      </div>
    </div>
  );
}
