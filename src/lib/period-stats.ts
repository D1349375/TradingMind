import {
  summarise,
  disciplineComplianceRate,
  topSetupsByPnl,
  winLossComparison,
  performanceByPositionSize,
  performanceByLeverage,
  riskAdjustedMetrics,
  computeTraderScore,
  type Summary,
  type SetupRankRow,
  type WinLossComparison,
  type PerfBucket,
  type RiskAdjustedMetrics,
  type HourBucket,
  type TraderScore,
} from "@/lib/stats";
import type { DetectionOutcome } from "@/lib/behavior-detection";
import type { AnalysisTrade } from "@/components/analysis/setup-view";

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
  // 2026-08-17 追加(對照 TradeZella 調研,週期回顧原本餵給 LLM 的統計量
  // 太單薄):複用績效分析頁已經有的純函式,不是重新發明統計邏輯。
  // assetClassMixed 為 true 時,winLoss 的 avgPositionSize/avgLeverage 跟
  // positionSizeBuckets/leverageBuckets 不能拿來下判斷(見 lib/account-filter.ts
  // 的 resolveAssetClassMix)——UI 端會直接不顯示,這裡額外在 prompt 規則
  // 提醒 LLM 不要引用,雙重保險。
  assetClassMixed: boolean;
  winLoss: WinLossComparison;
  hourBreakdown: HourBucket[];
  positionSizeBuckets: PerfBucket[];
  leverageBuckets: PerfBucket[];
  riskAdjusted: RiskAdjustedMetrics;
};

export type PeriodStatsSnapshot = PeriodStatsForLLM & {
  // 給詳情頁重畫每日損益長條圖用,不送進 LLM prompt(設計文件沒有把它列進
  // 輸入清單,加進去對輸出品質沒有幫助,只會增加 token)。
  dailySeries: { date: string; pnl: number; count: number }[];
  // 2026-08-17 追加(使用者要求把 Setup 分析頁的交叉分析搬進週期回顧頁)。
  // 週期回顧的統計快照是「生成當下凍結」的設計(之後補匯入交易不會悄悄
  // 改動舊報告數字),交叉分析需要的原始交易欄位(商品/平倉時間/R值/Setup/
  // 自訂欄位值)跟當時哪些自訂欄位是啟用的,都必須一起凍結進快照,不能在
  // 頁面渲染時重新查詢即時交易列表,否則會破壞凍結原則、讓同一份報告在
  // 不同時間點顯示不同數字。UI-only,不送進 LLM prompt。
  crossAnalysisTrades: AnalysisTrade[];
  enabledFieldKeys: string[];
  // 綜合評分(見 lib/stats.ts 的 computeTraderScore),UI-only,不送進
  // LLM prompt——分數是決定性公式算出來的,不需要 AI 重新詮釋。
  traderScore: TraderScore;
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
// 用 Date 的月份運算處理,不手算天數)。只需要 periodStart 就能算出來
// (上一期的終點定義為這一期的起點,不用參照這一期的終點),輸入的
// periodStart 已經是使用者瀏覽器端算好轉成的 ISO 時間(見產生報告按鈕
// 元件),這裡純粹是對 Date 做算術,不涉及時區猜測。
export function getPriorRange(
  periodType: "WEEK" | "MONTH",
  periodStart: Date,
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

// 依「使用者告知的 UTC 偏移量」算平倉本地小時分組,取代 lib/stats.ts 的
// hourOfDayBreakdown(那個用 getHours() 是瀏覽器本地時區方法,同樣只能在
// 瀏覽器端呼叫)。邏輯跟原函式一致,只是時區換算方式改成手動位移。
function hourOfDayBreakdownWithOffset(
  trades: PeriodTrade[],
  utcOffsetMinutes: number,
): HourBucket[] {
  const buckets = new Map<number, PeriodTrade[]>();
  for (const t of trades) {
    if (!t.closedAt || t.realizedPnl === null) continue;
    const shifted = new Date(new Date(t.closedAt).getTime() + utcOffsetMinutes * 60000);
    const h = shifted.getUTCHours();
    const arr = buckets.get(h) ?? [];
    arr.push(t);
    buckets.set(h, arr);
  }
  return [...buckets.entries()]
    .map(([hour, list]) => {
      const pnls = list.map((t) => t.realizedPnl).filter((p): p is number => p !== null);
      const wins = pnls.filter((p) => p > 0).length;
      const losses = pnls.filter((p) => p < 0).length;
      const rs = list.map((t) => t.rMultiple).filter((r): r is number => r !== null);
      return {
        hour,
        n: list.length,
        winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
        avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
        pnl: pnls.reduce((s, p) => s + p, 0),
      };
    })
    .sort((a, b) => a.hour - b.hour);
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
  assetClassMixed: boolean;
  totalCapital: number | null;
  crossAnalysisTrades: AnalysisTrade[];
  enabledFieldKeys: string[];
}): PeriodStatsSnapshot {
  const currentSummary = summarise(opts.currentTrades);
  const priorSummary = opts.priorTrades.length > 0 ? summarise(opts.priorTrades) : null;
  const dailySeries = dailySeriesWithOffset(opts.currentTrades, opts.utcOffsetMinutes);
  const riskAdjusted = riskAdjustedMetrics(
    opts.currentTrades,
    opts.totalCapital,
    dailySeries.map((d) => d.pnl),
  );

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
    // 前3名損益排行看不出「持續表現差」的Setup(TradeZella月報明確會點名這類
    // Setup)——多數帳號Setup數量不多,拉大到8名通常就足夠自然帶出墊底的。
    topSetups: topSetupsByPnl(opts.currentTrades, 8),
    assetClassMixed: opts.assetClassMixed,
    winLoss: winLossComparison(opts.currentTrades),
    hourBreakdown: hourOfDayBreakdownWithOffset(opts.currentTrades, opts.utcOffsetMinutes),
    positionSizeBuckets: opts.assetClassMixed ? [] : performanceByPositionSize(opts.currentTrades),
    leverageBuckets: opts.assetClassMixed ? [] : performanceByLeverage(opts.currentTrades),
    riskAdjusted,
    dailySeries,
    crossAnalysisTrades: opts.crossAnalysisTrades,
    enabledFieldKeys: opts.enabledFieldKeys,
    traderScore: computeTraderScore(
      opts.currentTrades,
      riskAdjusted,
      disciplineComplianceRate(opts.currentTrades),
    ),
  };
}

// 補齊舊快照缺少的欄位(2026-08-17 擴充新增 winLoss/hourBreakdown 等)。
// statsSnapshot 存的是「產生報告當下」的 JSON 快照,本機開發跟正式站共用
// 同一個資料庫,上線前產生過的舊報告沒有這些新欄位——用預設值補齊,讓舊
// 報告優雅顯示「沒有這項資料」而不是整頁因為存取 undefined 壞掉。頁面
// (period-review/[id]/page.tsx)跟 Word 匯出(period-report-docx.ts 的
// 呼叫端)都要用同一份正規化邏輯,不要各自寫一次容易漏掉欄位或跑掉。
export function normalizePeriodStatsSnapshot(
  raw: Partial<PeriodStatsSnapshot>,
): PeriodStatsSnapshot {
  return {
    ...raw,
    assetClassMixed: raw.assetClassMixed ?? false,
    winLoss: raw.winLoss ?? {
      win: { n: 0, avgPositionSize: null, avgLeverage: null, avgR: null },
      loss: { n: 0, avgPositionSize: null, avgLeverage: null, avgR: null },
    },
    hourBreakdown: raw.hourBreakdown ?? [],
    positionSizeBuckets: raw.positionSizeBuckets ?? [],
    leverageBuckets: raw.leverageBuckets ?? [],
    riskAdjusted: raw.riskAdjusted ?? {
      available: false,
      unavailableReason: "這份報告是在數據擴充前產生的,沒有這項資料——重新生成一次就會有。",
      sampleDays: 0,
      sharpeAnnualized: null,
      sortinoAnnualized: null,
      calmarAnnualized: null,
      usingCapitalReturns: false,
    },
    crossAnalysisTrades: raw.crossAnalysisTrades ?? [],
    enabledFieldKeys: raw.enabledFieldKeys ?? [],
    traderScore: raw.traderScore ?? {
      overall: null,
      unavailableReason: "這份報告是在評分機制上線前產生的,沒有這項資料——重新生成一次就會有。",
      profitability: { score: null },
      riskControl: { score: null },
      consistency: { score: null },
      discipline: { score: null },
    },
  } as PeriodStatsSnapshot;
}
