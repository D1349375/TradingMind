"use client";

import { useMemo, useState } from "react";
import { sampleTier, SAMPLE_TIER_LABEL } from "@/lib/stats";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { GatedFeature } from "@/components/ui/gated-feature";

// 對應 prototype 的 Setup 分析頁:Setup 排行 + 依維度比較。

export type AnalysisTrade = {
  symbol: string;
  closedAt: string | null;
  realizedPnl: number | null;
  rMultiple: number | null;
  setupName: string | null;
  /** 自訂欄位值,以欄位 key 索引(session / timeframe / tradeType 等) */
  fieldsByKey: Record<string, unknown>;
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

function statsOf(list: AnalysisTrade[]): Omit<Row, "key"> {
  const pnls = list.map((t) => t.realizedPnl).filter((p): p is number => p !== null);
  const wins = pnls.filter((p) => p > 0).length;
  const losses = pnls.filter((p) => p < 0).length;
  const rs = list.map((t) => t.rMultiple).filter((r): r is number => r !== null);
  return {
    n: list.length,
    winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
    avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
    pnl: pnls.reduce((s, p) => s + p, 0),
  };
}

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
  return [...groups.entries()].map(([key, list]) => ({ key, ...statsOf(list) }));
}

type RowSortKey = "pnl" | "winRate" | "avgR" | "n" | "natural";

const SORT_METRIC_OPTIONS: { key: Exclude<RowSortKey, "natural">; label: string }[] = [
  { key: "pnl", label: "累計損益" },
  { key: "winRate", label: "勝率" },
  { key: "avgR", label: "平均 R" },
  { key: "n", label: "交易數" },
];

// 依累計損益/勝率/平均R/交易數排序一律高到低;缺值(勝率/平均R 樣本不足時
// 為 null)排到最後,不當成 0 參與排序,避免「沒資料」被誤判成「表現最差」。
// naturalOrder 用在星期幾這種有固定順序的維度,依索引由小到大排(週一→週日)。
function sortRows(rows: Row[], sortKey: RowSortKey, naturalOrder?: string[]): Row[] {
  if (sortKey === "natural" && naturalOrder) {
    const index = new Map(naturalOrder.map((k, i) => [k, i]));
    return [...rows].sort(
      (a, b) => (index.get(a.key) ?? naturalOrder.length) - (index.get(b.key) ?? naturalOrder.length),
    );
  }
  const key = sortKey === "natural" ? "pnl" : sortKey;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });
}

// 二維交叉分析:依兩個維度分組,找「單一維度看不出來、兩個維度交叉才浮現」的
// 隱藏模式(例如「錯誤類型 × 星期幾」)。列/欄依樣本數由多到少排序——資料
// 越多的組合放前面,越可靠的格子先看到。
function aggregate2D(
  trades: AnalysisTrade[],
  keyOf1: (t: AnalysisTrade) => string | null,
  keyOf2: (t: AnalysisTrade) => string | null,
) {
  const byRow = new Map<string, Map<string, AnalysisTrade[]>>();
  const rowTotal = new Map<string, number>();
  const colTotal = new Map<string, number>();

  for (const t of trades) {
    const r = keyOf1(t);
    const c = keyOf2(t);
    if (r === null || c === null) continue;
    let cols = byRow.get(r);
    if (!cols) {
      cols = new Map();
      byRow.set(r, cols);
    }
    const arr = cols.get(c) ?? [];
    arr.push(t);
    cols.set(c, arr);
    rowTotal.set(r, (rowTotal.get(r) ?? 0) + 1);
    colTotal.set(c, (colTotal.get(c) ?? 0) + 1);
  }

  const rowKeys = [...rowTotal.keys()].sort((a, b) => (rowTotal.get(b)! - rowTotal.get(a)!));
  const colKeys = [...colTotal.keys()].sort((a, b) => (colTotal.get(b)! - colTotal.get(a)!));

  function cellOf(r: string, c: string): (Omit<Row, "key">) | null {
    const list = byRow.get(r)?.get(c);
    return list ? statsOf(list) : null;
  }

  return { rowKeys, colKeys, cellOf };
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
// 「依序」排序用的週一→週日順序,跟上面 WEEKDAYS(Date.getDay() 索引,週日=0)
// 是不同用途,不要合併成同一個陣列。
const WEEKDAY_NATURAL_ORDER = ["一", "二", "三", "四", "五", "六", "日"];

type Dimension = {
  key: string;
  label: string;
  available: boolean;
  note?: string;
  missing?: string;
  keyOf?: (t: AnalysisTrade) => string | null;
};

// 取自訂欄位的值當分組鍵。多選欄位會讓一筆交易同時落入多個分組,
// 那需要不同的彙總方式,這裡先只支援單選欄位取單一值。
function fieldKeyOf(key: string) {
  return (t: AnalysisTrade) => {
    const v = t.fieldsByKey[key];
    if (v === null || v === undefined || v === "") return null;
    if (Array.isArray(v)) return v.length ? v.join(" · ") : null;
    if (typeof v === "boolean") return v ? "是" : "否";
    return String(v);
  };
}

// 每個維度都標明資料來源。自訂欄位維度是否可用,取決於使用者有沒有啟用該欄位——
// 沒啟用就說明去哪裡啟用,不要假裝有資料。
function buildDimensions(enabledKeys: Set<string>): Dimension[] {
  const custom = (
    key: string,
    label: string,
    fieldLabel: string,
  ): Dimension =>
    enabledKeys.has(key)
      ? { key, label, available: true, keyOf: fieldKeyOf(key) }
      : {
          key,
          label,
          available: false,
          missing: `${label}來自自訂欄位「${fieldLabel}」。到「設定 → 欄位自訂」啟用它,並在交易記錄頁逐筆標記後,這裡就會有資料。`,
        };

  return [
    { key: "symbol", label: "商品", available: true, keyOf: (t) => t.symbol },
    {
      key: "weekday",
      label: "星期幾",
      available: true,
      note: "依平倉日(本地時區)分組",
      keyOf: (t) =>
        t.closedAt ? WEEKDAYS[new Date(t.closedAt).getDay()] : null,
    },
    custom("session", "交易時段", "交易時區"),
    custom("timeframe", "時間週期", "做單週期"),
    custom("tradeType", "交易類型", "交易類型"),
  ];
}

export function SetupView({
  trades,
  enabledFieldKeys,
  showBybitHint,
  tier,
}: {
  trades: AnalysisTrade[];
  enabledFieldKeys: string[];
  showBybitHint: boolean;
  tier: "FREE" | "STANDARD" | "ADVANCED";
}) {
  const [dim, setDim] = useState<string>("symbol");
  const [setupSort, setSetupSort] = useState<RowSortKey>("pnl");
  const [dimSort, setDimSort] = useState<RowSortKey>("pnl");
  const DIMENSIONS = useMemo(
    () => buildDimensions(new Set(enabledFieldKeys)),
    [enabledFieldKeys],
  );
  const active = DIMENSIONS.find((d) => d.key === dim) ?? DIMENSIONS[0];

  const setupRows = useMemo(
    () => sortRows(aggregate(trades, (t) => t.setupName), setupSort),
    [trades, setupSort],
  );
  // 只有星期幾這個維度有固定的「依序」意義(週一→週日),換到其他維度時
  // 如果還停在「依序」,悄悄退回累計損益排序,而不是顯示一個沒作用的選項。
  const dimNaturalOrder = active.key === "weekday" ? WEEKDAY_NATURAL_ORDER : undefined;
  const effectiveDimSort = dimSort === "natural" && !dimNaturalOrder ? "pnl" : dimSort;
  const dimRows = useMemo(
    () =>
      active.keyOf
        ? sortRows(aggregate(trades, active.keyOf), effectiveDimSort, dimNaturalOrder)
        : [],
    [trades, active, effectiveDimSort, dimNaturalOrder],
  );

  if (trades.length === 0) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-12 text-center">
        <div className="mb-1 text-[0.9rem] font-semibold text-text-secondary">
          還沒有交易資料
        </div>
        <p className="text-[0.82rem] text-text-secondary">
          {showBybitHint
            ? "同步 Bybit/OKX、CSV 匯入或手動新增交易後,這裡會依實際資料計算。"
            : "這個模板的資產類別跟目前支援自動同步的交易所(Bybit/OKX,僅限加密貨幣)對不上。用 CSV 匯入或手動新增交易後,這裡會依實際資料計算。"}
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="mb-5">
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          <h2 className="text-[0.82rem] font-semibold text-text-secondary">
            Setup 排行
          </h2>
          <HelpTooltip>
            排序方式只是換一個角度看,不是校正過「多重比較」的信心分數——測的 Setup 越多,排第一名光靠運氣的機率也越高,目前只用交易數做粗略的樣本量分級提醒。
          </HelpTooltip>
          {setupRows.length > 0 && (
            <SortSelect value={setupSort} onChange={setSetupSort} className="ml-auto" />
          )}
        </div>
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
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="text-[0.82rem] font-semibold text-text-secondary">
            依維度比較
          </h2>
          <HelpTooltip>
            把已平倉交易依所選維度分組,各自算勝率/平均R/累計損益。商品與星期幾直接用系統資料算,其他維度來自你自己填的自訂欄位。
          </HelpTooltip>
        </div>
        <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
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
          {active.available && dimRows.length > 0 && (
            <SortSelect
              value={effectiveDimSort}
              onChange={setDimSort}
              naturalLabel={dimNaturalOrder ? "依序(週一→週日)" : undefined}
              className="ml-auto"
            />
          )}
        </div>

        {!active.available ? (
          <div className="rounded border border-dashed border-border bg-canvas px-4 py-6 text-center">
            <div className="mb-1 text-[0.85rem] font-semibold text-text-secondary">
              {active.label}目前無法分析
            </div>
            <p className="mx-auto max-w-[52ch] text-[0.8rem] leading-relaxed text-text-secondary">
              {active.missing}
            </p>
          </div>
        ) : dimRows.length === 0 ? (
          <div className="rounded border border-dashed border-border bg-canvas px-4 py-6 text-center text-[0.82rem] text-text-secondary">
            這個欄位已啟用,但還沒有任何交易填寫它。到交易記錄頁的「自訂欄位」分頁標記後就會出現。
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
                {dimRows.map((r) => {
                  const tier = sampleTier(r.n);
                  const tierLabel = tier === "sufficient" ? null : SAMPLE_TIER_LABEL[tier];
                  return (
                  <tr key={r.key}>
                    <td className="border-b border-border px-2.5 py-2">
                      {r.key}
                      {tierLabel && (
                        <span className="ml-1.5 text-[0.68rem] text-text-tertiary">
                          {tierLabel}
                        </span>
                      )}
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
                  );
                })}
              </tbody>
            </table>
            {active.note && (
              <p className="mt-2 text-[0.75rem] text-text-tertiary">
                {active.note}
              </p>
            )}
          </>
        )}
      </section>

      {tier === "FREE" ? (
        <GatedFeature feature="二維交叉分析">
          <CrossAnalysisSection trades={trades} enabledFieldKeys={enabledFieldKeys} />
        </GatedFeature>
      ) : (
        <CrossAnalysisSection trades={trades} enabledFieldKeys={enabledFieldKeys} />
      )}
    </>
  );
}

// 抽成獨立元件是因為週期回顧頁(period-review/[id]/page.tsx)也要用同一套
// 二維交叉分析,但吃的是「生成當下凍結的快照」資料而不是即時交易列表——
// 呼叫端只要餵 trades/enabledFieldKeys 就好,不用管 SetupView 其他部分
// (Setup排行/依維度比較)的狀態。
export function CrossAnalysisSection({
  trades,
  enabledFieldKeys,
}: {
  trades: AnalysisTrade[];
  enabledFieldKeys: string[];
}) {
  const [crossDim1, setCrossDim1] = useState<string>("symbol");
  const [crossDim2, setCrossDim2] = useState<string>("weekday");
  const [crossMetric, setCrossMetric] = useState<"pnl" | "winRate" | "avgR" | "n">("pnl");
  const DIMENSIONS = useMemo(
    () => buildDimensions(new Set(enabledFieldKeys)),
    [enabledFieldKeys],
  );
  const crossActive1 = DIMENSIONS.find((d) => d.key === crossDim1) ?? DIMENSIONS[0];
  const crossActive2 = DIMENSIONS.find((d) => d.key === crossDim2) ?? DIMENSIONS[1] ?? DIMENSIONS[0];
  const crossMatrix = useMemo(
    () =>
      crossActive1.keyOf && crossActive2.keyOf
        ? aggregate2D(trades, crossActive1.keyOf, crossActive2.keyOf)
        : null,
    [trades, crossActive1, crossActive2],
  );

  return (
    <section className="mt-5 rounded border border-border bg-surface px-4 py-4">
      <div className="mb-3 flex items-center gap-1.5">
        <h2 className="text-[0.82rem] font-semibold text-text-secondary">
          交叉分析
        </h2>
        <HelpTooltip>
          同時用兩個維度分組,找單一維度看不出來、兩個交叉才浮現的模式(例如「商品 × 星期幾」)。格子樣本數通常比單維度表少很多,數字少的格子只能參考。
        </HelpTooltip>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.8rem]">
        <span className="text-text-secondary">列</span>
        <DimensionSelect
          dimensions={DIMENSIONS}
          value={crossDim1}
          onChange={setCrossDim1}
        />
        <span className="text-text-secondary">× 欄</span>
        <DimensionSelect
          dimensions={DIMENSIONS}
          value={crossDim2}
          onChange={setCrossDim2}
        />
        <span className="ml-2 text-text-secondary">顯示</span>
        <div className="flex overflow-hidden rounded border border-border">
          {(
            [
              { key: "pnl", label: "累計損益" },
              { key: "winRate", label: "勝率" },
              { key: "avgR", label: "平均R" },
              { key: "n", label: "交易數" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setCrossMetric(m.key)}
              aria-pressed={crossMetric === m.key}
              className={`px-2.5 py-1 text-[0.76rem] ${
                crossMetric === m.key
                  ? "bg-accent-soft font-semibold text-accent"
                  : "bg-canvas text-text-secondary hover:text-text"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {crossDim1 === crossDim2 ? (
        <div className="rounded border border-dashed border-border bg-canvas px-4 py-6 text-center text-[0.82rem] text-text-secondary">
          列跟欄選了同一個維度,交叉沒有意義,換一個看看。
        </div>
      ) : !crossActive1.available || !crossActive2.available ? (
        <div className="rounded border border-dashed border-border bg-canvas px-4 py-6 text-center">
          <div className="mb-1 text-[0.85rem] font-semibold text-text-secondary">
            {!crossActive1.available ? crossActive1.label : crossActive2.label}目前無法分析
          </div>
          <p className="mx-auto max-w-[52ch] text-[0.8rem] leading-relaxed text-text-secondary">
            {!crossActive1.available ? crossActive1.missing : crossActive2.missing}
          </p>
        </div>
      ) : !crossMatrix || crossMatrix.rowKeys.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-canvas px-4 py-6 text-center text-[0.82rem] text-text-secondary">
          這兩個維度目前沒有交集的資料。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.85rem]">
            <thead>
              <tr>
                <th className="border-b border-border px-2.5 py-1.5 text-left text-[0.75rem] font-semibold text-text-secondary">
                  {crossActive1.label} \ {crossActive2.label}
                </th>
                {crossMatrix.colKeys.map((c) => (
                  <th
                    key={c}
                    className="border-b border-border px-2.5 py-1.5 text-right text-[0.75rem] font-semibold text-text-secondary"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {crossMatrix.rowKeys.map((r) => (
                <tr key={r}>
                  <td className="whitespace-nowrap border-b border-border px-2.5 py-1.5 font-semibold">
                    {r}
                  </td>
                  {crossMatrix.colKeys.map((c) => {
                    const cell = crossMatrix.cellOf(r, c);
                    return (
                      <CrossCell key={c} cell={cell} metric={crossMetric} />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SortSelect({
  value,
  onChange,
  naturalLabel,
  className = "",
}: {
  value: RowSortKey;
  onChange: (key: RowSortKey) => void;
  naturalLabel?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as RowSortKey)}
      className={`rounded border border-border bg-canvas px-2 py-1 text-[0.78rem] text-text outline-none focus:border-accent ${className}`}
    >
      {SORT_METRIC_OPTIONS.map((o) => (
        <option key={o.key} value={o.key}>
          依{o.label}排序
        </option>
      ))}
      {naturalLabel && <option value="natural">{naturalLabel}</option>}
    </select>
  );
}

function DimensionSelect({
  dimensions,
  value,
  onChange,
}: {
  dimensions: Dimension[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-border bg-canvas px-2 py-1 text-[0.8rem] text-text outline-none focus:border-accent"
    >
      {dimensions.map((d) => (
        <option key={d.key} value={d.key}>
          {d.label}
          {!d.available ? "(無資料)" : ""}
        </option>
      ))}
    </select>
  );
}

function CrossCell({
  cell,
  metric,
}: {
  cell: Omit<Row, "key"> | null;
  metric: "pnl" | "winRate" | "avgR" | "n";
}) {
  if (!cell) {
    return (
      <td className="num border-b border-border px-2.5 py-1.5 text-right text-text-tertiary">
        —
      </td>
    );
  }
  const tier = sampleTier(cell.n);
  const muted = tier !== "sufficient";

  let text: string;
  let tone: "profit" | "loss" | "neutral" = "neutral";
  if (metric === "n") {
    text = String(cell.n);
  } else if (metric === "winRate") {
    text = cell.winRate === null ? "—" : `${fmt(cell.winRate, 0)}%`;
  } else if (metric === "avgR") {
    text = cell.avgR === null ? "—" : `${fmt(cell.avgR)}R`;
  } else {
    text = `${signed(cell.pnl, 0)}U`;
    tone = cell.pnl >= 0 ? "profit" : "loss";
  }

  return (
    <td
      className={`num border-b border-border px-2.5 py-1.5 text-right ${
        tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""
      } ${muted ? "opacity-50" : ""}`}
      title={`${cell.n} 筆${muted ? "(樣本較少)" : ""}`}
    >
      {text}
    </td>
  );
}

function SetupRow({ row }: { row: Row }) {
  const tier = sampleTier(row.n);
  const tierLabel = tier === "sufficient" ? null : SAMPLE_TIER_LABEL[tier];
  return (
    <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] items-center gap-3 rounded border border-border bg-surface px-4 py-3">
      <div>
        <div className="text-[0.92rem] font-semibold">{row.key}</div>
        {tierLabel && (
          <div className="mt-0.5 text-[0.68rem] text-text-tertiary">{tierLabel}</div>
        )}
      </div>
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
