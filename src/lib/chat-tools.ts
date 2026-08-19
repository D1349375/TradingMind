import { prisma } from "@/lib/prisma";
import { tradeAccountFilter, resolveGoalState } from "@/lib/page-cache";
import type { AccountScope } from "@/lib/account-filter";
import {
  summarise,
  disciplineComplianceRate,
  topSetupsByPnl,
  winLossComparison,
  riskAdjustedMetrics,
  type TradePoint,
} from "@/lib/stats";
import { computeBehaviorAlerts, type BehaviorTrade } from "@/lib/behavior-detection";
import { DETECTION_DEFS } from "@/lib/behavior-presets";

// 開放式人格問答的讀取工具(TradeMind_開放式人格問答_技術設計.md 第二/四節
// 定案:只做唯讀,不給任何寫入/操作能力)。每個工具的回傳都刻意排除機敏
// 資料(交易所連線的 API Key/Secret 絕對不出現在任何工具回傳裡,即使是
// 使用者問自己的資料也一樣——這不是「使用者能不能看自己的資料」的問題,
// 是「不要把密鑰貼進 LLM prompt/context」這個獨立的安全原則,唯讀性質不
// 改變這個判斷)。
//
// 每個工具都限定在目前的帳戶篩選範圍(AccountScope)內,跟其他分析頁的
// 篩選邏輯一致,不會讓 AI 讀到使用者篩選範圍以外、但仍屬於自己的其他模板
// 資料——這其實比"讀取全部資料"更保守,是刻意的。

const TRADE_SELECT = {
  closedAt: true,
  openedAt: true,
  symbol: true,
  direction: true,
  realizedPnl: true,
  rMultiple: true,
  positionSize: true,
  leverage: true,
  reflectionNote: true,
  setup: { select: { name: true } },
} as const;

// 模型自己組出來的日期字串,格式不保證正確(使用者訊息裡的怪輸入也可能
// 誘導模型傳出無法解析的字串)。無效日期直接當「沒填」處理,不要讓
// Invalid Date 傳進 Prisma 查詢條件炸掉整輪對話。
function parseOptionalDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toTradePoint(t: {
  closedAt: Date | null;
  realizedPnl: unknown;
  rMultiple: unknown;
  positionSize: unknown;
  leverage: unknown;
}): TradePoint {
  return {
    closedAt: t.closedAt?.toISOString() ?? null,
    realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
    rMultiple: t.rMultiple === null ? null : Number(t.rMultiple),
    positionSize: t.positionSize === null ? null : Number(t.positionSize),
    leverage: t.leverage === null ? null : Number(t.leverage),
  };
}

// ---- 工具一:交易總覽統計 ----

export const GET_TRADING_SUMMARY_SCHEMA = {
  name: "get_trading_summary",
  description:
    "取得使用者交易的統計總覽,包含總損益/勝率/獲利因子/平均R/最大回撤、紀律遵守率、Setup排行前5名、贏輸交易對照、風險調整報酬指標(如果樣本足夠)。可選填期間範圍,不填則計算全部歷史交易。",
  input_schema: {
    type: "object" as const,
    properties: {
      periodStart: { type: "string", description: "起始日期,ISO格式(例如2026-08-01),不填則不限起始" },
      periodEnd: { type: "string", description: "結束日期,ISO格式,不填則不限結束" },
    },
  },
};

export async function executeGetTradingSummary(
  userId: string,
  scope: AccountScope,
  params: { periodStart?: string; periodEnd?: string },
) {
  const closedAt: { gte?: Date; lte?: Date } = {};
  const gte = parseOptionalDate(params.periodStart);
  const lte = parseOptionalDate(params.periodEnd);
  if (gte) closedAt.gte = gte;
  if (lte) closedAt.lte = lte;
  const hasRange = gte !== undefined || lte !== undefined;

  const rows = await prisma.trade.findMany({
    where: {
      userId,
      accountId: tradeAccountFilter(scope.accountIds, scope.isFiltered),
      ...(hasRange ? { closedAt } : {}),
    },
    select: TRADE_SELECT,
  });

  const trades = rows.map(toTradePoint);
  const disciplineRows = await prisma.trade.findMany({
    where: {
      userId,
      accountId: tradeAccountFilter(scope.accountIds, scope.isFiltered),
      ...(hasRange ? { closedAt } : {}),
    },
    select: { ruleChecks: { select: { checked: true } }, setup: { select: { name: true } }, realizedPnl: true },
  });

  const summary = summarise(trades);
  const discipline = disciplineComplianceRate(disciplineRows.map((t) => ({ ruleChecks: t.ruleChecks.map((c) => c.checked) })));
  const topSetups = topSetupsByPnl(
    disciplineRows.map((t) => ({ setupName: t.setup?.name ?? null, realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl) })),
    5,
  );
  const winLoss = winLossComparison(trades);
  const risk = riskAdjustedMetrics(trades, null);

  return {
    tradeCount: summary.tradeCount,
    totalPnl: summary.totalPnl,
    winRate: summary.winRate,
    profitFactor: summary.profitFactor,
    avgR: summary.avgR,
    maxDrawdown: summary.maxDrawdown,
    disciplineComplianceRate: discipline.rate,
    disciplineMarkedCount: discipline.marked,
    topSetups,
    winLossComparison: winLoss,
    riskAdjusted: risk.available
      ? { sharpeAnnualized: risk.sharpeAnnualized, sortinoAnnualized: risk.sortinoAnnualized, calmarAnnualized: risk.calmarAnnualized }
      : { available: false, reason: risk.unavailableReason },
  };
}

// ---- 工具二:搜尋交易明細 ----

export const SEARCH_TRADES_SCHEMA = {
  name: "search_trades",
  description:
    "搜尋符合條件的交易明細清單(最多回傳50筆,依平倉時間新到舊排序)。用來回答「哪幾筆賠最多」「這個Setup的交易有哪些」這類需要看到個別交易的問題,不是要總覽統計時應該用 get_trading_summary。",
  input_schema: {
    type: "object" as const,
    properties: {
      setupName: { type: "string", description: "只看特定Setup名稱的交易" },
      symbol: { type: "string", description: "只看特定商品,例如BTCUSDT" },
      direction: { type: "string", enum: ["LONG", "SHORT"], description: "只看多單或空單" },
      periodStart: { type: "string", description: "起始日期,ISO格式" },
      periodEnd: { type: "string", description: "結束日期,ISO格式" },
      onlyLosses: { type: "boolean", description: "true時只看虧損的交易" },
      onlyWins: { type: "boolean", description: "true時只看獲利的交易" },
      limit: { type: "number", description: "最多回傳幾筆,預設20,上限50" },
    },
  },
};

export async function executeSearchTrades(
  userId: string,
  scope: AccountScope,
  params: {
    setupName?: string;
    symbol?: string;
    direction?: "LONG" | "SHORT";
    periodStart?: string;
    periodEnd?: string;
    onlyLosses?: boolean;
    onlyWins?: boolean;
    limit?: number;
  },
) {
  const closedAt: { gte?: Date; lte?: Date } = {};
  const gte = parseOptionalDate(params.periodStart);
  const lte = parseOptionalDate(params.periodEnd);
  if (gte) closedAt.gte = gte;
  if (lte) closedAt.lte = lte;
  const hasRange = gte !== undefined || lte !== undefined;
  // limit 上限50、下限1——防的是模型被誘導傳一個誇張的數字(例如
  // 「回傳100000筆」)硬灌大量資料進context,不管使用者訊息裡怎麼要求。
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);

  const pnlFilter = params.onlyLosses ? { lt: 0 } : params.onlyWins ? { gt: 0 } : undefined;

  const rows = await prisma.trade.findMany({
    where: {
      userId,
      accountId: tradeAccountFilter(scope.accountIds, scope.isFiltered),
      ...(hasRange ? { closedAt } : {}),
      ...(params.symbol ? { symbol: params.symbol } : {}),
      ...(params.direction ? { direction: params.direction } : {}),
      ...(pnlFilter ? { realizedPnl: pnlFilter } : {}),
      ...(params.setupName ? { setup: { name: params.setupName } } : {}),
    },
    select: TRADE_SELECT,
    orderBy: { closedAt: "desc" },
    take: limit,
  });

  return {
    count: rows.length,
    trades: rows.map((t) => ({
      closedAt: t.closedAt?.toISOString() ?? null,
      symbol: t.symbol,
      direction: t.direction,
      realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
      rMultiple: t.rMultiple === null ? null : Number(t.rMultiple),
      positionSize: t.positionSize === null ? null : Number(t.positionSize),
      leverage: t.leverage === null ? null : Number(t.leverage),
      setupName: t.setup?.name ?? null,
      // 反思筆記截斷到300字,控制token成本,夠回答「這筆我當時在想什麼」這類問題
      reflectionNoteExcerpt: t.reflectionNote ? t.reflectionNote.slice(0, 300) : null,
    })),
  };
}

// ---- 工具三:紀律規則與行為偵測 ----

export const GET_DISCIPLINE_AND_BEHAVIOR_SCHEMA = {
  name: "get_discipline_and_behavior",
  description: "取得使用者設定的紀律規則清單、行為偵測(復仇交易/上頭/連續虧損/單筆風險超標)的開關與目前偵測結果。",
  input_schema: { type: "object" as const, properties: {} },
};

export async function executeGetDisciplineAndBehavior(userId: string, scope: AccountScope) {
  const [rules, behaviorRows, tradeRows, goals] = await Promise.all([
    prisma.disciplineRule.findMany({ where: { userId, active: true }, select: { label: true, isAutoDetected: true } }),
    // 這兩個查詢下面的程式碼本來就只會逐欄位取值(不會 ...row 整包展開),
    // 現在不存在洩漏風險,但明確列 select 是這個檔案的一貫做法——之後
    // schema 加欄位時,不用重新追一遍消費端邏輯才能確認安全,看 select
    // 就知道這支工具能拿到什麼。
    prisma.behaviorDetectionSetting.findMany({
      where: { userId },
      select: { kind: true, enabled: true, threshold: true },
    }),
    prisma.trade.findMany({
      where: { userId, accountId: tradeAccountFilter(scope.accountIds, scope.isFiltered) },
      select: { closedAt: true, openedAt: true, realizedPnl: true, positionSize: true, entryPrice: true },
    }),
    prisma.goal.findMany({
      where: { accountId: { in: scope.accountIds } },
      select: { lossLimitMode: true, dailyLossFixed: true, dailyLossPercent: true, totalCapital: true, profitTargetAmount: true },
    }),
  ]);

  const byKind = new Map(behaviorRows.map((r) => [r.kind, r]));
  const settings = DETECTION_DEFS.map((def) => {
    const row = byKind.get(def.kind);
    return {
      kind: def.kind,
      enabled: row?.enabled ?? def.defaultEnabled,
      threshold: (row?.threshold as Record<string, number> | undefined) ?? def.defaultThreshold,
    };
  });
  const totalCapital = resolveGoalState(goals, scope.accountIds.length)?.totalCapital ?? null;
  const behaviorTrades: BehaviorTrade[] = tradeRows.map((t) => ({
    closedAt: t.closedAt?.toISOString() ?? null,
    openedAt: t.openedAt?.toISOString() ?? null,
    realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
    positionSize: t.positionSize === null ? null : Number(t.positionSize),
    entryPrice: t.entryPrice === null ? null : Number(t.entryPrice),
  }));
  const alerts = computeBehaviorAlerts(behaviorTrades, settings, totalCapital);
  const labelByKind = Object.fromEntries(DETECTION_DEFS.map((d) => [d.kind, d.label]));

  return {
    disciplineRules: rules.map((r) => ({ label: r.label, isAutoDetected: r.isAutoDetected })),
    behaviorDetection: alerts.map((a) => ({ label: labelByKind[a.kind] ?? a.kind, ...a })),
  };
}

// ---- 工具四:帳戶與目標設定(唯讀,絕不包含API金鑰) ----

export const GET_ACCOUNT_SETTINGS_SCHEMA = {
  name: "get_account_settings",
  description:
    "取得使用者目前的帳戶模板設定(名稱/種類/資產類別/是否已連接交易所——不含任何金鑰)、目標與風控設定(帳戶總資金/每日虧損上限)、已啟用的自訂欄位清單。用來回答「我該調整什麼設定」這類問題。",
  input_schema: { type: "object" as const, properties: {} },
};

export async function executeGetAccountSettings(userId: string, scope: AccountScope) {
  const [accounts, goals, fieldDefs] = await Promise.all([
    prisma.tradingAccount.findMany({
      where: { userId },
      select: {
        id: true,
        label: true,
        kind: true,
        assetClass: true,
        exchangeConnection: { select: { id: true, provider: true, lastSyncedAt: true } },
      },
    }),
    prisma.goal.findMany({
      where: { accountId: { in: scope.accountIds } },
      select: { lossLimitMode: true, dailyLossFixed: true, dailyLossPercent: true, totalCapital: true },
    }),
    prisma.customFieldDefinition.findMany({ where: { userId }, select: { key: true, label: true, fieldType: true } }),
  ]);

  return {
    accounts: accounts.map((a) => ({
      label: a.label,
      kind: a.kind,
      assetClass: a.assetClass ?? (a.exchangeConnection ? "CRYPTO" : null),
      exchangeConnected: a.exchangeConnection !== null,
      exchangeProvider: a.exchangeConnection?.provider ?? null,
      lastSyncedAt: a.exchangeConnection?.lastSyncedAt?.toISOString() ?? null,
      isInCurrentFilterScope: scope.accountIds.includes(a.id),
    })),
    goalSettings: goals.map((g) => ({
      lossLimitMode: g.lossLimitMode,
      dailyLossFixed: g.dailyLossFixed ? Number(g.dailyLossFixed) : null,
      dailyLossPercent: g.dailyLossPercent ? Number(g.dailyLossPercent) : null,
      totalCapital: g.totalCapital ? Number(g.totalCapital) : null,
    })),
    enabledCustomFields: fieldDefs.map((f) => ({ key: f.key, label: f.label, fieldType: f.fieldType })),
  };
}

// ---- 統一匯出:工具schema清單 + dispatch ----

export const CHAT_TOOL_SCHEMAS = [
  GET_TRADING_SUMMARY_SCHEMA,
  SEARCH_TRADES_SCHEMA,
  GET_DISCIPLINE_AND_BEHAVIOR_SCHEMA,
  GET_ACCOUNT_SETTINGS_SCHEMA,
];

// 唯讀工具的白名單 dispatch——刻意用 switch 明確列舉,不用動態
// `(tools as any)[name]()` 這種可以被注入任意函式名稱呼叫的寫法,
// 就算 name 是模型從被污染的輸入生出來的字串,也只能命中這四個
// 讀取函式之一,沒有第五個選項。
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
  scope: AccountScope,
): Promise<object> {
  try {
    switch (name) {
      case "get_trading_summary":
        return await executeGetTradingSummary(userId, scope, input as { periodStart?: string; periodEnd?: string });
      case "search_trades":
        return await executeSearchTrades(userId, scope, input);
      case "get_discipline_and_behavior":
        return await executeGetDisciplineAndBehavior(userId, scope);
      case "get_account_settings":
        return await executeGetAccountSettings(userId, scope);
      default:
        return { error: `未知的工具:${name}` };
    }
  } catch {
    // 任何查詢失敗(不管是壞掉的參數還是其他原因)都不能讓例外往上炸開
    // 整輪對話——那樣不只浪費掉這輪已經花掉的真實API成本,還可能把
    // Prisma的原始錯誤訊息(可能帶表名/欄位名等內部細節)原樣回給前端。
    // 回一個籠統的錯誤結果讓模型自己決定怎麼跟使用者說。
    return { error: "查詢這項資料時發生問題,請換個方式再問一次" };
  }
}
