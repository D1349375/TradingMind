"use client";

import { useEffect, useRef, useState } from "react";

type Message = { id: string; role: "USER" | "ASSISTANT"; content: string };

const CREDIT_COST = 3;

export function ChatThread({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);

    // 樂觀先把使用者訊息放上去,失敗了再從清單移除,體驗上不用等API回來
    // 才看到自己剛打的字。
    const optimisticId = `pending-${Date.now()}`;
    setMessages((prev) => [...prev, { id: optimisticId, role: "USER", content: trimmed }]);
    setInput("");

    try {
      const res = await fetch(`/api/chat/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setError(
          res.status === 402
            ? `Credit 餘額不足(需要 ${data.required},目前 ${data.balance})`
            : (data.error ?? "發送失敗"),
        );
        return;
      }
      setMessages((prev) => [
        ...prev,
        { id: `reply-${Date.now()}`, role: "ASSISTANT", content: data.reply },
      ]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError("網路錯誤,請稍後再試");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded border border-border bg-surface">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "USER" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded px-3.5 py-2.5 text-[0.85rem] leading-relaxed whitespace-pre-wrap ${
                m.role === "USER"
                  ? "bg-accent-soft text-text"
                  : "border border-border bg-canvas text-text"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded border border-dashed border-border bg-canvas px-3.5 py-2.5 text-[0.8rem] text-text-secondary">
              思考中…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div role="alert" className="mx-4 mb-2 rounded border border-loss bg-loss-bg px-3 py-2 text-[0.8rem] text-loss">
          {error}
        </div>
      )}

      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="輸入訊息,Enter傳送、Shift+Enter換行"
            rows={2}
            className="flex-1 resize-none rounded border border-border bg-canvas px-3 py-2 text-[0.85rem] outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !input.trim()}
            className="shrink-0 rounded bg-accent px-4 py-2 text-[0.82rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            送出
          </button>
        </div>
        <p className="mt-1.5 text-[0.72rem] text-text-tertiary">每則回覆 {CREDIT_COST} Credits</p>
      </div>
    </div>
  );
}
