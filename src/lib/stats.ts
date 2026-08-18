// 統計計算。純函式、不碰 DB 也不碰 React,方便單獨驗算。
//
// 誠實原則(design.md 一貫立場):算不出來的指標回傳 null,由 UI 顯示「—」,
// 不要用 0 或猜測值頂替——0 在統計裡是有意義的數字,拿它代表「沒有資料」
// 會讓使用者誤判。

export type TradePoint = {
  closedAt: string | null; // ISO
  realizedPnl: number | null;
  rMultiple: number | null;
  positionSize?: number | null;
  leverage?: number | null;
  direction?: "LONG" | "SHORT";
  entryPrice?: number | null;
  exitPrice?: number | null;
  fee?: number | null;
  fundingFee?: number | null; // 只有 CSV 匯入的交易才有,見 lib/funding-cost.ts
};

export type Summary = {
  totalPnl: number;
  tradeCount: number;
  winRate: number | null; // 0-100
  profitFactor: number | null; // null = 沒有虧損交易,無法定義
  avgR: number | null; // null = 沒有任何一筆有 R 值
  maxDrawdown: number; // 負值或 0
  grossProfit: number;
  grossLoss: number; // 正值
  winCount: number;
  lossCount: number;
};

export function summarise(trades: TradePoint[]): Summary {
  const settled = trades.filter((t) => t.realizedPnl !== null);
  const pnls = settled.map((t) => t.realizedPnl as number);

  const grossProfit = pnls.filter((p) => p > 0).reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((s, p) => s + p, 0));
  const winCount = pnls.filter((p) => p > 0).length;
  const lossCount = pnls.filter((p) => p < 0).length;

  // 損益恰好為 0 的交易不算贏也不算輸,但仍計入總筆數
  const decided = winCount + lossCount;

  const rValues = trades
    .map((t) => t.rMultiple)
    .filter((r): r is number => r !== null);

  return {
    totalPnl: pnls.reduce((s, p) => s + p, 0),
    tradeCount: trades.length,
    winRate: decided > 0 ? (winCount / decided) * 100 : null,
    // 沒有虧損交易時獲利因子會是無限大,回傳 null 讓 UI 標示「無虧損交易」
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgR:
      rValues.length > 0
        ? rValues.reduce((s, r) => s + r, 0) / rValues.length
        : null,
    maxDrawdown: maxDrawdown(equityCurve(trades).map((p) => p.equity)),
    grossProfit,
    grossLoss,
    winCount,
    lossCount,
  };
}

export type EquityPoint = { closedAt: string; equity: number; pnl: number };

// 依平倉時間排序後的累計損益。損益是在平倉當下實現的,所以用 closedAt。
export function equityCurve(trades: TradePoint[]): EquityPoint[] {
  const settled = trades
    .filter(
      (t): t is TradePoint & { closedAt: string; realizedPnl: number } =>
        t.closedAt !== null && t.realizedPnl !== null,
    )
    .sort((a, b) => a.closedAt.localeCompare(b.closedAt));

  let running = 0;
  return settled.map((t) => {
    running += t.realizedPnl;
    return { closedAt: t.closedAt, equity: running, pnl: t.realizedPnl };
  });
}

// 最大回撤:權益曲線從高點回落的最大幅度(回傳負值)
export function maxDrawdown(equity: number[]): number {
  let peak = 0;
  let worst = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = e - peak;
    if (dd < worst) worst = dd;
  }
  return worst;
}

export type NamedTradePoint = TradePoint & { symbol: string };

// 每日損益(依平倉時間排序,供長條圖用)。跟 groupByLocalDay 分組邏輯共用,
// 但回傳陣列(有序)而不是 Map,方便直接畫圖。
export function dailyPnlSeries(
  trades: TradePoint[],
): { date: string; pnl: number; count: number }[] {
  const byDay = groupByLocalDay(trades);
  return [...byDay.entries()]
    .map(([date, v]) => ({ date, pnl: v.pnl, count: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type HistogramBucket = { rangeLabel: string; count: number; rangeStart: number; rangeEnd: number };

// 把一組數值切成等寬 bucket。全部值相同時(range=0)回傳單一 bucket,
// 避免除以零。
function histogram(values: number[], bucketCount: number, unit: string): HistogramBucket[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) {
    return [{ rangeLabel: `${min.toFixed(1)}${unit}`, count: values.length, rangeStart: min, rangeEnd: max }];
  }
  const width = range / bucketCount;
  const buckets: HistogramBucket[] = Array.from({ length: bucketCount }, (_, i) => {
    const start = min + i * width;
    const end = i === bucketCount - 1 ? max : start + width;
    return { rangeLabel: `${start.toFixed(1)}~${end.toFixed(1)}${unit}`, count: 0, rangeStart: start, rangeEnd: end };
  });
  for (const v of values) {
    const idx = Math.min(bucketCount - 1, Math.floor(((v - min) / range) * bucketCount));
    buckets[idx].count++;
  }
  return buckets;
}

// 損益分布直方圖:只算已平倉、有損益的交易。
export function pnlHistogram(trades: TradePoint[], bucketCount = 10): HistogramBucket[] {
  const values = trades
    .map((t) => t.realizedPnl)
    .filter((p): p is number => p !== null);
  return histogram(values, bucketCount, "U");
}

// R 分布直方圖:只算有填 R 值的交易——大部分同步交易缺止損價算不出 R,
// 樣本可能很小,由呼叫端決定要不要顯示樣本數警語。
export function rHistogram(trades: TradePoint[], bucketCount = 10): HistogramBucket[] {
  const values = trades
    .map((t) => t.rMultiple)
    .filter((r): r is number => r !== null);
  return histogram(values, bucketCount, "R");
}

// 最佳/最差 N 筆交易,依已實現損益排序。
export function topTrades(
  trades: NamedTradePoint[],
  n: number,
): { best: NamedTradePoint[]; worst: NamedTradePoint[] } {
  const settled = trades.filter((t) => t.realizedPnl !== null);
  const sorted = [...settled].sort(
    (a, b) => (b.realizedPnl as number) - (a.realizedPnl as number),
  );
  return {
    best: sorted.slice(0, n),
    worst: sorted.slice(-n).reverse(),
  };
}

export type RuinSimResult = {
  available: boolean;
  unavailableReason?: string;
  sampleSize: number;
  horizonTrades: number;
  ruinThresholdPct: number; // 例如 50 表示「跌破起始資金 50%」
  ruinProbabilityPct: number | null; // 0-100
};

// 破產風險:用歷史交易的「損益占帳戶總資金比例」自助抽樣(bootstrap)重放,
// 不是套一個現成公式硬算——好處是不需要止損價/風險%這些我們拿不到的欄位,
// 缺點是假設「未來的交易分布跟過去一樣」,樣本越小這個假設越不可靠,
// 所以樣本 < 20 筆時直接不給數字,只說明需要更多資料。
export function simulateRuinRisk(
  trades: TradePoint[],
  totalCapital: number | null,
  opts: { horizonTrades?: number; ruinThresholdPct?: number; simulations?: number } = {},
): RuinSimResult {
  const horizonTrades = opts.horizonTrades ?? 100;
  const ruinThresholdPct = opts.ruinThresholdPct ?? 50;
  const simulations = opts.simulations ?? 2000;

  const pnls = trades
    .map((t) => t.realizedPnl)
    .filter((p): p is number => p !== null);

  if (!totalCapital || totalCapital <= 0) {
    return {
      available: false,
      unavailableReason: "需要先在「設定 → 目標設定」填寫帳戶總資金,才能把損益換算成報酬率模擬。",
      sampleSize: pnls.length,
      horizonTrades,
      ruinThresholdPct,
      ruinProbabilityPct: null,
    };
  }
  if (pnls.length < 20) {
    return {
      available: false,
      unavailableReason: `目前只有 ${pnls.length} 筆已平倉交易,樣本太少(建議至少 20 筆),自助抽樣模擬出來的機率不可靠。`,
      sampleSize: pnls.length,
      horizonTrades,
      ruinThresholdPct,
      ruinProbabilityPct: null,
    };
  }

  // 每筆交易的報酬率(相對帳戶總資金),bootstrap 抽樣時直接複利相乘
  const returns = pnls.map((p) => 1 + p / totalCapital);
  const threshold = 1 - ruinThresholdPct / 100;

  let ruinCount = 0;
  for (let s = 0; s < simulations; s++) {
    let equity = 1;
    let hit = false;
    for (let i = 0; i < horizonTrades; i++) {
      const r = returns[Math.floor(Math.random() * returns.length)];
      equity *= r;
      if (equity <= threshold) {
        hit = true;
        break;
      }
    }
    if (hit) ruinCount++;
  }

  return {
    available: true,
    sampleSize: pnls.length,
    horizonTrades,
    ruinThresholdPct,
    ruinProbabilityPct: (ruinCount / simulations) * 100,
  };
}

export type RiskAdjustedMetrics = {
  available: boolean;
  unavailableReason?: string;
  sampleDays: number;
  sharpeAnnualized: number | null;
  sortinoAnnualized: number | null;
  calmarAnnualized: number | null;
  usingCapitalReturns: boolean; // false 時是用金額本身算比率(比率本身有效,但無法讀成年化百分比)
};

// 加密貨幣市場全年無休交易,年化天數用 365,不是股市慣用的 252。
const ANNUALIZATION_DAYS = 365;

// 風險調整報酬指標(Sharpe/Sortino/Calmar),用「本地日」損益序列計算。
// 有帳戶總資金時換算成報酬率(可讀成年化百分比);沒有的話直接用金額本身算——
// mean/std 的比率不受單位縮放影響,所以 Sharpe/Sortino 數值一樣有效,只是
// Calmar 的「年化報酬」在沒有總資金時無法讀成百分比,只能當金額本身的比率看。
// dailyPnlsOverride:週期回顧(lib/period-stats.ts)在伺服器端呼叫時,
// groupByLocalDay() 用的是瀏覽器本地時區方法,不能直接在 API route 用——
// 改成外部先用「使用者告知的UTC偏移量」分好日再傳進來。瀏覽器端呼叫(績效
// 分析頁)不傳這個參數,行為不變。
export function riskAdjustedMetrics(
  trades: TradePoint[],
  totalCapital: number | null,
  dailyPnlsOverride?: number[],
): RiskAdjustedMetrics {
  const dailyPnls = dailyPnlsOverride ?? [...groupByLocalDay(trades).values()].map((v) => v.pnl);
  const n = dailyPnls.length;

  if (n < 20) {
    return {
      available: false,
      unavailableReason: `目前只有 ${n} 個有交易的日子,樣本太少(建議至少 20 天),算出來的比率不穩定,暫不顯示。`,
      sampleDays: n,
      sharpeAnnualized: null,
      sortinoAnnualized: null,
      calmarAnnualized: null,
      usingCapitalReturns: false,
    };
  }

  const usingCapitalReturns = totalCapital !== null && totalCapital > 0;
  const series = usingCapitalReturns
    ? dailyPnls.map((p) => p / (totalCapital as number))
    : dailyPnls;

  const mean = series.reduce((s, v) => s + v, 0) / n;
  const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const downside = series.filter((v) => v < 0);
  const downsideStd =
    downside.length > 1
      ? Math.sqrt(downside.reduce((s, v) => s + v * v, 0) / (downside.length - 1))
      : null;

  const sharpeAnnualized = std > 0 ? (mean / std) * Math.sqrt(ANNUALIZATION_DAYS) : null;
  const sortinoAnnualized =
    downsideStd !== null && downsideStd > 0
      ? (mean / downsideStd) * Math.sqrt(ANNUALIZATION_DAYS)
      : null;

  const annualizedReturn = mean * ANNUALIZATION_DAYS;
  const ddRaw = maxDrawdown(equityCurve(trades).map((p) => p.equity)); // 負值或 0
  const ddInSeriesUnit = usingCapitalReturns ? ddRaw / (totalCapital as number) : ddRaw;
  const calmarAnnualized =
    ddInSeriesUnit < 0 ? annualizedReturn / Math.abs(ddInSeriesUnit) : null;

  return {
    available: true,
    sampleDays: n,
    sharpeAnnualized,
    sortinoAnnualized,
    calmarAnnualized,
    usingCapitalReturns,
  };
}

export type WinLossComparisonSide = {
  n: number;
  avgPositionSize: number | null;
  avgLeverage: number | null;
  avgR: number | null;
};

export type WinLossComparison = {
  win: WinLossComparisonSide;
  loss: WinLossComparisonSide;
};

// 贏的交易 vs 輸的交易,在部位大小/槓桿/R 上有沒有系統性差異
// (例如「一放大部位就開始虧」這種模式)。
export function winLossComparison(trades: TradePoint[]): WinLossComparison {
  const wins = trades.filter((t) => (t.realizedPnl ?? 0) > 0);
  const losses = trades.filter((t) => (t.realizedPnl ?? 0) < 0);

  const side = (list: TradePoint[]): WinLossComparisonSide => {
    const avg = (values: number[]) =>
      values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
    return {
      n: list.length,
      avgPositionSize: avg(
        list.map((t) => t.positionSize).filter((v): v is number => v != null),
      ),
      avgLeverage: avg(
        list.map((t) => t.leverage).filter((v): v is number => v != null),
      ),
      avgR: avg(list.map((t) => t.rMultiple).filter((v): v is number => v !== null)),
    };
  };

  return { win: side(wins), loss: side(losses) };
}

export type HourBucket = {
  hour: number;
  n: number;
  winRate: number | null;
  avgR: number | null;
  pnl: number;
};

// 依平倉時間的「本地小時」分組,找出一天中哪個時段表現較好/較差。
// 必須在瀏覽器端呼叫(理由同 groupByLocalDay:UTC 存值,本地小時才是使用者認知的時段)。
export function hourOfDayBreakdown(trades: TradePoint[]): HourBucket[] {
  const buckets = new Map<number, TradePoint[]>();
  for (const t of trades) {
    if (!t.closedAt || t.realizedPnl === null) continue;
    const h = new Date(t.closedAt).getHours();
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

export type PerfBucket = {
  rangeLabel: string;
  n: number;
  winRate: number | null;
  avgR: number | null;
  pnl: number;
};

function fmtBucketBound(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// 依連續數值欄位(部位大小/槓桿)等寬分桶,看不同區間的績效——
// 例如「部位一放大是不是就開始輸」。桶數少(預設4)是因為交易日誌樣本量
// 通常遠小於系統化回測,桶切太細每桶樣本會過少。
function performanceByContinuousField(
  trades: TradePoint[],
  getField: (t: TradePoint) => number | null | undefined,
  bucketCount = 4,
): PerfBucket[] {
  const withValue = trades
    .map((t) => ({ t, v: getField(t) }))
    .filter((x): x is { t: TradePoint; v: number } => x.v !== null && x.v !== undefined);
  if (withValue.length === 0) return [];

  const values = withValue.map((x) => x.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const buckets: { t: TradePoint; v: number }[][] = Array.from({ length: bucketCount }, () => []);
  for (const x of withValue) {
    const idx =
      range === 0 ? 0 : Math.min(bucketCount - 1, Math.floor(((x.v - min) / range) * bucketCount));
    buckets[idx].push(x);
  }
  const width = range / bucketCount;

  return buckets
    .map((list, i) => {
      const start = min + i * width;
      const end = i === bucketCount - 1 ? max : start + width;
      const pnls = list.map(({ t }) => t.realizedPnl).filter((p): p is number => p !== null);
      const wins = pnls.filter((p) => p > 0).length;
      const losses = pnls.filter((p) => p < 0).length;
      const rs = list.map(({ t }) => t.rMultiple).filter((r): r is number => r !== null);
      return {
        rangeLabel:
          range === 0
            ? fmtBucketBound(min)
            : `${fmtBucketBound(start)}~${fmtBucketBound(end)}`,
        n: list.length,
        winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
        avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
        pnl: pnls.reduce((s, p) => s + p, 0),
      };
    })
    .filter((b) => b.n > 0);
}

export function performanceByPositionSize(trades: TradePoint[], bucketCount = 4): PerfBucket[] {
  return performanceByContinuousField(trades, (t) => t.positionSize, bucketCount);
}

export function performanceByLeverage(trades: TradePoint[], bucketCount = 4): PerfBucket[] {
  return performanceByContinuousField(trades, (t) => t.leverage, bucketCount);
}

export type SampleTier = "insufficient" | "building" | "sufficient";

// 樣本數分級(TradeMind_裁量交易版統計驗證流程規劃.md 3.1節的裁量交易版校準):
// <20 筆「數據過少,僅供參考」、20-50 筆「初步趨勢,仍需累積」、50+ 筆才算有基礎樣本。
// 分級只改變呈現(要不要加警語),不改變任何數字本身怎麼算,也不影響排序。
export function sampleTier(n: number): SampleTier {
  if (n < 20) return "insufficient";
  if (n < 50) return "building";
  return "sufficient";
}

export const SAMPLE_TIER_LABEL: Record<Exclude<SampleTier, "sufficient">, string> = {
  insufficient: "數據過少,僅供參考",
  building: "初步趨勢,仍需累積",
};

export type DisciplineComplianceResult = { marked: number; rate: number | null };

// 紀律遵守率:依這筆交易的紀律檢查清單完成度算,不是單一是非題——只要有勾過
// 至少一條規則就算「已標記」,全部勾選才算「有遵守」。原本各自寫在
// psychology-view.tsx 跟週期回顧(lib/period-stats.ts)裡,抽成共用函式。
export function disciplineComplianceRate(
  trades: { ruleChecks: boolean[] }[],
): DisciplineComplianceResult {
  const marked = trades.filter((t) => t.ruleChecks.length > 0);
  const followed = marked.filter((t) => t.ruleChecks.every((c) => c));
  return {
    marked: marked.length,
    rate: marked.length ? (followed.length / marked.length) * 100 : null,
  };
}

export type SetupRankRow = {
  name: string;
  n: number;
  winRate: number | null;
  pnl: number;
};

// Setup 排行前 N 名,依總損益排序——週期回顧(lib/period-stats.ts)專用的
// 精簡版,只要排行前幾名,不像 setup-view.tsx 的 aggregate() 需要支援任意
// 維度分組跟二維交叉分析,兩邊定位不同不強行合併成同一個函式。
export function topSetupsByPnl(
  trades: { setupName: string | null; realizedPnl: number | null }[],
  n = 3,
): SetupRankRow[] {
  const groups = new Map<string, { realizedPnl: number | null }[]>();
  for (const t of trades) {
    if (t.setupName === null) continue;
    const arr = groups.get(t.setupName) ?? [];
    arr.push(t);
    groups.set(t.setupName, arr);
  }
  return [...groups.entries()]
    .map(([name, list]) => {
      const pnls = list.map((t) => t.realizedPnl).filter((p): p is number => p !== null);
      const wins = pnls.filter((p) => p > 0).length;
      const losses = pnls.filter((p) => p < 0).length;
      return {
        name,
        n: list.length,
        winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
        pnl: pnls.reduce((s, p) => s + p, 0),
      };
    })
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, n);
}

export type TraderScoreComponent = {
  score: number | null; // 0-100
  unavailableReason?: string;
};

export type TraderScore = {
  overall: number | null; // 0-100,四個子分數依權重加權平均,四捨五入
  unavailableReason?: string;
  sampleCaveat?: string;
  profitability: TraderScoreComponent;
  riskControl: TraderScoreComponent & { method?: "sharpe" | "drawdown_ratio" };
  consistency: TraderScoreComponent;
  discipline: TraderScoreComponent;
};

// 權重寫死在這裡,不是使用者可調參數——分數要能跨期間/跨使用者比較才有
// 「一眼看懂表現」的產品價值,可調權重會讓同一個分數在不同人手上代表不同
// 東西。獲利能力權重最高但刻意壓在 50% 以下,不讓「這期剛好賺錢」直接
// 決定分數——呼應這個 app 一貫的「不能用損益倒推紀律好壞」原則。
const TRADER_SCORE_WEIGHTS = {
  profitability: 0.35,
  riskControl: 0.25,
  consistency: 0.2,
  discipline: 0.2,
} as const;

// 四捨五入到整數——子分數是給人看的 0-100 分,不是內部精確計算值,顯示
// 帶一長串小數(例如紀律分數直接沿用 disciplineRate 的浮點數)是真的
// bug,不是刻意的精度。
function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

// 兩點以上的錨定線性內插,超出範圍夾在端點——用來把「有意義但量綱不同」的
// 原始指標(獲利因子/Sharpe/回撤比例/獲利集中度)映射成同一把 0-100 的尺。
// points 需依 x 由小到大排序,y 可以遞增或遞減(用在「比例越小越好」的指標)。
function piecewiseScore(value: number, points: [x: number, y: number][]): number {
  if (value <= points[0][0]) return clampScore(points[0][1]);
  const last = points[points.length - 1];
  if (value >= last[0]) return clampScore(last[1]);
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return clampScore(y0 + t * (y1 - y0));
    }
  }
  return clampScore(last[1]);
}

const PROFITABILITY_POINTS: [number, number][] = [
  [0.5, 0],
  [1, 50],
  [2.5, 100],
];
const SHARPE_POINTS: [number, number][] = [
  [0, 0],
  [1, 60],
  [2, 100],
];
// 回撤/毛利比,只在沒有 riskAdjusted(Sharpe 需要至少20個交易日,週報幾乎
// 不可能達標)時當備援——比例越小代表回撤相對獲利越輕微,風控越好。
const DRAWDOWN_RATIO_POINTS: [number, number][] = [
  [0.2, 100],
  [1.5, 0],
];
// 最大單筆獲利占毛利的比例(%)——用來看「這期的獲利是不是靠一筆運氣單撐起
// 來的」,比例越低代表獲利來源越分散、越可信。呼應 TradeZella 調研裡「某月
// 是唯一虧損月,其餘月份撐起獲利曲線」這類集中度洞察的量化版本。
const CONCENTRATION_POINTS: [number, number][] = [
  [15, 100],
  [60, 0],
];

// 綜合評分(對照 TradeZella「Zella Score」調研,產品需要一個「一眼看懂表現」
// 的單一數字,但刻意不做成黑箱——四個子分數的公式/權重都攤開在這個檔案裡,
// UI 端的說明文字直接描述同一套邏輯)。任一子分數算不出來時該子項回傳 null
// 並附原因,總分只用「算得出來的子項」依權重重新歸一化,不會為了湊出一個
// 總分就拿假設值頂替缺項。
//
// 樣本閘門:已平倉且有輸贏結果(不含平手)少於 10 筆時整個不給分——這個
// 分數會被拿去做分享圖卡的「蓋章」數字,比 app 其他地方(sampleTier 從 20
// 筆才開始加警語)更保守,避免小樣本的極端分數被截圖出去誤導。10-20筆之間
// 仍然给分但附帶 sampleCaveat 提醒。
export function computeTraderScore(
  trades: TradePoint[],
  riskAdjusted: RiskAdjustedMetrics,
  discipline: DisciplineComplianceResult,
): TraderScore {
  const summary = summarise(trades);
  const decided = summary.winCount + summary.lossCount;

  if (decided < 10) {
    return {
      overall: null,
      unavailableReason: `已平倉且有輸贏結果的交易只有 ${decided} 筆,樣本太少(至少需要 10 筆)無法評分。`,
      profitability: { score: null },
      riskControl: { score: null },
      consistency: { score: null },
      discipline: { score: null },
    };
  }
  const sampleCaveat =
    decided < 20 ? `樣本只有 ${decided} 筆(建議 20 筆以上),分數可能還不穩定。` : undefined;

  // 獲利能力:獲利因子映射,PF=1(打平)給50分,PF>=2.5給滿分。沒有虧損
  // 交易時 profitFactor 定義上是 null(無限大),只要有實際獲利就視為滿分。
  const profitability: TraderScoreComponent =
    summary.grossLoss === 0
      ? summary.grossProfit > 0
        ? { score: 100 }
        : { score: null, unavailableReason: "沒有輸贏結果,無法評估獲利能力。" }
      : { score: piecewiseScore(summary.profitFactor as number, PROFITABILITY_POINTS) };

  // 風險控管:優先用 Sharpe(統計上更嚴謹),樣本不足(常見於週報,20個交易日
  // 幾乎不可能在一週內達標)時退回回撤/毛利比當粗略替代,並標記用了哪種方法。
  let riskControl: TraderScoreComponent & { method?: "sharpe" | "drawdown_ratio" };
  if (riskAdjusted.available && riskAdjusted.sharpeAnnualized !== null) {
    riskControl = {
      score: piecewiseScore(riskAdjusted.sharpeAnnualized, SHARPE_POINTS),
      method: "sharpe",
    };
  } else if (summary.grossProfit > 0) {
    const ratio = Math.abs(summary.maxDrawdown) / summary.grossProfit;
    riskControl = { score: piecewiseScore(ratio, DRAWDOWN_RATIO_POINTS), method: "drawdown_ratio" };
  } else {
    riskControl = { score: null, unavailableReason: "沒有獲利交易,無法評估風險控管。" };
  }

  // 一致性:最大單筆獲利占毛利的集中度,越分散越一致。
  let consistency: TraderScoreComponent;
  if (summary.grossProfit > 0) {
    const wins = trades
      .map((t) => t.realizedPnl)
      .filter((p): p is number => p !== null && p > 0);
    const largestWin = Math.max(...wins);
    const share = (largestWin / summary.grossProfit) * 100;
    consistency = { score: piecewiseScore(share, CONCENTRATION_POINTS) };
  } else {
    consistency = { score: null, unavailableReason: "沒有獲利交易,無法評估獲利集中度。" };
  }

  // 紀律:直接沿用既有的紀律遵守率計算(見 disciplineComplianceRate),
  // 不重新發明一套判斷邏輯。
  const disciplineComp: TraderScoreComponent =
    discipline.marked > 0
      ? { score: clampScore(discipline.rate as number) }
      : { score: null, unavailableReason: "還沒有標記過紀律規則。" };

  const parts: { key: keyof typeof TRADER_SCORE_WEIGHTS; comp: TraderScoreComponent }[] = [
    { key: "profitability", comp: profitability },
    { key: "riskControl", comp: riskControl },
    { key: "consistency", comp: consistency },
    { key: "discipline", comp: disciplineComp },
  ];
  const available = parts.filter((p) => p.comp.score !== null);
  const overall =
    available.length === 0
      ? null
      : Math.round(
          available.reduce((s, p) => s + (p.comp.score as number) * TRADER_SCORE_WEIGHTS[p.key], 0) /
            available.reduce((s, p) => s + TRADER_SCORE_WEIGHTS[p.key], 0),
        );

  return {
    overall,
    sampleCaveat,
    profitability,
    riskControl,
    consistency,
    discipline: disciplineComp,
  };
}

// 依「本地日期」分組的每日損益。
// 分組必須在瀏覽器端做——交易時間存的是 UTC,但使用者認知的「哪一天」
// 是自己的時區;在伺服器分組會讓跨午夜的交易歸錯天。
export function groupByLocalDay(
  trades: TradePoint[],
): Map<string, { pnl: number; count: number }> {
  const map = new Map<string, { pnl: number; count: number }>();
  for (const t of trades) {
    if (!t.closedAt || t.realizedPnl === null) continue;
    const d = new Date(t.closedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const prev = map.get(key) ?? { pnl: 0, count: 0 };
    map.set(key, { pnl: prev.pnl + t.realizedPnl, count: prev.count + 1 });
  }
  return map;
}
