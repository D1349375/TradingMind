"use client";

import { useState } from "react";

export type SetupOption = {
  id: string;
  name: string;
  entryLogic: string | null;
  economicRationale: string | null;
};

// 交易詳情頁的 Setup 標記元件:指派既有 Setup,或就地新增一個。
// Setup 是第一級實體(要掛假設登記做統計驗證),不是自訂欄位,所以獨立成元件——
// 見 lib/field-presets.ts 開頭的說明。
export function SetupPicker({
  setups,
  selectedId,
  onAssign,
  onCreated,
}: {
  setups: SetupOption[];
  selectedId: string | null;
  onAssign: (setupId: string | null) => void;
  onCreated: (setup: SetupOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const selected = setups.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setCreating(false);
        }}
        aria-expanded={open}
        className={`rounded-full border px-3 py-1 text-[0.82rem] ${
          selected
            ? "border-accent bg-accent-soft font-semibold text-accent"
            : "border-dashed border-border bg-canvas text-text-secondary hover:border-accent hover:text-accent"
        }`}
      >
        {selected ? selected.name : "+ 標記 Setup"}
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-10 w-72 rounded border border-border bg-surface p-2 shadow-lg">
          {creating ? (
            <NewSetupForm
              onCancel={() => setCreating(false)}
              onCreated={(setup) => {
                onCreated(setup);
                onAssign(setup.id);
                setCreating(false);
                setOpen(false);
              }}
            />
          ) : (
            <>
              {selected && (
                <button
                  type="button"
                  onClick={() => {
                    onAssign(null);
                    setOpen(false);
                  }}
                  className="mb-1 w-full rounded px-2 py-1.5 text-left text-[0.82rem] text-text-secondary hover:bg-canvas"
                >
                  取消標記
                </button>
              )}
              <div className="max-h-52 overflow-y-auto">
                {setups.length === 0 ? (
                  <p className="px-2 py-1.5 text-[0.78rem] text-text-secondary">
                    還沒有任何 Setup。
                  </p>
                ) : (
                  setups.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onAssign(s.id);
                        setOpen(false);
                      }}
                      className={`block w-full rounded px-2 py-1.5 text-left text-[0.82rem] hover:bg-canvas ${
                        s.id === selectedId ? "font-semibold text-accent" : ""
                      }`}
                    >
                      {s.name}
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-1 w-full rounded border-t border-border px-2 py-1.5 text-left text-[0.82rem] text-accent hover:bg-canvas"
              >
                + 新增 Setup
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NewSetupForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (setup: SetupOption) => void;
}) {
  const [name, setName] = useState("");
  const [entryLogic, setEntryLogic] = useState("");
  const [economicRationale, setEconomicRationale] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input =
    "w-full rounded border border-border bg-canvas px-2 py-1 text-[0.8rem] text-text outline-none placeholder:text-text-tertiary focus:border-accent";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/setups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        entryLogic: entryLogic || undefined,
        economicRationale: economicRationale || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "建立失敗");
      return;
    }
    const { setup } = await res.json();
    onCreated(setup);
  }

  return (
    <form onSubmit={submit} className="space-y-2 p-1">
      <div>
        <label className="mb-0.5 block text-[0.76rem] font-semibold text-text-secondary">
          Setup 名稱
        </label>
        <input
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如:FVG 回補"
          autoFocus
          required
        />
      </div>
      <div>
        <label className="mb-0.5 block text-[0.76rem] font-semibold text-text-secondary">
          進場邏輯(選填)
        </label>
        <input
          className={input}
          value={entryLogic}
          onChange={(e) => setEntryLogic(e.target.value)}
          placeholder="關鍵位掃蕩 + MSS 確認…"
        />
      </div>
      <div>
        <label className="mb-0.5 block text-[0.76rem] font-semibold text-text-secondary">
          經濟機制(選填,填了才算已登記進 Playbook 排行)
        </label>
        <input
          className={input}
          value={economicRationale}
          onChange={(e) => setEconomicRationale(e.target.value)}
          placeholder="為什麼這個模式會重複出現…"
        />
      </div>
      {error && <p className="text-[0.76rem] text-loss">{error}</p>}
      <div className="flex gap-1.5 pt-0.5">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-accent px-2.5 py-1 text-[0.78rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "建立中…" : "建立並標記"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border px-2.5 py-1 text-[0.78rem] text-text-secondary hover:text-text"
        >
          取消
        </button>
      </div>
    </form>
  );
}
