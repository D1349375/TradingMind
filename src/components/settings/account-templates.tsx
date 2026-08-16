"use client";

import { useEffect, useState } from "react";

type AccountKind = "LIVE" | "DEMO" | "PROP_FIRM";
type AssetClass = "CRYPTO" | "FUTURES" | "STOCK" | "FOREX" | "OPTIONS";

export type AccountTemplate = {
  id: string;
  label: string;
  kind: AccountKind;
  assetClass: AssetClass | null;
  hasBybitConnection: boolean;
  lastSyncedAt: string | null;
  hasGoal: boolean;
  tradeCount: number;
};

const KIND_LABEL: Record<AccountKind, string> = {
  LIVE: "實盤",
  DEMO: "模擬",
  PROP_FIRM: "Prop Firm",
};

const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  CRYPTO: "加密貨幣",
  FUTURES: "期貨",
  STOCK: "股票",
  FOREX: "外匯",
  OPTIONS: "選擇權",
};

export function AccountTemplates() {
  const [accounts, setAccounts] = useState<AccountTemplate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const d = await fetch("/api/accounts").then((r) => r.json());
    setAccounts(d.accounts ?? []);
  }
  useEffect(() => {
    load().catch(() => setAccounts([]));
  }, []);

  async function remove(a: AccountTemplate) {
    const detail =
      a.tradeCount > 0
        ? `這個模板底下有 ${a.tradeCount} 筆交易,刪除後這些交易會變成「未分類」,不會被刪除。`
        : "這個模板底下沒有交易紀錄。";
    const ok = window.confirm(
      `刪除模板「${a.label}」?\n\n${detail}${
        a.hasBybitConnection ? "\n\n連接的 Bybit 唯讀金鑰會一併移除(不影響你在 Bybit 上的帳號本身)。" : ""
      }`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "刪除失敗");
    await load();
    setBusy(false);
  }

  async function rename(a: AccountTemplate) {
    const next = window.prompt("模板名稱", a.label);
    if (next === null) return;
    const label = next.trim();
    if (!label || label === a.label) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/accounts/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) setError((await res.json()).error ?? "更新失敗");
    await load();
    setBusy(false);
  }

  if (accounts === null) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-8 text-center text-[0.85rem] text-text-secondary">
        讀取帳戶模板…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded border border-border bg-surface px-5 py-5">
        <h3 className="mb-1 text-[0.84rem] font-semibold text-text-secondary">
          帳戶模板
        </h3>
        <p className="mb-3 text-[0.78rem] text-text-secondary">
          同一帳號可以建立多個交易模板,各自獨立選擇要不要連接交易所。「交易所連線」「目標設定」分頁裡可以分別針對每個模板設定;Dashboard 等分析頁預設合併看全部模板,也可以切換成只看其中幾個。
        </p>

        <ul className="space-y-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="rounded border border-border bg-canvas px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-[0.9rem] font-semibold">
                    {a.label}
                    <span className="rounded-full border border-border px-2 py-0.5 text-[0.72rem] font-normal text-text-secondary">
                      {KIND_LABEL[a.kind]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[0.75rem] text-text-secondary">
                    {a.hasBybitConnection
                      ? "已連接 Bybit"
                      : a.assetClass
                        ? ASSET_CLASS_LABEL[a.assetClass]
                        : "未連接交易所 · 尚未宣告資產類別"}
                    {" · "}
                    {a.tradeCount} 筆交易
                    {a.hasGoal ? " · 已設定目標與風控" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => rename(a)}
                  disabled={busy}
                  className="rounded border border-border px-2.5 py-1 text-[0.78rem] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  改名
                </button>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  disabled={busy || accounts.length <= 1}
                  title={accounts.length <= 1 ? "至少要保留一個帳戶模板" : undefined}
                  className="rounded border border-border px-2.5 py-1 text-[0.78rem] text-text-secondary hover:border-loss hover:text-loss disabled:opacity-30"
                >
                  刪除
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-border pt-4">
          {creating ? (
            <NewAccountForm
              onCancel={() => setCreating(false)}
              onCreated={async () => {
                setCreating(false);
                await load();
              }}
              onError={setError}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded border border-border px-3 py-1.5 text-[0.82rem] text-text-secondary hover:border-accent hover:text-accent"
            >
              新增帳戶模板
            </button>
          )}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded border border-loss bg-loss-bg px-3 py-2 text-[0.82rem] text-loss"
        >
          {error}
        </div>
      )}
    </div>
  );
}

function NewAccountForm({
  onCancel,
  onCreated,
  onError,
}: {
  onCancel: () => void;
  onCreated: () => void;
  onError: (e: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<AccountKind>("LIVE");
  const [assetClass, setAssetClass] = useState<AssetClass | "">("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError(null);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        kind,
        assetClass: assetClass || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      onError((await res.json()).error ?? "建立失敗");
      return;
    }
    onCreated();
  }

  const input =
    "w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[0.87rem] text-text outline-none placeholder:text-text-tertiary focus:border-accent";

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="mb-1 block text-[0.8rem] font-semibold text-text-secondary">
          模板名稱
        </label>
        <input
          className={input}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例如:FTMO Challenge #1"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-[0.8rem] font-semibold text-text-secondary">
          帳戶性質
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`rounded-full border px-3 py-1 text-[0.8rem] ${
                kind === k
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-border bg-canvas text-text-secondary hover:text-text"
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[0.8rem] font-semibold text-text-secondary">
          資產類別(選填)
        </label>
        <p className="mb-1.5 text-[0.75rem] text-text-secondary">
          只有不打算連接交易所的手動記錄模板需要填——之後在「交易所連線」分頁
          幫這個模板接上連線的話,資產類別會自動視為連線本身的類型,不用另外選。
        </p>
        <select
          className={input}
          value={assetClass}
          onChange={(e) => setAssetClass(e.target.value as AssetClass | "")}
        >
          <option value="">先不指定</option>
          {(Object.keys(ASSET_CLASS_LABEL) as AssetClass[]).map((c) => (
            <option key={c} value={c}>
              {ASSET_CLASS_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-accent px-3 py-1.5 text-[0.82rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "建立中…" : "建立"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border px-3 py-1.5 text-[0.82rem] text-text-secondary hover:text-text"
        >
          取消
        </button>
      </div>
    </form>
  );
}
