import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERSONAS, isPersonaKey, type PersonaKey } from "@/lib/personas";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatSidePanel } from "@/components/chat/chat-side-panel";

export const metadata: Metadata = {
  title: "AI 問答 · TradeMind",
};

export default async function ChatDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const tierBlocked = user!.subscriptionTier === "FREE";

  const [conversation, conversations] = await Promise.all([
    prisma.chatConversation.findFirst({
      where: { id: params.id, userId: user!.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.chatConversation.findMany({
      where: { userId: user!.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, persona: true, title: true, updatedAt: true, archivedAt: true },
    }),
  ]);
  if (!conversation) notFound();
  if (!isPersonaKey(conversation.persona)) notFound();

  const personaLabel = PERSONAS[conversation.persona].name;
  const summaries = conversations.map((c) => ({
    id: c.id,
    personaLabel: PERSONAS[c.persona as PersonaKey]?.name ?? c.persona,
    title: c.title,
    updatedAt: c.updatedAt.toISOString(),
    archivedAt: c.archivedAt?.toISOString() ?? null,
  }));

  return (
    <div className="flex h-full">
      <ChatSidePanel conversations={summaries} activeId={conversation.id} />
      <div className="flex flex-1 flex-col overflow-hidden px-9 py-8">
        <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col overflow-hidden">
          <div className="mb-4">
            <h1 className="text-[1.4rem] font-semibold">{conversation.title || "AI 問答"}</h1>
            <p className="mt-0.5 text-[0.84rem] text-text-secondary">與 {personaLabel} 的對話</p>
          </div>

          <ChatShell
            conversationId={conversation.id}
            initialMessages={conversation.messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
            initialPersona={conversation.persona}
            archived={conversation.archivedAt !== null}
            tierBlocked={tierBlocked}
          />
        </div>
      </div>
    </div>
  );
}
