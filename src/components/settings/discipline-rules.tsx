"use client";

import { useEffect, useState } from "react";
import { DISCIPLINE_PRESETS, type DisciplinePresetKey } from "@/lib/discipline-presets";

type Rule = {
  id: string;
  label: string;
  presetPackId: string | null;
};

export function DisciplineRules() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");

  async function load() {
    const d = await fetch("/api/discipline-rules").then((r) => r.json());
    setRules(d.rules ?? []);
  }
  useEffect(() => {
    load().catch(() => setRules([]));
  }, []);

  async function addPreset(key: DisciplinePresetKey) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/discipline-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presetKey: key }),
    });
    if (!res.ok) setError((await res.json()).error ?? "加入失敗");
    else setRules((await res.json()).rules);
    setBusy(false);
  }

  async function addCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/discipline-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "新增失敗");
    } else {
      setNewLabel("");
      await load();
    }
    setBusy(false);
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/discipline-rules/${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "刪除失敗");
    await load();
    setBusy(false);
  }

  if (rules === null) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-8 text-center text-[0.85rem] text-text-secondary">
        讀取規則設定…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded border border-border bg-surface px-5 py-5">
        <h3 className="mb-2.5 text-[0.84rem] font-semibold text-text-secondary">
          選一套規則起手,或從零開始
        </h3>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {(Object.entries(DISCIPLINE_PRESETS) as [DisciplinePresetKey, (typeof DISCIPLINE_PRESETS)[DisciplinePresetKey]][]).map(
            ([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => addPreset(key)}
                disabled={busy}
                className="rounded-full border border-border bg-canvas px-3 py-1.5 text-[0.82rem] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
              >
                + {preset.label}
              </button>
            ),
          )}
        </div>

        {rules.length === 0 ? (
          <div className="rounded border border-dashed border-border bg-canvas px-4 py-5 text-center text-[0.82rem] text-text-secondary">
            尚未新增任何規則,從上面選一套規則包,或直接從下方新增你自己的第一條。
          </div>
        ) : (
          <ul className="mb-3 space-y-1.5">
            {rules.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded border border-border bg-canvas px-3 py-2 text-[0.88rem]"
              >
                <span className="flex-1">{r.label}</span>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={busy}
                  aria-label={`移除「${r.label}」`}
                  className="text-text-tertiary hover:text-loss disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addCustom} className="flex gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="新增一條你自己的紀律,例如:單日虧損達上限即停手"
            className="flex-1 rounded border border-border bg-canvas px-2.5 py-1.5 text-[0.85rem] text-text outline-none placeholder:text-text-tertiary focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy || !newLabel.trim()}
            className="whitespace-nowrap rounded border border-border px-3 py-1.5 text-[0.82rem] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            新增
          </button>
        </form>

        {error && (
          <div role="alert" className="mt-3 rounded border border-loss bg-loss-bg px-3 py-2 text-[0.82rem] text-loss">
            {error}
          </div>
        )}
      </section>

      <div className="rounded border border-dashed border-border bg-surface px-4 py-4">
        <div className="mb-1 text-[0.85rem] font-semibold text-text-secondary">
          這套規則會出現在每筆交易的「紀律檢查」清單
        </div>
        <p className="text-[0.8rem] text-text-secondary">
          心態分析的紀律遵守率,依這份清單的勾選完成度計算,不是單一是非題。
        </p>
      </div>
    </div>
  );
}
