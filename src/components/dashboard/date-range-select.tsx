"use client";

// 時間區間篩選器。放在 Dashboard 右上角,調研 Tradezella/TraderSync 等競品後
// 定案的四個必要選項(當日/過去一週/過去一個月/自訂區間)之外,額外保留
// 「全部時間」當預設值——理由:預設若直接套用「過去一個月」,首次渲染會
// 依賴瀏覽器本地時區判斷「今天」,跟站內其他「本地日分組」邏輯一樣有
// SSR/CSR 不一致風險,得比照 mounted 旗標處理才安全;預設「全部時間」則不
// 受時區影響,可以直接算,也保留了目前「進站看得到完整歷史」的既有行為。

import { useEffect, useRef, useState } from "react";

export type DatePreset = "all" | "today" | "week" | "month" | "custom";

export type DateRangeValue = {
  preset: DatePreset;
  customStart: string | null; // yyyy-mm-dd
  customEnd: string | null; // yyyy-mm-dd
};

export const DEFAULT_DATE_RANGE: DateRangeValue = {
  preset: "all",
  customStart: null,
  customEnd: null,
};

const PRESET_LABELS: Record<DatePreset, string> = {
  all: "全部時間",
  today: "當日",
  week: "過去一週",
  month: "過去一個月",
  custom: "自訂區間",
};

const MENU_PRESETS: DatePreset[] = ["all", "today", "week", "month"];

// 換算成本地時區的起訖時間(含頭尾整天)。回傳 null 代表不過濾。
// 只在使用者互動(切換下拉選項)時才會呼叫到 today/week/month 分支,
// 所以不會有 SSR 期間用不到本地時區的問題。
export function resolveDateRange(
  value: DateRangeValue,
): { start: Date; end: Date } | null {
  const now = new Date();
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );

  function startOfDaysAgo(days: number) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - days);
    return d;
  }

  switch (value.preset) {
    case "today":
      return { start: startOfDaysAgo(0), end: endOfToday };
    case "week":
      return { start: startOfDaysAgo(6), end: endOfToday };
    case "month":
      return { start: startOfDaysAgo(29), end: endOfToday };
    case "custom": {
      if (!value.customStart || !value.customEnd) return null;
      const start = new Date(`${value.customStart}T00:00:00`);
      const end = new Date(`${value.customEnd}T23:59:59.999`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
      }
      return start <= end ? { start, end } : { start: end, end: start };
    }
    case "all":
    default:
      return null;
  }
}

export function DateRangeSelect({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(value.customStart ?? "");
  const [draftEnd, setDraftEnd] = useState(value.customEnd ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const label =
    value.preset === "custom" && value.customStart && value.customEnd
      ? `${value.customStart} ~ ${value.customEnd}`
      : PRESET_LABELS[value.preset];

  function choose(preset: DatePreset) {
    onChange({ preset, customStart: null, customEnd: null });
    setOpen(false);
  }

  function applyCustom() {
    if (!draftStart || !draftEnd) return;
    onChange({ preset: "custom", customStart: draftStart, customEnd: draftEnd });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-[0.82rem] text-text hover:border-accent"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 shrink-0 text-text-secondary"
        >
          <rect x="3" y="4.5" width="14" height="12" rx="1.5" />
          <path d="M3 8.5h14M7 2.5v3M13 2.5v3" />
        </svg>
        <span className="num whitespace-nowrap">{label}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3 shrink-0 text-text-secondary"
        >
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-10 w-64 rounded border border-border bg-surface p-1.5 shadow-lg">
          {MENU_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => choose(p)}
              className={`block w-full rounded px-2.5 py-1.5 text-left text-[0.83rem] hover:bg-canvas ${
                value.preset === p ? "font-semibold text-accent" : "text-text"
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <div className="px-2.5 py-1.5">
            <div
              className={`mb-1.5 text-[0.83rem] ${
                value.preset === "custom" ? "font-semibold text-accent" : "text-text"
              }`}
            >
              自訂區間
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                className="w-full rounded border border-border bg-canvas px-1.5 py-1 text-[0.78rem] text-text"
              />
              <span className="text-text-tertiary">–</span>
              <input
                type="date"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
                className="w-full rounded border border-border bg-canvas px-1.5 py-1 text-[0.78rem] text-text"
              />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!draftStart || !draftEnd}
              className="mt-1.5 w-full rounded border border-border bg-canvas py-1 text-[0.78rem] font-semibold text-text hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              套用
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
