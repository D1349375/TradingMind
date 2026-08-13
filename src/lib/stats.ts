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
