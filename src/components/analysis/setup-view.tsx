"use client";

import { useMemo, useState } from "react";

// 對應 prototype 的 Setup 分析頁:Setup 排行 + 依維度比較。

export type AnalysisTrade = {
  symbol: string;
  closedAt: string | null;
  realizedPnl: number | null;
  rMultiple: number | null;
  setupName: string | null;
};

type Row = {
  key: string;
  n: number;
  winRate: number | null;
  avgR: number | null;
  pnl: number;
};

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;

function aggregate(
  trades: AnalysisTrade[],
  keyOf: (t: AnalysisTrade) => string | null,
): Row[] {
  const groups = new Map<string, AnalysisTrade[]>();
  for (const t of trades) {
    const k = keyOf(t);
    if (k === null) continue;
    const arr = groups.get(k) ?? [];
    arr.push(t);
    groups.set(k, arr);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const pnls = list
        .map((t) => t.realizedPnl)
        .filter((p): p is number => p !== null);
      const wins = pnls.filter((p) => p > 0).length;
      const losses = pnls.filter((p) => p < 0).length;
      const rs = list
        .map((t) => t.rMultiple)
        .filter((r): r is number => r !== null);
      return {
        key,
        n: list.length,
        winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
        avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
        pnl: pnls.reduce((s, p) => s + p, 0),
      };
    })
    .sort((a, b) => b.pnl - a.pnl);
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// 每個維度都標明資料來源,算不出來的維度直接說明缺什麼,不要假裝有資料
const DIMENSIONS = [
  {
    key: "symbol",
    label: "商品",
    available: true,
    keyOf: (t: AnalysisTrade) => t.symbol,
  },
  {
    key: "weekday",
    label: "星期幾",
    available: true,
    note: "依平倉日(本地時區)分組",
    keyOf: (t: AnalysisTrade) =>
      t.closedAt ? WEEKDAYS[new Date(t.closedAt).getDay()] : null,
  },
  {
    key: "session",
    label: "交易時段",
    available: false,
    missing:
      "交易時段要依「進場時間」判斷,但 Bybit 的已平倉損益不提供開倉時間,需先從撮合明細還原。",
  },
  {
    key: "timeframe",
    label: "時間週期",
    available: false,
    missing: "做單週期是自訂欄位,需先在「設定 → 欄位自訂」建立並於每筆交易標記。",
  },
  {
    key: "type",
    label: "交易類型",
    available: false,
    missing: "交易類型是自訂欄位,需先在「設定 → 欄位自訂」建立並於每筆交易標記。",
  },
] as const;

export function SetupView({ trades }: { trades: AnalysisTrade[] }) {
  const [dim, setDim] = useState<string>("symbol");
  const active = DIMENSIONS.find((d) => d.key === dim)!;

  const setupRows = useMemo(
    () => aggregate(trades, (t) => t.setupName),
    [trades],
  );
  const dimRows = useMemo(
    () =>
      "keyOf" in active ? aggregate(trades, active.keyOf as (t: AnalysisTrade) => string | null) : [],
    [trades, active],
  );

  if (trades.length === 0) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-12 text-center">
        <div className="mb-1 text-[0.9rem] font-semibold text-text-secondary">
          還沒有交易資料
        </div>
        <p className="text-[0.82rem] text-text-secondary">
          到「設定 → 交易所連線」同步交易後,這裡會依實際資料計算。
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="mb-5">
        <h2 className="mb-2.5 text-[0.82rem] font-semibold text-text-secondary">
          Setup 排行
        </h2>
        {setupRows.length === 0 ? (
          <div className="rounded border border-dashed border-border bg-surface px-5 py-8 text-center">
            <div className="mb-1 text-[0.88rem] font-semibold text-text-secondary">
              還沒有任何交易被標記 Setup
            </div>
            <p className="mx-auto max-w-[46ch] text-[0.8rem] leading-relaxed text-text-secondary">
              Setup 是你自己定義的進場邏輯(例如 FVG 回補、Sweep + MSS)。
              在交易記錄頁替交易標記 Setup 之後,這裡就會統計各 Setup 的勝率與期望值。
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {setupRows.map((r) => (
              <SetupRow key={r.key} row={r} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded border border-border bg-surface px-4 py-4">
        <h2 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
          依維度比較
        </h2>
        <div className="mb-3.5 flex flex-wrap gap-1.5">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDim(d.key)}
              aria-pressed={dim === d.key}
              className={`rounded-full border px-3 py-1.5 text-[0.8rem] ${
                dim === d.key
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-border bg-surface text-text-secondary hover:text-text"
              } ${!d.available ? "opacity-60" : ""}`}
            >
              {d.label}
              {!d.available && (
                <span className="ml-1 text-[0.7rem] text-text-tertiary">
                  無資料
                </span>
              )}
            </button>
          ))}
        </div>

        {!active.available ? (
          <div className="rounded border border-dashed border-border bg-canvas px-4 py-6 text-center">
            <div className="mb-1 text-[0.85rem] font-semibold text-text-secondary">
              {active.label}目前無法分析
            </div>
            <p className="mx-auto max-w-[52ch] text-[0.8rem] leading-relaxed text-text-secondary">
              {"missing" in active ? active.missing : ""}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full border-collapse text-[0.9rem]">
              <thead>
                <tr>
                  {[active.label, "交易數", "勝率", "平均 R", "累計損益"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`border-b border-border px-2.5 py-1.5 text-[0.78rem] font-semibold text-text-secondary ${
                          i === 0 ? "text-left" : "text-right"
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {dimRows.map((r) => (
                  <tr key={r.key}>
                    <td className="border-b border-border px-2.5 py-2">
                      {r.key}
                    </td>
                    <td className="num border-b border-border px-2.5 py-2 text-right">
                      {r.n}
                    </td>
                    <td className="num border-b border-border px-2.5 py-2 text-right">
                      {r.winRate === null ? "—" : `${fmt(r.winRate, 1)}%`}
                    </td>
                    <td className="num border-b border-border px-2.5 py-2 text-right">
                      {r.avgR === null ? "—" : `${fmt(r.avgR)}R`}
                    </td>
                    <td
                      className={`num border-b border-border px-2.5 py-2 text-right font-semibold ${
                        r.pnl >= 0 ? "text-profit" : "text-loss"
                      }`}
                    >
                      {signed(r.pnl)}U
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {"note" in active && active.note && (
              <p className="mt-2 text-[0.75rem] text-text-tertiary">
                {active.note}
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}

function SetupRow({ row }: { row: Row }) {
  return (
    <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] items-center gap-3 rounded border border-border bg-surface px-4 py-3">
      <div className="text-[0.92rem] font-semibold">{row.key}</div>
      {[
        { l: "交易數", v: String(row.n) },
        {
          l: "勝率",
          v: row.winRate === null ? "—" : `${fmt(row.winRate, 1)}%`,
        },
        { l: "平均 R", v: row.avgR === null ? "—" : `${fmt(row.avgR)}R` },
      ].map((m) => (
        <div key={m.l} className="text-right">
          <span className="block text-[0.72rem] text-text-secondary">
            {m.l}
          </span>
          <span className="num text-[0.94rem] font-semibold">{m.v}</span>
        </div>
      ))}
      <div className="text-right">
        <span className="block text-[0.72rem] text-text-secondary">
          累計損益
        </span>
        <span
          className={`num text-[0.94rem] font-semibold ${
            row.pnl >= 0 ? "text-profit" : "text-loss"
          }`}
        >
          {signed(row.pnl)}U
        </span>
      </div>
    </div>
  );
}
