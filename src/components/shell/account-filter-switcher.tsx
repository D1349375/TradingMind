"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACCOUNT_FILTER_COOKIE } from "@/lib/account-filter-cookie";

type AccountOption = { id: string; label: string };

// 分析頁全域帳戶篩選器(規劃書 5.5)。放在側邊欄,寫 cookie 讓所有伺服器端
// 頁面(Dashboard/日曆/Setup分析/心態分析/交易記錄/Playbook)共用同一個
// 篩選狀態。只有使用者名下有 2 個以上模板時才顯示——單一模板是遷移後
// 絕大多數既有使用者的狀態,不該平白多一層選擇(呼應設定頁「交易所連線」
// /「目標設定」單模板時隱藏選擇器的同一個原則)。
export function AccountFilterSwitcher({
  allAccountIds,
  selectedAccountIds,
  collapsed,
}: {
  allAccountIds: string[];
  selectedAccountIds: string[];
  collapsed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (allAccountIds.length <= 1) return;
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) =>
        setAccounts((d.accounts ?? []).map((a: { id: string; label: string }) => ({
          id: a.id,
          label: a.label,
        }))),
      )
      .catch(() => setAccounts([]));
  }, [allAccountIds.length]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (allAccountIds.length <= 1) return null;

  const isAll = selectedAccountIds.length === allAccountIds.length;

  function apply(ids: string[]) {
    const value = ids.length === 0 || ids.length === allAccountIds.length ? "" : ids.join(",");
    document.cookie = `${ACCOUNT_FILTER_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}`;
    setOpen(false);
    router.refresh();
  }

  function toggle(id: string) {
    const next = selectedAccountIds.includes(id)
      ? selectedAccountIds.filter((x) => x !== id)
      : [...selectedAccountIds, id];
    // 至少要選一個,否則查詢會變成「沒有任何帳戶」——回退成點掉前的狀態。
    if (next.length === 0) return;
    apply(next);
  }

  const label = isAll
    ? "全部模板"
    : selectedAccountIds.length === 1
      ? accounts?.find((a) => a.id === selectedAccountIds[0])?.label ?? "1 個模板"
      : `${selectedAccountIds.length} 個模板`;

  return (
    <div ref={ref} className={`relative px-2 py-[5px] ${collapsed ? "flex justify-center" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? `帳戶篩選:${label}` : undefined}
        className={`flex items-center gap-1.5 rounded-md border border-border bg-surface text-[11.5px] text-text-secondary hover:border-accent hover:text-text ${
          collapsed ? "h-[26px] w-[26px] justify-center" : "w-full px-2 py-1"
        }`}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
          <rect x="3" y="5" width="14" height="10" rx="1.5" />
          <path d="M3 8.5h14" />
        </svg>
        {!collapsed && <span className="flex-1 truncate text-left">{label}</span>}
      </button>

      {open && (
        <div className="absolute bottom-full left-2 z-20 mb-1.5 w-56 rounded-md border border-border bg-surface p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => apply(allAccountIds)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[0.82rem] ${
              isAll ? "text-accent font-semibold" : "text-text-secondary hover:bg-canvas hover:text-text"
            }`}
          >
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                isAll ? "border-accent bg-accent" : "border-border"
              }`}
            >
              {isAll && (
                <svg viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                  <path d="M4 10l4 4 8-8" />
                </svg>
              )}
            </span>
            <span className="truncate">全選(合併檢視全部模板)</span>
          </button>
          <div className="my-1 border-t border-border" />
          {(accounts ?? allAccountIds.map((id) => ({ id, label: id }))).map((a) => {
            const checked = selectedAccountIds.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[0.82rem] ${
                  checked && !isAll ? "text-accent" : "text-text-secondary hover:bg-canvas hover:text-text"
                }`}
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                    checked ? "border-accent bg-accent" : "border-border"
                  }`}
                >
                  {checked && (
                    <svg viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                      <path d="M4 10l4 4 8-8" />
                    </svg>
                  )}
                </span>
                <span className="truncate">{a.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
