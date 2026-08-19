"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { isTodayLossDanger, type GoalForAlert } from "@/lib/notifications";
import { AccountFilterSwitcher } from "@/components/shell/account-filter-switcher";
import { Logomark } from "@/components/brand/logomark";

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
        href: "/calendar",
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
        href: "/setup",
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
        href: "/psychology",
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
        href: "/journal",
        icon: icon(
          <path d="M4 4h8l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />,
        ),
      },
      {
        label: "Playbook",
        href: "/playbook",
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
        label: "多人格辯論室",
        badge: "進階",
        icon: icon(<path d="M3 5h14v8H8l-4 3v-3H3z" />),
      },
      {
        label: "週期回顧",
        href: "/period-review",
        icon: icon(
          <>
            <rect x="4" y="3" width="12" height="14" rx="1.5" />
            <path d="M7 7.5h6M7 10.5h3" />
            <path d="M7.5 14l1.3 1.3L11.5 12.5" />
          </>,
        ),
      },
      {
        label: "AI 問答",
        href: "/chat",
        icon: icon(
          <>
            <path d="M3 5h14v8H8l-4 3v-3H3z" />
            <path d="M7 8h6M7 10.5h3" />
          </>,
        ),
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

// 拖曳寬度的邊界:展開態限制在 180-320px 之間,拉到 140px 以下放開時
// 收合成純圖示的固定寬度,避免使用者拖出一個文字擠不下又不算收合的尷尬中間態。
const EXPANDED_MIN = 180;
const EXPANDED_MAX = 320;
const COLLAPSE_THRESHOLD = 140;
const COLLAPSED_WIDTH = 60;
const DEFAULT_WIDTH = 232;

export function Sidebar({
  email,
  credits,
  pendingReview,
  recentTrades,
  goal,
  accountFilter,
}: {
  email: string;
  credits: number;
  pendingReview: number;
  recentTrades: { closedAt: string | null; realizedPnl: number | null }[];
  goal: GoalForAlert;
  accountFilter: { accountIds: string[]; allAccountIds: string[] };
}) {
  const pathname = usePathname();
  const [scale, setScale] = useState("15.5");
  const [isDark, setIsDark] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const collapsed = width <= COLLAPSE_THRESHOLD;

  // 通知開關存 localStorage(跟主題/字級一樣是純前端偏好,不需要進資料庫),
  // 設定頁的「通知設定」分頁改這兩個 key。
  const [mounted, setMounted] = useState(false);
  const [notifyReview, setNotifyReview] = useState(true);
  const [notifyLossDanger, setNotifyLossDanger] = useState(true);

  useEffect(() => {
    setScale(localStorage.getItem("tm-scale") ?? "15.5");
    const stored = localStorage.getItem("tm-theme");
    setIsDark(
      stored
        ? stored === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
    const storedWidth = Number(localStorage.getItem("tm-sidebar-width"));
    if (storedWidth) setWidth(storedWidth);
    setNotifyReview(localStorage.getItem("tm-notif-review") !== "off");
    setNotifyLossDanger(localStorage.getItem("tm-notif-lossdanger") !== "off");
    setMounted(true);
  }, []);

  // 「今日虧損」是本地時區概念,必須掛載後用瀏覽器時區篩,不能信伺服器算好的「今天」。
  const todayLoss = useMemo(() => {
    if (!mounted) return 0;
    const now = new Date();
    let loss = 0;
    for (const t of recentTrades) {
      if (!t.closedAt || t.realizedPnl === null) continue;
      const d = new Date(t.closedAt);
      if (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate() &&
        t.realizedPnl < 0
      ) {
        loss += -t.realizedPnl;
      }
    }
    return loss;
  }, [mounted, recentTrades]);

  const lossDanger = mounted && notifyLossDanger && isTodayLossDanger(todayLoss, goal);
  const reviewBadge = mounted && notifyReview && pendingReview > 0 ? String(pendingReview) : null;

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
    const onMove = (ev: PointerEvent) => {
      if (!dragState.current) return;
      const delta = ev.clientX - dragState.current.startX;
      const raw = dragState.current.startWidth + delta;
      // 拖曳中即時預覽:允許滑到收合寬度以下一點,放開時才決定要不要真的收合
      setWidth(Math.max(COLLAPSED_WIDTH, Math.min(EXPANDED_MAX, raw)));
    };
    const onUp = () => {
      setWidth((w) => {
        const next = w <= COLLAPSE_THRESHOLD ? COLLAPSED_WIDTH : Math.max(EXPANDED_MIN, w);
        localStorage.setItem("tm-sidebar-width", String(next));
        return next;
      });
      setDragging(false);
      dragState.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function toggleCollapsed() {
    const next = collapsed ? DEFAULT_WIDTH : COLLAPSED_WIDTH;
    setWidth(next);
    localStorage.setItem("tm-sidebar-width", String(next));
  }

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
    <aside
      style={{ width }}
      className={`no-print relative flex min-w-0 shrink-0 flex-col border-r border-border bg-canvas p-[14px_10px] text-[14.5px] ${
        dragging ? "" : "transition-[width] duration-150"
      }`}
    >
      <div
        className={`flex items-center gap-2 px-2 pb-4 pt-1.5 text-[15px] font-bold ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <button
          type="button"
          onClick={collapsed ? toggleCollapsed : undefined}
          title={collapsed ? "展開側邊欄" : undefined}
          className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-accent text-white ${
            collapsed ? "cursor-pointer" : "cursor-default"
          }`}
        >
          <Logomark className="h-3.5 w-3.5" />
        </button>
        {!collapsed && <span className="flex-1 truncate">TradeMind</span>}
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            title="收合側邊欄"
            aria-label="收合側邊欄"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-surface hover:text-text"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M12 4l-6 6 6 6" />
            </svg>
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <div className="mb-0.5 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-text-secondary">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = item.href && pathname.startsWith(item.href);
              const base = `flex items-center gap-[9px] rounded-[5px] px-2 py-[6.5px] text-[13.5px] [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 ${
                collapsed ? "justify-center" : ""
              }`;
              if (!item.href) {
                return (
                  <div
                    key={item.label}
                    className={`${base} cursor-default text-text-tertiary`}
                    aria-disabled="true"
                    title={collapsed ? item.label : undefined}
                  >
                    {item.icon}
                    {!collapsed && item.label}
                    {!collapsed && item.badge && (
                      <span className="ml-auto whitespace-nowrap rounded-[3px] border border-border px-1 py-[1.5px] text-[9.5px] text-text-tertiary">
                        {item.badge}
                      </span>
                    )}
                  </div>
                );
              }
              // 動態通知徽章:交易記錄=待補充筆數、Dashboard=今日虧損逼近上限。
              // 跟原本「Phase 2」那種靜態灰色徽章分開處理,顏色要跳出來才有警示感。
              const reviewDot = item.label === "交易記錄" && reviewBadge;
              const lossDot = item.label === "Dashboard" && lossDanger;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  title={
                    collapsed
                      ? [item.label, reviewDot && `${reviewBadge} 筆待補充`, lossDot && "今日虧損逼近上限"]
                          .filter(Boolean)
                          .join(" · ")
                      : undefined
                  }
                  className={
                    active
                      ? `${base} bg-accent-soft font-bold text-accent`
                      : `${base} text-text-secondary hover:bg-surface hover:text-text`
                  }
                >
                  <span className="relative h-4 w-4 shrink-0 [&>svg]:h-4 [&>svg]:w-4">
                    {item.icon}
                    {collapsed && (reviewDot || lossDot) && (
                      <span
                        className={`absolute -right-0.5 -top-0.5 h-[7px] w-[7px] rounded-full border border-canvas ${
                          lossDot ? "bg-loss" : "bg-accent"
                        }`}
                      />
                    )}
                  </span>
                  {!collapsed && item.label}
                  {!collapsed && item.badge && (
                    <span className="ml-auto whitespace-nowrap rounded-[3px] border border-border px-1 py-[1.5px] text-[9.5px] text-text-tertiary">
                      {item.badge}
                    </span>
                  )}
                  {!collapsed && reviewDot && (
                    <span className="ml-auto whitespace-nowrap rounded-full bg-accent px-1.5 py-[1.5px] text-[9.5px] font-bold text-white">
                      {reviewBadge}
                    </span>
                  )}
                  {!collapsed && lossDot && (
                    <span className="ml-auto h-[7px] w-[7px] shrink-0 rounded-full bg-loss" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-border pt-2">
        <div className={`flex items-center px-2 py-[5px] ${collapsed ? "justify-center" : "justify-between"}`}>
          <span
            className="flex items-center gap-2 truncate text-[12.5px] text-text-secondary"
            title={email}
          >
            <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-border" />
            {!collapsed && <span className="truncate">{email}</span>}
          </span>
        </div>
        <AccountFilterSwitcher
          allAccountIds={accountFilter.allAccountIds}
          selectedAccountIds={accountFilter.accountIds}
          collapsed={collapsed}
        />
        <div className={`flex items-center px-2 py-[5px] ${collapsed ? "flex-col gap-2" : "justify-between"}`}>
          <span
            className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11.5px] text-text-secondary"
            title={collapsed ? `${credits} Credits` : undefined}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 shrink-0 text-accent">
              <path d="M11 2L4 12h5l-1 6 7-10h-5l1-6z" />
            </svg>
            {!collapsed && credits}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              title="登出"
              className={`rounded-md border border-border bg-surface text-[11.5px] text-text-secondary hover:border-accent hover:text-accent ${
                collapsed ? "flex h-[26px] w-[26px] items-center justify-center" : "px-2 py-1"
              }`}
            >
              {collapsed ? (
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M13 14l4-4-4-4M6 10h11" />
                </svg>
              ) : (
                "登出"
              )}
            </button>
          </form>
        </div>
        <div className={`flex items-center px-2 py-[5px] ${collapsed ? "flex-col gap-2" : "justify-between"}`}>
          {!collapsed && (
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
          )}
          <button
            type="button"
            onClick={toggleTheme}
            title="切換淺/深色"
            aria-label="切換淺色或深色主題"
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-secondary hover:text-text"
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

      {/* 拖曳把手:貼在右邊界,拖曳範圍見檔案開頭的常數說明 */}
      <div
        onPointerDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        aria-label="調整側邊欄寬度"
        className={`absolute -right-[3px] top-0 h-full w-[6px] cursor-col-resize select-none ${
          dragging ? "bg-accent/40" : "bg-transparent hover:bg-accent/25"
        }`}
      />
    </aside>
  );
}
