import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getPsychologyData } from "@/lib/page-cache";
import { resolveAccountScope } from "@/lib/account-filter";
import { PsychologyView } from "@/components/analysis/psychology-view";
import { DETECTION_DEFS } from "@/lib/behavior-presets";

export const metadata: Metadata = {
  title: "心態分析 · TradeMind",
};

export default async function PsychologyPage() {
  const user = await getCurrentUser();
  const scope = await resolveAccountScope(user!.id);
  const { trades, hasEmotionField, ruleCount, behaviorRows, totalCapital } =
    await getPsychologyData(user!.id, scope.accountIds, scope.isFiltered);

  const byKind = new Map(behaviorRows.map((r) => [r.kind, r]));
  const behaviorSettings = DETECTION_DEFS.map((def) => {
    const row = byKind.get(def.kind);
    return {
      kind: def.kind,
      enabled: row?.enabled ?? def.defaultEnabled,
      threshold: row?.threshold ?? def.defaultThreshold,
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
          hasEmotionField={hasEmotionField}
          ruleCount={ruleCount}
          behaviorSettings={behaviorSettings}
          totalCapital={totalCapital}
        />
      </div>
    </div>
  );
}
