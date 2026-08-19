"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CustomFields,
  type FieldDef,
  type FieldValues,
} from "@/components/trades/custom-fields";
import { SetupPicker, type SetupOption } from "@/components/trades/setup-picker";
import { AiAnalysis } from "@/components/trades/ai-analysis";
import { RichNoteEditor } from "@/components/trades/rich-note-editor";
import { calcRMultiple } from "@/lib/r-multiple";

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
  stopLossPrice: string | null;
  takeProfitPrice: string | null;
  rMultiple: string | null;
  grade: string | null;
  reflectionNote: string | null;
  source: string;
  customValues: FieldValues;
  setupId: string | null;
  ruleChecks: Record<string, boolean>;
};

export type DisciplineRuleDef = { id: string; label: string };

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

// 拖曳調整寬度的共用邏輯,列表/詳情面板、雙欄對比的分隔線都用這個——
// 跟側邊欄的拖曳把手是同一套模式,只是把 min/max/setter 參數化。
function useDragResize(
  width: number,
  setWidth: (n: number) => void,
  min: number,
  max: number,
) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
    function onMove(ev: PointerEvent) {
      if (!dragRef.current) return;
      const next = Math.max(
        min,
        Math.min(max, dragRef.current.startWidth + (ev.clientX - dragRef.current.startX)),
      );
      setWidth(next);
    }
    function onUp() {
      setDragging(false);
      dragRef.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return { onPointerDown, dragging };
}

function DragHandle({ onPointerDown, dragging }: { onPointerDown: (e: React.PointerEvent) => void; dragging: boolean }) {
  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      className={`w-[5px] shrink-0 cursor-col-resize ${dragging ? "bg-accent/40" : "bg-transparent hover:bg-accent/25"}`}
    />
  );
}

const LIST_WIDTH_DEFAULT = 300;
const LIST_WIDTH_MIN = 220;
const LIST_WIDTH_MAX = 460;
const LIST_COLLAPSE_THRESHOLD = 80;
const PANE_MIN = 380;

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
  setups: initialSetups,
  rules,
}: {
  trades: TradeDto[];
  fields: FieldDef[];
  setups: SetupOption[];
  rules: DisciplineRuleDef[];
}) {
  const [selectedId, setSelectedId] = useState(trades[0]?.id ?? null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(LIST_WIDTH_DEFAULT);
  const [paneAWidth, setPaneAWidth] = useState(600);
  const [setups, setSetups] = useState(initialSetups);
  const [tradeSetup, setTradeSetup] = useState<Record<string, string | null>>(
    () => Object.fromEntries(trades.map((t) => [t.id, t.setupId])),
  );
  const selected = trades.find((t) => t.id === selectedId) ?? null;
  const compared = compareId ? (trades.find((t) => t.id === compareId) ?? null) : null;
  const local = useLocalTime();

  const listCollapsed = listWidth <= LIST_COLLAPSE_THRESHOLD;
  const listDrag = useDragResize(
    listWidth,
    (w) => setListWidth(w < LIST_COLLAPSE_THRESHOLD ? 0 : Math.max(w, LIST_WIDTH_MIN)),
    0,
    LIST_WIDTH_MAX,
  );
  const paneDrag = useDragResize(paneAWidth, setPaneAWidth, PANE_MIN, 1400);

  function selectPrimary(id: string) {
    setSelectedId(id);
    if (compareId === id) setCompareId(null);
  }
  function toggleCompare(id: string) {
    if (id === selectedId) return;
    setCompareId((cur) => (cur === id ? null : id));
  }

  if (trades.length === 0) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-12 text-center">
        <div className="mb-1 text-[0.9rem] font-semibold text-text-secondary">
          還沒有任何交易紀錄
        </div>
        <p className="text-[0.82rem] text-text-secondary">
          到「設定 → 交易所連線」連接 Bybit 後按「立即同步」,或用 CSV 匯入,也可以直接手動新增交易。
        </p>
      </div>
    );
  }

  return (
    // 168px 是舊版頁首(含副標題行)量出來的高度;頁首縮短後(2026-08-14)
    // 這個扣掉的值要跟著變小,不然面板高度沒吃到讓出來的空間。
    <div className="flex h-[calc(100vh-100px)] overflow-hidden rounded border border-border">
      <div
        style={{ width: listWidth }}
        className={`min-w-0 shrink-0 overflow-y-auto bg-canvas ${
          listCollapsed ? "invisible" : "border-r border-border"
        } ${listDrag.dragging ? "" : "transition-[width] duration-150"}`}
      >
        {trades.map((t) => {
          const pnl = Number(t.realizedPnl ?? 0);
          const win = pnl >= 0;
          const isSelected = t.id === selectedId;
          const isCompared = t.id === compareId;
          return (
            <div
              key={t.id}
              className={`group relative border-b border-border ${
                isSelected ? "bg-accent-soft" : isCompared ? "bg-surface" : "hover:bg-surface"
              }`}
            >
              <button
                type="button"
                onClick={() => selectPrimary(t.id)}
                className="w-full px-[14px] py-[10px] text-left"
                aria-current={isSelected}
              >
                <div className="mb-[3px] flex justify-between text-[0.87rem]">
                  <span className="font-semibold">
                    {isSelected && (
                      <span className="mr-1.5 rounded-[3px] bg-accent px-1 py-[1px] text-[0.62rem] font-bold text-white">A</span>
                    )}
                    {isCompared && (
                      <span className="mr-1.5 rounded-[3px] border border-accent px-1 py-[1px] text-[0.62rem] font-bold text-accent">B</span>
                    )}
                    {t.symbol}
                  </span>
                  <span className={`num font-semibold ${win ? "text-profit" : "text-loss"}`}>
                    {win ? "+" : ""}
                    {fmtNum(t.realizedPnl)}U
                  </span>
                </div>
                <div className="text-[0.78rem] text-text-secondary" suppressHydrationWarning>
                  {fmtShortDate(t.closedAt, local)} · {t.direction} ·{" "}
                  {t.rMultiple ? `${fmtNum(t.rMultiple)}R` : "—"}
                </div>
              </button>
              {!isSelected && (
                <button
                  type="button"
                  onClick={() => toggleCompare(t.id)}
                  title={isCompared ? "取消比較" : "在右側比較"}
                  aria-label={isCompared ? "取消比較" : "在右側比較"}
                  className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded border text-[0.65rem] font-bold ${
                    isCompared
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-canvas text-text-tertiary opacity-0 hover:border-accent hover:text-accent group-hover:opacity-100"
                  }`}
                >
                  B
                </button>
              )}
            </div>
          );
        })}
      </div>

      <DragHandle onPointerDown={listDrag.onPointerDown} dragging={listDrag.dragging} />

      <div
        style={compared ? { width: paneAWidth } : undefined}
        className={`${compared ? "shrink-0" : "flex-1"} min-w-0 overflow-y-auto bg-surface px-11 py-8`}
      >
        {selected && (
          <TradeDetail
            key={selected.id}
            trade={selected}
            fields={fields}
            rules={rules}
            setups={setups}
            setupId={tradeSetup[selected.id] ?? null}
            onSetupCreated={(s) => setSetups((prev) => [...prev, s])}
            onSetupAssign={(setupId) =>
              setTradeSetup((prev) => ({ ...prev, [selected.id]: setupId }))
            }
            listCollapsed={listCollapsed}
            onToggleList={() => setListWidth(listCollapsed ? LIST_WIDTH_DEFAULT : 0)}
          />
        )}
      </div>

      {compared && (
        <>
          <DragHandle onPointerDown={paneDrag.onPointerDown} dragging={paneDrag.dragging} />
          <div className="min-w-0 flex-1 overflow-y-auto border-l border-border bg-surface px-11 py-8">
            <TradeDetail
              key={compared.id}
              trade={compared}
              fields={fields}
              rules={rules}
              setups={setups}
              setupId={tradeSetup[compared.id] ?? null}
              onSetupCreated={(s) => setSetups((prev) => [...prev, s])}
              onSetupAssign={(setupId) =>
                setTradeSetup((prev) => ({ ...prev, [compared.id]: setupId }))
              }
              listCollapsed={listCollapsed}
              onToggleList={() => setListWidth(listCollapsed ? LIST_WIDTH_DEFAULT : 0)}
              onClose={() => setCompareId(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}

const DETAIL_TABS = [
  { key: "overview", label: "總覽" },
  // 反思筆記跟截圖原本分開兩個分頁,改成 Notion/Word 式圖文合一的
  // 「記錄」分頁(2026-08-14)——圖片直接插在筆記裡,不再是固定的
  // 「入場前/平倉後」兩格版位。自訂欄位也併進來當左欄(2026-08-14):
  // 自訂欄位單獨一頁常常只有小貓兩三隻、右邊空一大片,不如跟記錄合併,
  // 改用下拉選單壓縮高度。
  { key: "note", label: "記錄" },
  { key: "ai", label: "AI 分析" },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]["key"];

function TradeDetail({
  trade,
  fields,
  rules,
  setups,
  setupId,
  onSetupCreated,
  onSetupAssign,
  listCollapsed,
  onToggleList,
  onClose,
}: {
  trade: TradeDto;
  fields: FieldDef[];
  rules: DisciplineRuleDef[];
  setups: SetupOption[];
  setupId: string | null;
  onSetupCreated: (setup: SetupOption) => void;
  onSetupAssign: (setupId: string | null) => void;
  listCollapsed: boolean;
  onToggleList: () => void;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<DetailTab>("overview");
  const local = useLocalTime();
  const [note, setNote] = useState(trade.reflectionNote ?? "");
  const [grade, setGrade] = useState(trade.grade ?? "");
  const [stopLoss, setStopLoss] = useState(trade.stopLossPrice ?? "");
  const [takeProfit, setTakeProfit] = useState(trade.takeProfitPrice ?? "");
  const [ruleChecks, setRuleChecks] = useState(trade.ruleChecks);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // 雙欄對比時每個面板都變窄,固定寬度的自訂欄位會把記錄擠得很難讀,
  // 所以做成可收合——收合後只留標題列,記錄editor拿到全部空間。
  const [fieldsCollapsed, setFieldsCollapsed] = useState(false);

  // 刪除交易:手動新增的交易只要一般確認,自動匯入的(Bybit同步/CSV)
  // 要求輸入商品代碼再次確認才能刪除——防的是使用者一時衝動刪掉不利的
  // 真實交易紀錄。伺服器端(/api/trades/[id] DELETE)有一樣的門檔,這裡
  // 的輸入框驗證只是體驗層面,不是唯一防線。
  const isAutoImported = trade.source !== "MANUAL";
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isAutoImported ? { confirmSymbol: deleteConfirmInput.trim() } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? "刪除失敗");
        return;
      }
      setShowDeleteDialog(false);
      router.refresh();
    } catch {
      setDeleteError("網路錯誤,請稍後再試");
    } finally {
      setDeleting(false);
    }
  }

  const pnl = Number(trade.realizedPnl ?? 0);
  const win = pnl >= 0;
  const duration = holdingDuration(trade.openedAt, trade.closedAt);
  // 用當下輸入框裡的止損價即時算 R,不用等存檔後重新整理才看到結果。
  const liveRMultiple = calcRMultiple(
    trade.direction,
    Number(trade.entryPrice),
    trade.exitPrice === null ? null : Number(trade.exitPrice),
    stopLoss.trim() === "" ? null : Number(stopLoss),
  );

  return (
    // 面板本身可拖曳調整寬度(見 TradesView)。上限拉高到 1400px 只是防止
    // 收起列表後在超寬螢幕上文字行寬離譜地長,平常應該用不到這個天花板——
    // 2026-08-14 從 980px 調高,980 在收起列表後還是浪費掉不少可用寬度。
    <div className="max-w-[1400px]">
      <div className="mb-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleList}
          title={listCollapsed ? "展開交易列表" : "收起交易列表"}
          aria-label={listCollapsed ? "展開交易列表" : "收起交易列表"}
          aria-expanded={!listCollapsed}
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
            {listCollapsed && <path d="M11 8l2 2-2 2" />}
          </svg>
        </button>
        <h2 className="text-[1.48rem] font-semibold">
          {trade.symbol} · {trade.direction}
        </h2>
        <SetupPicker
          setups={setups}
          selectedId={setupId}
          onAssign={(id) => {
            onSetupAssign(id);
            save({ setupId: id });
          }}
          onCreated={onSetupCreated}
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmInput("");
              setDeleteError(null);
              setShowDeleteDialog(true);
            }}
            title="刪除這筆交易"
            aria-label="刪除這筆交易"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-text-secondary hover:border-loss hover:text-loss"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M4.5 5.5h11M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M6 5.5l.6 10a1 1 0 0 0 1 1h4.8a1 1 0 0 0 1-1l.6-10" />
            </svg>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="關閉比較"
              aria-label="關閉比較"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-text-secondary hover:border-loss hover:text-loss"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-3.5 w-3.5">
                <line x1="5" y1="5" x2="15" y2="15" />
                <line x1="15" y1="5" x2="5" y2="15" />
              </svg>
            </button>
          )}
        </div>
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
            {liveRMultiple === null ? "—" : `${liveRMultiple.toFixed(2)}R`}
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
          風險欄位(可編輯,R 值由此推算)
        </h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
          <div>
            <dt className="mb-1 text-[0.78rem] text-text-secondary">止損價</dt>
            <input
              type="number"
              step="any"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              onBlur={() => save({ stopLossPrice: stopLoss.trim() || null })}
              placeholder="未設定"
              className="num w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[0.9rem] text-text outline-none placeholder:text-text-tertiary focus:border-accent"
            />
          </div>
          <div>
            <dt className="mb-1 text-[0.78rem] text-text-secondary">目標價(選填)</dt>
            <input
              type="number"
              step="any"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              onBlur={() => save({ takeProfitPrice: takeProfit.trim() || null })}
              placeholder="未設定"
              className="num w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[0.9rem] text-text outline-none placeholder:text-text-tertiary focus:border-accent"
            />
          </div>
        </dl>
        <p className="mt-2 text-[0.75rem] leading-relaxed text-text-tertiary">
          R 值 = 實際損益 ÷ 初始風險,只需要止損價就能算,不需要目標價。目標價只用來之後對照「計畫 R:R vs 實現 R」。
        </p>
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

      <section className={tab === "overview" ? "mb-6" : "hidden"}>
        <h3 className="mb-2.5 text-[0.78rem] font-semibold tracking-[0.05em] text-text-secondary">
          紀律檢查
        </h3>
        {rules.length === 0 ? (
          <p className="rounded border border-dashed border-border bg-canvas px-3.5 py-3.5 text-[0.8rem] leading-relaxed text-text-secondary">
            還沒有設定任何紀律規則。到「設定 → 紀律規則」選一套規則包,或新增你自己的規則。
          </p>
        ) : (
          <div className="space-y-1.5">
            {rules.map((r) => {
              const checked = ruleChecks[r.id] === true;
              return (
                <div
                  key={r.id}
                  role="checkbox"
                  aria-checked={checked}
                  tabIndex={0}
                  onClick={() => {
                    const next = { ...ruleChecks, [r.id]: !checked };
                    setRuleChecks(next);
                    save({ ruleChecks: { [r.id]: !checked } });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const next = { ...ruleChecks, [r.id]: !checked };
                      setRuleChecks(next);
                      save({ ruleChecks: { [r.id]: !checked } });
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-2.5 rounded border px-3 py-2 text-[0.88rem] ${
                    checked
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-canvas hover:border-accent"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked ? "border-accent bg-accent text-white" : "border-border"
                    }`}
                  >
                    {checked && (
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                        <path d="M4 10l4 4 8-8" />
                      </svg>
                    )}
                  </span>
                  <span>{r.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={tab === "ai" ? "mb-6" : "hidden"}>
        <h3 className="mb-2.5 text-[0.78rem] font-semibold tracking-[0.05em] text-text-secondary">
          單一人格交易分析
        </h3>
        <AiAnalysis tradeId={trade.id} />
      </section>

      {/* 記錄:左欄自訂欄位(下拉選單,壓縮高度)+ 右欄圖文編輯器,
          2026-08-14 合併自「自訂欄位」+「反思筆記/截圖」三個原本分開的分頁。 */}
      <section className={tab === "note" ? "flex gap-6" : "hidden"}>
        <div className={fieldsCollapsed ? "shrink-0" : "w-[240px] shrink-0"}>
          <button
            type="button"
            onClick={() => setFieldsCollapsed((v) => !v)}
            aria-expanded={!fieldsCollapsed}
            title={fieldsCollapsed ? "展開自訂欄位" : "收合自訂欄位"}
            className="mb-2.5 flex items-center gap-1 text-[0.78rem] font-semibold tracking-[0.05em] text-text-secondary hover:text-accent"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-3 w-3 shrink-0 transition-transform ${fieldsCollapsed ? "-rotate-90" : ""}`}
            >
              <path d="M5 7l5 6 5-6" />
            </svg>
            {!fieldsCollapsed && "自訂欄位"}
          </button>
          {!fieldsCollapsed && (
            <CustomFields
              fields={fields}
              initialValues={trade.customValues}
              onSave={(patch) => save({ customValues: patch })}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="mb-2.5 text-[0.78rem] font-semibold tracking-[0.05em] text-text-secondary">
            記錄
          </h3>
          <RichNoteEditor
            tradeId={trade.id}
            initialContent={trade.reflectionNote ?? ""}
            onSave={(html) => {
              setNote(html);
              save({ reflectionNote: html });
            }}
          />
        </div>
      </section>

      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[440px] rounded border border-border bg-surface p-5">
            <h3 className="mb-2 text-[1.02rem] font-semibold text-text">刪除交易紀錄</h3>
            {isAutoImported ? (
              <>
                <p className="mb-3 text-[0.85rem] leading-relaxed text-text-secondary">
                  這筆 <span className="font-semibold text-text">{trade.symbol}</span> 交易是由{" "}
                  <span className="font-semibold text-text">
                    {trade.source === "BYBIT_SYNC" ? "Bybit API 自動同步" : "CSV 匯入"}
                  </span>{" "}
                  的真實交易紀錄。刪除已經匯入的交易可能讓你的統計分析失真,也違背這個工具「誠實面對自己交易行為」的目的——如果只是想排除某筆交易的統計,考慮改用反思筆記記錄原因,而不是刪除。
                </p>
                <p className="mb-1.5 text-[0.8rem] text-text-secondary">
                  請輸入商品代碼「<span className="font-semibold text-text">{trade.symbol}</span>」確認刪除:
                </p>
                <input
                  autoFocus
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  placeholder={trade.symbol}
                  className="w-full rounded border border-border bg-canvas px-3 py-2 text-[0.85rem] outline-none focus:border-accent"
                />
              </>
            ) : (
              <p className="mb-3 text-[0.85rem] leading-relaxed text-text-secondary">
                確定要刪除這筆 {trade.symbol} 交易紀錄嗎?此動作無法復原。
              </p>
            )}

            {deleteError && (
              <div role="alert" className="mt-3 rounded border border-loss bg-loss-bg px-3 py-2 text-[0.8rem] text-loss">
                {deleteError}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className="rounded border border-border bg-canvas px-3.5 py-1.5 text-[0.82rem] text-text-secondary hover:border-accent hover:text-accent"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting || (isAutoImported && deleteConfirmInput.trim() !== trade.symbol)}
                className="rounded bg-loss px-3.5 py-1.5 text-[0.82rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? "刪除中…" : "確定刪除"}
              </button>
            </div>
          </div>
        </div>
      )}
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
