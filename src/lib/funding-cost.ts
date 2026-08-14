// 資金費率拖累分析。永續合約每 8 小時結算一次資金費率,是加密貨幣衍生品
// 特有的成本項,一般交易日誌(股票/期貨)完全沒有這個概念。
//
// 兩種資料來源,精確度不同,UI 上必須分開標示,不能混為同一種數字:
//   - explicit:CSV 匯入的交易——Bybit CSV 匯出本身就有「Funding Fee」欄,直接讀
//   - estimated:Bybit API 同步的交易——closed-pnl 端點沒有單獨回傳資金費率
//     (推測內含在 closedPnl 裡但沒拆開,見已知限制記錄),改用「預期損益
//     (不含資金費率)減去實際損益」反推——這是推估值,不是 Bybit 官方數字,
//     可能包含其他微小誤差來源,不是 100% 純資金費率。
export type FundingCostSource = "explicit" | "estimated";

export type FundingTradeInput = {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number | null;
  positionSize: number;
  fee: number | null;
  fundingFee: number | null;
  realizedPnl: number | null;
};

// 正值 = 資金費率是淨成本(吃掉損益);負值 = 資金費率反而是淨收入。
export function fundingCostOf(
  t: FundingTradeInput,
): { value: number; source: FundingCostSource } | null {
  if (t.fundingFee !== null) {
    return { value: t.fundingFee, source: "explicit" };
  }
  if (t.exitPrice === null || t.realizedPnl === null) return null;

  const gross =
    t.direction === "LONG"
      ? (t.exitPrice - t.entryPrice) * t.positionSize
      : (t.entryPrice - t.exitPrice) * t.positionSize;
  const netBeforeFunding = gross - (t.fee ?? 0);
  return { value: netBeforeFunding - t.realizedPnl, source: "estimated" };
}

export type FundingCostSummary = {
  available: boolean;
  unavailableReason?: string;
  totalCost: number;
  explicitCount: number;
  estimatedCount: number;
  unavailableCount: number;
  grossProfit: number;
  pctOfGrossProfit: number | null;
};

export function summarizeFundingCost(trades: FundingTradeInput[]): FundingCostSummary {
  let totalCost = 0;
  let explicitCount = 0;
  let estimatedCount = 0;
  let unavailableCount = 0;
  let grossProfit = 0;

  for (const t of trades) {
    if (t.realizedPnl !== null && t.realizedPnl > 0) grossProfit += t.realizedPnl;
    const r = fundingCostOf(t);
    if (!r) {
      unavailableCount++;
      continue;
    }
    totalCost += r.value;
    if (r.source === "explicit") explicitCount++;
    else estimatedCount++;
  }

  const covered = explicitCount + estimatedCount;
  if (covered === 0) {
    return {
      available: false,
      unavailableReason: "目前的交易缺出場價或已實現損益,無法估算資金費率。",
      totalCost: 0,
      explicitCount,
      estimatedCount,
      unavailableCount,
      grossProfit,
      pctOfGrossProfit: null,
    };
  }

  return {
    available: true,
    totalCost,
    explicitCount,
    estimatedCount,
    unavailableCount,
    grossProfit,
    pctOfGrossProfit: grossProfit > 0 ? (totalCost / grossProfit) * 100 : null,
  };
}
