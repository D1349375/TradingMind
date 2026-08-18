"use client";

import { useEffect, useMemo, useState } from "react";
import {
  dailyPnlSeries,
  pnlHistogram,
  rHistogram,
  topTrades,
  simulateRuinRisk,
  riskAdjustedMetrics,
  winLossComparison,
  hourOfDayBreakdown,
  performanceByPositionSize,
  performanceByLeverage,
  type NamedTradePoint,
  type HistogramBucket,
  type PerfBucket,
} from "@/lib/stats";
import { summarizeFundingCost } from "@/lib/funding-cost";
import { HelpTooltip } from "@/components/ui/help-tooltip";

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;

export function PerformanceView({
  trades,
  totalCapital,
  assetClassMixed,
}: {
  trades: NamedTradePoint[];
  totalCapital: number | null;
  // 目前檢視範圍橫跨多種資產類別(規劃書 5.5 補充,Q16-Q18)——部位大小/
  // 槓桿/損益的「單位」在不同資產類別間不能直接混算(加密貨幣的部位大小、
  // 期貨的手數、股票的股數無法比較),這幾個報表直接不顯示並說明原因,
  // 不強行合併算出一個沒有意義的數字。
  assetClassMixed: boolean;
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
  const risk = useMemo(
    () => (mounted ? riskAdjustedMetrics(trades, totalCapital) : null),
    [mounted, trades, totalCapital],
  );
  const wl = useMemo(() => winLossComparison(trades), [trades]);
  const hourly = useMemo(() => (mounted ? hourOfDayBreakdown(trades) : []), [mounted, trades]);
  const sizeBuckets = useMemo(() => performanceByPositionSize(trades), [trades]);
  const leverageBuckets = useMemo(() => performanceByLeverage(trades), [trades]);
  const funding = useMemo(
    () =>
      summarizeFundingCost(
        trades
          .filter(
            (
              t,
            ): t is typeof t & {
              direction: "LONG" | "SHORT";
              entryPrice: number;
              positionSize: number;
            } =>
              t.direction !== undefined &&
              t.entryPrice !== undefined &&
              t.entryPrice !== null &&
              t.positionSize !== undefined &&
              t.positionSize !== null,
          )
          .map((t) => ({
            direction: t.direction,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice ?? null,
            positionSize: t.positionSize,
            fee: t.fee ?? null,
            fundingFee: t.fundingFee ?? null,
            realizedPnl: t.realizedPnl,
          })),
      ),
    [trades],
  );

  return (
    <div className="space-y-4">
      <Card
        title="每日損益"
        help="依平倉日(你的本地時區)加總每天的已實現損益。滑鼠移到長條上看該日詳細數字。"
      >
        {!mounted ? (
          <p className="text-[0.82rem] text-text-secondary">計算中…</p>
        ) : (
          <DailyBarChart data={daily} />
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card title="損益分布" help="把每筆已平倉交易的損益切成 10 個等寬區間,看損益集中在哪個範圍。滑鼠移到長條上看該區間筆數。">
          <HistogramChart buckets={pnlBuckets} unit="U" />
        </Card>
        <Card title="R 分布" help="把每筆有填 R 值的交易切成 10 個等寬區間。R 值需要止損價才能算,同步交易大多沒有,要在交易詳情頁手動填。">
          {rSampleSize === 0 ? (
            <p className="text-[0.8rem] leading-relaxed text-text-secondary">
              目前沒有交易填過 R 值——同步交易缺止損價算不出 R,要在交易詳情頁手動填寫。
            </p>
          ) : (
            <>
              <HistogramChart buckets={rBuckets} unit="R" />
              {rSampleSize < 10 && (
                <p className="mt-2 text-[0.72rem] text-text-tertiary">
                  只有 {rSampleSize} 筆交易有 R 值,樣本少,分布形狀還不穩定。
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      <Card
        title="風險調整報酬指標"
        help="用每天的損益序列算 Sharpe/Sortino/Calmar。有設定帳戶總資金時會換算成報酬率(可讀成年化百分比);沒設定則直接用金額本身算比率,Sharpe/Sortino 數值仍然有效,但無法讀成百分比。加密貨幣全年無休交易,年化用 365 天而非股市慣用的 252 天。樣本少於 20 個交易日時不顯示,避免比率不穩定誤導判斷。"
      >
        <RiskMetricsCard result={risk} mounted={mounted} />
      </Card>

      <Card
        title="破產風險模擬"
        help="用你過去已平倉交易的損益(換算成占帳戶總資金的報酬率)自助抽樣(bootstrap)重放 2000 次,估計未來 100 筆交易內帳戶跌破起始資金一定比例的機率。假設未來交易分布跟過去相似,樣本越小這個假設越不可靠。"
      >
        <RuinRiskCard result={ruin} mounted={mounted} />
      </Card>

      <Card
        title="Wins vs Losses 對照"
        help="把贏的交易和輸的交易分開,比較筆數/平均R(資產類別混合時,部位大小/槓桿單位無法比較會略過)——用來找「是不是部位一放大就開始輸」這類系統性差異,不是單純的勝率統計。"
      >
        <WinLossComparisonCard result={wl} hideUnitSpecific={assetClassMixed} />
      </Card>

      <Card
        title="資金費率拖累分析"
        help="永續合約每 8 小時結算一次資金費率,是加密貨幣特有的成本項。CSV 匯入的交易有 Bybit 原始的資金費率數字(精確值);Bybit API 同步的交易沒有單獨回傳這個欄位,改用「預期損益(不含資金費率)減去實際損益」反推(推估值,可能有微小誤差,不是官方數字)。手動新增的交易沒有這項資料,不計入。"
      >
        <FundingCostCard result={funding} />
      </Card>

      {assetClassMixed ? (
        <MixedAssetNotice title="依部位大小分組 / 依槓桿分組" />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Card
            title="依部位大小分組"
            help="把交易依部位大小切成 4 個等寬區間,分別看各區間的勝率/平均R/損益。"
          >
            <BucketTable buckets={sizeBuckets} label="部位大小" />
          </Card>
          <Card
            title="依槓桿分組"
            help="把交易依槓桿倍數切成 4 個等寬區間,分別看各區間的勝率/平均R/損益。"
          >
            <BucketTable buckets={leverageBuckets} label="槓桿" />
          </Card>
        </div>
      )}

      <Card
        title="依平倉小時分布"
        help="依平倉時間的本地小時分組(0-23點),不需要你手動填任何欄位,系統直接用平倉時間算——用來找「哪個時段表現特別好或特別差」。"
      >
        {!mounted ? (
          <p className="text-[0.82rem] text-text-secondary">計算中…</p>
        ) : (
          <HourlyTable buckets={hourly} />
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <TopTradesTable title="最佳 10 筆" rows={best} tone="profit" />
        <TopTradesTable title="最差 10 筆" rows={worst} tone="loss" />
      </div>
    </div>
  );
}

export function MixedAssetNotice({ title }: { title: string }) {
  return (
    <div className="rounded border border-dashed border-border bg-canvas px-4 py-4 text-center text-[0.82rem] text-text-secondary">
      <span className="font-semibold text-text">{title}</span>
      ——目前篩選範圍橫跨多種資產類別(例如加密貨幣+期貨),部位大小/槓桿/損益的單位無法直接混算,已停用避免誤導。切換到單一資產類別的模板檢視即可看到。
    </div>
  );
}

function Card({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-surface px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.82rem] font-semibold text-text-secondary">{title}</h3>
        <HelpTooltip>{help}</HelpTooltip>
      </div>
      {children}
    </div>
  );
}

export function RiskMetricsCard({
  result,
  mounted,
}: {
  result: ReturnType<typeof riskAdjustedMetrics> | null;
  mounted: boolean;
}) {
  if (!mounted || !result) {
    return <p className="text-[0.82rem] text-text-secondary">計算中…</p>;
  }
  if (!result.available) {
    return (
      <div className="rounded border border-dashed border-border bg-canvas px-3.5 py-3.5">
        <p className="text-[0.8rem] leading-relaxed text-text-secondary">
          {result.unavailableReason}
        </p>
      </div>
    );
  }
  const cells: { label: string; value: number | null }[] = [
    { label: "Sharpe(年化)", value: result.sharpeAnnualized },
    { label: "Sortino(年化)", value: result.sortinoAnnualized },
    { label: "Calmar(年化)", value: result.calmarAnnualized },
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.label}>
            <div className="text-[0.72rem] text-text-secondary">{c.label}</div>
            <div className="num text-[1.1rem] font-semibold">
              {c.value === null ? "—" : fmt(c.value, 2)}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[0.72rem] text-text-tertiary">
        {result.usingCapitalReturns
          ? `以 ${result.sampleDays} 個交易日、換算成帳戶總資金報酬率計算。`
          : `以 ${result.sampleDays} 個交易日、金額本身(未設定帳戶總資金)計算——比率仍有效,但無法讀成年化百分比。`}
      </p>
    </div>
  );
}

export function WinLossComparisonCard({
  result,
  hideUnitSpecific,
}: {
  result: ReturnType<typeof winLossComparison>;
  // 資產類別混合檢視時,部位大小/槓桿的「單位」無法跨資產比較(見
  // account-filter.ts 的 resolveAssetClassMix),但筆數/平均R是單位無關
  // 的正規化數字,混合檢視時仍然誠實可比,不需要整卡隱藏。
  hideUnitSpecific?: boolean;
}) {
  const allRows: { label: string; win: number | null; loss: number | null; unit: string; decimals: number; unitSpecific?: boolean }[] = [
    { label: "筆數", win: result.win.n, loss: result.loss.n, unit: "", decimals: 0 },
    {
      label: "平均部位大小",
      win: result.win.avgPositionSize,
      loss: result.loss.avgPositionSize,
      unit: "",
      decimals: 2,
      unitSpecific: true,
    },
    {
      label: "平均槓桿",
      win: result.win.avgLeverage,
      loss: result.loss.avgLeverage,
      unit: "x",
      decimals: 1,
      unitSpecific: true,
    },
    { label: "平均 R", win: result.win.avgR, loss: result.loss.avgR, unit: "R", decimals: 2 },
  ];
  const rows = hideUnitSpecific ? allRows.filter((r) => !r.unitSpecific) : allRows;
  if (result.win.n === 0 && result.loss.n === 0) {
    return <p className="text-[0.82rem] text-text-secondary">還沒有已平倉交易。</p>;
  }
  return (
    <>
      <table className="w-full border-collapse text-[0.85rem]">
      <thead>
        <tr>
          {["", "贏的交易", "輸的交易"].map((h, i) => (
            <th
              key={h}
              className={`border-b border-border px-2.5 py-1.5 text-[0.75rem] font-semibold text-text-secondary ${
                i === 0 ? "text-left" : "text-right"
              }`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="border-b border-border px-2.5 py-1.5 text-text-secondary">{r.label}</td>
            <td className="num border-b border-border px-2.5 py-1.5 text-right text-profit">
              {r.win === null ? "—" : `${fmt(r.win, r.decimals)}${r.unit}`}
            </td>
            <td className="num border-b border-border px-2.5 py-1.5 text-right text-loss">
              {r.loss === null ? "—" : `${fmt(r.loss, r.decimals)}${r.unit}`}
            </td>
          </tr>
        ))}
      </tbody>
      </table>
      {hideUnitSpecific && (
        <p className="mt-2 text-[0.72rem] text-text-tertiary">
          目前篩選範圍橫跨多種資產類別,平均部位大小/平均槓桿的單位無法直接比較,已略過只顯示可跨資產比較的欄位。
        </p>
      )}
    </>
  );
}

function FundingCostCard({ result }: { result: ReturnType<typeof summarizeFundingCost> }) {
  if (!result.available) {
    return (
      <div className="rounded border border-dashed border-border bg-canvas px-3.5 py-3.5">
        <p className="text-[0.8rem] leading-relaxed text-text-secondary">
          {result.unavailableReason}
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[0.72rem] text-text-secondary">總資金費率成本</div>
          <div
            className={`num text-[1.1rem] font-semibold ${result.totalCost > 0 ? "text-loss" : "text-profit"}`}
          >
            {result.totalCost > 0 ? "-" : "+"}
            {fmt(Math.abs(result.totalCost))}U
          </div>
        </div>
        <div>
          <div className="text-[0.72rem] text-text-secondary">佔總獲利比例</div>
          <div className="num text-[1.1rem] font-semibold">
            {result.pctOfGrossProfit === null ? "—" : `${fmt(result.pctOfGrossProfit, 1)}%`}
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-[0.72rem] leading-relaxed text-text-tertiary">
        {result.explicitCount} 筆精確值(CSV)、{result.estimatedCount} 筆推估值(API 同步)
        {result.unavailableCount > 0 && `、${result.unavailableCount} 筆缺資料未計入`}。
      </p>
    </div>
  );
}

export function BucketTable({ buckets, label }: { buckets: PerfBucket[]; label: string }) {
  if (buckets.length === 0) {
    return (
      <p className="text-[0.82rem] text-text-secondary">
        目前沒有交易有{label}資料。
      </p>
    );
  }
  return (
    <table className="w-full border-collapse text-[0.85rem]">
      <thead>
        <tr>
          {[label, "筆數", "勝率", "損益"].map((h, i) => (
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
        {buckets.map((b) => (
          <tr key={b.rangeLabel}>
            <td className="border-b border-border px-2 py-1.5">{b.rangeLabel}</td>
            <td className="num border-b border-border px-2 py-1.5 text-right">{b.n}</td>
            <td className="num border-b border-border px-2 py-1.5 text-right">
              {b.winRate === null ? "—" : `${fmt(b.winRate, 1)}%`}
            </td>
            <td
              className={`num border-b border-border px-2 py-1.5 text-right font-semibold ${
                b.pnl >= 0 ? "text-profit" : "text-loss"
              }`}
            >
              {signed(b.pnl)}U
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HourlyTable({ buckets }: { buckets: ReturnType<typeof hourOfDayBreakdown> }) {
  if (buckets.length === 0) {
    return <p className="text-[0.82rem] text-text-secondary">還沒有已平倉交易。</p>;
  }
  const max = Math.max(1, ...buckets.map((b) => Math.abs(b.pnl)));
  return (
    <div className="flex h-[120px] items-end gap-1">
      {buckets.map((b) => (
        <div
          key={b.hour}
          className="group relative flex-1"
          title={`${b.hour}時 · ${signed(b.pnl)}U · ${b.n}筆${b.winRate === null ? "" : ` · 勝率${fmt(b.winRate, 0)}%`}`}
        >
          <div
            className={`w-full rounded-t-sm ${b.pnl >= 0 ? "bg-profit" : "bg-loss"}`}
            style={{ height: `${(Math.abs(b.pnl) / max) * 100}px` }}
          />
          <div className="mt-1 truncate text-center text-[0.58rem] text-text-tertiary">
            {b.hour}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DailyBarChart({ data }: { data: { date: string; pnl: number; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) {
    return <p className="text-[0.82rem] text-text-secondary">還沒有已平倉交易。</p>;
  }
  const max = Math.max(1, ...data.map((d) => Math.abs(d.pnl)));
  const W = 960;
  const H = 160;
  const barW = W / data.length;
  const zeroY = H / 2;
  const hovered = hover !== null ? data[hover] : null;
  const tickIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return (
    <div>
      <div className="mb-1.5 h-4 text-[0.76rem] text-text-secondary">
        {hovered && (
          <>
            <span className="text-text-tertiary">{hovered.date} · </span>
            <span className={`num font-semibold ${hovered.pnl >= 0 ? "text-profit" : "text-loss"}`}>
              {signed(hovered.pnl)}U
            </span>
            <span className="text-text-tertiary"> · {hovered.count}筆</span>
          </>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label="每日損益長條圖"
        onMouseLeave={() => setHover(null)}
      >
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--border)" strokeWidth="1" />
        {data.map((d, i) => {
          const barH = (Math.abs(d.pnl) / max) * (H / 2 - 4);
          const x = i * barW + barW * 0.15;
          const w = barW * 0.7;
          const y = d.pnl >= 0 ? zeroY - barH : zeroY;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={i * barW} y={0} width={barW} height={H} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={Math.max(1, w)}
                height={Math.max(1, barH)}
                fill={d.pnl >= 0 ? "var(--profit)" : "var(--loss)"}
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[0.68rem] text-text-tertiary">
        {tickIdx.map((i, k) => (
          <span key={k}>{data[i].date}</span>
        ))}
      </div>
    </div>
  );
}

function HistogramChart({ buckets, unit }: { buckets: HistogramBucket[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (buckets.length === 0) {
    return <p className="text-[0.82rem] text-text-secondary">還沒有資料。</p>;
  }
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const hovered = hover !== null ? buckets[hover] : null;
  return (
    <div>
      <div className="mb-1.5 h-4 text-[0.76rem] text-text-secondary">
        {hovered && (
          <>
            <span className="text-text-tertiary">{hovered.rangeLabel}{unit} · </span>
            <span className="num font-semibold">{hovered.count} 筆</span>
          </>
        )}
      </div>
      <div className="flex h-[124px] items-end gap-1" onMouseLeave={() => setHover(null)}>
        {buckets.map((b, i) => (
          <div
            key={b.rangeLabel}
            className="group relative flex-1"
            onMouseEnter={() => setHover(i)}
          >
            <div
              className={`w-full rounded-t-sm ${b.rangeStart >= 0 ? "bg-profit" : "bg-loss"}`}
              style={{
                height: `${(b.count / max) * 130}px`,
                opacity: hover === null || hover === i ? 1 : 0.45,
              }}
            />
            <div className="mt-1 truncate text-center text-[0.6rem] text-text-tertiary">
              {b.count > 0 ? b.count : ""}
            </div>
          </div>
        ))}
      </div>
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
