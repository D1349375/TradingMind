"use client";

import { useEffect, useMemo, useState } from "react";
import {
  equityCurve,
  groupByLocalDay,
  summarise,
  type NamedTradePoint,
  type TradePoint,
} from "@/lib/stats";
import { GoalCards, type GoalState } from "@/components/dashboard/goal-cards";
import { PerformanceView } from "@/components/dashboard/performance-view";
import {
  DateRangeSelect,
  DEFAULT_DATE_RANGE,
  resolveDateRange,
  type DateRangeValue,
} from "@/components/dashboard/date-range-select";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { GatedFeature } from "@/components/ui/gated-feature";

function fmt(n: number, digits = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signed(n: number, digits = 2) {
  return `${n >= 0 ? "+" : ""}${fmt(n, digits)}`;
}

const DASH_TABS = [
  { key: "overview", label: "總覽" },
  { key: "performance", label: "績效分析" },
] as const;
type DashTab = (typeof DASH_TABS)[number]["key"];

export function DashboardView({
  trades,
  goals,
  lastSyncedText,
  assetClassMixed,
  showBybitHint,
  tier,
}: {
  trades: NamedTradePoint[];
  goals: GoalState | null;
  lastSyncedText: string;
  assetClassMixed: boolean;
  showBybitHint: boolean;
  tier: "FREE" | "STANDARD" | "ADVANCED";
}) {
  const [tab, setTab] = useState<DashTab>("overview");
  const [range, setRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);

  // 區間篩選只影響「回顧型」統計(總覽數據格/損益曲線/績效分析頁)。
  // 回撤緩衝、獲利目標、日曆卡刻意不受此篩選影響——見下方對應區塊註解。
  const filteredTrades = useMemo(() => {
    const r = resolveDateRange(range);
    if (!r) return trades;
    return trades.filter((t) => {
      if (!t.closedAt) return false;
      const d = new Date(t.closedAt);
      return d >= r.start && d <= r.end;
    });
  }, [trades, range]);

  const summary = useMemo(() => summarise(filteredTrades), [filteredTrades]);
  const curve = useMemo(() => equityCurve(filteredTrades), [filteredTrades]);

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

  const header = (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[1.4rem] font-semibold">Dashboard</h1>
        <p className="mt-0.5 text-[0.84rem] text-text-secondary">
          {lastSyncedText}
        </p>
      </div>
      <DateRangeSelect value={range} onChange={setRange} />
    </div>
  );

  if (trades.length === 0) {
    return (
      <>
        {header}
        <div className="rounded border border-border bg-surface px-5 py-12 text-center">
          <div className="mb-1 text-[0.9rem] font-semibold text-text-secondary">
            還沒有交易資料
          </div>
          <p className="text-[0.82rem] text-text-secondary">
            {showBybitHint
              ? "到「設定 → 交易所連線」連接 Bybit 或 OKX 同步,或到「交易記錄」頁用 CSV 匯入、手動新增交易。"
              : "這個模板的資產類別跟目前支援自動同步的交易所(Bybit/OKX,僅限加密貨幣)對不上,期貨/CFD 類交易所串接還在規劃中。可以到「交易記錄」頁用 CSV 匯入或手動新增交易。"}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="mb-5 flex items-center gap-5 border-b border-border">
        {DASH_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key}
            className={
              tab === t.key
                ? "-mb-px border-b-2 border-accent pb-2 text-[0.9rem] font-semibold text-text"
                : "-mb-px border-b-2 border-transparent pb-2 text-[0.9rem] text-text-secondary hover:text-text"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <StatGrid summary={summary} />
          {filteredTrades.length === 0 && (
            <div className="mb-5 rounded border border-dashed border-border bg-canvas px-4 py-3 text-[0.82rem] text-text-secondary">
              選取的區間內沒有交易資料。
            </div>
          )}
          {/* 回撤緩衝/獲利目標是即時風控狀態,固定看「今日/本月」,不隨上方區間篩選變動——
              不分方案都看得到,這是風控安全機制不是分析洞察層,不適用分級鎖。 */}
          <div suppressHydrationWarning>
            {mounted && (
              <GoalCards goals={goals} todayLoss={todayLoss} monthPnl={monthPnl} />
            )}
          </div>
          {/* 權益曲線/盈虧佔比是「分析洞察」層,FREE 只給 StatGrid+日曆(基本數字),
              STANDARD/ADVANCED 才解鎖——見規劃書 Credit定價文件第五節分層設計。
              內容一律照常渲染(真實資料),只是用 GatedFeature 灰階蓋鎖頭,
              不是整段換成文字提示——2026-08-20 改版,讓使用者先看到「這功能
              長什麼樣子」。 */}
          <div className="mb-4">
            {tier === "FREE" ? (
              <GatedFeature feature="權益曲線與盈虧佔比圖表">
                <div className="grid grid-cols-[1.4fr_1fr] gap-4">
                  <EquityChart curve={curve} />
                  <WinLossCard summary={summary} />
                </div>
              </GatedFeature>
            ) : (
              <div className="grid grid-cols-[1.4fr_1fr] gap-4">
                <EquityChart curve={curve} />
                <WinLossCard summary={summary} />
              </div>
            )}
          </div>
          {/* 日曆卡有自己的月份導覽,同樣不受上方區間篩選影響 */}
          <CalendarCard trades={trades} />
        </>
      ) : tier !== "ADVANCED" ? (
        <GatedFeature feature="績效分析頁(風險調整報酬指標、破產風險模擬等)" requiredTier="ADVANCED">
          <PerformanceView
            trades={filteredTrades}
            totalCapital={goals?.totalCapital ?? null}
            assetClassMixed={assetClassMixed}
          />
        </GatedFeature>
      ) : (
        <PerformanceView
          trades={filteredTrades}
          totalCapital={goals?.totalCapital ?? null}
          assetClassMixed={assetClassMixed}
        />
      )}
    </>
  );
}

export function StatGrid({ summary }: { summary: ReturnType<typeof summarise> }) {
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
  const [hover, setHover] = useState<number | null>(null);

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
  const hovered = hover !== null ? curve[hover] : null;

  // 日期軸只取頭/中/尾三個刻度,避免點數多時擠成一團看不清
  const tickIdx = [0, Math.floor((curve.length - 1) / 2), curve.length - 1];

  return (
    <div className="rounded border border-border bg-surface px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[0.82rem] font-semibold text-text-secondary">
            累計損益曲線
          </h3>
          <HelpTooltip>
            依平倉時間排序後,把每筆已實現損益累加起來的曲線——不是帳戶淨值(不含未平倉部位浮盈虧、也不含入金/出金)。滑鼠移到曲線上看該筆交易當下的累計損益與這筆本身的損益。
          </HelpTooltip>
        </div>
        <span className="text-[0.78rem] text-text-secondary">
          {hovered ? (
            <>
              <span className="text-text-tertiary">{hovered.closedAt.slice(0, 10)} · </span>
              <span className={`num font-semibold ${hovered.equity >= 0 ? "text-profit" : "text-loss"}`}>
                {signed(hovered.equity)}U
              </span>
              <span className="text-text-tertiary"> (該筆 {signed(hovered.pnl)}U)</span>
            </>
          ) : (
            <span className={`num font-semibold ${up ? "text-profit" : "text-loss"}`}>
              {signed(last)}U
            </span>
          )}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`累計損益曲線,期末 ${fmt(last)}U`}
        onMouseLeave={() => setHover(null)}
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
        {hovered && (
          <>
            <line x1={x(hover as number)} y1="0" x2={x(hover as number)} y2={H} stroke="var(--border)" strokeWidth="1" />
            <circle cx={x(hover as number)} cy={y(hovered.equity)} r="3.5" fill={hovered.equity >= 0 ? "var(--profit)" : "var(--loss)"} />
          </>
        )}
        {/* 逐點透明命中區,滑鼠移到任一段就抓最近的點 */}
        {curve.map((_, i) => (
          <rect
            key={i}
            x={i === 0 ? 0 : (x(i - 1) + x(i)) / 2}
            y={0}
            width={
              (i === 0 ? (x(1) - x(0)) / 2 : (x(i) - x(i - 1)) / 2) +
              (i === curve.length - 1 ? (x(i) - x(i - 1)) / 2 : (x(i + 1) - x(i)) / 2)
            }
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[0.68rem] text-text-tertiary">
        {tickIdx.map((i, k) => (
          <span key={k}>{curve[i].closedAt.slice(0, 10)}</span>
        ))}
      </div>
    </div>
  );
}

function WinLossCard({ summary }: { summary: ReturnType<typeof summarise> }) {
  const total = summary.grossProfit + summary.grossLoss;
  const profitPct = total > 0 ? (summary.grossProfit / total) * 100 : 0;

  return (
    <div className="rounded border border-border bg-surface px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.82rem] font-semibold text-text-secondary">
          總獲利 vs 總虧損
        </h3>
        <HelpTooltip>
          所有已平倉交易裡,獲利交易的損益總和 vs 虧損交易的損益總和(絕對值),用長條比例呈現兩者相對規模——跟獲利因子(總獲利/總虧損)是同一組數字的視覺化版本。
        </HelpTooltip>
      </div>
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
          <HelpTooltip>
            每格顯示當天已實現損益加總與交易筆數,依你的本地時區分組(不是伺服器時區)。顏色只反映當天是賺是賠,深淺不代表金額大小。
          </HelpTooltip>
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
