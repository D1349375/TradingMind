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
  emotion: string | null;
  discipline: boolean | null;
};

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;

export function PsychologyView({
  trades,
  hasEmotionField,
  hasDisciplineField,
}: {
  trades: PsychTrade[];
  hasEmotionField: boolean;
  hasDisciplineField: boolean;
}) {
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

    // 情緒 × 損益
    const byEmotion = new Map<
      string,
      { n: number; wins: number; losses: number; pnl: number }
    >();
    for (const t of trades) {
      if (!t.emotion || t.realizedPnl === null) continue;
      const prev = byEmotion.get(t.emotion) ?? {
        n: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
      };
      prev.n++;
      if (t.realizedPnl > 0) prev.wins++;
      else if (t.realizedPnl < 0) prev.losses++;
      prev.pnl += t.realizedPnl;
      byEmotion.set(t.emotion, prev);
    }

    // 紀律遵守
    const marked = trades.filter((t) => t.discipline !== null);
    const followed = marked.filter((t) => t.discipline === true);
    const violated = marked.filter((t) => t.discipline === false);
    const violationLoss = violated.reduce(
      (s, t) => s + Math.min(0, t.realizedPnl ?? 0),
      0,
    );

    return {
      maxWinStreak: maxWin,
      maxLossStreak: maxLoss,
      emotionRows: [...byEmotion.entries()].sort((a, b) => b[1].pnl - a[1].pnl),
      disciplineMarked: marked.length,
      disciplineRate: marked.length
        ? (followed.length / marked.length) * 100
        : null,
      violationCount: violated.length,
      violationLoss,
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
          {!hasDisciplineField ? (
            <NeedsSetup
              what="紀律遵守欄位"
              why="要先在欄位庫啟用「紀律遵守」,並在每筆交易標記是否符合交易計劃。"
              where="設定 → 欄位自訂"
            />
          ) : stats.disciplineMarked === 0 ? (
            <p className="text-[0.82rem] leading-relaxed text-text-secondary">
              「紀律遵守」欄位已啟用,但還沒有交易標記。到交易記錄頁的「自訂欄位」分頁標記後就會統計。
            </p>
          ) : (
            <div>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="num text-[1.5rem] font-semibold text-profit">
                  {fmt(stats.disciplineRate ?? 0, 1)}%
                </span>
                <span className="text-[0.78rem] text-text-secondary">
                  已標記 {stats.disciplineMarked} 筆
                </span>
              </div>
              <div className="text-[0.82rem] text-text-secondary">
                違規 <b className="num text-text">{stats.violationCount}</b> 筆,
                造成虧損{" "}
                <b className="num text-loss">
                  {fmt(stats.violationLoss)}U
                </b>
              </div>
            </div>
          )}
        </Card>

        <Card title="情緒 × 損益">
          {!hasEmotionField ? (
            <NeedsSetup
              what="情緒狀態欄位"
              why="要先在欄位庫啟用「情緒狀態」,並在每筆交易標記,才能交叉分析。"
              where="設定 → 欄位自訂"
            />
          ) : stats.emotionRows.length === 0 ? (
            <p className="text-[0.82rem] leading-relaxed text-text-secondary">
              「情緒狀態」欄位已啟用,但還沒有交易標記。到交易記錄頁的「自訂欄位」分頁標記後就會統計。
            </p>
          ) : (
            <table className="w-full border-collapse text-[0.87rem]">
              <thead>
                <tr>
                  {["情緒", "筆數", "勝率", "累計損益"].map((h, i) => (
                    <th
                      key={h}
                      className={`border-b border-border px-2 py-1.5 text-[0.75rem] font-semibold text-text-secondary ${
                        i === 0 ? "text-left" : "text-right"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.emotionRows.map(([e, v]) => {
                  const decided = v.wins + v.losses;
                  return (
                    <tr key={e}>
                      <td className="border-b border-border px-2 py-1.5">{e}</td>
                      <td className="num border-b border-border px-2 py-1.5 text-right">
                        {v.n}
                      </td>
                      <td className="num border-b border-border px-2 py-1.5 text-right">
                        {decided
                          ? `${fmt((v.wins / decided) * 100, 0)}%`
                          : "—"}
                      </td>
                      <td
                        className={`num border-b border-border px-2 py-1.5 text-right font-semibold ${
                          v.pnl >= 0 ? "text-profit" : "text-loss"
                        }`}
                      >
                        {signed(v.pnl)}U
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {stats.emotionRows.some(([, v]) => v.n < 5) && (
            <p className="mt-2 text-[0.72rem] leading-relaxed text-text-tertiary">
              筆數少於 5 的情緒只是少數樣本,單筆大賺大賠就會主導結果,
              別急著據此下結論。情緒是自己標的,回頭補標時容易受結果影響——
              當下就標比較準。
            </p>
          )}
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
