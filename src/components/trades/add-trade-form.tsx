"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 交易記錄頁的「+ 新增交易」按鈕 + 彈窗表單。只收已平倉交易——
// 見 /api/trades route 開頭的說明,app 目前沒有「未平倉部位」這個概念。
export function AddTradeForm() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded border border-accent bg-accent px-3 py-1.5 text-[0.84rem] font-semibold text-white hover:opacity-90"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-3.5 w-3.5">
          <line x1="10" y1="4" x2="10" y2="16" />
          <line x1="4" y1="10" x2="16" y2="10" />
        </svg>
        新增交易
      </button>
      {open && <Modal onClose={() => setOpen(false)} />}
    </>
  );
}

function Modal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [positionSize, setPositionSize] = useState("");
  const [leverage, setLeverage] = useState("");
  const [fee, setFee] = useState("");
  const [realizedPnl, setRealizedPnl] = useState("");
  const [openedAt, setOpenedAt] = useState("");
  const [closedAt, setClosedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input =
    "w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[0.87rem] text-text outline-none placeholder:text-text-tertiary focus:border-accent";
  const label = "mb-1 block text-[0.78rem] font-semibold text-text-secondary";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        direction,
        entryPrice,
        exitPrice: exitPrice || undefined,
        stopLossPrice,
        takeProfitPrice: takeProfitPrice || undefined,
        positionSize,
        leverage: leverage || undefined,
        fee: fee || undefined,
        realizedPnl,
        openedAt: openedAt ? new Date(openedAt).toISOString() : undefined,
        closedAt: new Date(closedAt).toISOString(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "新增失敗");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded border border-border bg-surface p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[1.1rem] font-semibold">新增交易</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="text-text-secondary hover:text-text"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>商品名稱</label>
              <input
                className={input}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="BTCUSDT"
                required
              />
            </div>
            <div>
              <label className={label}>方向</label>
              <div className="flex overflow-hidden rounded border border-border">
                {(["LONG", "SHORT"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    aria-pressed={direction === d}
                    className={`flex-1 py-1.5 text-[0.85rem] ${
                      direction === d
                        ? "bg-accent-soft font-semibold text-accent"
                        : "bg-canvas text-text-secondary hover:text-text"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>入場價</label>
              <input
                type="number"
                step="any"
                className={input}
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={label}>出場價(選填)</label>
              <input
                type="number"
                step="any"
                className={input}
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>止損價</label>
              <input
                type="number"
                step="any"
                className={input}
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={label}>目標價(選填)</label>
              <input
                type="number"
                step="any"
                className={input}
                value={takeProfitPrice}
                onChange={(e) => setTakeProfitPrice(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[0.76rem] leading-relaxed text-text-tertiary">
            R 值(風報比)由止損價自動算出,不需要另外填一個 R 數字。
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>倉位大小</label>
              <input
                type="number"
                step="any"
                className={input}
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={label}>槓桿(選填)</label>
              <input
                type="number"
                step="any"
                className={input}
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>手續費(選填)</label>
              <input
                type="number"
                step="any"
                className={input}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className={label}>已實現損益(U)</label>
            <input
              type="number"
              step="any"
              className={input}
              value={realizedPnl}
              onChange={(e) => setRealizedPnl(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>開倉時間(選填)</label>
              <input
                type="datetime-local"
                className={input}
                value={openedAt}
                onChange={(e) => setOpenedAt(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>平倉時間</label>
              <input
                type="datetime-local"
                className={input}
                value={closedAt}
                onChange={(e) => setClosedAt(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded border border-loss bg-loss-bg px-3 py-2 text-[0.82rem] text-loss">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-accent px-4 py-1.5 text-[0.85rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "新增中…" : "新增交易"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-4 py-1.5 text-[0.85rem] text-text-secondary hover:text-text"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
