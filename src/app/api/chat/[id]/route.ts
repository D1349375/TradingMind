import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPersonaKey } from "@/lib/personas";
import { resolveAccountScope } from "@/lib/account-filter";
import { runPersonaChat, ChatNotConfiguredError } from "@/lib/chat";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const CREDIT_COST = 3; // 暫定值,同 /api/chat/route.ts 說明
const MAX_MESSAGE_LENGTH = 2000;

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

  const balance = await prisma.creditBalance.findUnique({ where: { userId: user.id } });
  if (!balance || balance.balance < CREDIT_COST) {
    return NextResponse.json(
      { error: "Credit 餘額不足", required: CREDIT_COST, balance: balance?.balance ?? 0 },
      { status: 402 },
    );
  }

  const scope = await resolveAccountScope(user.id);
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
    if (err instanceof ChatNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : "生成失敗";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

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
    prisma.creditBalance.update({
      where: { userId: user.id },
      data: { balance: { decrement: CREDIT_COST }, totalSpent: { increment: CREDIT_COST } },
    }),
    prisma.creditTransaction.create({
      data: { userId: user.id, amount: -CREDIT_COST, reason: "persona_chat" },
    }),
  ]);

  return NextResponse.json({ reply: result.text });
}
