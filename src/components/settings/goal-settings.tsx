"use client";

import { useEffect, useState } from "react";

// 對應 prototype 設定頁的「目標設定」分頁。
// 每日虧損上限支援固定金額 / 資金比例雙模式(2026-08-11 對話定案)。
// 2026-08-16 起 Goal 綁在帳戶模板底下,先選要設定哪一個模板(單模板時隱藏)。

type Goals = {
  lossLimitMode: "FIXED" | "PERCENT";
  dailyLossFixed: number | null;
  dailyLossPercent: number | null;
  totalCapital: number | null;
  profitTargetAmount: number | null;
};

type AccountOption = { id: string; label: string };

const EMPTY: Goals = {
  lossLimitMode: "FIXED",
  dailyLossFixed: null,
  dailyLossPercent: null,
  totalCapital: null,
  profitTargetAmount: null,
};

export function GoalSettings() {
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchingBalance, setFetchingBalance] = useState(false);
  const [balanceNotice, setBalanceNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        const list: AccountOption[] = d.accounts ?? [];
        setAccounts(list);
        if (list.length > 0) setAccountId(list[0].id);
      })
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (!accountId) return;
    setGoals(null);
    fetch(`/api/goals?accountId=${accountId}`)
      .then((r) => r.json())
      .then((d) => setGoals({ ...EMPTY, ...d }))
      .catch(() => setGoals(EMPTY));
  }, [accountId]);

  async function save(next: Goals) {
    if (!accountId) return;
    setGoals(next);
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, ...next }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "儲存失敗");
      return;
    }
    setSaved(true);
  }

  async function fetchFromExchange() {
    if (!accountId) return;
    setFetchingBalance(true);
    setBalanceNotice(null);
    setError(null);
    const res = await fetch(`/api/exchange/balance?accountId=${accountId}`);
    const d = await res.json();
    setFetchingBalance(false);
    if (!res.ok) {
      setError(d.error ?? "抓取失敗");
      return;
    }
    const prev = goals?.totalCapital;
    await save({ ...(goals as Goals), totalCapital: d.totalEquity });
    setBalanceNotice(
      prev !== null && prev !== undefined && prev !== d.totalEquity
        ? `已用交易所帳戶淨值更新(原本 ${prev} → ${d.totalEquity.toFixed(1)})`
        : `已帶入交易所帳戶淨值:${d.totalEquity.toFixed(1)}U`,
    );
  }

  if (!accounts || !goals) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-8 text-center text-[0.85rem] text-text-secondary">
        讀取設定…
      </div>
    );
  }

  const isPercent = goals.lossLimitMode === "PERCENT";
  const inputClass =
    "w-40 rounded border border-border bg-canvas px-2.5 py-1.5 text-right text-[0.87rem] text-text outline-none placeholder:text-text-tertiary focus:border-accent";
  const selectClass =
    "w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[0.87rem] text-text outline-none focus:border-accent";

  const effectiveLimit = isPercent
    ? (goals.totalCapital ?? 0) * ((goals.dailyLossPercent ?? 0) / 100)
    : (goals.dailyLossFixed ?? 0);

  return (
    <>
      <div className="rounded border border-border bg-surface px-5 py-5">
        {accounts.length > 1 && (
          <div className="mb-4">
            <label className="mb-1.5 block text-[0.8rem] font-semibold text-text-secondary">
              帳戶模板
            </label>
            <select
              className={selectClass}
              value={accountId ?? ""}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[0.84rem] font-semibold text-text-secondary">
            風控上限(驅動 Dashboard 的目標與風控量表)
          </h3>
          <span className="text-[0.75rem] text-text-secondary" role="status" aria-live="polite">
            {saving ? "儲存中…" : saved ? "已儲存" : ""}
          </span>
        </div>

        <Row
          label="每日最大虧損上限 · 計算方式"
          hint="固定金額,或依帳戶總資金比例動態換算"
        >
          <div className="flex overflow-hidden rounded-md border border-border">
            {(["FIXED", "PERCENT"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => save({ ...goals, lossLimitMode: m })}
                aria-pressed={goals.lossLimitMode === m}
                className={`px-3 py-1.5 text-[0.8rem] ${
                  m === "FIXED" ? "border-r border-border" : ""
                } ${
                  goals.lossLimitMode === m
                    ? "bg-accent-soft font-semibold text-accent"
                    : "bg-surface text-text-secondary hover:text-text"
                }`}
              >
                {m === "FIXED" ? "固定金額" : "資金比例"}
              </button>
            ))}
          </div>
        </Row>

        {isPercent ? (
          <Row
            label="每日最大虧損上限(% 資金)"
            hint="依下方帳戶總資金即時換算成 U"
          >
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              className={inputClass}
              value={goals.dailyLossPercent ?? ""}
              placeholder="未設定"
              onChange={(e) =>
                save({
                  ...goals,
                  dailyLossPercent: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Row>
        ) : (
          <Row label="每日最大虧損上限(U)" hint="觸及此值,回撤緩衝量表轉紅">
            <input
              type="number"
              min="0"
              step="1"
              className={inputClass}
              value={goals.dailyLossFixed ?? ""}
              placeholder="未設定"
              onChange={(e) =>
                save({
                  ...goals,
                  dailyLossFixed: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </Row>
        )}

        <Row
          label="帳戶總資金(U)"
          hint="資金比例模式的計算基準,固定金額模式不影響量表。可以手動填,或從已連接的交易所帳戶淨值帶入(含未實現損益,之後每次都要重新抓,不會自動更新)"
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchFromExchange}
              disabled={fetchingBalance}
              className="whitespace-nowrap rounded border border-border px-2.5 py-1.5 text-[0.78rem] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {fetchingBalance ? "抓取中…" : "從交易所抓取"}
            </button>
            <input
              type="number"
              min="0"
              step="1"
              className={inputClass}
              value={goals.totalCapital ?? ""}
              placeholder="未設定"
              onChange={(e) => {
                setBalanceNotice(null);
                save({
                  ...goals,
                  totalCapital:
                    e.target.value === "" ? null : Number(e.target.value),
                });
              }}
            />
          </div>
        </Row>
        {balanceNotice && (
          <p className="pb-2.5 text-right text-[0.75rem] text-text-secondary">
            {balanceNotice}
          </p>
        )}

        <Row label="獲利目標(U · 本月)" hint="獲利目標進度條的目標值" last>
          <input
            type="number"
            min="0"
            step="1"
            className={inputClass}
            value={goals.profitTargetAmount ?? ""}
            placeholder="未設定"
            onChange={(e) =>
              save({
                ...goals,
                profitTargetAmount:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </Row>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded border border-loss bg-loss-bg px-3 py-2 text-[0.82rem] text-loss"
          >
            {error}
          </div>
        )}

        {isPercent && effectiveLimit > 0 && (
          <p className="mt-3 text-[0.78rem] text-text-secondary">
            目前換算後的每日虧損上限:
            <b className="num ml-1 text-text">{effectiveLimit.toFixed(1)}U</b>
          </p>
        )}
      </div>
    </>
  );
}

function Row({
  label,
  hint,
  children,
  last,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-2.5 ${
        last ? "" : "border-b border-border"
      }`}
    >
      <div>
        <div className="text-[0.9rem]">{label}</div>
        {hint && (
          <div className="mt-0.5 text-[0.78rem] text-text-secondary">{hint}</div>
        )}
      </div>
      {children}
    </div>
  );
}
