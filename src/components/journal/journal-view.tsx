"use client";

import { useEffect, useRef, useState } from "react";

// 日期一律用「使用者本地時區」的今天當預設值,伺服器不知道使用者在哪個
// 時區——SSR 階段還不知道,掛載後才決定,避免 hydration mismatch
// (跟 trades-view.tsx 的 useLocalTime 同一個理由)。
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftKey(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function fmtLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][dt.getDay()];
  return `${y} 年 ${m} 月 ${d} 日 · 週${weekday}`;
}

export function JournalView() {
  const [dateKey, setDateKey] = useState<string | null>(null);
  useEffect(() => setDateKey(todayKey()), []);

  if (dateKey === null) return null; // 掛載前不渲染,避免用伺服器時區猜錯今天

  return <JournalDay dateKey={dateKey} onNavigate={setDateKey} />;
}

function JournalDay({
  dateKey,
  onNavigate,
}: {
  dateKey: string;
  onNavigate: (key: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [plan, setPlan] = useState("");
  const [review, setReview] = useState("");
  const [savedPlan, setSavedPlan] = useState("");
  const [savedReview, setSavedReview] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/journal?date=${dateKey}`)
      .then((r) => r.json())
      .then((d) => {
        setPlan(d.preMarketPlan ?? "");
        setReview(d.postSessionReview ?? "");
        setSavedPlan(d.preMarketPlan ?? "");
        setSavedReview(d.postSessionReview ?? "");
        setLoaded(true);
        setSaveState("idle");
      });
  }, [dateKey]);

  useEffect(() => {
    if (!loaded) return;
    if (plan === savedPlan && review === savedReview) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaveState("saving");
      const res = await fetch("/api/journal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateKey,
          preMarketPlan: plan,
          postSessionReview: review,
        }),
      });
      if (res.ok) {
        setSavedPlan(plan);
        setSavedReview(review);
        setSaveState("saved");
      } else {
        setSaveState("error");
      }
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, review, loaded]);

  const textarea =
    "w-full resize-y rounded border border-border bg-canvas px-3.5 py-3 text-[1rem] leading-[1.75] text-text outline-none placeholder:text-text-tertiary focus:border-accent";

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate(shiftKey(dateKey, -1))}
            aria-label="前一天"
            className="flex h-7 w-7 items-center justify-center rounded border border-border text-text-secondary hover:border-accent hover:text-accent"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M12 4l-6 6 6 6" />
            </svg>
          </button>
          <span className="text-[0.98rem] font-semibold">{fmtLabel(dateKey)}</span>
          <button
            type="button"
            onClick={() => onNavigate(shiftKey(dateKey, 1))}
            aria-label="後一天"
            className="flex h-7 w-7 items-center justify-center rounded border border-border text-text-secondary hover:border-accent hover:text-accent"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M8 4l6 6-6 6" />
            </svg>
          </button>
          {dateKey !== todayKey() && (
            <button
              type="button"
              onClick={() => onNavigate(todayKey())}
              className="rounded border border-border px-2 py-1 text-[0.76rem] text-text-secondary hover:border-accent hover:text-accent"
            >
              回今天
            </button>
          )}
        </div>
        <span className="text-[0.72rem] text-text-secondary" role="status" aria-live="polite">
          {saveState === "saving" && "儲存中…"}
          {saveState === "saved" && "已儲存"}
          {saveState === "error" && <span className="text-loss">儲存失敗</span>}
        </span>
      </div>

      {!loaded ? (
        <p className="text-[0.85rem] text-text-secondary">讀取中…</p>
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-[0.85rem] font-semibold text-text-secondary">
              盤前計劃
            </h3>
            <textarea
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="今天的市場結構、關注標的、進場情境劇本…"
              rows={6}
              className={textarea}
            />
          </div>
          <div>
            <h3 className="mb-2 text-[0.85rem] font-semibold text-text-secondary">
              盤後反思
            </h3>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="今天的執行是否符合計劃、哪裡值得檢討…"
              rows={6}
              className={textarea}
            />
          </div>
        </div>
      )}
    </div>
  );
}
