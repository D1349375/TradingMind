import type { PeriodReportResult } from "@/lib/period-report";

// AI 教練筆記卡(設計文件第七節):定位是「解讀旁邊的數據」,不是佔滿整頁,
// 樣式沿用 ai-analysis.tsx(單一人格分析)的強調卡+格線佈局,維持全站一致。

const TREND_LABEL: Record<string, string> = {
  IMPROVING: "進步中",
  STABLE: "持平",
  DECLINING: "下滑",
  NO_PRIOR_DATA: "尚無對照期間",
};

const TREND_TONE: Record<string, string> = {
  IMPROVING: "text-profit",
  STABLE: "text-text-secondary",
  DECLINING: "text-loss",
  NO_PRIOR_DATA: "text-text-secondary",
};

export function ReportCard({
  personaLabel,
  result,
}: {
  personaLabel: string;
  result: PeriodReportResult;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded border border-accent bg-accent-soft px-4 py-4">
        <p className="text-[1rem] font-semibold leading-relaxed text-text">
          「{result.signatureLine}」
        </p>
        <p className="mt-1 text-[0.75rem] text-text-secondary">— {personaLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-border bg-surface px-3.5 py-3">
          <div className="text-[0.72rem] text-text-secondary">趨勢</div>
          <div className={`text-[1rem] font-semibold ${TREND_TONE[result.trend] ?? ""}`}>
            {TREND_LABEL[result.trend] ?? result.trend}
          </div>
        </div>
        <div className="rounded border border-border bg-surface px-3.5 py-3">
          <div className="text-[0.72rem] text-text-secondary">對應心智模型</div>
          <div className="text-[0.85rem] font-semibold">{result.keyModelApplied}</div>
        </div>
      </div>

      <div className="rounded border border-border bg-surface px-3.5 py-3">
        <div className="mb-1 text-[0.75rem] font-semibold text-text-secondary">期間摘要</div>
        <p className="text-[0.85rem] leading-relaxed">{result.periodSummary}</p>
      </div>

      <div className="rounded border border-border bg-surface px-3.5 py-3">
        <div className="mb-1 text-[0.75rem] font-semibold text-text-secondary">教練筆記</div>
        <p className="whitespace-pre-wrap text-[0.88rem] leading-relaxed">{result.narrative}</p>
      </div>

      <div className="rounded border border-border bg-surface px-3.5 py-3">
        <div className="mb-1 text-[0.75rem] font-semibold text-text-secondary">下一步</div>
        <p className="text-[0.85rem] leading-relaxed">{result.nextAction}</p>
      </div>

      {result.dataGaps && result.dataGaps.length > 0 && (
        <div className="rounded border border-dashed border-border bg-canvas px-3.5 py-3">
          <div className="mb-1 text-[0.75rem] font-semibold text-text-secondary">
            這次判斷缺少的資訊
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-[0.78rem] text-text-secondary">
            {result.dataGaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
