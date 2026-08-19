"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import type { PersonaKey } from "@/lib/personas";
import { GatedFeature } from "@/components/ui/gated-feature";

type Message = { id: string; role: "USER" | "ASSISTANT"; content: string };

// 只能用型別 import(見上面),不能把 @/lib/personas 的值也一起帶進來——
// 那個模組用 node:fs/node:path 讀人格檔案,是伺服器端專用,被 client
// component 匯入會直接把 Node built-in 打進瀏覽器bundle炸掉webpack。
const PERSONA_OPTIONS: { key: PersonaKey; label: string }[] = [
  { key: "ict", label: "ICT" },
  { key: "tjr", label: "TJR" },
  { key: "emperorbtc", label: "EmperorBTC" },
];

const CREDIT_COST = 3;

// 同一個對話的訊息數硬上限——真正的防線在 /api/chat/[id]/route.ts(前端
// 擋不了直接打API的情況),這裡複製同一個數字只是為了達到上限時能立刻
// 鎖住輸入框、不用等使用者送出才發現被擋。防的是「刻意不開新對話,同一個
// session問到底」讓單則真實成本(cache read隨歷史長度線性增加,沒有
// 天花板)超過固定Credit收入。
const MAX_MESSAGES_PER_CONVERSATION = 30;

const EXAMPLE_PROMPTS = ["我最近紀律有變差嗎", "這個 Setup 值得繼續用嗎", "我週五的表現為什麼總是比較差"];

// 統一「開新對話」跟「延續既有對話」的介面,仿 Claude/ChatGPT:訊息區佔滿
// 剩餘空間、輸入框固定在下方,人格用下拉選單放在輸入框旁邊(對應那類產品
// 放模型選擇器的位置),不是獨立的一個表單頁面。conversationId 為 null
// 代表還沒送出第一則訊息;送出後在原地把狀態接上、用 router.replace 把
// 網址切到 /chat/[id],不整頁跳轉。
export function ChatShell({
  conversationId,
  initialMessages,
  initialPersona,
  archived = false,
  tierBlocked = false,
}: {
  conversationId: string | null;
  initialMessages: Message[];
  initialPersona: PersonaKey;
  archived?: boolean;
  // FREE 方案整個 AI 問答功能都鎖(見 tier-limits.ts 的 requiresPaidTier)。
  // 已有訊息的舊對話(降級前留下的)只鎖輸入框,訊息本身照常看得到；
  // 全新空對話(還沒送出過第一則訊息)沒有東西可以先「看得到但用不了」,
  // 整個對話框(含範例提示按鈕)一起蓋鎖頭。
  tierBlocked?: boolean;
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState(conversationId);
  const [persona, setPersona] = useState<PersonaKey>(initialPersona);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 人格綁在對話上(後端 ChatConversation.persona 建立後不會變),對話一旦
  // 建立就不能再換人格,下拉選單改成鎖定顯示目前的人格。
  const locked = activeId !== null;
  const atLimit = messages.length >= MAX_MESSAGES_PER_CONVERSATION;
  const hasMessages = messages.length > 0;
  // 封存的對話不給繼續發言(側欄有取消封存按鈕)、訊息數上限、FREE 方案
  // 分級鎖,三種理由都是「擋輸入框」,合併成一個總開關方便判斷。
  const blocked = atLimit || archived || tierBlocked;
  // 全新空對話用 GatedFeature 蓋住整個對話框;已有訊息的舊對話只蓋輸入區,
  // 訊息本身不受影響——見上面 tierBlocked prop 的註解。
  const showFullGate = tierBlocked && !hasMessages;
  const showComposerGate = tierBlocked && hasMessages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text?: string) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || sending || blocked) return;
    setSending(true);
    setError(null);
    setNotConfigured(false);

    const optimisticId = `pending-${Date.now()}`;
    setMessages((prev) => [...prev, { id: optimisticId, role: "USER", content: trimmed }]);
    setInput("");

    try {
      const endpoint = activeId ? `/api/chat/${activeId}` : "/api/chat";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeId ? { message: trimmed } : { persona, message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        if (res.status === 503) setNotConfigured(true);
        setError(
          res.status === 402
            ? `Credit 餘額不足(需要 ${data.required},目前 ${data.balance})`
            : (data.error ?? "發送失敗"),
        );
        return;
      }
      setMessages((prev) => [...prev, { id: `reply-${Date.now()}`, role: "ASSISTANT", content: data.reply }]);
      if (!activeId && data.conversationId) {
        setActiveId(data.conversationId);
        router.replace(`/chat/${data.conversationId}`, { scroll: false });
      }
      // 扣款成功,側邊欄的Credit餘額(layout.tsx讀的)要馬上反映,不能等
      // 使用者下次真的換頁才刷新——router.replace只換網址不保證重新
      // 跑layout,這裡明確再補一次refresh確保萬無一失。
      router.refresh();
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

  const composer = (
    <div className="border-t border-border px-4 py-3">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={blocked}
        placeholder={archived ? "這個對話已封存" : atLimit ? "這個對話已達訊息數上限" : "輸入訊息,Enter傳送、Shift+Enter換行"}
        rows={2}
        className="w-full resize-none rounded border border-border bg-canvas px-3 py-2 text-[0.85rem] outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={persona}
            disabled={locked}
            onChange={(e) => setPersona(e.target.value as PersonaKey)}
            title={locked ? "人格在對話建立後就固定,開新對話才能換人格" : "選擇要對話的人格"}
            className={`rounded-full border px-3 py-1.5 text-[0.78rem] outline-none ${
              locked
                ? "cursor-not-allowed border-border bg-canvas text-text-tertiary"
                : "border-border bg-canvas text-text-secondary hover:border-accent"
            }`}
          >
            {PERSONA_OPTIONS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="text-[0.72rem] text-text-tertiary">每則回覆 {CREDIT_COST} Credits</span>
        </div>
        <button
          type="button"
          onClick={() => send()}
          disabled={sending || !input.trim() || blocked}
          className="shrink-0 rounded bg-accent px-4 py-2 text-[0.82rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          送出
        </button>
      </div>
    </div>
  );

  const shell = (
    <div className="flex flex-1 flex-col overflow-hidden rounded border border-border bg-surface">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-[0.85rem] text-text-secondary">選一個人格,直接問關於你自己交易的任何問題</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="rounded-full border border-border bg-canvas px-3 py-1.5 text-[0.78rem] text-text-secondary hover:border-accent hover:text-accent"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "USER" ? "justify-end" : "justify-start"}`}>
              {m.role === "USER" ? (
                <div className="max-w-[80%] rounded bg-accent-soft px-3.5 py-2.5 text-[0.85rem] leading-relaxed whitespace-pre-wrap text-text">
                  {m.content}
                </div>
              ) : (
                <div className="prose-chat max-w-[80%] rounded border border-border bg-canvas px-3.5 py-2.5 text-[0.85rem] leading-relaxed text-text">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              )}
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded border border-dashed border-border bg-canvas px-3.5 py-2.5 text-[0.8rem] text-text-secondary">
              思考中…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && !notConfigured && (
        <div role="alert" className="mx-4 mb-2 rounded border border-loss bg-loss-bg px-3 py-2 text-[0.8rem] text-loss">
          {error}
        </div>
      )}
      {notConfigured && (
        <div className="mx-4 mb-2 rounded border border-dashed border-border bg-canvas px-4 py-3 text-[0.8rem] text-text-secondary">
          AI 問答尚未開放,還不會扣 Credit。等後台設定好之後就能直接使用。
        </div>
      )}
      {!tierBlocked && archived && (
        <div className="mx-4 mb-2 rounded border border-dashed border-border bg-canvas px-4 py-3 text-[0.8rem] text-text-secondary">
          這個對話已封存,請先在左側列表取消封存才能繼續發言。
        </div>
      )}
      {!tierBlocked && !archived && atLimit && (
        <div className="mx-4 mb-2 rounded border border-dashed border-border bg-canvas px-4 py-3 text-[0.8rem] text-text-secondary">
          這個對話已經達到訊息數上限(30則),請{" "}
          <a href="/chat" className="text-accent underline">
            開新對話
          </a>{" "}
          繼續。
        </div>
      )}

      {showComposerGate ? <GatedFeature feature="AI 問答(繼續對話)">{composer}</GatedFeature> : composer}
    </div>
  );

  return showFullGate ? <GatedFeature feature="AI 問答">{shell}</GatedFeature> : shell;
}
