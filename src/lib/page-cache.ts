import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

// 同樣的道理跟 sidebar-data.ts 一樣:(app)/ 底下每個路由都是 force-dynamic,
// 沒有這層快取的話,使用者在頁面之間來回切換,每次都會重新對資料庫打一輪
// 查詢。這裡只包「純讀取展示」的頁面(Dashboard/日曆/Setup分析/心態分析)——
// 交易記錄頁跟 Playbook 頁本身就是編輯介面,編輯後靠 router.refresh() 拿
// 最新資料,套上這層時間快取會讓使用者看不到自己剛做的修改,刻意不套用。
// 30 秒窗口跟 sidebar 一致:分析數據本來就不需要毫秒級新鮮。
//
// 2026-08-16 起每個函式都多接 accountIds/isFiltered 兩個參數(帳戶篩選器,
// 見 lib/account-filter.ts)——因為是 unstable_cache 包住的函式參數,
// Next.js 會自動把它併進快取鍵,不同篩選範圍不會互相蓋掉快取。
// isFiltered=false(預設「全部模板合併檢視」)時,交易查詢刻意不加
// accountId 條件,而不是塞 `{in: allAccountIds}`——後者會漏掉
// accountId=null 的「未分類」交易(模板被刪除後留下的孤兒交易,見
// TradingAccount.trades 的 onDelete: SetNull),合併檢視應該看到使用者
// 名下「所有」交易,不分有沒有掛在某個模板底下。只有使用者主動篩選成
// 特定模板子集合時,才需要真的排除掉未分類的交易。
export function tradeAccountFilter(accountIds: string[], isFiltered: boolean) {
  return isFiltered ? { in: accountIds } : undefined;
}

export function resolveGoalState(
  goals: {
    lossLimitMode: "FIXED" | "PERCENT";
    dailyLossFixed: unknown;
    dailyLossPercent: unknown;
    totalCapital: unknown;
    profitTargetAmount?: unknown;
  }[],
  accountCount: number,
) {
  // 檢視範圍橫跨多個模板時,目標與風控無法合併成一組數字——誠實回傳 null,
  // 由 UI 層(GoalCards)顯示「不適用」,不要湊一個看起來像真數字的假合併值。
  // 判斷依據是「篩選範圍選了幾個帳戶」而不是「查到幾筆 Goal」——如果選了
  // 2 個帳戶但只有其中 1 個設定過 Goal,不能把那 1 筆數字當成整個合併範圍
  // 的代表值,一樣要當作不適用。
  if (accountCount !== 1 || goals.length !== 1) return null;
  const g = goals[0];
  return {
    lossLimitMode: g.lossLimitMode,
    dailyLossFixed: g.dailyLossFixed ? Number(g.dailyLossFixed) : null,
    dailyLossPercent: g.dailyLossPercent ? Number(g.dailyLossPercent) : null,
    totalCapital: g.totalCapital ? Number(g.totalCapital) : null,
    profitTargetAmount: g.profitTargetAmount
      ? Number(g.profitTargetAmount)
      : null,
  };
}

export const getDashboardData = unstable_cache(
  async (userId: string, accountIds: string[], isFiltered: boolean) => {
    const [rows, conns, goals] = await Promise.all([
      prisma.trade.findMany({
        where: { userId, accountId: tradeAccountFilter(accountIds, isFiltered) },
        select: {
          symbol: true,
          closedAt: true,
          realizedPnl: true,
          rMultiple: true,
          positionSize: true,
          leverage: true,
          direction: true,
          entryPrice: true,
          exitPrice: true,
          fee: true,
          fundingFee: true,
        },
        orderBy: { closedAt: "asc" },
      }),
      prisma.exchangeConnection.findMany({
        where: { accountId: { in: accountIds } },
        select: { lastSyncedAt: true },
      }),
      prisma.goal.findMany({ where: { accountId: { in: accountIds } } }),
    ]);

    const lastSyncedAt = conns.reduce<Date | null>((max, c) => {
      if (!c.lastSyncedAt) return max;
      return !max || c.lastSyncedAt > max ? c.lastSyncedAt : max;
    }, null);

    return {
      trades: rows.map((t) => ({
        symbol: t.symbol,
        closedAt: t.closedAt?.toISOString() ?? null,
        realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
        rMultiple: t.rMultiple === null ? null : Number(t.rMultiple),
        positionSize: Number(t.positionSize),
        leverage: t.leverage === null ? null : Number(t.leverage),
        direction: t.direction,
        entryPrice: Number(t.entryPrice),
        exitPrice: t.exitPrice === null ? null : Number(t.exitPrice),
        fee: Number(t.fee),
        fundingFee: t.fundingFee === null ? null : Number(t.fundingFee),
      })),
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
      goal: resolveGoalState(goals, accountIds.length),
    };
  },
  ["dashboard-data"],
  { revalidate: 30 },
);

export const getCalendarData = unstable_cache(
  async (userId: string, accountIds: string[], isFiltered: boolean) => {
    const rows = await prisma.trade.findMany({
      where: { userId, accountId: tradeAccountFilter(accountIds, isFiltered) },
      select: {
        id: true,
        symbol: true,
        direction: true,
        closedAt: true,
        realizedPnl: true,
      },
      orderBy: { closedAt: "asc" },
    });

    return rows.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      closedAt: t.closedAt?.toISOString() ?? null,
      realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
    }));
  },
  ["calendar-data"],
  { revalidate: 30 },
);

export const getSetupPageData = unstable_cache(
  async (userId: string, accountIds: string[], isFiltered: boolean) => {
    const [rows, fieldDefs] = await Promise.all([
      prisma.trade.findMany({
        where: { userId, accountId: tradeAccountFilter(accountIds, isFiltered) },
        select: {
          symbol: true,
          closedAt: true,
          realizedPnl: true,
          rMultiple: true,
          setup: { select: { name: true } },
          customValues: {
            select: { value: true, field: { select: { key: true } } },
          },
        },
      }),
      prisma.customFieldDefinition.findMany({
        where: { userId },
        select: { key: true },
      }),
    ]);

    return {
      trades: rows.map((t) => ({
        symbol: t.symbol,
        closedAt: t.closedAt?.toISOString() ?? null,
        realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
        rMultiple: t.rMultiple === null ? null : Number(t.rMultiple),
        setupName: t.setup?.name ?? null,
        fieldsByKey: Object.fromEntries(
          t.customValues.map((v) => [v.field.key, v.value]),
        ),
      })),
      enabledFieldKeys: fieldDefs.map((f) => f.key),
    };
  },
  ["setup-page-data"],
  { revalidate: 30 },
);

export const getPsychologyData = unstable_cache(
  async (userId: string, accountIds: string[], isFiltered: boolean) => {
    const [rows, fieldDefs, ruleCount, behaviorRows, goals] = await Promise.all([
      prisma.trade.findMany({
        where: { userId, accountId: tradeAccountFilter(accountIds, isFiltered) },
        select: {
          closedAt: true,
          openedAt: true,
          realizedPnl: true,
          positionSize: true,
          entryPrice: true,
          grade: true,
          customValues: {
            select: { value: true, field: { select: { key: true } } },
          },
          ruleChecks: { select: { checked: true } },
        },
        orderBy: { closedAt: "asc" },
      }),
      prisma.customFieldDefinition.findMany({
        where: { userId },
        select: { key: true },
      }),
      prisma.disciplineRule.count({ where: { userId, active: true } }),
      prisma.behaviorDetectionSetting.findMany({ where: { userId } }),
      prisma.goal.findMany({ where: { accountId: { in: accountIds } } }),
    ]);

    return {
      trades: rows.map((t) => {
        const byKey = Object.fromEntries(
          t.customValues.map((v) => [v.field.key, v.value]),
        );
        return {
          closedAt: t.closedAt?.toISOString() ?? null,
          openedAt: t.openedAt?.toISOString() ?? null,
          realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
          positionSize:
            t.positionSize === null ? null : Number(t.positionSize),
          entryPrice: t.entryPrice === null ? null : Number(t.entryPrice),
          grade: t.grade,
          emotion: typeof byKey.emotion === "string" ? byKey.emotion : null,
          ruleChecks: t.ruleChecks.map((c) => c.checked),
        };
      }),
      hasEmotionField: fieldDefs.some((f) => f.key === "emotion"),
      ruleCount,
      behaviorRows: behaviorRows.map((r) => ({
        kind: r.kind,
        enabled: r.enabled,
        threshold: r.threshold as Record<string, number> | null,
      })),
      totalCapital: resolveGoalState(goals, accountIds.length)?.totalCapital ?? null,
    };
  },
  ["psychology-data"],
  { revalidate: 30 },
);
