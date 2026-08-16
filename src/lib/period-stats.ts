import {
  summarise,
  disciplineComplianceRate,
  topSetupsByPnl,
  type Summary,
  type TradePoint,
  type SetupRankRow,
} from "@/lib/stats";
import type { DetectionOutcome } from "@/lib/behavior-detection";

// AI 週報/月報的期間統計計算(設計文件第一節「先算統計再餵給LLM」)。
// 這裡刻意不呼叫 lib/stats.ts 的 dailyPnlSeries()/groupByLocalDay()——那兩個
// 函式用 `new Date().getMonth()` 這類本地時區方法分組,只能在瀏覽器端呼叫
// (見該檔案的註解),這個模組是給 API route(伺服器端,Node.js 執行環境的
// 時區跟使用者不一定一樣)用的。改成跟 CSV 匯入(lib/bybit-csv.ts)同一招:
// 由使用者告訴我們 UTC 偏移量,伺服器端用偏移量位移後再取日期,不用猜測
// 執行環境時區。

export type PeriodTrade = {
  closedAt: string | null;
  openedAt: string | null;
  realizedPnl: number | null;
  rMultiple: number | null;
  positionSize: number | null;
  leverage: number | null;
  entryPrice: number | null;
  setupName: string | null;
  ruleChecks: boolean[];
};

export type PeriodBehaviorAlert = DetectionOutcome & { label: string };

// 直接擴充 Summary(而不是挑幾個欄位重新定義一份窄型別)——這樣詳情頁
// 可以直接把 current/prior 丟給 Dashboard 既有的 StatGrid 元件重用
// (StatGrid 吃的就是 ReturnType<typeof summarise>),不用另外轉接。
export type PeriodStatsCore = Summary & {
  disciplineMarked: number;
  disciplineRate: number | null;
};

export type Trend = "IMPROVING" | "STABLE" | "DECLINING" | "NO_PRIOR_DATA";

export type PeriodStatsForLLM = {
  periodType: "WEEK" | "MONTH";
  periodStart: string;
  periodEnd: string;
  current: PeriodStatsCore;
  prior: PeriodStatsCore | null;
  trend: Trend;
  behaviorAlerts: PeriodBehaviorAlert[];
  topSetups: SetupRankRow[];
};

export type PeriodStatsSnapshot = PeriodStatsForLLM & {
  // 給詳情頁重畫每日損益長條圖用,不送進 LLM prompt(設計文件沒有把它列進
  // 輸入清單,加進去對輸出品質沒有幫助,只會增加 token)。
  dailySeries: { date: string; pnl: number; count: number }[];
};

function toCore(trades: PeriodTrade[]): PeriodStatsCore {
  const summary: Summary = summarise(trades);
  const discipline = disciplineComplianceRate(trades);
  return {
    ...summary,
    disciplineMarked: discipline.marked,
    disciplineRate: discipline.rate,
  };
}

// 趨勢判斷是簡化過的 heuristic,不是精確科學(設計文件第四節:LLM 只引用
// 這個值,不自己重新判斷,所以门槛選得保守寧可判 STABLE 也不要亂判)。
// 沒有上一期資料(帳號剛開始用/上一期沒有任何已平倉交易)時誠實回傳
// NO_PRIOR_DATA,不要硬湊一個 STABLE 讓使用者誤以為「有比較過,結果持平」。
export function computeTrend(current: Summary, prior: Summary | null): Trend {
  if (!prior || prior.tradeCount === 0) return "NO_PRIOR_DATA";
  const delta = current.totalPnl - prior.totalPnl;
  const threshold = Math.max(Math.abs(prior.totalPnl) * 0.1, 5);
  if (delta > threshold) return "IMPROVING";
  if (delta < -threshold) return "DECLINING";
  return "STABLE";
}

// 上一期的起訖時間——週:再往前 7 天;月:上一個日曆月(月初到月底,天數
// 用 Date 的月份運算處理,不手算天數)。輸入的 periodStart/periodEnd 已經
// 是使用者瀏覽器端算好轉成的 ISO 時間(見產生報告按鈕元件),這裡純粹是
// 對兩個 Date 做算術,不涉及時區猜測。
export function getPriorRange(
  periodType: "WEEK" | "MONTH",
  periodStart: Date,
  periodEnd: Date,
): { start: Date; end: Date } {
  if (periodType === "WEEK") {
    const ms = 7 * 24 * 60 * 60 * 1000;
    return { start: new Date(periodStart.getTime() - ms), end: new Date(periodStart.getTime()) };
  }
  // 月:上一個日曆月同一天號碼(用 periodStart 的年月往前推一個月),
  // end 就是這一期的 periodStart(避免頭尾重疊算兩次)。
  const priorStart = new Date(periodStart);
  priorStart.setMonth(priorStart.getMonth() - 1);
  return { start: priorStart, end: new Date(periodStart.getTime()) };
}

// 依「使用者告知的 UTC 偏移量」分組每日損益,取代 lib/stats.ts 的
// groupByLocalDay(那個只能在瀏覽器端呼叫,見檔案開頭說明)。
function dailySeriesWithOffset(
  trades: PeriodTrade[],
  utcOffsetMinutes: number,
): { date: string; pnl: number; count: number }[] {
  const map = new Map<string, { pnl: number; count: number }>();
  for (const t of trades) {
    if (!t.closedAt || t.realizedPnl === null) continue;
    const shifted = new Date(new Date(t.closedAt).getTime() + utcOffsetMinutes * 60000);
    const key = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
    const prev = map.get(key) ?? { pnl: 0, count: 0 };
    map.set(key, { pnl: prev.pnl + t.realizedPnl, count: prev.count + 1 });
  }
  return [...map.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildPeriodStats(opts: {
  periodType: "WEEK" | "MONTH";
  periodStart: Date;
  periodEnd: Date;
  utcOffsetMinutes: number;
  currentTrades: PeriodTrade[];
  priorTrades: PeriodTrade[];
  behaviorAlerts: DetectionOutcome[];
  behaviorLabelByKind: Record<string, string>;
}): PeriodStatsSnapshot {
  const currentSummary = summarise(opts.currentTrades);
  const priorSummary = opts.priorTrades.length > 0 ? summarise(opts.priorTrades) : null;

  return {
    periodType: opts.periodType,
    periodStart: opts.periodStart.toISOString(),
    periodEnd: opts.periodEnd.toISOString(),
    current: toCore(opts.currentTrades),
    prior: opts.priorTrades.length > 0 ? toCore(opts.priorTrades) : null,
    trend: computeTrend(currentSummary, priorSummary),
    behaviorAlerts: opts.behaviorAlerts.map((a) => ({
      ...a,
      label: opts.behaviorLabelByKind[a.kind] ?? a.kind,
    })),
    topSetups: topSetupsByPnl(opts.currentTrades, 3),
    dailySeries: dailySeriesWithOffset(opts.currentTrades, opts.utcOffsetMinutes),
  };
}
