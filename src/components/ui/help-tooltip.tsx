"use client";

import { useState } from "react";

// 卡片右上角的「?」說明按鈕:點擊展開這個分析在算什麼/怎麼算,再點一次收合。
// 用點擊不用 hover——手機無法 hover,且說明文字通常較長,hover 一移開就消失會看不完。
export function HelpTooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="這個分析在做什麼"
        className={`flex h-4 w-4 items-center justify-center rounded-full border text-[0.62rem] font-semibold leading-none ${
          open
            ? "border-accent bg-accent-soft text-accent"
            : "border-border text-text-tertiary hover:border-accent hover:text-accent"
        }`}
      >
        ?
      </button>
      {open && (
        <>
          {/* 點外面關閉 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-20 w-64 rounded border border-border bg-surface px-3 py-2.5 text-[0.76rem] leading-relaxed text-text-secondary shadow-lg">
            {children}
          </div>
        </>
      )}
    </div>
  );
}
