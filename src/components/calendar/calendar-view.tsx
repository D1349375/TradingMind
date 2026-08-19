"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// 對應 prototype 的日曆視圖:月摘要條 + 週損益欄 + 點日期下鑽當日交易。

export type CalTrade = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  closedAt: string | null;
  realizedPnl: number | null;
};

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function CalendarView({ trades }: { trades: CalTrade[] }) {
  // 日期分組一律在瀏覽器端做:closedAt 是 UTC,但「哪一天」是使用者本地時區
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [offset, setOffset] = useState(0);
  const [openDay, setOpenDay] = useState<number | null>(null);

  const now = new Date();
  const view = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();

  const byDay = useMemo(() => {
    const m = new Map<number, { pnl: number; list: CalTrade[] }>();
    for (const t of trades) {
      if (!t.closedAt || t.realizedPnl === null) continue;
      const d = new Date(t.closedAt);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      const prev = m.get(day) ?? { pnl: 0, list: [] };
      prev.pnl += t.realizedPnl;
      prev.list.push(t);
      m.set(day, prev);
    }
    return m;
  }, [trades, year, month]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const summary = useMemo(() => {
    let total = 0,
      profitDays = 0,
      lossDays = 0,
      curWin = 0,
      curLoss = 0,
      bestWin = 0,
      worstLoss = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const data = byDay.get(d);
      if (!data) continue;
      total += data.pnl;
      if (data.pnl >= 0) {
        profitDays++;
        curWin++;
        curLoss = 0;
        bestWin = Math.max(bestWin, curWin);
      } else {
        lossDays++;
        curLoss++;
        curWin = 0;
        worstLoss = Math.max(worstLoss, curLoss);
      }
    }
    return { total, profitDays, lossDays, bestWin, worstLoss };
  }, [byDay, daysInMonth]);

  // 依週切分,最後一欄放該週合計
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const openData = openDay !== null ? byDay.get(openDay) : undefined;

  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-px overflow-hidden rounded border border-border bg-border">
        <Cell
          label="本月損益"
          value={`${signed(summary.total)}U`}
          tone={summary.total >= 0 ? "profit" : "loss"}
        />
        <Cell label="獲利天數" value={`${summary.profitDays} 天`} />
        <Cell label="虧損天數" value={`${summary.lossDays} 天`} />
        <Cell
          label="最大連勝 / 連敗"
          value={`${summary.bestWin} / ${summary.worstLoss}`}
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <NavBtn label="上個月" onClick={() => { setOffset((v) => v - 1); setOpenDay(null); }} dir="prev" />
          <span className="text-[0.98rem] font-semibold" suppressHydrationWarning>
            {year} 年 {month + 1} 月
          </span>
          <NavBtn label="下個月" onClick={() => { setOffset((v) => v + 1); setOpenDay(null); }} dir="next" />
          {offset !== 0 && (
            <button
              type="button"
              onClick={() => { setOffset(0); setOpenDay(null); }}
              className="ml-1 rounded border border-border px-2 py-1 text-[0.75rem] text-text-secondary hover:border-accent hover:text-accent"
            >
              回到本月
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-[0.78rem] text-text-secondary">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-border bg-loss-bg-strong" />
          虧損日
          <span className="ml-2 inline-block h-2.5 w-2.5 rounded-sm border border-border bg-surface" />
          無交易
          <span className="ml-2 inline-block h-2.5 w-2.5 rounded-sm border border-border bg-profit-bg-strong" />
          獲利日
        </div>
      </div>

      <div className="grid grid-cols-[repeat(7,1fr)_0.85fr] gap-px overflow-hidden rounded border border-border bg-border">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="bg-canvas py-2 text-center text-[0.78rem] font-semibold text-text-secondary"
          >
            {d}
          </div>
        ))}
        <div className="bg-canvas py-2 text-center text-[0.78rem] font-semibold text-text-secondary">
          週損益
        </div>

        {weeks.map((w, wi) => {
          const weekPnl = w.reduce<number>(
            (s, d) => s + (d !== null ? (byDay.get(d)?.pnl ?? 0) : 0),
            0,
          );
          const hasAny = w.some((d) => d !== null && byDay.has(d));
          return (
            <FragmentWeek
              key={wi}
              week={w}
              byDay={byDay}
              weekPnl={weekPnl}
              hasAny={hasAny}
              openDay={openDay}
              onOpen={setOpenDay}
            />
          );
        })}
      </div>

      {openDay !== null && openData && (
        <div className="mt-4 rounded border border-border bg-surface px-4 py-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="text-[0.92rem] font-semibold" suppressHydrationWarning>
              {year} 年 {month + 1} 月 {openDay} 日 · {openData.list.length} 筆交易 ·{" "}
              <span className={openData.pnl >= 0 ? "text-profit" : "text-loss"}>
                {signed(openData.pnl)}U
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpenDay(null)}
              className="text-[0.78rem] text-text-secondary hover:text-text"
            >
              收起
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {openData.list.map((t) => {
              const win = (t.realizedPnl ?? 0) >= 0;
              return (
                // 點單筆交易直接連到 /trades?id=... 看完整紀錄(反思筆記/
                // 紀律清單等),不只是這裡的商品+損益+時間三個數字。
                <Link
                  key={t.id}
                  href={`/trades?id=${t.id}`}
                  className="block rounded border border-border bg-canvas px-3 py-2 hover:border-accent"
                >
                  <div className="flex justify-between text-[0.87rem]">
                    <span className="font-semibold">{t.symbol}</span>
                    <span
                      className={`num font-semibold ${win ? "text-profit" : "text-loss"}`}
                    >
                      {signed(t.realizedPnl ?? 0)}U
                    </span>
                  </div>
                  <div
                    className="text-[0.78rem] text-text-secondary"
                    suppressHydrationWarning
                  >
                    {t.closedAt
                      ? new Date(t.closedAt).toLocaleTimeString("zh-TW", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                          timeZone: mounted ? undefined : "UTC",
                        })
                      : "—"}{" "}
                    · {t.direction}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function FragmentWeek({
  week,
  byDay,
  weekPnl,
  hasAny,
  openDay,
  onOpen,
}: {
  week: (number | null)[];
  byDay: Map<number, { pnl: number; list: CalTrade[] }>;
  weekPnl: number;
  hasAny: boolean;
  openDay: number | null;
  onOpen: (d: number | null) => void;
}) {
  return (
    <>
      {week.map((d, i) => {
        if (d === null)
          return <div key={`e${i}`} className="min-h-[78px] bg-canvas" />;
        const data = byDay.get(d);
        const tone = !data
          ? "bg-surface"
          : data.pnl >= 0
            ? "bg-profit-bg-strong"
            : "bg-loss-bg-strong";
        const selected = openDay === d;
        const content = (
          <>
            <div className="text-[0.8rem] text-text-secondary">{d}</div>
            {data && (
              <>
                <div className="absolute right-2 top-2 text-[0.72rem] text-text-tertiary">
                  {data.list.length}筆
                </div>
                <div
                  className={`num absolute bottom-2 left-2 text-[0.87rem] font-semibold ${
                    data.pnl >= 0 ? "text-profit" : "text-loss"
                  }`}
                >
                  {signed(data.pnl, 0)}U
                </div>
              </>
            )}
          </>
        );
        return data ? (
          <button
            key={d}
            type="button"
            onClick={() => onOpen(selected ? null : d)}
            aria-pressed={selected}
            className={`relative min-h-[78px] px-2 py-2 text-left ${tone} ${
              selected ? "outline outline-2 -outline-offset-2 outline-accent" : "hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-accent"
            }`}
          >
            {content}
          </button>
        ) : (
          <div key={d} className={`relative min-h-[78px] px-2 py-2 ${tone}`}>
            {content}
          </div>
        );
      })}
      <div className="flex items-center justify-center bg-canvas px-1 text-[0.72rem] text-text-secondary">
        {hasAny && weekPnl !== 0 && (
          <b className={`num ${weekPnl >= 0 ? "text-profit" : "text-loss"}`}>
            {signed(weekPnl, 0)}U
          </b>
        )}
      </div>
    </>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss";
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="mb-1.5 text-[0.75rem] text-text-secondary">{label}</div>
      <div
        className={`num text-[1.1rem] font-semibold ${
          tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""
        }`}
        suppressHydrationWarning
      >
        {value}
      </div>
    </div>
  );
}

function NavBtn({
  label,
  onClick,
  dir,
}: {
  label: string;
  onClick: () => void;
  dir: "prev" | "next";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-6.5 w-6.5 items-center justify-center rounded border border-border p-1 text-text-secondary hover:border-accent hover:text-accent"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        <path d={dir === "prev" ? "M12 4l-6 6 6 6" : "M8 4l6 6-6 6"} />
      </svg>
    </button>
  );
}
