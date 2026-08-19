import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERSONAS, type PersonaKey } from "@/lib/personas";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatSidePanel } from "@/components/chat/chat-side-panel";

export const metadata: Metadata = {
  title: "AI 問答 · TradeMind",
};

export default async function ChatListPage() {
  const user = await getCurrentUser();

  const conversations = await prisma.chatConversation.findMany({
    where: { userId: user!.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, persona: true, title: true, updatedAt: true, archivedAt: true },
  });

  const summaries = conversations.map((c) => ({
    id: c.id,
    personaLabel: PERSONAS[c.persona as PersonaKey]?.name ?? c.persona,
    title: c.title,
    updatedAt: c.updatedAt.toISOString(),
    archivedAt: c.archivedAt?.toISOString() ?? null,
  }));

  return (
    <div className="flex h-full">
      <ChatSidePanel conversations={summaries} />
      <div className="flex flex-1 flex-col overflow-hidden px-9 py-8">
        <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col overflow-hidden">
          <div className="mb-4">
            <h1 className="text-[1.4rem] font-semibold">AI 問答</h1>
            <p className="mt-0.5 text-[0.84rem] text-text-secondary">
              直接問人格關於你自己交易的任何問題,不是評論單筆交易或固定週期,想問什麼就問
            </p>
          </div>

          <ChatShell conversationId={null} initialMessages={[]} initialPersona="ict" />
        </div>
      </div>
    </div>
  );
}
