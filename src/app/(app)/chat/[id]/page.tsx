import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERSONAS, type PersonaKey } from "@/lib/personas";
import { ChatThread } from "@/components/chat/chat-thread";

export const metadata: Metadata = {
  title: "AI 問答 · TradeMind",
};

export default async function ChatDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();

  const conversation = await prisma.chatConversation.findFirst({
    where: { id: params.id, userId: user!.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) notFound();

  const personaLabel = PERSONAS[conversation.persona as PersonaKey]?.name ?? conversation.persona;

  return (
    <div className="flex h-full flex-col px-9 py-8">
      <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col overflow-hidden">
        <div className="mb-4">
          <h1 className="text-[1.4rem] font-semibold">{conversation.title || "AI 問答"}</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">與 {personaLabel} 的對話</p>
        </div>

        <ChatThread
          conversationId={conversation.id}
          initialMessages={conversation.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          }))}
        />
      </div>
    </div>
  );
}
