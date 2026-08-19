import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERSONAS, type PersonaKey } from "@/lib/personas";
import type { PeriodReportResult } from "@/lib/period-report";
import { GenerateReportButtons } from "@/components/period-review/generate-report-buttons";
import { GatedFeature } from "@/components/ui/gated-feature";

export const metadata: Metadata = {
  title: "週期回顧 · TradeMind",
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("zh-TW", { timeZone: "UTC" });
}

export default async function PeriodReviewPage() {
  const user = await getCurrentUser();
  const tier = user!.subscriptionTier;

  const reports = await prisma.periodReport.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      periodType: true,
      periodStart: true,
      periodEnd: true,
      persona: true,
      result: true,
    },
  });

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">週期回顧</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            AI 教練回顧一段期間的整體交易行為,跟上一期比較,不是評論單筆交易
          </p>
        </div>

        {/* 週報/月報 FREE 整個功能鎖(不是局部),用跟 Dashboard 等處同一套
            GatedFeature 灰階+鎖頭處理——已產生過的舊報告(降級前留下的)
            不受影響,只鎖「產生新報告」這個動作本身。 */}
        {tier === "FREE" ? (
          <GatedFeature feature="AI 週報/月報生成">
            <GenerateReportButtons />
          </GatedFeature>
        ) : (
          <GenerateReportButtons />
        )}

        {reports.length === 0 ? (
          <div className="rounded border border-dashed border-border bg-canvas px-4 py-12 text-center text-[0.85rem] text-text-secondary">
            還沒有產生過任何週報/月報。選一個人格,產生第一份報告。
          </div>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => {
              const result = r.result as unknown as PeriodReportResult;
              const personaLabel = PERSONAS[r.persona as PersonaKey]?.name ?? r.persona;
              return (
                <li key={r.id}>
                  <Link
                    href={`/period-review/${r.id}`}
                    className="block rounded border border-border bg-surface px-4 py-3.5 hover:border-accent"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-border px-2 py-0.5 text-[0.72rem] text-text-secondary">
                          {r.periodType === "WEEK" ? "週報" : "月報"}
                        </span>
                        <span className="text-[0.85rem] font-semibold">
                          {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
                        </span>
                        <span className="text-[0.75rem] text-text-secondary">{personaLabel}</span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[0.82rem] leading-relaxed text-text-secondary">
                      「{result.signatureLine}」
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
