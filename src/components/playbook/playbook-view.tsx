"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type SetupWithTrades = {
  id: string;
  name: string;
  entryLogic: string | null;
  economicRationale: string | null;
  registered: boolean;
  trades: { realizedPnl: number | null; rMultiple: number | null }[];
};

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;

function stats(trades: SetupWithTrades["trades"]) {
  const pnls = trades.map((t) => t.realizedPnl).filter((p): p is number => p !== null);
  const wins = pnls.filter((p) => p > 0).length;
  const losses = pnls.filter((p) => p < 0).length;
  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r !== null);
  return {
    n: trades.length,
    winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
    avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
    pnl: pnls.reduce((s, p) => s + p, 0),
  };
}

// 已登記的 Setup(填過經濟機制)才進 Playbook 排行比較——沒登記的只是
// 假設清單,拿來跟已驗證的排在一起比較沒有意義。見 schema 的 Setup 註解。
export function PlaybookView({ setups }: { setups: SetupWithTrades[] }) {
  const registered = setups
    .filter((s) => s.registered)
    .map((s) => ({ setup: s, stats: stats(s.trades) }))
    .sort((a, b) => b.stats.pnl - a.stats.pnl);
  const unregistered = setups.filter((s) => !s.registered);

  if (setups.length === 0) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-12 text-center">
        <div className="mb-1 text-[0.9rem] font-semibold text-text-secondary">
          還沒有任何 Setup
        </div>
        <p className="mx-auto max-w-[46ch] text-[0.82rem] text-text-secondary">
          到交易記錄頁的交易詳情,用「+ 標記 Setup」建立你的第一個進場邏輯。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2.5 text-[0.82rem] font-semibold text-text-secondary">
          已登記 Setup 排行
        </h2>
        {registered.length === 0 ? (
          <div className="rounded border border-dashed border-border bg-surface px-5 py-8 text-center text-[0.82rem] text-text-secondary">
            還沒有任何 Setup 填過「經濟機制」,不會出現在排行——見下方「尚未登記」清單。
          </div>
        ) : (
          <div className="space-y-2.5">
            {registered.map(({ setup, stats: s }) => (
              <SetupCard key={setup.id} setup={setup} stats={s} />
            ))}
          </div>
        )}
      </section>

      {unregistered.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[0.82rem] font-semibold text-text-secondary">
            尚未登記(缺經濟機制,不進排行)
          </h2>
          <div className="space-y-2.5">
            {unregistered.map((setup) => (
              <SetupCard key={setup.id} setup={setup} stats={stats(setup.trades)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SetupCard({
  setup,
  stats: s,
}: {
  setup: SetupWithTrades;
  stats: ReturnType<typeof stats>;
}) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  if (editing) {
    return <SetupEditForm setup={setup} onDone={() => setEditing(false)} />;
  }

  async function remove() {
    const ok = window.confirm(
      `刪除 Setup「${setup.name}」?已標記這個 Setup 的交易不會被刪除,只是取消標記。`,
    );
    if (!ok) return;
    const res = await fetch(`/api/setups/${setup.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="rounded border border-border bg-surface px-4 py-3.5">
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.94rem] font-semibold">{setup.name}</div>
          {setup.entryLogic && (
            <div className="mt-0.5 text-[0.8rem] text-text-secondary">
              {setup.entryLogic}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-border px-2.5 py-1 text-[0.76rem] text-text-secondary hover:border-accent hover:text-accent"
          >
            編輯
          </button>
          <button
            type="button"
            onClick={remove}
            className="rounded border border-border px-2.5 py-1 text-[0.76rem] text-text-secondary hover:border-loss hover:text-loss"
          >
            刪除
          </button>
        </div>
      </div>

      {setup.economicRationale ? (
        <p className="mb-2.5 text-[0.8rem] italic leading-relaxed text-text-secondary">
          {setup.economicRationale}
        </p>
      ) : (
        <p className="mb-2.5 text-[0.78rem] text-text-tertiary">
          還沒填經濟機制——說明為什麼這個模式會重複出現,填了才算已登記。
        </p>
      )}

      <div className="grid grid-cols-4 gap-3">
        {[
          { l: "交易數", v: String(s.n) },
          { l: "勝率", v: s.winRate === null ? "—" : `${fmt(s.winRate, 1)}%` },
          { l: "平均 R", v: s.avgR === null ? "—" : `${fmt(s.avgR)}R` },
        ].map((m) => (
          <div key={m.l}>
            <div className="text-[0.72rem] text-text-secondary">{m.l}</div>
            <div className="num text-[0.92rem] font-semibold">{m.v}</div>
          </div>
        ))}
        <div>
          <div className="text-[0.72rem] text-text-secondary">累計損益</div>
          <div className={`num text-[0.92rem] font-semibold ${s.pnl >= 0 ? "text-profit" : "text-loss"}`}>
            {s.n > 0 ? `${signed(s.pnl)}U` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupEditForm({
  setup,
  onDone,
}: {
  setup: SetupWithTrades;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(setup.name);
  const [entryLogic, setEntryLogic] = useState(setup.entryLogic ?? "");
  const [economicRationale, setEconomicRationale] = useState(setup.economicRationale ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input =
    "w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[0.85rem] text-text outline-none focus:border-accent";
  const label = "mb-1 block text-[0.76rem] font-semibold text-text-secondary";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/setups/${setup.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, entryLogic, economicRationale }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "儲存失敗");
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-2.5 rounded border border-accent bg-surface px-4 py-3.5">
      <div>
        <label className={label}>Setup 名稱</label>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className={label}>進場邏輯</label>
        <input className={input} value={entryLogic} onChange={(e) => setEntryLogic(e.target.value)} />
      </div>
      <div>
        <label className={label}>經濟機制(填了才算已登記進排行)</label>
        <input
          className={input}
          value={economicRationale}
          onChange={(e) => setEconomicRationale(e.target.value)}
        />
      </div>
      {error && <p className="text-[0.76rem] text-loss">{error}</p>}
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-accent px-3 py-1.5 text-[0.8rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "儲存中…" : "儲存"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded border border-border px-3 py-1.5 text-[0.8rem] text-text-secondary hover:text-text"
        >
          取消
        </button>
      </div>
    </form>
  );
}
