"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// 對應 prototype/index.html 的側邊欄。
// 尺寸一律固定 px(design.md 第三節:介面外殼不隨內容字級縮放)。

type NavItem = {
  label: string;
  href?: string; // 沒有 href = 尚未實作,不可點
  badge?: string;
  icon: React.ReactNode;
};

const icon = (d: React.ReactNode) => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {d}
  </svg>
);

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "分析",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: icon(
          <>
            <rect x="3" y="3" width="6" height="6" rx="1" />
            <rect x="11" y="3" width="6" height="6" rx="1" />
            <rect x="3" y="11" width="6" height="6" rx="1" />
            <rect x="11" y="11" width="6" height="6" rx="1" />
          </>,
        ),
      },
      {
        label: "日曆視圖",
        badge: "待實作",
        icon: icon(
          <>
            <rect x="3" y="4" width="14" height="13" rx="1.5" />
            <line x1="3" y1="8" x2="17" y2="8" />
            <line x1="7" y1="2.5" x2="7" y2="5.5" />
            <line x1="13" y1="2.5" x2="13" y2="5.5" />
          </>,
        ),
      },
      {
        label: "Setup 分析",
        badge: "Phase 2",
        icon: icon(
          <>
            <line x1="4" y1="17" x2="4" y2="10" />
            <line x1="10" y1="17" x2="10" y2="5" />
            <line x1="16" y1="17" x2="16" y2="12" />
          </>,
        ),
      },
      {
        label: "心態分析",
        badge: "Phase 2",
        icon: icon(
          <>
            <circle cx="10" cy="10" r="7" />
            <path d="M10 6v4l3 2" />
          </>,
        ),
      },
    ],
  },
  {
    label: "記錄",
    items: [
      {
        label: "交易記錄",
        href: "/trades",
        icon: icon(
          <>
            <line x1="4" y1="6" x2="16" y2="6" />
            <line x1="4" y1="10" x2="16" y2="10" />
            <line x1="4" y1="14" x2="11" y2="14" />
          </>,
        ),
      },
      {
        label: "每日日記",
        badge: "Phase 2",
        icon: icon(
          <path d="M4 4h8l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />,
        ),
      },
      {
        label: "Playbook",
        badge: "Phase 2",
        icon: icon(
          <>
            <path d="M4 5a2 2 0 0 1 2-2h8v14H6a2 2 0 0 0-2 2z" />
            <line x1="14" y1="3" x2="14" y2="17" />
          </>,
        ),
      },
    ],
  },
  {
    label: "AI 分析",
    items: [
      {
        label: "單一人格分析",
        badge: "Phase 2",
        icon: icon(
          <>
            <circle cx="10" cy="10" r="7" />
            <path d="M7 10l2 2 4-4" />
          </>,
        ),
      },
      {
        label: "多人格辯論室",
        badge: "進階",
        icon: icon(<path d="M3 5h14v8H8l-4 3v-3H3z" />),
      },
    ],
  },
  {
    label: "系統",
    items: [
      {
        label: "設定",
        href: "/settings",
        icon: icon(
          <>
            <circle cx="10" cy="10" r="2.5" />
            <path d="M10 3v2M10 15v2M17 10h-2M5 10H3M15 5l-1.4 1.4M6.4 13.6L5 15M15 15l-1.4-1.4M6.4 6.4L5 5" />
          </>,
        ),
      },
    ],
  },
];

const SCALES = [
  { value: "14", label: "小" },
  { value: "15.5", label: "中" },
  { value: "17.5", label: "大" },
];

export function Sidebar({
  email,
  credits,
}: {
  email: string;
  credits: number;
}) {
  const pathname = usePathname();
  const [scale, setScale] = useState("15.5");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setScale(localStorage.getItem("tm-scale") ?? "15.5");
    const stored = localStorage.getItem("tm-theme");
    setIsDark(
      stored
        ? stored === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
  }, []);

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tm-theme", next);
    setIsDark(!isDark);
  }

  function applyScale(v: string) {
    document.documentElement.style.fontSize = `${v}px`;
    localStorage.setItem("tm-scale", v);
    setScale(v);
  }

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-border bg-canvas p-[14px_10px] text-[14.5px]">
      <div className="flex items-center gap-2 px-2 pb-4 pt-1.5 text-[15px] font-bold">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-accent text-[12px] font-bold text-white">
          T
        </span>
        TradeMind
      </div>

      <nav className="flex-1 overflow-y-auto">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="mb-0.5 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-text-secondary">
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = item.href && pathname.startsWith(item.href);
              const base =
                "flex items-center gap-[9px] rounded-[5px] px-2 py-[6.5px] text-[13.5px] [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0";
              if (!item.href) {
                return (
                  <div
                    key={item.label}
                    className={`${base} cursor-default text-text-tertiary`}
                    aria-disabled="true"
                  >
                    {item.icon}
                    {item.label}
                    {item.badge && (
                      <span className="ml-auto whitespace-nowrap rounded-[3px] border border-border px-1 py-[1.5px] text-[9.5px] text-text-tertiary">
                        {item.badge}
                      </span>
                    )}
                  </div>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={
                    active
                      ? `${base} bg-accent-soft font-bold text-accent`
                      : `${base} text-text-secondary hover:bg-surface hover:text-text`
                  }
                >
                  {item.icon}
                  {item.label}
                  {item.badge && (
                    <span className="ml-auto whitespace-nowrap rounded-[3px] border border-border px-1 py-[1.5px] text-[9.5px] text-text-tertiary">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-border pt-2">
        <div className="flex items-center justify-between px-2 py-[5px]">
          <span
            className="flex items-center gap-2 truncate text-[12.5px] text-text-secondary"
            title={email}
          >
            <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-border" />
            <span className="truncate">{email}</span>
          </span>
        </div>
        <div className="flex items-center justify-between px-2 py-[5px]">
          <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11.5px] text-text-secondary">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-accent">
              <path d="M11 2L4 12h5l-1 6 7-10h-5l1-6z" />
            </svg>
            {credits}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-md border border-border bg-surface px-2 py-1 text-[11.5px] text-text-secondary hover:border-accent hover:text-accent"
            >
              登出
            </button>
          </form>
        </div>
        <div className="flex items-center justify-between px-2 py-[5px]">
          <div className="flex overflow-hidden rounded-md border border-border">
            {SCALES.map((s, i) => (
              <button
                key={s.value}
                type="button"
                onClick={() => applyScale(s.value)}
                className={`h-[26px] w-[26px] text-[11px] ${
                  i < SCALES.length - 1 ? "border-r border-border" : ""
                } ${
                  scale === s.value
                    ? "bg-accent-soft font-bold text-accent"
                    : "bg-surface text-text-secondary"
                }`}
                aria-pressed={scale === s.value}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            title="切換淺/深色"
            aria-label="切換淺色或深色主題"
            className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-surface text-text-secondary hover:text-text"
          >
            {isDark ? (
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M16 12.5A6.5 6.5 0 0 1 7.5 4 6.5 6.5 0 1 0 16 12.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-3.5 w-3.5">
                <circle cx="10" cy="10" r="3.5" />
                <path d="M10 2v2M10 16v2M18 10h-2M4 10H2M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4M15.5 15.5l-1.4-1.4M5.9 5.9L4.5 4.5" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
