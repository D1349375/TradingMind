"use client";

import { useState } from "react";

// 分級鎖的統一互動模式(2026-08-20,取代原本整段替換成文字的做法):
// 被鎖住的內容維持「看得到、灰階、不能互動」,蓋一個鎖頭圖示,點下去彈出
// 小視窗說明要升級哪個方案——不是整個消失或整段換成純文字提示。讓使用者
// 先看到「這個功能長什麼樣子」比較有轉換動機,也符合這個 app 一貫「誠實
// 呈現、不隱藏資訊」的原則。

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
    </svg>
  );
}

export function GatedFeature({
  feature,
  requiredTier = "STANDARD",
  children,
}: {
  feature: string;
  requiredTier?: "STANDARD" | "ADVANCED";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${feature}需要升級方案才能使用`}
        className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded transition-colors hover:bg-canvas/30"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface shadow-sm">
          <LockIcon className="h-4 w-4 text-text-secondary" />
        </span>
      </button>
      {/* pointer-events-none 讓底下真實內容(圖表按鈕/下拉選單等)點不到,
          只有上面那顆鎖頭按鈕能被點——灰階+降低透明度做出「看得到但用不了」
          的預覽效果,不是整段隱藏。 */}
      <div className="pointer-events-none select-none opacity-35 grayscale">
        {children}
      </div>
      {open && <UpgradeDialog feature={feature} requiredTier={requiredTier} onClose={() => setOpen(false)} />}
    </div>
  );
}

function UpgradeDialog({
  feature,
  requiredTier,
  onClose,
}: {
  feature: string;
  requiredTier: "STANDARD" | "ADVANCED";
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[380px] rounded border border-border bg-surface p-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-canvas">
          <LockIcon className="h-5 w-5 text-text-secondary" />
        </div>
        <h3 className="mb-1.5 text-[1rem] font-semibold text-text">升級解鎖{feature}</h3>
        <p className="mb-4 text-[0.82rem] leading-relaxed text-text-secondary">
          這個功能需要訂閱 <span className="font-semibold text-text">{requiredTier}</span> 方案才能使用
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded border border-border bg-canvas px-3.5 py-2 text-[0.85rem] text-text-secondary hover:border-accent hover:text-accent"
          >
            先不用
          </button>
          <a
            href="/settings?tab=subscription"
            className="flex-1 rounded bg-accent px-3.5 py-2 text-[0.85rem] font-semibold text-white hover:opacity-90"
          >
            查看訂閱方案
          </a>
        </div>
      </div>
    </div>
  );
}
