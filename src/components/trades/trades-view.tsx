"use client";

import { useEffect, useRef, useState } from "react";
import {
  CustomFields,
  type FieldDef,
  type FieldValues,
} from "@/components/trades/custom-fields";

// 對應 prototype/index.html 的 .trades-layout(左列表 / 右詳情)。

export type TradeDto = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  openedAt: string | null;
  closedAt: string | null;
  entryPrice: string;
  exitPrice: string | null;
  positionSize: string;
  leverage: string | null;
  fee: string;
  realizedPnl: string | null;
  rMultiple: string | null;
  grade: string | null;
  reflectionNote: string | null;
  source: string;
  customValues: FieldValues;
};

const GRADES = ["A", "B", "C", "D"];

function fmtNum(v: string | null, digits = 2): string {
  if (v === null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// 時間格式化在伺服器與瀏覽器會落在不同時區,直接用 toLocaleString 會炸出
// hydration mismatch。這裡兩層一起用:
//   1. 顯示時間的元素加 suppressHydrationWarning——React 對「時間戳」明確
//      支援這個做法,只影響該節點的文字內容。
//   2. useLocalTime:SSR/首次繪製用 UTC,掛載後再切成使用者本地時區,
//      所以最終畫面顯示的是本地時間,不是伺服器時區。
// 只做 2 不做 1 是不夠的——實測 hydration 比對仍會抓到差異(已用 bisect 確認)。
function fmtDateTime(iso: string | null, local: boolean): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: local ? undefined : "UTC",
  });
}

function fmtShortDate(iso: string | null, local: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const month = local ? d.getMonth() + 1 : d.getUTCMonth() + 1;
  const day = local ? d.getDate() : d.getUTCDate();
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

// false 於伺服器端與首次 hydration,掛載後變 true
function useLocalTime() {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  return local;
}

// 持倉時間需要開倉時間,而 Bybit closed-pnl 給不了(見 sync.ts 說明)。
// 這裡回傳 null,由 UI 顯示「—」並附說明,不要編造數字。
function holdingDuration(openedAt: string | null, closedAt: string | null) {
  if (!openedAt || !closedAt) return null;
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  if (ms < 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TradesView({
  trades,
  fields,
}: {
  trades: TradeDto[];
  fields: FieldDef[];
}) {
  const [selectedId, setSelectedId] = useState(trades[0]?.id ?? null);
  const [listOpen, setListOpen] = useState(true);
  const selected = trades.find((t) => t.id === selectedId) ?? null;
  const local = useLocalTime();

  if (trades.length === 0) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-12 text-center">
        <div className="mb-1 text-[0.9rem] font-semibold text-text-secondary">
          還沒有任何交易紀錄
        </div>
        <p className="text-[0.82rem] text-text-secondary">
          到「設定 → 交易所連線」連接 Bybit 後按「立即同步」,即可匯入已平倉的交易。
        </p>
      </div>
    );
  }

  return (
    <div
      className={`grid h-[calc(100vh-168px)] overflow-hidden rounded border border-border ${
        listOpen ? "grid-cols-[300px_1fr]" : "grid-cols-[0_1fr]"
      }`}
    >
      <div
        className={`overflow-y-auto bg-canvas ${listOpen ? "border-r border-border" : "invisible"}`}
      >
        {trades.map((t) => {
          const pnl = Number(t.realizedPnl ?? 0);
          const win = pnl >= 0;
          const isSelected = t.id === selectedId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`w-full border-b border-border px-[14px] py-[10px] text-left ${
                isSelected ? "bg-accent-soft" : "hover:bg-surface"
              }`}
              aria-current={isSelected}
            >
              <div className="mb-[3px] flex justify-between text-[0.87rem]">
                <span className="font-semibold">{t.symbol}</span>
                <span
                  className={`num font-semibold ${win ? "text-profit" : "text-loss"}`}
                >
                  {win ? "+" : ""}
                  {fmtNum(t.realizedPnl)}U
                </span>
              </div>
              <div
                className="text-[0.78rem] text-text-secondary"
                suppressHydrationWarning
              >
                {fmtShortDate(t.closedAt, local)} · {t.direction} ·{" "}
                {t.rMultiple ? `${fmtNum(t.rMultiple)}R` : "—"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="overflow-y-auto bg-surface px-11 py-8">
        {selected && (
          <TradeDetail
            key={selected.id}
            trade={selected}
            fields={fields}
            listOpen={listOpen}
            onToggleList={() => setListOpen((v) => !v)}
          />
        )}
      </div>
    </div>
  );
}

const DETAIL_TABS = [
  { key: "overview", label: "總覽" },
  // 自訂欄位獨立一個分頁:Field Builder 完成後這裡會有情緒/時段/Setup/
  // 週期/紀律/標籤等十幾個欄位,塞在總覽會把它擠爆
  { key: "fields", label: "自訂欄位" },
  { key: "note", label: "反思筆記" },
  { key: "shots", label: "截圖" },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]["key"];

function TradeDetail({
  trade,
  fields,
  listOpen,
  onToggleList,
}: {
  trade: TradeDto;
  fields: FieldDef[];
  listOpen: boolean;
  onToggleList: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const local = useLocalTime();
  const [note, setNote] = useState(trade.reflectionNote ?? "");
  const [grade, setGrade] = useState(trade.grade ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(payload: Record<string, unknown>) {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  // 反思筆記自動儲存(停止輸入 800ms 後)。
  // 用「和已儲存的值比對」判斷要不要送出,而不是用 first-render 旗標——
  // StrictMode 在開發模式會重跑 effect,旗標會被第一次執行吃掉,
  // 導致每次切換交易都白送一次 PATCH。
  useEffect(() => {
    if (note === (trade.reflectionNote ?? "")) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save({ reflectionNote: note }), 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, trade.reflectionNote]);

  const pnl = Number(trade.realizedPnl ?? 0);
  const win = pnl >= 0;
  const duration = holdingDuration(trade.openedAt, trade.closedAt);

  return (
    // 收起列表時放寬到 860px,展開時維持 640px 的舒適閱讀寬度
    <div className={listOpen ? "max-w-[640px]" : "max-w-[860px]"}>
      <div className="mb-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleList}
          title={listOpen ? "收起交易列表" : "展開交易列表"}
          aria-label={listOpen ? "收起交易列表" : "展開交易列表"}
          aria-expanded={listOpen}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-text-secondary hover:border-accent hover:text-accent"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <rect x="3" y="4" width="14" height="12" rx="1.5" />
            <line x1="8" y1="4" x2="8" y2="16" />
            {!listOpen && <path d="M11 8l2 2-2 2" />}
          </svg>
        </button>
        <h2 className="text-[1.48rem] font-semibold">
          {trade.symbol} · {trade.direction}
        </h2>
      </div>
      <div
        className="mb-4 text-[0.87rem] text-text-secondary"
        suppressHydrationWarning
      >
        {fmtDateTime(trade.closedAt, local)} 平倉
        {trade.source === "BYBIT_SYNC" && " · 由 Bybit 自動同步"}
      </div>

      <div className="mb-6 flex gap-6 border-y border-border py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[0.78rem] text-text-secondary">Closed PnL</span>
          <span
            className={`num text-[1.1rem] font-semibold ${win ? "text-profit" : "text-loss"}`}
          >
            {win ? "+" : ""}
            {fmtNum(trade.realizedPnl)}U
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[0.78rem] text-text-secondary">R</span>
          <span className="num text-[1.1rem] font-semibold">
            {trade.rMultiple ? `${fmtNum(trade.rMultiple)}R` : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[0.78rem] text-text-secondary">評分</span>
          <span className="text-[1.1rem] font-semibold">{grade || "—"}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[0.78rem] text-text-secondary">持倉時間</span>
          <span
            className="num text-[1.1rem] font-semibold"
            title={
              duration
                ? undefined
                : "Bybit 的已平倉損益不提供開倉時間,需另從撮合明細還原"
            }
          >
            {duration ?? "—"}
          </span>
        </div>
      </div>

      {/* 分頁籤:垂直空間是這一頁的瓶頸,拆成分頁比一路往下捲好讀。
          依據見 design.md 第六之二節。 */}
      <div className="mb-5 flex items-center gap-5 border-b border-border">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key}
            className={
              tab === t.key
                ? "-mb-px border-b-2 border-accent pb-2 text-[0.85rem] font-semibold text-text"
                : "-mb-px border-b-2 border-transparent pb-2 text-[0.85rem] text-text-secondary hover:text-text"
            }
          >
            {t.label}
            {t.key === "note" && note.trim() !== "" && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
            )}
          </button>
        ))}
        <span
          className="ml-auto pb-2 text-[0.72rem] text-text-secondary"
          role="status"
          aria-live="polite"
        >
          {saveState === "saving" && "儲存中…"}
          {saveState === "saved" && "已儲存"}
          {saveState === "error" && <span className="text-loss">儲存失敗</span>}
        </span>
      </div>

      <section className={tab === "overview" ? "mb-6" : "hidden"}>
        <h3 className="mb-2.5 text-[0.78rem] font-semibold tracking-[0.05em] text-text-secondary">
          自動同步欄位 · Bybit API
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
          <Field label="入場價" value={fmtNum(trade.entryPrice, 4)} />
          <Field label="出場價" value={fmtNum(trade.exitPrice, 4)} />
          <Field label="倉位" value={fmtNum(trade.positionSize, 4)} />
          <Field
            label="槓桿"
            value={trade.leverage ? `${fmtNum(trade.leverage, 0)}x` : "—"}
          />
          <Field label="手續費" value={`${fmtNum(trade.fee, 4)}U`} />
          <Field
            label="已實現損益"
            value={`${win ? "+" : ""}${fmtNum(trade.realizedPnl)}U`}
          />
        </dl>
      </section>

      <section className={tab === "overview" ? "mb-6" : "hidden"}>
        <h3 className="mb-2.5 text-[0.78rem] font-semibold tracking-[0.05em] text-text-secondary">
          交易評分
        </h3>
        <div className="flex gap-1.5">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                const next = grade === g ? "" : g;
                setGrade(next);
                save({ grade: next || null });
              }}
              className={`h-8 w-8 rounded border text-[0.85rem] font-semibold ${
                grade === g
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-canvas text-text-secondary hover:border-accent hover:text-accent"
              }`}
              aria-pressed={grade === g}
            >
              {g}
            </button>
          ))}
        </div>
      </section>

      <section className={tab === "fields" ? "mb-6" : "hidden"}>
        <h3 className="mb-2.5 text-[0.78rem] font-semibold tracking-[0.05em] text-text-secondary">
          自訂欄位
        </h3>
        <CustomFields
          fields={fields}
          initialValues={trade.customValues}
          onSave={(patch) => save({ customValues: patch })}
        />
      </section>

      <section className={tab === "shots" ? "mb-6" : "hidden"}>
        <h3 className="mb-2.5 text-[0.78rem] font-semibold tracking-[0.05em] text-text-secondary">
          截圖
        </h3>
        <div className="flex gap-3">
          {["入場前 K 線", "平倉後結果"].map((label) => (
            <div
              key={label}
              className="flex aspect-[16/10] flex-1 items-center justify-center rounded border border-dashed border-border bg-canvas text-[0.8rem] text-text-secondary"
            >
              {label}
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[0.75rem] text-text-tertiary">
          圖片上傳需要接 Supabase Storage,尚未實作。
        </p>
      </section>

      <section className={tab === "note" ? "" : "hidden"}>
        <h3 className="mb-2.5 text-[0.78rem] font-semibold tracking-[0.05em] text-text-secondary">
          反思筆記
        </h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="這筆交易的進場理由、執行狀況、事後檢討…"
          rows={7}
          className="w-full resize-y rounded border border-border bg-canvas px-3.5 py-3 text-[1.03rem] leading-[1.75] text-text outline-none placeholder:text-text-tertiary focus:border-accent"
        />
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-dashed border-border py-1 text-[0.9rem]">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="num font-semibold">{value}</dd>
    </div>
  );
}
