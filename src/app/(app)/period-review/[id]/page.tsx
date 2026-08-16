import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERSONAS, type PersonaKey } from "@/lib/personas";
import type { PeriodReportResult } from "@/lib/period-report";
import type { PeriodStatsSnapshot } from "@/lib/period-stats";
import { StatGrid } from "@/components/dashboard/dashboard-view";
import { DailyBarChart } from "@/components/dashboard/performance-view";
import { ReportCard } from "@/components/period-review/report-card";

export const metadata: Metadata = {
  title: "週期回顧 · TradeMind",
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("zh-TW", { timeZone: "UTC" });
}
function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;

const TREND_LABEL: Record<string, string> = {
  IMPROVING: "進步中",
  STABLE: "持平",
  DECLINING: "下滑",
  NO_PRIOR_DATA: "尚無對照期間",
};

export default async function PeriodReviewDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();

  const report = await prisma.periodReport.findFirst({
    where: { id: params.id, userId: user!.id },
  });
  if (!report) notFound();

  const stats = report.statsSnapshot as unknown as PeriodStatsSnapshot;
  const result = report.result as unknown as PeriodReportResult;
  const personaLabel = PERSONAS[report.persona as PersonaKey]?.name ?? report.persona;

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">
            {report.periodType === "WEEK" ? "週報" : "月報"} · {fmtDate(report.periodStart)} – {fmtDate(report.periodEnd)}
          </h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            這是生成當下的快照,之後補匯入交易不會改動這裡的數字
          </p>
        </div>

        <div className="mb-5">
          <ReportCard personaLabel={personaLabel} result={result} />
        </div>

        <StatGrid summary={stats.current} />

        {stats.prior ? (
          <div className="mb-5 rounded border border-border bg-surface px-4 py-3 text-[0.82rem] text-text-secondary">
            對照上一期:總損益 {signed(stats.prior.totalPnl)}U
            {stats.prior.winRate !== null && <>,勝率 {fmt(stats.prior.winRate, 1)}%</>}
            {" · "}趨勢判定:<span className="font-semibold text-text">{TREND_LABEL[stats.trend] ?? stats.trend}</span>
          </div>
        ) : (
          <div className="mb-5 rounded border border-dashed border-border bg-canvas px-4 py-3 text-[0.82rem] text-text-secondary">
            這是第一次追蹤到的期間,沒有上一期資料可以比較。
          </div>
        )}

        <div className="mb-5 rounded border border-border bg-surface px-4 py-4">
          <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">每日損益</h3>
          <DailyBarChart data={stats.dailySeries} />
        </div>

        <div className="mb-5 grid grid-cols-2 gap-4">
          <div className="rounded border border-border bg-surface px-4 py-4">
            <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">紀律遵守率</h3>
            {stats.current.disciplineMarked === 0 ? (
              <p className="text-[0.82rem] text-text-secondary">這期沒有交易標記過紀律規則。</p>
            ) : (
              <p className="text-[0.9rem]">
                <b className="num text-[1.3rem] font-semibold">{fmt(stats.current.disciplineRate ?? 0, 1)}%</b>
                <span className="ml-2 text-[0.78rem] text-text-secondary">
                  已標記 {stats.current.disciplineMarked} 筆
                </span>
              </p>
            )}
          </div>

          <div className="rounded border border-border bg-surface px-4 py-4">
            <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">Setup 排行(前 3)</h3>
            {stats.topSetups.length === 0 ? (
              <p className="text-[0.82rem] text-text-secondary">這期沒有已標記 Setup 的交易。</p>
            ) : (
              <ul className="space-y-1.5">
                {stats.topSetups.map((s) => (
                  <li key={s.name} className="flex items-center justify-between text-[0.85rem]">
                    <span>{s.name}</span>
                    <span className="num text-text-secondary">
                      {signed(s.pnl)}U · {s.n} 筆
                      {s.winRate !== null && <> · {fmt(s.winRate, 0)}%</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded border border-border bg-surface px-4 py-4">
          <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">行為偵測</h3>
          <ul className="space-y-2">
            {stats.behaviorAlerts.map((a) => (
              <li key={a.kind} className="flex items-start justify-between gap-3 text-[0.82rem]">
                <span className="text-text-secondary">{a.label}</span>
                {!a.enabled ? (
                  <span className="text-text-tertiary">未啟用</span>
                ) : !a.available ? (
                  <span className="text-right text-text-tertiary">{a.unavailableReason}</span>
                ) : a.count === 0 ? (
                  <span className="text-profit">沒有偵測到異常</span>
                ) : (
                  <span className="text-loss">{a.count} 次{a.sample.length > 0 && `(${a.sample.join("、")})`}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
