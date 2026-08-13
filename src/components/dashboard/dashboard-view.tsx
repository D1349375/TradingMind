"use client";

import { useEffect, useMemo, useState } from "react";
import {
  equityCurve,
  groupByLocalDay,
  summarise,
  type TradePoint,
} from "@/lib/stats";
import { GoalCards, type GoalState } from "@/components/dashboard/goal-cards";

function fmt(n: number, digits = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signed(n: number, digits = 2) {
  return `${n >= 0 ? "+" : ""}${fmt(n, digits)}`;
}

export function DashboardView({
  trades,
  goals,
}: {
  trades: TradePoint[];
  goals: GoalState;
}) {
  const summary = useMemo(() => summarise(trades), [trades]);
  const curve = useMemo(() => equityCurve(trades), [trades]);

  // 今日/本月都是「使用者本地時區」的概念,必須在瀏覽器端算,
  // 否則跨午夜的交易會被歸到錯誤的一天(跟日曆分組同一個理由)。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { todayLoss, monthPnl } = useMemo(() => {
    const now = new Date();
    let todayPnl = 0;
    let month = 0;
    for (const t of trades) {
      if (!t.closedAt || t.realizedPnl === null) continue;
      const d = new Date(t.closedAt);
      if (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      ) {
        month += t.realizedPnl;
        if (d.getDate() === now.getDate()) todayPnl += t.realizedPnl;
      }
    }
    // 今日淨損益為正時,當天沒有消耗風控額度
    return { todayLoss: todayPnl < 0 ? -todayPnl : 0, monthPnl: month };
  }, [trades]);

  if (trades.length === 0) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-12 text-center">
        <div className="mb-1 text-[0.9rem] font-semibold text-text-secondary">
          還沒有交易資料
        </div>
        <p className="text-[0.82rem] text-text-secondary">
          到「設定 → 交易所連線」連接 Bybit 後按「立即同步」。
        </p>
      </div>
    );
  }

  return (
    <>
      <StatGrid summary={summary} />
      <div suppressHydrationWarning>
        {mounted && (
          <GoalCards goals={goals} todayLoss={todayLoss} monthPnl={monthPnl} />
        )}
      </div>
      <div className="mb-4 grid grid-cols-[1.4fr_1fr] gap-4">
        <EquityChart curve={curve} />
        <WinLossCard summary={summary} />
      </div>
      <CalendarCard trades={trades} />
    </>
  );
}

function StatGrid({ summary }: { summary: ReturnType<typeof summarise> }) {
  const cells: { label: string; value: string; tone?: "profit" | "loss"; hint?: string }[] = [
    {
      label: "總損益",
      value: `${signed(summary.totalPnl)}U`,
      tone: summary.totalPnl >= 0 ? "profit" : "loss",
    },
    {
      label: "勝率",
      value: summary.winRate === null ? "—" : `${fmt(summary.winRate, 1)}%`,
      hint:
        summary.winRate === null
          ? undefined
          : `${summary.winCount} 勝 / ${summary.lossCount} 敗`,
    },
    {
      label: "獲利因子",
      value:
        summary.profitFactor === null ? "—" : fmt(summary.profitFactor, 2),
      hint:
        summary.profitFactor === null ? "沒有虧損交易,無法計算" : undefined,
    },
    {
      label: "平均 R",
      value: summary.avgR === null ? "—" : `${fmt(summary.avgR, 2)}R`,
      hint:
        summary.avgR === null
          ? "需要止損價才能算 R,同步資料不含此欄位"
          : undefined,
    },
    {
      label: "最大回撤",
      value: `${fmt(summary.maxDrawdown)}U`,
      tone: summary.maxDrawdown < 0 ? "loss" : undefined,
    },
    { label: "總交易數", value: String(summary.tradeCount) },
  ];

  return (
    <div className="mb-5 grid grid-cols-6 gap-px overflow-hidden rounded border border-border bg-border">
      {cells.map((c) => (
        <div key={c.label} className="bg-surface px-4 py-3.5">
          <div className="mb-1.5 text-[0.78rem] text-text-secondary">
            {c.label}
          </div>
          <div
            className={`num text-[1.29rem] font-semibold ${
              c.tone === "profit"
                ? "text-profit"
                : c.tone === "loss"
                  ? "text-loss"
                  : ""
            }`}
            title={c.hint}
          >
            {c.value}
          </div>
          {c.hint && (
            <div className="mt-0.5 text-[0.7rem] text-text-tertiary">
              {c.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EquityChart({ curve }: { curve: ReturnType<typeof equityCurve> }) {
  const W = 480;
  const H = 150;

  if (curve.length < 2) {
    return (
      <div className="rounded border border-border bg-surface px-4 py-4">
        <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
          累計損益曲線
        </h3>
        <p className="text-[0.82rem] text-text-secondary">
          至少要有兩筆已平倉交易才能畫出曲線。
        </p>
      </div>
    );
  }

  const values = curve.map((p) => p.equity);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const x = (i: number) => (i / (curve.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / range) * H;

  const points = curve.map((p, i) => `${x(i)},${y(p.equity)}`).join(" ");
  const last = curve[curve.length - 1].equity;
  const up = last >= 0;

  return (
    <div className="rounded border border-border bg-surface px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[0.82rem] font-semibold text-text-secondary">
          累計損益曲線
        </h3>
        <span
          className={`num text-[0.85rem] font-semibold ${up ? "text-profit" : "text-loss"}`}
        >
          {signed(last)}U
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`累計損益曲線,期末 ${fmt(last)}U`}
      >
        {/* 零軸:有了它才看得出何時由盈轉虧 */}
        {min < 0 && max > 0 && (
          <line
            x1="0"
            y1={y(0)}
            x2={W}
            y2={y(0)}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        )}
        <polyline
          points={points}
          fill="none"
          stroke={up ? "var(--profit)" : "var(--loss)"}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function WinLossCard({ summary }: { summary: ReturnType<typeof summarise> }) {
  const total = summary.grossProfit + summary.grossLoss;
  const profitPct = total > 0 ? (summary.grossProfit / total) * 100 : 0;

  return (
    <div className="rounded border border-border bg-surface px-4 py-4">
      <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
        總獲利 vs 總虧損
      </h3>
      <div className="mb-2 flex h-2.5 overflow-hidden rounded-full border border-border">
        <div className="bg-profit" style={{ width: `${profitPct}%` }} />
        <div className="bg-loss" style={{ width: `${100 - profitPct}%` }} />
      </div>
      <dl className="space-y-1.5 text-[0.84rem]">
        <div className="flex justify-between">
          <dt className="text-text-secondary">總獲利</dt>
          <dd className="num font-semibold text-profit">
            +{fmt(summary.grossProfit)}U
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">總虧損</dt>
          <dd className="num font-semibold text-loss">
            -{fmt(summary.grossLoss)}U
          </dd>
        </div>
      </dl>
    </div>
  );
}

function CalendarCard({ trades }: { trades: TradePoint[] }) {
  // 只在瀏覽器端分組,避免用伺服器時區把跨午夜的交易歸錯天
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [monthOffset, setMonthOffset] = useState(0);
  const byDay = useMemo(() => groupByLocalDay(trades), [trades]);

  const base = new Date();
  const view = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { day, data: byDay.get(key) };
  });

  const monthTotal = monthDays.reduce((s, d) => s + (d.data?.pnl ?? 0), 0);
  const profitDays = monthDays.filter((d) => (d.data?.pnl ?? 0) > 0).length;
  const lossDays = monthDays.filter((d) => (d.data?.pnl ?? 0) < 0).length;

  return (
    <div className="rounded border border-border bg-surface px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMonthOffset((v) => v - 1)}
            aria-label="上個月"
            className="flex h-6 w-6 items-center justify-center rounded border border-border text-text-secondary hover:border-accent hover:text-accent"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M12 4l-6 6 6 6" />
            </svg>
          </button>
          <span className="text-[0.98rem] font-semibold" suppressHydrationWarning>
            {year} 年 {month + 1} 月
          </span>
          <button
            type="button"
            onClick={() => setMonthOffset((v) => v + 1)}
            aria-label="下個月"
            className="flex h-6 w-6 items-center justify-center rounded border border-border text-text-secondary hover:border-accent hover:text-accent"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M8 4l6 6-6 6" />
            </svg>
          </button>
        </div>
        <div className="flex gap-4 text-[0.78rem] text-text-secondary" suppressHydrationWarning>
          <span>
            本月{" "}
            <b className={`num ${monthTotal >= 0 ? "text-profit" : "text-loss"}`}>
              {signed(monthTotal)}U
            </b>
          </span>
          <span>
            獲利 <b className="num">{profitDays}</b> 天 / 虧損{" "}
            <b className="num">{lossDays}</b> 天
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-border bg-border">
        {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
          <div
            key={d}
            className="bg-canvas py-1.5 text-center text-[0.78rem] font-semibold text-text-secondary"
          >
            {d}
          </div>
        ))}
        {Array.from({ length: firstDow }, (_, i) => (
          <div key={`pad-${i}`} className="min-h-[62px] bg-canvas" />
        ))}
        {monthDays.map(({ day, data }) => {
          const pnl = data?.pnl;
          const tone =
            pnl === undefined
              ? "bg-surface"
              : pnl >= 0
                ? "bg-profit-bg-strong"
                : "bg-loss-bg-strong";
          return (
            <div
              key={day}
              className={`relative min-h-[62px] px-1.5 py-1.5 ${tone}`}
              suppressHydrationWarning
            >
              <div className="text-[0.78rem] text-text-secondary">{day}</div>
              {data && (
                <>
                  <div className="absolute right-1.5 top-1.5 text-[0.68rem] text-text-tertiary">
                    {data.count}筆
                  </div>
                  <div
                    className={`num absolute bottom-1.5 left-1.5 text-[0.8rem] font-semibold ${
                      data.pnl >= 0 ? "text-profit" : "text-loss"
                    }`}
                  >
                    {signed(data.pnl, 0)}U
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {!mounted && (
        <p className="mt-2 text-[0.72rem] text-text-tertiary">
          日期依你的所在時區分組。
        </p>
      )}
    </div>
  );
}
