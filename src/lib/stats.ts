// 統計計算。純函式、不碰 DB 也不碰 React,方便單獨驗算。
//
// 誠實原則(design.md 一貫立場):算不出來的指標回傳 null,由 UI 顯示「—」,
// 不要用 0 或猜測值頂替——0 在統計裡是有意義的數字,拿它代表「沒有資料」
// 會讓使用者誤判。

export type TradePoint = {
  closedAt: string | null; // ISO
  realizedPnl: number | null;
  rMultiple: number | null;
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
