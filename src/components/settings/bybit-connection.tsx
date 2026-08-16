"use client";

import { useEffect, useState } from "react";

type ConnectionState = {
  connected: boolean;
  maskedApiKey?: string;
  lastSyncedAt?: string | null;
  connectedAt?: string;
  boundIps?: string[];
};

type AccountOption = { id: string; label: string };

export function BybitConnection() {
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [state, setState] = useState<ConnectionState | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // 帳戶模板清單:2026-08-16 起 Bybit 連線綁在模板底下,先選要設定哪一個
  // 模板。只有 1 個模板時直接沿用,不多顯示一層選擇(維持既有零摩擦體驗)。
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        const list: AccountOption[] = d.accounts ?? [];
        setAccounts(list);
        if (list.length > 0) setAccountId(list[0].id);
      })
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (!accountId) return;
    setState(null);
    fetch(`/api/exchange/bybit?accountId=${accountId}`)
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState({ connected: false }));
  }, [accountId]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) return;
    setBusy(true);
    setError(null);

    const res = await fetch("/api/exchange/bybit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, apiKey, apiSecret }),
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

  async function handleSync() {
    if (!accountId) return;
    setSyncing(true);
    setError(null);
    setSyncResult(null);

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "同步失敗");
      setSyncing(false);
      return;
    }

    setSyncResult(
      data.fetched === 0
        ? "最近 7 天沒有已平倉的交易"
        : `取回 ${data.fetched} 筆,新增 ${data.created} 筆,已存在 ${data.skipped} 筆`,
    );
    // 重新讀取連線狀態,更新「上次同步」時間
    const refreshed = await fetch(`/api/exchange/bybit?accountId=${accountId}`).then((r) =>
      r.json(),
    );
    setState(refreshed);
    setSyncing(false);
  }

  async function handleDisconnect() {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/exchange/bybit?accountId=${accountId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setState(data);
    setBusy(false);
  }

  const inputClass =
    "w-full rounded border border-border bg-canvas px-3 py-2 font-mono text-[0.85rem] text-text outline-none placeholder:text-text-tertiary focus:border-accent";

  const accountPicker =
    accounts && accounts.length > 1 ? (
      <div className="mb-4">
        <label className="mb-1.5 block text-[0.8rem] font-semibold text-text-secondary">
          帳戶模板
        </label>
        <select
          className={inputClass}
          value={accountId ?? ""}
          onChange={(e) => setAccountId(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
    ) : null;

  if (accounts === null || state === null) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-8 text-center text-[0.85rem] text-text-secondary">
        讀取連線狀態…
      </div>
    );
  }

  if (state.connected) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-5">
        {accountPicker}
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
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing || busy}
              className="rounded bg-accent px-3 py-1.5 text-[0.82rem] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {syncing ? "同步中…" : "立即同步"}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy || syncing}
              className="rounded border border-border bg-surface px-3 py-1.5 text-[0.82rem] text-text transition-colors hover:border-loss hover:text-loss disabled:opacity-50"
            >
              {busy ? "處理中…" : "中斷連線"}
            </button>
          </div>
        </div>

        {syncResult && (
          <div
            role="status"
            className="mb-4 rounded border border-profit bg-profit-bg px-3 py-2 text-[0.82rem] text-profit"
          >
            {syncResult}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 rounded border border-loss bg-loss-bg px-3 py-2 text-[0.82rem] leading-relaxed text-loss"
          >
            {error}
          </div>
        )}

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
      {accountPicker}
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
          disabled={busy || !accountId}
          className="rounded bg-accent px-4 py-2 text-[0.85rem] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "驗證中…" : "驗證並連接"}
        </button>
      </form>
    </div>
  );
}
