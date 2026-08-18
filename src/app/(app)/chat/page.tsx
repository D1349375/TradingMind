import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERSONAS, type PersonaKey } from "@/lib/personas";
import { NewChatForm } from "@/components/chat/new-chat-form";

export const metadata: Metadata = {
  title: "AI 問答 · TradeMind",
};

function fmtDateTime(d: Date) {
  return d.toLocaleString("zh-TW", { timeZone: "UTC", hour12: false });
}

export default async function ChatListPage() {
  const user = await getCurrentUser();

  const conversations = await prisma.chatConversation.findMany({
    where: { userId: user!.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, persona: true, title: true, updatedAt: true },
  });

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[900px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">AI 問答</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            直接問人格關於你自己交易的任何問題,不是評論單筆交易或固定週期,想問什麼就問
          </p>
        </div>

        <NewChatForm />

        {conversations.length === 0 ? (
          <div className="rounded border border-dashed border-border bg-canvas px-4 py-12 text-center text-[0.85rem] text-text-secondary">
            還沒有任何對話紀錄。選一個人格,問出第一個問題。
          </div>
        ) : (
          <ul className="space-y-2">
            {conversations.map((c) => {
              const personaLabel = PERSONAS[c.persona as PersonaKey]?.name ?? c.persona;
              return (
                <li key={c.id}>
                  <Link
                    href={`/chat/${c.id}`}
                    className="block rounded border border-border bg-surface px-4 py-3.5 hover:border-accent"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[0.85rem] font-semibold">{c.title || "(無標題對話)"}</span>
                      <span className="shrink-0 text-[0.72rem] text-text-tertiary">{fmtDateTime(c.updatedAt)}</span>
                    </div>
                    <span className="mt-1 inline-block text-[0.75rem] text-text-secondary">{personaLabel}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
