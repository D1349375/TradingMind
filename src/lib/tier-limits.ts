import { prisma } from "@/lib/prisma";
import type { SubscriptionTier } from "@prisma/client";

// FREE 方案的兩個資料量限制,刻意分開,原因不同(見規劃書 Phase3
// 訂閱制段落/2026-08-19 討論):
//
// - FREE_VISIBLE_TRADES(30):使用者能「查看」的交易數量上限,同業驗證過
//   的有效轉換鎖(TradeZella等)。只影響查詢/顯示,不影響同步/匯入/新增
//   本身——交易所自動同步一律正常寫入資料庫,不因為使用者是FREE就漏記
//   真實交易,不然使用者升級後也補不回來,比「暫時看不到」嚴重得多。
//
// - FREE_STORED_TRADES(2000):FREE 方案能「儲存」的交易總數上限,防的是
//   CSV 一次性大量匯入的濫用情境(交易紀錄本身很便宜,但不該真的無上限)。
//   這個限制只擋 CSV 匯入跟手動新增,**不擋自動交易所同步**——同步是
//   真實交易數據,不能因為存量上限就漏記,寧可讓同步繼續寫入超過上限也
//   不要遺漏真實紀錄;2000 這個數字抓得夠寬鬆,一般交易頻率的使用者
//   純靠自動同步要一年以上才會碰到,只有刻意大量匯入才會撞到。
export const FREE_VISIBLE_TRADES = 30;
export const FREE_STORED_TRADES = 2000;

// 算出 FREE 使用者「可見範圍」的 closedAt 下限——只算全域(不受目前帳戶
// 篩選器影響),避免「篩選成單一模板反而看得到更多筆」這種漏洞。
// STANDARD/ADVANCED 回傳 null(不限制)。
export async function resolveTradeVisibilityCutoff(
  userId: string,
  tier: SubscriptionTier,
): Promise<Date | null> {
  if (tier !== "FREE") return null;

  const cutoffTrade = await prisma.trade.findFirst({
    where: { userId, closedAt: { not: null } },
    orderBy: { closedAt: "desc" },
    skip: FREE_VISIBLE_TRADES - 1,
    select: { closedAt: true },
  });
  // 交易數 < 30 筆時 cutoffTrade 是 null,代表全部都在可見範圍內,
  // 用一個極早的日期當下限等於不限制。
  return cutoffTrade?.closedAt ?? new Date(0);
}

// 合併可見度下限進既有的 closedAt 查詢條件——page-cache.ts 的函式目前
// 都是 `orderBy: { closedAt: ... }` 沒有另外帶 closedAt where 條件,
// 所以這裡先只處理「沒有既有條件」的情況,不用處理合併兩個範圍的邏輯。
export function applyTradeVisibility(cutoff: Date | null) {
  return cutoff ? { gte: cutoff } : undefined;
}

// FREE 方案整個功能都不開放的情況,統一用這個檢查,錯誤訊息格式一致。
export function requiresPaidTier(tier: SubscriptionTier): { blocked: true; error: string } | { blocked: false } {
  if (tier === "FREE") {
    return { blocked: true, error: "這個功能需要訂閱 STANDARD 或 ADVANCED 方案才能使用" };
  }
  return { blocked: false };
}

// CSV 匯入/手動新增前檢查存量上限。回傳 true 代表還有空間可以再新增
// count 筆,false 代表會超過上限、要擋下來。STANDARD/ADVANCED 永遠回傳
// true(不限制)。
export async function canStoreMoreTrades(
  userId: string,
  tier: SubscriptionTier,
  additionalCount: number,
): Promise<boolean> {
  if (tier !== "FREE") return true;
  const existing = await prisma.trade.count({ where: { userId } });
  return existing + additionalCount <= FREE_STORED_TRADES;
}
