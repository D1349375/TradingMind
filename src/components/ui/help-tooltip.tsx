"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// 卡片右上角的「?」說明按鈕:點擊展開這個分析在算什麼/怎麼算,再點一次收合。
// 用點擊不用 hover——手機無法 hover,且說明文字通常較長,hover 一移開就消失會看不完。
//
// 說明框用 createPortal 掛到 document.body、position:fixed 自己算座標
// (不是原本的 absolute 掛在按鈕旁邊)——(app)/layout.tsx 的 <main> 設了
// overflow-y-auto,CSS 規則是只要 overflow-x/overflow-y 其中一個不是
// visible,另一個會被瀏覽器自動算成 auto,所以 <main> 其實同時在裁切
// x 方向,任何往左延伸超出 <main> 左邊界的 absolute 說明框都會被裁掉、
// 縮小側邊欄也沒用(裁切點是 <main> 自己的邊界,不是側邊欄寬度)。
// 用 fixed+portal 直接跳出這整個 overflow 容器,不會再被裁到。
const WIDTH = 256; // w-64

export function HelpTooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // 預設右緣切齊按鈕、往左展開(跟原本 right-0 的視覺一致),但要是
      // 這樣會超出視窗左邊,改成貼齊視窗邊界留一點邊距,不讓文字被切掉。
      const left = Math.max(8, r.right - WIDTH);
      setPos({ top: r.bottom + 4, left });
    }
    setOpen((v) => !v);
  }

  // 說明框跳出來後,底下的內容一滾動座標就不準了(fixed 不會跟著卷軸走),
  // 直接關掉比讓它錯位飄在別的地方乾淨。
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
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
      {open &&
        createPortal(
          <>
            {/* 點外面關閉 */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              style={{ top: pos.top, left: pos.left, width: WIDTH }}
              className="fixed z-50 rounded border border-border bg-surface px-3 py-2.5 text-[0.76rem] leading-relaxed text-text-secondary shadow-lg"
            >
              {children}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
