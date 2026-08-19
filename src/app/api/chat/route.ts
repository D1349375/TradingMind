import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPersonaKey } from "@/lib/personas";
import { resolveAccountScope } from "@/lib/account-filter";
import { runPersonaChat, ChatNotConfiguredError } from "@/lib/chat";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSpendableBalance, planCreditSpend, creditSpendOps } from "@/lib/credits";
import { requiresPaidTier } from "@/lib/tier-limits";

// 開放式人格問答(TradeMind_開放式人格問答_技術設計.md)。這支路由建立
// 新對話(第一則訊息);既有對話的後續訊息走 /api/chat/[id]。
// 2026-08-19 定案維持3(見TradeMind_Credit定價與營收策略.md第十節):真實
// 3輪對話實測,平均每則成本約$0.04(標準定價,已排除即將到期的Sonnet 5
// 上線優惠價),新對話第一則(無快取)最貴約$0.076,margin最薄約36%,
// 後續輪次因命中prompt cache margin回升到78-86%——維持3不調整。
const CREDIT_COST = 3;
const MAX_MESSAGE_LENGTH = 2000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const conversations = await prisma.chatConversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, persona: true, title: true, updatedAt: true, createdAt: true },
  });
  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const tierCheck = requiresPaidTier(user.subscriptionTier);
  if (tierCheck.blocked) return NextResponse.json({ error: tierCheck.error }, { status: 403 });

  const rl = await checkRateLimit("chat-message", user.id, { limit: 20, windowSeconds: 3600 });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  let body: { persona?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const persona = typeof body.persona === "string" ? body.persona : "";
  if (!isPersonaKey(persona)) {
    return NextResponse.json({ error: "人格參數不正確" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "訊息不能是空的" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `訊息長度不能超過 ${MAX_MESSAGE_LENGTH} 字` }, { status: 400 });
  }

  // 1. 預檢查額度,先擋掉沒錢的請求,不浪費一次 LLM 呼叫
  const available = await getSpendableBalance(user.id);
  if (!available || available.total < CREDIT_COST) {
    return NextResponse.json(
      { error: "Credit 餘額不足", required: CREDIT_COST, balance: available?.total ?? 0 },
      { status: 402 },
    );
  }
  const spend = planCreditSpend(available, CREDIT_COST);

  const scope = await resolveAccountScope(user.id, user.subscriptionTier);

  let result;
  try {
    result = await runPersonaChat({ persona, userId: user.id, scope, history: [], userMessage: message });
  } catch (err) {
    if (err instanceof ChatNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : "生成失敗";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 2. 只有真的成功產出回覆才扣款跟建立對話紀錄。用批次陣列形式的
  // $transaction(不是 callback 形式的互動式交易)——理由跟全站其他寫入
  // (period-reports/route.ts、綠界 callback)一致,互動式交易會在整個
  // callback 執行期間占用一個連線,在 Supabase pooler 上更容易撞到
  // "Unable to start a transaction in the given time"(P2028)這個逾時,
  // 批次陣列形式不會有這個問題。先自己生成 id 取代讓 Prisma 自動產生,
  // 這樣才能在同一個陣列裡讓 ChatMessage 引用還沒真正建立的 ChatConversation id。
  const conversationId = randomUUID();
  await prisma.$transaction([
    prisma.chatConversation.create({
      data: { id: conversationId, userId: user.id, persona, title: message.slice(0, 40) },
    }),
    prisma.chatMessage.create({
      data: { conversationId, role: "USER", content: message },
    }),
    prisma.chatMessage.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: result.text,
        // ChatToolCallLog[]的input欄位是Record<string,unknown>(工具參數
        // 型別不定),Prisma的InputJsonValue要求明確排除unknown——用跟
        // period-reports route.ts寫statsSnapshot同一種中介轉型。
        toolCalls: result.toolCalls as unknown as Prisma.InputJsonValue,
        creditsCost: CREDIT_COST,
      },
    }),
    ...creditSpendOps(user.id, spend, CREDIT_COST, "persona_chat"),
  ]);

  return NextResponse.json({ conversationId, reply: result.text });
}
