import { NextResponse, type NextRequest } from "next/server";
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
import { resolveAccountScope } from "@/lib/account-filter";
import { tradeAccountFilter, resolveGoalState } from "@/lib/page-cache";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// 週報/月報產生。額度這次先純 Credit 扣款,不分訂閱層級(見
// lib/period-report.ts 開頭說明;規劃書寫「進階訂閱獨家」,但系統目前完全
// 沒有訂閱層級能讓任何人變成進階,先不做 tier 檢查,靠 Credit 餘額擋)。
const CREDIT_COST = { WEEK: 8, MONTH: 20 } as const;

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

  const scope = await resolveAccountScope(user.id);
  const accountId = tradeAccountFilter(scope.accountIds, scope.isFiltered);
  const prior = getPriorRange(periodType, periodStart, periodEnd);

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

  const [currentRows, priorRows, behaviorRows, goals] = await Promise.all([
    prisma.trade.findMany({
      where: { userId: user.id, accountId, closedAt: { gte: periodStart, lte: periodEnd } },
      select: tradeSelect,
    }),
    prisma.trade.findMany({
      where: { userId: user.id, accountId, closedAt: { gte: prior.start, lt: prior.end } },
      select: tradeSelect,
    }),
    prisma.behaviorDetectionSetting.findMany({ where: { userId: user.id } }),
    prisma.goal.findMany({ where: { accountId: { in: scope.accountIds } } }),
  ]);

  const currentTrades = currentRows.map(toTradeRow);
  const priorTrades = priorRows.map(toTradeRow);

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
  });

  // 1. 預檢查額度,先擋掉沒錢的請求,不浪費一次 LLM 呼叫
  const creditCost = CREDIT_COST[periodType];
  const balance = await prisma.creditBalance.findUnique({ where: { userId: user.id } });
  if (!balance || balance.balance < creditCost) {
    return NextResponse.json(
      { error: "Credit 餘額不足", required: creditCost, balance: balance?.balance ?? 0 },
      { status: 402 },
    );
  }

  let result;
  try {
    // dailySeries 只給詳情頁畫圖用,不送進 LLM——傳完整 snapshot 進去會
    // 讓 prompt 白白變胖,LLM 也用不到逐日明細。
    const { dailySeries: _dailySeries, ...statsForLLM } = statsSnapshot;
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
        statsSnapshot,
        result,
      },
    }),
    prisma.creditBalance.update({
      where: { userId: user.id },
      data: { balance: { decrement: creditCost }, totalSpent: { increment: creditCost } },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: user.id,
        amount: -creditCost,
        reason: periodType === "WEEK" ? "period_report_week" : "period_report_month",
      },
    }),
  ]);

  return NextResponse.json({ reportId: report.id, creditsSpent: creditCost });
}
