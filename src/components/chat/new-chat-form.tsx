"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PERSONAS = [
  { key: "ict", label: "ICT" },
  { key: "tjr", label: "TJR" },
  { key: "emperorbtc", label: "EmperorBTC" },
] as const;

const CREDIT_COST = 3;

export function NewChatForm() {
  const router = useRouter();
  const [persona, setPersona] = useState<(typeof PERSONAS)[number]["key"]>("ict");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  async function submit() {
    const trimmed = message.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 503) setNotConfigured(true);
        setError(
          res.status === 402
            ? `Credit 餘額不足(需要 ${data.required},目前 ${data.balance})`
            : (data.error ?? "發送失敗"),
        );
        return;
      }
      router.push(`/chat/${data.conversationId}`);
    } catch {
      setError("網路錯誤,請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-5 rounded border border-border bg-surface px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[0.8rem] font-semibold text-text-secondary">人格</span>
        {PERSONAS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPersona(p.key)}
            aria-pressed={persona === p.key}
            className={`rounded-full border px-3 py-1.5 text-[0.82rem] ${
              persona === p.key
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-border bg-canvas text-text-secondary hover:border-accent hover:text-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="想問這個人格什麼?例如「我最近紀律有變差嗎」「這個Setup值得繼續用嗎」"
        rows={3}
        className="w-full resize-none rounded border border-border bg-canvas px-3 py-2 text-[0.85rem] outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[0.72rem] text-text-tertiary">每則回覆 {CREDIT_COST} Credits</span>
        <button
          type="button"
          onClick={submit}
          disabled={loading || !message.trim()}
          className="rounded bg-accent px-4 py-1.5 text-[0.82rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "傳送中…" : "開始新對話"}
        </button>
      </div>

      {error && !notConfigured && (
        <div role="alert" className="mt-3 rounded border border-loss bg-loss-bg px-3 py-2.5 text-[0.82rem] text-loss">
          {error}
        </div>
      )}
      {notConfigured && (
        <div className="mt-3 rounded border border-dashed border-border bg-canvas px-4 py-4">
          <div className="mb-1 text-[0.85rem] font-semibold text-text-secondary">AI 問答尚未開放</div>
          <p className="text-[0.8rem] leading-relaxed text-text-secondary">
            這個功能還沒有接上 AI 服務,還不會扣 Credit。等後台設定好之後就能直接使用。
          </p>
        </div>
      )}
    </div>
  );
}
