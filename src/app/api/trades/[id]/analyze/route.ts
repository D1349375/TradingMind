import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPersonaKey } from "@/lib/personas";
import {
  runPersonaAnalysis,
  TraderDebateNotConfiguredError,
  type TradeDataForAnalysis,
} from "@/lib/trader-debate";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSpendableBalance, planCreditSpend, creditSpendOps } from "@/lib/credits";

// 純文字單一人格分析,規劃書 11.2 節定價
const CREDIT_COST = 5;
const REASON = "single_persona_analysis";

function holdingDuration(openedAt: Date | null, closedAt: Date | null): string | null {
  if (!openedAt || !closedAt) return null;
  const ms = closedAt.getTime() - openedAt.getTime();
  if (ms < 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  // 每次呼叫都是真的 LLM API 費用,Credit 餘額本來就會擋住長期濫用,
  // 但這裡多擋一層短時間爆量(例如程式錯誤造成的迴圈連續呼叫)。
  const rl = await checkRateLimit("analyze", user.id, { limit: 10, windowSeconds: 3600 });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  let body: { persona?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const persona = typeof body.persona === "string" ? body.persona : "";
  if (!isPersonaKey(persona)) {
    return NextResponse.json({ error: "人格參數不正確" }, { status: 400 });
  }

  const trade = await prisma.trade.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      setup: { select: { name: true, entryLogic: true } },
      ruleChecks: { select: { checked: true, rule: { select: { label: true } } } },
      customValues: { select: { value: true, field: { select: { label: true } } } },
    },
  });
  if (!trade) {
    return NextResponse.json({ error: "找不到這筆交易" }, { status: 404 });
  }

  // 1. 預檢查額度(規劃書 11.4 流程),先擋掉沒錢的請求,不浪費一次 LLM 呼叫
  const available = await getSpendableBalance(user.id);
  if (!available || available.total < CREDIT_COST) {
    return NextResponse.json(
      { error: "Credit 餘額不足", required: CREDIT_COST, balance: available?.total ?? 0 },
      { status: 402 },
    );
  }
  const spend = planCreditSpend(available, CREDIT_COST);

  const tradeData: TradeDataForAnalysis = {
    symbol: trade.symbol,
    direction: trade.direction,
    entryPrice: trade.entryPrice.toString(),
    exitPrice: trade.exitPrice?.toString() ?? null,
    positionSize: trade.positionSize.toString(),
    leverage: trade.leverage?.toString() ?? null,
    fee: trade.fee.toString(),
    realizedPnl: trade.realizedPnl?.toString() ?? null,
    rMultiple: trade.rMultiple?.toString() ?? null,
    grade: trade.grade,
    holdingDuration: holdingDuration(trade.openedAt, trade.closedAt),
    reflectionNote: trade.reflectionNote,
    setup: trade.setup ? { name: trade.setup.name, entryLogic: trade.setup.entryLogic } : null,
    disciplineChecks: trade.ruleChecks.map((c) => ({ rule: c.rule.label, checked: c.checked })),
    customFields: Object.fromEntries(
      trade.customValues.map((v) => [v.field.label, v.value]),
    ),
  };

  let result;
  try {
    result = await runPersonaAnalysis(persona, tradeData);
  } catch (err) {
    if (err instanceof TraderDebateNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "分析失敗";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // 2. 只有真的成功產出結果才扣款——失敗的呼叫不該讓使用者付錢
  await prisma.$transaction(creditSpendOps(user.id, spend, CREDIT_COST, REASON));

  return NextResponse.json({ result, creditsSpent: CREDIT_COST });
}
