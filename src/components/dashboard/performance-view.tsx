"use client";

import { useEffect, useMemo, useState } from "react";
import {
  dailyPnlSeries,
  pnlHistogram,
  rHistogram,
  topTrades,
  simulateRuinRisk,
  type NamedTradePoint,
  type HistogramBucket,
} from "@/lib/stats";

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;

export function PerformanceView({
  trades,
  totalCapital,
}: {
  trades: NamedTradePoint[];
  totalCapital: number | null;
}) {
  // 每日長條圖依「本地日期」分組,伺服器/瀏覽器時區不同會誤判——
  // 跟 Dashboard 日曆卡、日曆視圖同一個理由,延後到掛載後才計算。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const daily = useMemo(() => (mounted ? dailyPnlSeries(trades) : []), [mounted, trades]);
  const pnlBuckets = useMemo(() => pnlHistogram(trades), [trades]);
  const rBuckets = useMemo(() => rHistogram(trades), [trades]);
  const rSampleSize = useMemo(
    () => trades.filter((t) => t.rMultiple !== null).length,
    [trades],
  );
  const { best, worst } = useMemo(() => topTrades(trades, 10), [trades]);
  const ruin = useMemo(
    () => (mounted ? simulateRuinRisk(trades, totalCapital) : null),
    [mounted, trades, totalCapital],
  );

  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-surface px-4 py-4">
        <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
          每日損益
        </h3>
        {!mounted ? (
          <p className="text-[0.82rem] text-text-secondary">計算中…</p>
        ) : (
          <DailyBarChart data={daily} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded border border-border bg-surface px-4 py-4">
          <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
            損益分布
          </h3>
          <HistogramChart buckets={pnlBuckets} />
        </div>
        <div className="rounded border border-border bg-surface px-4 py-4">
          <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
            R 分布
          </h3>
          {rSampleSize === 0 ? (
            <p className="text-[0.8rem] leading-relaxed text-text-secondary">
              目前沒有交易填過 R 值——同步交易缺止損價算不出 R,要在交易詳情頁手動填寫。
            </p>
          ) : (
            <>
              <HistogramChart buckets={rBuckets} />
              {rSampleSize < 10 && (
                <p className="mt-2 text-[0.72rem] text-text-tertiary">
                  只有 {rSampleSize} 筆交易有 R 值,樣本少,分布形狀還不穩定。
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="rounded border border-border bg-surface px-4 py-4">
        <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
          破產風險模擬
        </h3>
        <RuinRiskCard result={ruin} mounted={mounted} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TopTradesTable title="最佳 10 筆" rows={best} tone="profit" />
        <TopTradesTable title="最差 10 筆" rows={worst} tone="loss" />
      </div>
    </div>
  );
}

function DailyBarChart({ data }: { data: { date: string; pnl: number; count: number }[] }) {
  if (data.length === 0) {
    return <p className="text-[0.82rem] text-text-secondary">還沒有已平倉交易。</p>;
  }
  const max = Math.max(1, ...data.map((d) => Math.abs(d.pnl)));
  const W = 960;
  const H = 160;
  const barW = W / data.length;
  const zeroY = H / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="每日損益長條圖">
      <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--border)" strokeWidth="1" />
      {data.map((d, i) => {
        const barH = (Math.abs(d.pnl) / max) * (H / 2 - 4);
        const x = i * barW + barW * 0.15;
        const w = barW * 0.7;
        const y = d.pnl >= 0 ? zeroY - barH : zeroY;
        return (
          <rect
            key={d.date}
            x={x}
            y={y}
            width={Math.max(1, w)}
            height={Math.max(1, barH)}
            fill={d.pnl >= 0 ? "var(--profit)" : "var(--loss)"}
          >
            <title>{`${d.date} · ${signed(d.pnl)}U · ${d.count}筆`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function HistogramChart({ buckets }: { buckets: HistogramBucket[] }) {
  if (buckets.length === 0) {
    return <p className="text-[0.82rem] text-text-secondary">還沒有資料。</p>;
  }
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="flex h-[140px] items-end gap-1">
      {buckets.map((b) => (
        <div key={b.rangeLabel} className="group relative flex-1" title={`${b.rangeLabel} · ${b.count} 筆`}>
          <div
            className={`w-full rounded-t-sm ${b.rangeStart >= 0 ? "bg-profit" : "bg-loss"}`}
            style={{ height: `${(b.count / max) * 130}px` }}
          />
          <div className="mt-1 truncate text-center text-[0.6rem] text-text-tertiary">
            {b.count > 0 ? b.count : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function RuinRiskCard({
  result,
  mounted,
}: {
  result: ReturnType<typeof simulateRuinRisk> | null;
  mounted: boolean;
}) {
  if (!mounted || !result) {
    return <p className="text-[0.82rem] text-text-secondary">計算中…</p>;
  }
  if (!result.available) {
    return (
      <div className="rounded border border-dashed border-border bg-canvas px-3.5 py-3.5">
        <div className="mb-1 text-[0.85rem] font-semibold text-text-secondary">
          目前無法模擬
        </div>
        <p className="text-[0.8rem] leading-relaxed text-text-secondary">
          {result.unavailableReason}
        </p>
      </div>
    );
  }
  const pct = result.ruinProbabilityPct ?? 0;
  const tone = pct >= 20 ? "text-loss" : pct >= 5 ? "text-warning" : "text-profit";
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className={`num text-[1.6rem] font-semibold ${tone}`}>{fmt(pct, 1)}%</span>
        <span className="text-[0.78rem] text-text-secondary">
          未來 {result.horizonTrades} 筆交易內,帳戶跌破起始資金 {result.ruinThresholdPct}% 的機率
        </span>
      </div>
      <p className="text-[0.75rem] leading-relaxed text-text-tertiary">
        用你過去 {result.sampleSize} 筆已平倉交易的損益(換算成占帳戶總資金的報酬率)自助抽樣
        (bootstrap)重放 2000 次模擬——假設未來交易的損益分布跟過去相似,樣本越小這個假設越不可靠,
        不是精確預測,只是用真實歷史數據抓一個粗略風險量級。
      </p>
    </div>
  );
}

function TopTradesTable({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: NamedTradePoint[];
  tone: "profit" | "loss";
}) {
  return (
    <div className="rounded border border-border bg-surface px-4 py-4">
      <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-[0.82rem] text-text-secondary">還沒有資料。</p>
      ) : (
        <table className="w-full border-collapse text-[0.85rem]">
          <thead>
            <tr>
              {["商品", "損益"].map((h, i) => (
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
            {rows.map((t, i) => (
              <tr key={i}>
                <td className="border-b border-border px-2 py-1.5">{t.symbol}</td>
                <td
                  className={`num border-b border-border px-2 py-1.5 text-right font-semibold ${
                    tone === "profit" ? "text-profit" : "text-loss"
                  }`}
                >
                  {signed(t.realizedPnl ?? 0)}U
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
