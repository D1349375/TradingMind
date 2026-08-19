// 純資料,client/server 都能安全 import——跟 credit-packs.ts 同一個理由。

// 訂閱方案正式定價(2026-08-19 定案,見 `TradeMind_Credit定價與營收策略.md`
// 第五節)。刻意用台幣直接定價,不是即時匯率換算——目標市場是台灣/亞洲
// 交易者,對台幣價格的敏感度錨點是其他台灣訂閱服務,不是美金;且綠界
// 定期定額金額在建立訂閱當下就鎖死,用即時匯率換算只會讓不同時間訂閱的
// 使用者付到不同金額,徒增複雜度沒有實質好處。350/650 的價格比(1.86倍)
// 落在 Credit定價文件第一節查證的同業區間(升一級價格漲1.6-1.7倍、
// Credit額度漲3-4倍——這裡是100→300,3倍)。
export const SUBSCRIPTION_PLANS = [
  { tier: "STANDARD", priceTwd: 350, monthlyCredits: 100, label: "STANDARD" },
  { tier: "ADVANCED", priceTwd: 650, monthlyCredits: 300, label: "ADVANCED" },
] as const;

export type SubscriptionPlanTier = (typeof SUBSCRIPTION_PLANS)[number]["tier"];

export function findSubscriptionPlan(tier: string) {
  return SUBSCRIPTION_PLANS.find((p) => p.tier === tier) ?? null;
}

// 方案等級高低比較用,升級/降級判斷靠這個排序,不是靠價格數字本身
// (價格未來可能調整,等級順序不應該跟著變動)。
const TIER_RANK: Record<string, number> = { FREE: 0, STANDARD: 1, ADVANCED: 2 };

export function compareTiers(a: string, b: string): number {
  return (TIER_RANK[a] ?? 0) - (TIER_RANK[b] ?? 0);
}
