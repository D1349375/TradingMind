import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPersonaKey } from "@/lib/personas";
import {
  runPeriodReport,
  PeriodReportNotConfiguredError,
} from "@/lib/period-report";
import { buildPeriodStats, getPriorRange, type PeriodTrade } from "@/lib/period-stats";
import { computeBehaviorAlerts } from "@/lib/behavior-detection";
import { DETECTION_DEFS } from "@/lib/behavior-presets";
import { resolveAccountScope, resolveAssetClassMix } from "@/lib/account-filter";
import { tradeAccountFilter, resolveGoalState } from "@/lib/page-cache";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSpendableBalance, planCreditSpend, creditSpendOps } from "@/lib/credits";
import { requiresPaidTier } from "@/lib/tier-limits";
import { addMonths } from "@/lib/subscriptions";

// 週報/月報產生。2026-08-19 訂閱制上線後接上真正的分層定價(見
// `TradeMind_Credit定價與營收策略.md`第五節):FREE整個功能擋掉、
// STANDARD全額付費、ADVANCED每個訂閱週期(用Subscription.currentPeriodEnd
// 往前推一個月當作這期的起點,不是額外開一個計數器欄位)有「2次週報+1次
// 月報」免費額度,用完後才跟STANDARD一樣付費(但費率較低)。
const STANDARD_COST = { WEEK: 12, MONTH: 30 } as const;
const ADVANCED_OVERAGE_COST = { WEEK: 8, MONTH: 20 } as const;
const ADVANCED_INCLUDED_QUOTA = { WEEK: 2, MONTH: 1 } as const;

function toTradeRow(t: {
  closedAt: Date | null;
  openedAt: Date | null;
  realizedPnl: unknown;
  rMultiple: unknown;
  positionSize: unknown;
  leverage: unknown;
  entryPrice: unknown;
  setup: { name: string } | null;
  ruleChecks: { checked: boolean }[];
}): PeriodTrade {
  return {
    closedAt: t.closedAt?.toISOString() ?? null,
    openedAt: t.openedAt?.toISOString() ?? null,
    realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
    rMultiple: t.rMultiple === null ? null : Number(t.rMultiple),
    positionSize: t.positionSize === null ? null : Number(t.positionSize),
    leverage: t.leverage === null ? null : Number(t.leverage),
    entryPrice: t.entryPrice === null ? null : Number(t.entryPrice),
    setupName: t.setup?.name ?? null,
    ruleChecks: t.ruleChecks.map((c) => c.checked),
  };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const tierCheck = requiresPaidTier(user.subscriptionTier);
  if (tierCheck.blocked) return NextResponse.json({ error: tierCheck.error }, { status: 403 });

  const rl = await checkRateLimit("period-report", user.id, { limit: 5, windowSeconds: 3600 });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  let body: {
    periodType?: unknown;
    periodStart?: unknown;
    periodEnd?: unknown;
    utcOffsetMinutes?: unknown;
    persona?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const periodType = body.periodType === "MONTH" ? "MONTH" : body.periodType === "WEEK" ? "WEEK" : null;
  if (!periodType) {
    return NextResponse.json({ error: "periodType 必須是 WEEK 或 MONTH" }, { status: 400 });
  }
  const persona = typeof body.persona === "string" ? body.persona : "";
  if (!isPersonaKey(persona)) {
    return NextResponse.json({ error: "人格參數不正確" }, { status: 400 });
  }
  const periodStart = typeof body.periodStart === "string" ? new Date(body.periodStart) : null;
  const periodEnd = typeof body.periodEnd === "string" ? new Date(body.periodEnd) : null;
  if (!periodStart || !periodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    return NextResponse.json({ error: "期間起訖時間格式不正確" }, { status: 400 });
  }
  const utcOffsetMinutes = typeof body.utcOffsetMinutes === "number" ? body.utcOffsetMinutes : 0;

  const scope = await resolveAccountScope(user.id, user.subscriptionTier);
  const accountId = tradeAccountFilter(scope.accountIds, scope.isFiltered);
  const prior = getPriorRange(periodType, periodStart);

  const tradeSelect = {
    closedAt: true,
    openedAt: true,
    realizedPnl: true,
    rMultiple: true,
    positionSize: true,
    leverage: true,
    entryPrice: true,
    setup: { select: { name: true } },
    ruleChecks: { select: { checked: true } },
  } as const;

  // 交叉分析(components/analysis/setup-view.tsx 的 CrossAnalysisSection)
  // 要用到的欄位比一般統計多(商品/自訂欄位值),只有這一期(current)要凍結
  // 進快照,上一期(prior)只拿來算趨勢對照,不需要多查這些欄位。
  const currentSelect = {
    ...tradeSelect,
    symbol: true,
    customValues: {
      select: { value: true, field: { select: { key: true } } },
    },
  } as const;

  const [currentRows, priorRows, behaviorRows, goals, assetClassMix, fieldDefs] = await Promise.all([
    prisma.trade.findMany({
      where: { userId: user.id, accountId, closedAt: { gte: periodStart, lte: periodEnd } },
      select: currentSelect,
    }),
    prisma.trade.findMany({
      where: { userId: user.id, accountId, closedAt: { gte: prior.start, lt: prior.end } },
      select: tradeSelect,
    }),
    prisma.behaviorDetectionSetting.findMany({ where: { userId: user.id } }),
    prisma.goal.findMany({ where: { accountId: { in: scope.accountIds } } }),
    resolveAssetClassMix(scope.accountIds),
    prisma.customFieldDefinition.findMany({ where: { userId: user.id }, select: { key: true } }),
  ]);

  const currentTrades = currentRows.map(toTradeRow);
  const priorTrades = priorRows.map(toTradeRow);
  const crossAnalysisTrades = currentRows.map((t) => ({
    symbol: t.symbol,
    closedAt: t.closedAt?.toISOString() ?? null,
    realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
    rMultiple: t.rMultiple === null ? null : Number(t.rMultiple),
    setupName: t.setup?.name ?? null,
    fieldsByKey: Object.fromEntries(t.customValues.map((v) => [v.field.key, v.value])),
  }));
  const enabledFieldKeys = fieldDefs.map((f) => f.key);

  const byKind = new Map(behaviorRows.map((r) => [r.kind, r]));
  const behaviorSettings = DETECTION_DEFS.map((def) => {
    const row = byKind.get(def.kind);
    return {
      kind: def.kind,
      enabled: row?.enabled ?? def.defaultEnabled,
      threshold: (row?.threshold as Record<string, number> | undefined) ?? def.defaultThreshold,
    };
  });
  const behaviorLabelByKind = Object.fromEntries(DETECTION_DEFS.map((d) => [d.kind, d.label]));
  const totalCapital = resolveGoalState(goals, scope.accountIds.length)?.totalCapital ?? null;
  const behaviorAlerts = computeBehaviorAlerts(currentTrades, behaviorSettings, totalCapital);

  const statsSnapshot = buildPeriodStats({
    periodType,
    periodStart,
    periodEnd,
    utcOffsetMinutes,
    currentTrades,
    priorTrades,
    behaviorAlerts,
    behaviorLabelByKind,
    assetClassMixed: assetClassMix.mixed,
    totalCapital,
    crossAnalysisTrades,
    enabledFieldKeys,
  });

  // 1. 算這次要扣多少 Credit——STANDARD 全額付費;ADVANCED 這個訂閱週期
  // 內還有免費額度就是 0,額度用完才用比較低的超額費率。週期起點用
  // Subscription.currentPeriodEnd 往前推一個月,不用另外開計數器欄位。
  let creditCost: number;
  let creditReasonSuffix = "";
  if (user.subscriptionTier === "ADVANCED") {
    const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    const cycleStart = sub?.currentPeriodEnd ? addMonths(sub.currentPeriodEnd, -1) : new Date(0);
    const usedThisCycle = await prisma.periodReport.count({
      where: { userId: user.id, periodType, createdAt: { gte: cycleStart } },
    });
    if (usedThisCycle < ADVANCED_INCLUDED_QUOTA[periodType]) {
      creditCost = 0;
      creditReasonSuffix = "_included";
    } else {
      creditCost = ADVANCED_OVERAGE_COST[periodType];
      creditReasonSuffix = "_overage";
    }
  } else {
    creditCost = STANDARD_COST[periodType];
  }

  const available = await getSpendableBalance(user.id);
  if (!available || available.total < creditCost) {
    return NextResponse.json(
      { error: "Credit 餘額不足", required: creditCost, balance: available?.total ?? 0 },
      { status: 402 },
    );
  }
  const spend = planCreditSpend(available, creditCost);

  let result;
  try {
    // dailySeries/crossAnalysisTrades/enabledFieldKeys/traderScore 都只給
    // 詳情頁UI用,不送進LLM——傳完整snapshot會讓prompt白白變胖(尤其
    // crossAnalysisTrades帶了逐筆交易的反思筆記文字),LLM也用不到這些。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { dailySeries, crossAnalysisTrades, enabledFieldKeys, traderScore, ...statsForLLM } = statsSnapshot;
    result = await runPeriodReport(persona, statsForLLM);
  } catch (err) {
    if (err instanceof PeriodReportNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "生成失敗";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // 2. 只有真的成功產出結果才扣款——失敗的呼叫不該讓使用者付錢
  const [report] = await prisma.$transaction([
    prisma.periodReport.create({
      data: {
        userId: user.id,
        periodType,
        periodStart,
        periodEnd,
        persona,
        // crossAnalysisTrades.fieldsByKey 型別是 Record<string, unknown>
        // (自訂欄位值本來就是未知形狀的 JSON),Prisma 的 InputJsonValue
        // 要求明確排除 unknown——用跟讀取端(normalizePeriodStatsSnapshot
        // 呼叫處)同一種 unknown 中介轉型,不逐欄位窄化型別。
        statsSnapshot: statsSnapshot as unknown as Prisma.InputJsonValue,
        result,
      },
    }),
    ...creditSpendOps(
      user.id,
      spend,
      creditCost,
      `${periodType === "WEEK" ? "period_report_week" : "period_report_month"}${creditReasonSuffix}`,
    ),
  ]);

  return NextResponse.json({ reportId: report.id, creditsSpent: creditCost });
}
