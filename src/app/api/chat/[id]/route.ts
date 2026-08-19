import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPersonaKey } from "@/lib/personas";
import { resolveAccountScope } from "@/lib/account-filter";
import { runPersonaChat, ChatNotConfiguredError } from "@/lib/chat";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSpendableBalance, reserveCredits, refundCredits, creditSpendOps } from "@/lib/credits";
import { requiresPaidTier } from "@/lib/tier-limits";

const CREDIT_COST = 3; // 2026-08-19 定案,同 /api/chat/route.ts 說明
const MAX_MESSAGE_LENGTH = 2000;

// 同一個對話的訊息數硬上限(使用者+人格訊息合計)。防的是「刻意不開新
// 對話,同一個session問到底」——歷史越長,每輪的cache read成本就越高
// (跟對話長度成正比,即使折扣後也沒有天花板),長期下來單則真實成本會
// 超過固定3 Credits的收入。硬上限把每個對話的歷史大小、單則成本都鎖住
// 在可預期範圍。前端(chat-shell.tsx)有複製同一個數字做UI提前擋,但
// 真正的防線在這裡——前端擋不了直接打API的情況。
const MAX_MESSAGES_PER_CONVERSATION = 30;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const conversation = await prisma.chatConversation.findFirst({
    where: { id: params.id, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return NextResponse.json({ error: "找不到這段對話" }, { status: 404 });

  return NextResponse.json({ conversation });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const tierCheck = requiresPaidTier(user.subscriptionTier);
  if (tierCheck.blocked) return NextResponse.json({ error: tierCheck.error }, { status: 403 });

  const rl = await checkRateLimit("chat-message", user.id, { limit: 20, windowSeconds: 3600 });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const conversation = await prisma.chatConversation.findFirst({
    where: { id: params.id, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return NextResponse.json({ error: "找不到這段對話" }, { status: 404 });
  if (!isPersonaKey(conversation.persona)) {
    return NextResponse.json({ error: "這段對話的人格資料異常" }, { status: 500 });
  }
  if (conversation.archivedAt) {
    return NextResponse.json(
      { error: "這個對話已封存,請先取消封存再繼續發言", code: "CONVERSATION_ARCHIVED" },
      { status: 409 },
    );
  }
  if (conversation.messages.length >= MAX_MESSAGES_PER_CONVERSATION) {
    return NextResponse.json(
      { error: "這個對話已經達到訊息數上限,請開新對話繼續", code: "CONVERSATION_LIMIT_REACHED" },
      { status: 409 },
    );
  }

  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "訊息不能是空的" }, { status: 400 });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `訊息長度不能超過 ${MAX_MESSAGE_LENGTH} 字` }, { status: 400 });
  }

  // 呼叫 LLM 之前先原子扣款(見 lib/credits.ts 開頭說明,擋並發請求超扣
  // 同一份餘額),扣不到代表餘額不夠。
  const reserved = await reserveCredits(user.id, CREDIT_COST);
  if (!reserved) {
    const available = await getSpendableBalance(user.id);
    return NextResponse.json(
      { error: "Credit 餘額不足", required: CREDIT_COST, balance: available?.total ?? 0 },
      { status: 402 },
    );
  }

  const scope = await resolveAccountScope(user.id, user.subscriptionTier);
  const history = conversation.messages.map((m) => ({
    role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));

  let result;
  try {
    result = await runPersonaChat({
      persona: conversation.persona,
      userId: user.id,
      scope,
      history,
      userMessage: message,
    });
  } catch (err) {
    // 失敗的呼叫不該讓使用者付錢——已經扣過的額度退回。
    await refundCredits(user.id, CREDIT_COST);
    if (err instanceof ChatNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : "生成失敗";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 扣款已經在上面 reserveCredits() 完成,這裡只建立訊息紀錄+留一筆
  // CreditTransaction 稽核紀錄。
  await prisma.$transaction([
    prisma.chatMessage.create({
      data: { conversationId: conversation.id, role: "USER", content: message },
    }),
    prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: result.text,
        toolCalls: result.toolCalls as unknown as Prisma.InputJsonValue,
        creditsCost: CREDIT_COST,
      },
    }),
    prisma.chatConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
    ...creditSpendOps(user.id, CREDIT_COST, "persona_chat"),
  ]);

  return NextResponse.json({ reply: result.text });
}

const MAX_TITLE_LENGTH = 60;

// 側欄用:重新命名 / 封存 / 取消封存。封存是軟性隱藏(archivedAt有值),
// 不刪除訊息紀錄——跟這個專案其他刪除操作(帳戶模板等)的softer那一種
// 一致,使用者隨時可以在側欄切到「已封存」把它調回來。
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const conversation = await prisma.chatConversation.findFirst({ where: { id: params.id, userId: user.id } });
  if (!conversation) return NextResponse.json({ error: "找不到這段對話" }, { status: 404 });

  let body: { title?: unknown; archived?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const data: { title?: string; archivedAt?: Date | null } = {};
  if (typeof body.title === "string") {
    const trimmed = body.title.trim();
    if (!trimmed) return NextResponse.json({ error: "標題不能是空的" }, { status: 400 });
    if (trimmed.length > MAX_TITLE_LENGTH) {
      return NextResponse.json({ error: `標題不能超過 ${MAX_TITLE_LENGTH} 字` }, { status: 400 });
    }
    data.title = trimmed;
  }
  if (typeof body.archived === "boolean") {
    data.archivedAt = body.archived ? new Date() : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "沒有可更新的欄位" }, { status: 400 });
  }

  const updated = await prisma.chatConversation.update({ where: { id: conversation.id }, data });
  return NextResponse.json({ title: updated.title, archivedAt: updated.archivedAt?.toISOString() ?? null });
}
