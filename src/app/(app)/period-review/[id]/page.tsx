import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERSONAS, type PersonaKey } from "@/lib/personas";
import { normalizePeriodReportResult, type PeriodReportResult } from "@/lib/period-report";
import { normalizePeriodStatsSnapshot, type PeriodStatsSnapshot } from "@/lib/period-stats";
import { StatGrid } from "@/components/dashboard/dashboard-view";
import {
  DailyBarChart,
  WinLossComparisonCard,
  HourlyTable,
  BucketTable,
  RiskMetricsCard,
  MixedAssetNotice,
} from "@/components/dashboard/performance-view";
import { ReportCard } from "@/components/period-review/report-card";
import { ExportButtons } from "@/components/period-review/export-buttons";
import { TraderScoreCard, TraderScoreHelp } from "@/components/period-review/trader-score";
import { CrossAnalysisSection } from "@/components/analysis/setup-view";
import { HelpTooltip } from "@/components/ui/help-tooltip";

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

  // 舊報告快照可能缺少新欄位(見 normalizePeriodStatsSnapshot 註解),
  // 補齊後才能安全渲染。
  const stats = normalizePeriodStatsSnapshot(
    report.statsSnapshot as unknown as Partial<PeriodStatsSnapshot>,
  );
  const result = normalizePeriodReportResult(
    report.result as unknown as Partial<PeriodReportResult>,
  );
  const personaLabel = PERSONAS[report.persona as PersonaKey]?.name ?? report.persona;

  return (
    <div className="px-9 py-8">
      <div id="period-report-root" className="mx-auto max-w-[1180px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[1.4rem] font-semibold">
              {report.periodType === "WEEK" ? "週報" : "月報"} · {fmtDate(report.periodStart)} – {fmtDate(report.periodEnd)}
            </h1>
            <p className="mt-0.5 text-[0.84rem] text-text-secondary">
              這是生成當下的快照,之後補匯入交易不會改動這裡的數字
            </p>
          </div>
          <ExportButtons
            reportId={report.id}
            periodType={report.periodType as "WEEK" | "MONTH"}
            periodStartLabel={fmtDate(report.periodStart)}
            periodEndLabel={fmtDate(report.periodEnd)}
            personaLabel={personaLabel}
            result={result}
            stats={stats}
          />
        </div>

        <div className="mb-5 grid grid-cols-[1fr_320px] gap-4">
          <ReportCard personaLabel={personaLabel} result={result} />
          <div className="rounded border border-border bg-surface px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[0.82rem] font-semibold text-text-secondary">綜合評分</h3>
              <TraderScoreHelp />
            </div>
            <TraderScoreCard score={stats.traderScore} />
          </div>
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
            <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">Setup 排行</h3>
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
          <div className="grid grid-cols-2 gap-3">
            {stats.behaviorAlerts.map((a) => (
              <div
                key={a.kind}
                className={`rounded border px-3 py-2.5 ${
                  a.enabled ? "border-border bg-canvas" : "border-dashed border-border bg-canvas opacity-60"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[0.84rem] font-semibold">{a.label}</span>
                  {!a.enabled && (
                    <span className="text-[0.68rem] text-text-tertiary">未啟用</span>
                  )}
                </div>
                {!a.available ? (
                  <p className="text-[0.76rem] leading-relaxed text-text-tertiary">
                    {a.unavailableReason}
                  </p>
                ) : (
                  <>
                    <div
                      className={`num text-[1.1rem] font-semibold ${
                        a.count > 0 ? "text-loss" : "text-text"
                      }`}
                    >
                      {a.count} 次
                    </div>
                    {a.sample.length > 0 && (
                      <div className="mt-0.5 text-[0.72rem] text-text-tertiary">
                        {a.sample.join(" · ")}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 2026-08-17 追加:對照 TradeZella 調研,週期回顧原本只有 StatGrid
            這種表層數字,教練筆記講的模式使用者自己看不到數據依據。這幾張卡
            全部複用績效分析頁(performance-view.tsx)已經有的元件,不是重新
            設計一套 UI——維持全站視覺一致,也降低維護成本。 */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="rounded border border-border bg-surface px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[0.82rem] font-semibold text-text-secondary">Wins vs Losses 對照</h3>
              <HelpTooltip>
                把這期贏的交易和輸的交易分開,比較筆數/平均R
                值——用來找「是不是部位一放大就開始輸」這類系統性差異(資產類別混合時,部位大小/槓桿單位無法比較會略過)。
              </HelpTooltip>
            </div>
            <WinLossComparisonCard result={stats.winLoss} hideUnitSpecific={stats.assetClassMixed} />
          </div>

          <div className="rounded border border-border bg-surface px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[0.82rem] font-semibold text-text-secondary">依平倉小時分布</h3>
              <HelpTooltip>
                依平倉時間的本地小時分組(0-23點)——用來找這期哪個時段表現特別好或特別差。
              </HelpTooltip>
            </div>
            <HourlyTable buckets={stats.hourBreakdown} />
          </div>
        </div>

        <div className="mt-5 rounded border border-border bg-surface px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[0.82rem] font-semibold text-text-secondary">風險調整報酬指標</h3>
            <HelpTooltip>
              用這期每天的損益序列算 Sharpe/Sortino/Calmar。樣本少於 20 個交易日時不顯示,避免比率不穩定誤導判斷。
            </HelpTooltip>
          </div>
          <RiskMetricsCard result={stats.riskAdjusted} mounted={true} />
        </div>

        {stats.assetClassMixed ? (
          <div className="mt-5">
            <MixedAssetNotice title="依部位大小分組 / 依槓桿分組" />
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded border border-border bg-surface px-4 py-4">
              <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">依部位大小分組</h3>
              <BucketTable buckets={stats.positionSizeBuckets} label="部位大小" />
            </div>
            <div className="rounded border border-border bg-surface px-4 py-4">
              <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">依槓桿分組</h3>
              <BucketTable buckets={stats.leverageBuckets} label="槓桿" />
            </div>
          </div>
        )}

        <div className="mt-5">
          <CrossAnalysisSection
            trades={stats.crossAnalysisTrades}
            enabledFieldKeys={stats.enabledFieldKeys}
          />
        </div>
      </div>
    </div>
  );
}
