"use client";

import { useEffect, useState } from "react";

type ConnectionState = {
  connected: boolean;
  maskedApiKey?: string;
  lastSyncedAt?: string | null;
  connectedAt?: string;
  boundIps?: string[];
};

export function BybitConnection() {
  const [state, setState] = useState<ConnectionState | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/exchange/bybit")
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState({ connected: false }));
  }, []);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/exchange/bybit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, apiSecret }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "連線失敗");
      setBusy(false);
      return;
    }

    setState(data);
    setApiKey("");
    setApiSecret("");
    setBusy(false);
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/exchange/bybit", { method: "DELETE" });
    const data = await res.json();
    setState(data);
    setBusy(false);
  }

  const inputClass =
    "w-full rounded border border-border bg-canvas px-3 py-2 font-mono text-[0.85rem] text-text outline-none placeholder:text-text-tertiary focus:border-accent";

  if (state === null) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-8 text-center text-[0.85rem] text-text-secondary">
        讀取連線狀態…
      </div>
    );
  }

  if (state.connected) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-profit" />
              <span className="text-[0.9rem] font-semibold">已連線 Bybit</span>
            </div>
            <div className="font-mono text-[0.8rem] text-text-secondary">
              {state.maskedApiKey}
            </div>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="shrink-0 rounded border border-border bg-surface px-3 py-1.5 text-[0.82rem] text-text transition-colors hover:border-loss hover:text-loss disabled:opacity-50"
          >
            {busy ? "處理中…" : "中斷連線"}
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border pt-4 text-[0.82rem]">
          <div className="flex justify-between">
            <dt className="text-text-secondary">上次同步</dt>
            <dd className="num">
              {state.lastSyncedAt
                ? new Date(state.lastSyncedAt).toLocaleString("zh-TW")
                : "尚未同步"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">連線建立</dt>
            <dd className="num">
              {state.connectedAt
                ? new Date(state.connectedAt).toLocaleDateString("zh-TW")
                : "—"}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-surface px-5 py-5">
      <div className="mb-1 text-[0.9rem] font-semibold">連接 Bybit 帳戶</div>
      <p className="mb-4 text-[0.82rem] leading-relaxed text-text-secondary">
        TradeMind 只會讀取你的交易紀錄,不會也無法下單或提領。
        系統會在儲存前向 Bybit 驗證,
        <span className="font-semibold text-text">
          帶有交易或提領權限的金鑰會被拒絕
        </span>
        ,Secret 以 AES-256-GCM 加密後才寫入資料庫。
      </p>

      <details className="mb-4 rounded border border-border bg-canvas px-3 py-2">
        <summary className="cursor-pointer text-[0.82rem] font-semibold text-text-secondary">
          如何建立唯讀 API Key?
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[0.8rem] leading-relaxed text-text-secondary">
          <li>登入 Bybit → 右上角頭像 → API</li>
          <li>建立新 API Key,選「系統生成的 API 金鑰」</li>
          <li>
            權限只勾選<span className="font-semibold text-text">「唯讀」</span>
            ,不要勾交易、提領、劃轉
          </li>
          <li>建議同時綁定 IP 白名單,安全性更高</li>
          <li>複製 Key 與 Secret 貼到下方(Secret 只會顯示一次)</li>
        </ol>
      </details>

      <form onSubmit={handleConnect} className="space-y-3">
        <div>
          <label
            htmlFor="bybit-key"
            className="mb-1.5 block text-[0.8rem] font-semibold text-text-secondary"
          >
            API Key
          </label>
          <input
            id="bybit-key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className={inputClass}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>
        <div>
          <label
            htmlFor="bybit-secret"
            className="mb-1.5 block text-[0.8rem] font-semibold text-text-secondary"
          >
            API Secret
          </label>
          <input
            id="bybit-secret"
            type="password"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            className={inputClass}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded border border-loss bg-loss-bg px-3 py-2 text-[0.82rem] leading-relaxed text-loss"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-4 py-2 text-[0.85rem] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "驗證中…" : "驗證並連接"}
        </button>
      </form>
    </div>
  );
}
