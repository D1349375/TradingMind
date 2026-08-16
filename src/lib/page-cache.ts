import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

// 同樣的道理跟 sidebar-data.ts 一樣:(app)/ 底下每個路由都是 force-dynamic,
// 沒有這層快取的話,使用者在頁面之間來回切換,每次都會重新對資料庫打一輪
// 查詢。這裡只包「純讀取展示」的頁面(Dashboard/日曆/Setup分析/心態分析)——
// 交易記錄頁跟 Playbook 頁本身就是編輯介面,編輯後靠 router.refresh() 拿
// 最新資料,套上這層時間快取會讓使用者看不到自己剛做的修改,刻意不套用。
// 30 秒窗口跟 sidebar 一致:分析數據本來就不需要毫秒級新鮮。

export const getDashboardData = unstable_cache(
  async (userId: string) => {
    const [rows, conn, goal] = await Promise.all([
      prisma.trade.findMany({
        where: { userId },
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
      prisma.bybitConnection.findUnique({
        where: { userId },
        select: { lastSyncedAt: true },
      }),
      prisma.goal.findUnique({ where: { userId } }),
    ]);

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
      lastSyncedAt: conn?.lastSyncedAt?.toISOString() ?? null,
      goal: {
        lossLimitMode: goal?.lossLimitMode ?? "FIXED",
        dailyLossFixed: goal?.dailyLossFixed ? Number(goal.dailyLossFixed) : null,
        dailyLossPercent: goal?.dailyLossPercent
          ? Number(goal.dailyLossPercent)
          : null,
        totalCapital: goal?.totalCapital ? Number(goal.totalCapital) : null,
        profitTargetAmount: goal?.profitTargetAmount
          ? Number(goal.profitTargetAmount)
          : null,
      },
    };
  },
  ["dashboard-data"],
  { revalidate: 30 },
);

export const getCalendarData = unstable_cache(
  async (userId: string) => {
    const rows = await prisma.trade.findMany({
      where: { userId },
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
  async (userId: string) => {
    const [rows, fieldDefs] = await Promise.all([
      prisma.trade.findMany({
        where: { userId },
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
  async (userId: string) => {
    const [rows, fieldDefs, ruleCount, behaviorRows, goal] = await Promise.all([
      prisma.trade.findMany({
        where: { userId },
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
      prisma.goal.findUnique({ where: { userId } }),
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
      totalCapital: goal?.totalCapital ? Number(goal.totalCapital) : null,
    };
  },
  ["psychology-data"],
  { revalidate: 30 },
);
