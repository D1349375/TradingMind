"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ConversationSummary = {
  id: string;
  personaLabel: string;
  title: string | null;
  updatedAt: string;
  archivedAt: string | null;
};

// 常駐可收合/拖曳面板,取代原本只是個下拉選單的做法——仿全域導覽側邊欄
// (components/shell/sidebar.tsx)同一套拖曳邏輯跟寬度常數命名習慣,不要
// 另外發明一套手感不一致的互動。這裡的欄寬比全域側邊欄窄一截,因為內容
// 只有對話標題,不需要那麼寬。
const EXPANDED_MIN = 200;
const EXPANDED_MAX = 360;
const COLLAPSE_THRESHOLD = 120;
const COLLAPSED_WIDTH = 44;
const DEFAULT_WIDTH = 260;

// 這裡是 client component,SSR 那一輪跟瀏覽器 hydrate 那一輪都會跑這個
// function——`toLocaleString` 在 Node 的 ICU 跟瀏覽器的 ICU 之間格式化
// 結果不保證逐字元相同(就算兩邊都明確指定同一個 timeZone/locale),
// 之前在交易記錄頁的時間戳就踩過這類 hydration mismatch。這裡直接用
// 純數字格式化,不呼叫任何跟環境有關的 locale API,兩輪必然算出同一個
// 字串,連 suppressHydrationWarning 都不需要。
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function ChatSidePanel({
  conversations,
  activeId,
}: {
  conversations: ConversationSummary[];
  activeId?: string;
}) {
  const router = useRouter();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const collapsed = width <= COLLAPSE_THRESHOLD;

  const [view, setView] = useState<"active" | "archived">("active");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Esc 取消時,輸入框從 DOM 移除會連帶觸發一次真的 blur 事件——如果
  // onBlur 也綁 commitEdit,等於「取消」反而多送出一次PATCH。用這個旗標
  // 讓那一次 blur 知道自己是取消觸發的,跳過送出。
  const skipNextBlurCommit = useRef(false);

  const activeList = conversations.filter((c) => !c.archivedAt);
  const archivedList = conversations.filter((c) => c.archivedAt);
  const list = view === "active" ? activeList : archivedList;

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
    const onMove = (ev: PointerEvent) => {
      if (!dragState.current) return;
      const delta = ev.clientX - dragState.current.startX;
      const raw = dragState.current.startWidth + delta;
      setWidth(Math.max(COLLAPSED_WIDTH, Math.min(EXPANDED_MAX, raw)));
    };
    const onUp = () => {
      setWidth((w) => (w <= COLLAPSE_THRESHOLD ? COLLAPSED_WIDTH : Math.max(EXPANDED_MIN, w)));
      setDragging(false);
      dragState.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  async function patchConversation(id: string, body: { title?: string; archived?: boolean }) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/chat/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "更新失敗");
        return;
      }
      if (body.archived === true && id === activeId) {
        router.push("/chat");
      } else {
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(c: ConversationSummary) {
    setEditingId(c.id);
    setEditValue(c.title || "");
  }

  async function commitEdit(id: string) {
    const trimmed = editValue.trim();
    setEditingId(null);
    if (!trimmed) return;
    await patchConversation(id, { title: trimmed });
  }

  if (collapsed) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-border bg-canvas py-3">
        <button
          type="button"
          onClick={() => setWidth(DEFAULT_WIDTH)}
          title="展開對話列表"
          className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:bg-surface hover:text-text"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M8 4l6 6-6 6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ width }}
      className={`relative flex shrink-0 flex-col border-r border-border bg-canvas ${dragging ? "" : "transition-[width] duration-150"}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <Link
          href="/chat"
          className="flex-1 rounded border border-border bg-surface px-2.5 py-1.5 text-center text-[0.78rem] font-semibold text-text hover:border-accent hover:text-accent"
        >
          + 新對話
        </Link>
        <button
          type="button"
          onClick={() => setWidth(COLLAPSED_WIDTH)}
          title="收合對話列表"
          aria-label="收合對話列表"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-surface hover:text-text"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
      </div>

      <div className="flex border-b border-border text-[0.76rem]">
        <button
          type="button"
          onClick={() => setView("active")}
          className={`flex-1 py-1.5 ${view === "active" ? "border-b-2 border-accent font-semibold text-accent" : "text-text-secondary hover:text-text"}`}
        >
          進行中 ({activeList.length})
        </button>
        <button
          type="button"
          onClick={() => setView("archived")}
          className={`flex-1 py-1.5 ${view === "archived" ? "border-b-2 border-accent font-semibold text-accent" : "text-text-secondary hover:text-text"}`}
        >
          已封存 ({archivedList.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <p className="px-3 py-6 text-center text-[0.78rem] text-text-tertiary">
            {view === "active" ? "還沒有對話紀錄" : "沒有已封存的對話"}
          </p>
        ) : (
          <ul>
            {list.map((c) => (
              <li
                key={c.id}
                className={`group relative border-b border-border px-3 py-2.5 ${c.id === activeId ? "bg-accent-soft" : "hover:bg-surface"}`}
              >
                {editingId === c.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => {
                      if (skipNextBlurCommit.current) {
                        skipNextBlurCommit.current = false;
                        return;
                      }
                      commitEdit(c.id);
                    }}
                    onKeyDown={(e) => {
                      // Enter 統一走 blur 觸發 commitEdit,不直接呼叫——
                      // 只有一個真正送出的路徑,不用擔心跟 blur 重複觸發。
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        skipNextBlurCommit.current = true;
                        setEditingId(null);
                      }
                    }}
                    className="w-full rounded border border-accent bg-canvas px-1.5 py-0.5 text-[0.8rem] outline-none"
                  />
                ) : (
                  <Link href={`/chat/${c.id}`} className="block pr-12">
                    <span className="block truncate text-[0.8rem] font-medium text-text">{c.title || "(無標題對話)"}</span>
                    <span className="mt-0.5 block text-[0.7rem] text-text-tertiary">
                      {c.personaLabel} · {fmtDateTime(c.updatedAt)}
                    </span>
                  </Link>
                )}

                {editingId !== c.id && (
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => startEdit(c)}
                      title="重新命名"
                      className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-canvas hover:text-text disabled:opacity-40"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <path d="M13 3.5l3.5 3.5L6 17.5H2.5V14L13 3.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => patchConversation(c.id, { archived: view === "active" })}
                      title={view === "active" ? "封存" : "取消封存"}
                      className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-canvas hover:text-text disabled:opacity-40"
                    >
                      {view === "active" ? (
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                          <rect x="3" y="4" width="14" height="3.2" rx="0.8" />
                          <path d="M4.5 7.5v8a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-8M8.2 11h3.6" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                          <rect x="3" y="4" width="14" height="3.2" rx="0.8" />
                          <path d="M4.5 7.5v8a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-8" />
                          <path d="M10 9.5v3M8.3 11.2L10 9.5l1.7 1.7" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        onPointerDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        aria-label="調整對話列表寬度"
        className={`absolute -right-[3px] top-0 h-full w-[6px] cursor-col-resize select-none ${dragging ? "bg-accent/40" : "bg-transparent hover:bg-accent/25"}`}
      />
    </div>
  );
}
