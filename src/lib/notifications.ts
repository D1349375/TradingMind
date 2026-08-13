// 通知設定的核心邏輯。刻意只做「使用者在 app 裡就能算出來」的兩種通知
// (新交易待補充/當日虧損警告),不做「使用者不在 app 裡也要收到」的定時提醒——
// 那種需要 Web Push 或 Email 服務,目前沒有接,見 design.md/settings 頁的說明,
// 不要為了填滿三個開關就做一個按時間觸發卻永遠不會真的送出的假功能。

export type ReviewTrade = {
  closedAt: string | null;
  grade: string | null;
  reflectionNote: string | null;
};

// 已平倉超過 sinceDays 天還沒補充(沒打分、沒寫反思筆記)的交易數。
// 只看「最近」的,避免舊資料把提醒卡死在一個使用者已經放棄回顧的數字上。
export function countPendingReview(trades: ReviewTrade[], sinceDays = 14): number {
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  return trades.filter((t) => {
    if (!t.closedAt) return false;
    if (new Date(t.closedAt).getTime() < cutoff) return false;
    return !t.grade && !t.reflectionNote;
  }).length;
}

export type GoalForAlert = {
  lossLimitMode: "FIXED" | "PERCENT";
  dailyLossFixed: number | null;
  dailyLossPercent: number | null;
  totalCapital: number | null;
};

// 回撤緩衝剩餘百分比,跟 GoalCards 用同一套門檻(≤25% 算「危險」)——
// 兩處各自算是因為一個在 Sidebar(所有頁面都要看到警示),一個在 Dashboard
// 卡片本身,重複這幾行比硬跨元件共用 state 單純。
export function isTodayLossDanger(todayLoss: number, goal: GoalForAlert): boolean {
  const limit =
    goal.lossLimitMode === "PERCENT"
      ? (goal.totalCapital ?? 0) * ((goal.dailyLossPercent ?? 0) / 100)
      : (goal.dailyLossFixed ?? 0);
  if (limit <= 0) return false;
  const remainPct = Math.max(0, Math.min(100, (1 - todayLoss / limit) * 100));
  return remainPct <= 25;
}
