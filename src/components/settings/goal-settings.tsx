"use client";

import { useEffect, useState } from "react";

// 對應 prototype 設定頁的「目標設定」分頁。
// 每日虧損上限支援固定金額 / 資金比例雙模式(2026-08-11 對話定案)。

type Goals = {
  lossLimitMode: "FIXED" | "PERCENT";
  dailyLossFixed: number | null;
  dailyLossPercent: number | null;
  totalCapital: number | null;
  profitTargetAmount: number | null;
};

const EMPTY: Goals = {
  lossLimitMode: "FIXED",
  dailyLossFixed: null,
  dailyLossPercent: null,
  totalCapital: null,
  profitTargetAmount: null,
};

export function GoalSettings() {
  const [goals, setGoals] = useState<Goals | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/goals")
      .then((r) => r.json())
      .then((d) => setGoals({ ...EMPTY, ...d }))
      .catch(() => setGoals(EMPTY));
  }, []);

  async function save(next: Goals) {
    setGoals(next);
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "儲存失敗");
      return;
    }
    setSaved(true);
  }

  if (!goals) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-8 text-center text-[0.85rem] text-text-secondary">
        讀取設定…
      </div>
    );
  }

  const isPercent = goals.lossLimitMode === "PERCENT";
  const inputClass =
    "w-40 rounded border border-border bg-canvas px-2.5 py-1.5 text-right text-[0.87rem] text-text outline-none placeholder:text-text-tertiary focus:border-accent";

  const effectiveLimit = isPercent
    ? (goals.totalCapital ?? 0) * ((goals.dailyLossPercent ?? 0) / 100)
    : (goals.dailyLossFixed ?? 0);

  return (
    <>
      <div className="rounded border border-border bg-surface px-5 py-5">
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
          hint="資金比例模式的計算基準,固定金額模式不影響量表"
        >
          <input
            type="number"
            min="0"
            step="1"
            className={inputClass}
            value={goals.totalCapital ?? ""}
            placeholder="未設定"
            onChange={(e) =>
              save({
                ...goals,
                totalCapital: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </Row>

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
