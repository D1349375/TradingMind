"use client";

import { useMemo } from "react";

// 對應 prototype 的心態分析頁。
//
// 重要:這一頁大部分指標依賴目前還不存在的資料——
//   紀律遵守率 → 需要紀律規則設定 + 每筆交易的自陳勾選
//   情緒 × 損益 → 需要自訂欄位的「情緒狀態」
//   行為偵測   → 需要偵測設定與偵測結果
// 沒有資料就誠實說明缺什麼、去哪裡設定,不要顯示 0% 或假資料。
// 唯一能從現有資料算的是「連續虧損」這類純數字模式,那個是真的。

export type PsychTrade = {
  closedAt: string | null;
  realizedPnl: number | null;
  grade: string | null;
};

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;

export function PsychologyView({ trades }: { trades: PsychTrade[] }) {
  const stats = useMemo(() => {
    const settled = trades
      .filter(
        (t): t is PsychTrade & { closedAt: string; realizedPnl: number } =>
          t.closedAt !== null && t.realizedPnl !== null,
      )
      .sort((a, b) => a.closedAt.localeCompare(b.closedAt));

    // 最大連虧 / 連勝
    let curWin = 0,
      curLoss = 0,
      maxWin = 0,
      maxLoss = 0;
    for (const t of settled) {
      if (t.realizedPnl > 0) {
        curWin++;
        curLoss = 0;
        maxWin = Math.max(maxWin, curWin);
      } else if (t.realizedPnl < 0) {
        curLoss++;
        curWin = 0;
        maxLoss = Math.max(maxLoss, curLoss);
      }
    }

    // 評分分布(使用者自己打的,有資料才算)
    const graded = trades.filter((t) => t.grade);
    const byGrade = new Map<string, { n: number; pnl: number }>();
    for (const t of graded) {
      const g = t.grade as string;
      const prev = byGrade.get(g) ?? { n: 0, pnl: 0 };
      byGrade.set(g, {
        n: prev.n + 1,
        pnl: prev.pnl + (t.realizedPnl ?? 0),
      });
    }

    // 每日交易次數(本地時區),用來看有沒有過度交易的日子
    const perDay = new Map<string, number>();
    for (const t of settled) {
      const d = new Date(t.closedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    const counts = [...perDay.values()];
    const avgPerDay = counts.length
      ? counts.reduce((s, c) => s + c, 0) / counts.length
      : 0;
    const busiest = counts.length ? Math.max(...counts) : 0;

    return {
      maxWinStreak: maxWin,
      maxLossStreak: maxLoss,
      gradeRows: [...byGrade.entries()].sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
      gradedCount: graded.length,
      avgPerDay,
      busiest,
      tradingDays: counts.length,
    };
  }, [trades]);

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
      <div className="mb-5 grid grid-cols-4 gap-px overflow-hidden rounded border border-border bg-border">
        <Stat label="最大連續虧損" value={`${stats.maxLossStreak} 筆`} tone="loss" />
        <Stat label="最大連續獲利" value={`${stats.maxWinStreak} 筆`} tone="profit" />
        <Stat
          label="平均每日交易次數"
          value={stats.tradingDays ? fmt(stats.avgPerDay, 1) : "—"}
          hint={stats.tradingDays ? `共 ${stats.tradingDays} 個交易日` : undefined}
        />
        <Stat
          label="單日最多交易"
          value={stats.busiest ? `${stats.busiest} 筆` : "—"}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card title="紀律遵守率">
          <NeedsSetup
            what="紀律規則"
            why="紀律遵守率要先有你自己的規則清單,才能逐筆記錄有沒有遵守。"
            where="設定 → 紀律規則(尚未實作)"
          />
        </Card>

        <Card title="情緒 × 損益">
          <NeedsSetup
            what="情緒狀態欄位"
            why="要先在自訂欄位建立「情緒狀態」,並在每筆交易標記,才能交叉分析。"
            where="設定 → 欄位自訂(尚未實作)"
          />
        </Card>
      </div>

      <div className="mb-4 rounded border border-border bg-surface px-4 py-4">
        <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
          行為偵測
        </h3>
        <NeedsSetup
          what="行為偵測設定"
          why="復仇交易、上頭偵測這類判定需要先設定要偵測哪些模式與門檻;其中「浮虧加倉」等可驗證的行為之後會由系統直接從成交資料算出,不需你自己勾選。"
          where="設定 → 行為偵測(尚未實作)"
        />
      </div>

      <div className="rounded border border-border bg-surface px-4 py-4">
        <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
          交易評分分布
        </h3>
        {stats.gradedCount === 0 ? (
          <p className="text-[0.82rem] leading-relaxed text-text-secondary">
            還沒有交易被評分。到交易記錄頁的「總覽」分頁替交易打 A/B/C/D,
            這裡就會顯示各評分的筆數與損益貢獻。
          </p>
        ) : (
          <table className="w-full border-collapse text-[0.9rem]">
            <thead>
              <tr>
                {["評分", "交易數", "累計損益"].map((h, i) => (
                  <th
                    key={h}
                    className={`border-b border-border px-2.5 py-1.5 text-[0.78rem] font-semibold text-text-secondary ${
                      i === 0 ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.gradeRows.map(([g, v]) => (
                <tr key={g}>
                  <td className="border-b border-border px-2.5 py-2 font-semibold">
                    {g}
                  </td>
                  <td className="num border-b border-border px-2.5 py-2 text-right">
                    {v.n}
                  </td>
                  <td
                    className={`num border-b border-border px-2.5 py-2 text-right font-semibold ${
                      v.pnl >= 0 ? "text-profit" : "text-loss"
                    }`}
                  >
                    {signed(v.pnl)}U
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss";
  hint?: string;
}) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className="mb-1.5 text-[0.78rem] text-text-secondary">{label}</div>
      <div
        className={`num text-[1.29rem] font-semibold ${
          tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""
        }`}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[0.7rem] text-text-tertiary">{hint}</div>
      )}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-surface px-4 py-4">
      <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
        {title}
      </h3>
      {children}
    </div>
  );
}

function NeedsSetup({
  what,
  why,
  where,
}: {
  what: string;
  why: string;
  where: string;
}) {
  return (
    <div className="rounded border border-dashed border-border bg-canvas px-3.5 py-3.5">
      <div className="mb-1 text-[0.85rem] font-semibold text-text-secondary">
        需要先設定{what}
      </div>
      <p className="mb-1.5 text-[0.8rem] leading-relaxed text-text-secondary">
        {why}
      </p>
      <p className="text-[0.75rem] text-text-tertiary">{where}</p>
    </div>
  );
}
