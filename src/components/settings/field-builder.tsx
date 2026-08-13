"use client";

import { useEffect, useState } from "react";
import {
  BASE_FIELDS,
  FIELD_PRESETS,
  FIELD_TYPE_LABEL,
  type PresetFieldType,
} from "@/lib/field-presets";

export type FieldDef = {
  id: string;
  key: string;
  label: string;
  fieldType: PresetFieldType;
  options: string[] | null;
  sortOrder: number;
};

export function FieldBuilder() {
  const [fields, setFields] = useState<FieldDef[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const d = await fetch("/api/fields").then((r) => r.json());
    setFields(d.fields ?? []);
  }
  useEffect(() => {
    load().catch(() => setFields([]));
  }, []);

  async function addPreset(presetKey: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presetKey }),
    });
    if (!res.ok) setError((await res.json()).error ?? "新增失敗");
    await load();
    setBusy(false);
  }

  async function remove(f: FieldDef) {
    const ok = window.confirm(
      `停用「${f.label}」?\n\n已經填在各筆交易上的這個欄位值會一併刪除,而且無法復原。`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/fields/${f.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "刪除失敗");
    await load();
    setBusy(false);
  }

  async function move(index: number, dir: -1 | 1) {
    if (!fields) return;
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const a = fields[index];
    const b = fields[target];
    setBusy(true);
    await Promise.all([
      fetch(`/api/fields/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: b.sortOrder }),
      }),
      fetch(`/api/fields/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: a.sortOrder }),
      }),
    ]);
    await load();
    setBusy(false);
  }

  if (fields === null) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-8 text-center text-[0.85rem] text-text-secondary">
        讀取欄位設定…
      </div>
    );
  }

  const enabledKeys = new Set(fields.map((f) => f.key));
  const available = FIELD_PRESETS.filter((p) => !enabledKeys.has(p.key));

  return (
    <div className="space-y-4">
      <section className="rounded border border-border bg-surface px-5 py-5">
        <h3 className="mb-1 text-[0.84rem] font-semibold text-text-secondary">
          基礎欄位
        </h3>
        <p className="mb-2.5 text-[0.78rem] text-text-secondary">
          由交易所 API 自動填入,不可刪除。
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BASE_FIELDS.map((b) => (
            <span
              key={b}
              className="rounded-full border border-border bg-canvas px-2.5 py-1 text-[0.8rem] text-text-secondary"
            >
              {b}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded border border-border bg-surface px-5 py-5">
        <h3 className="mb-1 text-[0.84rem] font-semibold text-text-secondary">
          已啟用的自訂欄位
        </h3>
        <p className="mb-3 text-[0.78rem] text-text-secondary">
          會出現在每筆交易的「自訂欄位」分頁,順序即為填寫時的排列順序。
        </p>

        {fields.length === 0 ? (
          <div className="rounded border border-dashed border-border bg-canvas px-4 py-5 text-center text-[0.82rem] text-text-secondary">
            還沒有啟用任何自訂欄位。從下方欄位庫挑選開始。
          </div>
        ) : (
          <ul className="space-y-2">
            {fields.map((f, i) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded border border-border bg-canvas px-3 py-2.5"
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || busy}
                    aria-label={`${f.label} 上移`}
                    className="text-text-tertiary hover:text-accent disabled:opacity-30"
                  >
                    <Chevron dir="up" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === fields.length - 1 || busy}
                    aria-label={`${f.label} 下移`}
                    className="text-text-tertiary hover:text-accent disabled:opacity-30"
                  >
                    <Chevron dir="down" />
                  </button>
                </div>
                <div className="flex-1">
                  <div className="text-[0.9rem] font-semibold">{f.label}</div>
                  <div className="text-[0.75rem] text-text-secondary">
                    {FIELD_TYPE_LABEL[f.fieldType]}
                    {f.options && f.options.length > 0 && (
                      <> · {f.options.join(" / ")}</>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(f)}
                  disabled={busy}
                  className="rounded border border-border px-2.5 py-1 text-[0.78rem] text-text-secondary hover:border-loss hover:text-loss disabled:opacity-50"
                >
                  停用
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded border border-border bg-surface px-5 py-5">
        <h3 className="mb-1 text-[0.84rem] font-semibold text-text-secondary">
          欄位庫
        </h3>
        <p className="mb-3 text-[0.78rem] text-text-secondary">
          點擊即加入你的記錄模板。標註用途的欄位會直接讓對應的分析頁活起來。
        </p>
        {available.length === 0 ? (
          <p className="text-[0.82rem] text-text-secondary">
            欄位庫裡的欄位都已啟用。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {available.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => addPreset(p.key)}
                disabled={busy}
                title={
                  p.poweredAnalysis
                    ? `啟用後可用於:${p.poweredAnalysis}`
                    : undefined
                }
                className="rounded-full border border-border bg-canvas px-3 py-1.5 text-[0.82rem] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
              >
                + {p.label}
                <span className="ml-1 text-[0.72rem] text-text-tertiary">
                  {FIELD_TYPE_LABEL[p.fieldType]}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 border-t border-border pt-4">
          {creating ? (
            <CustomFieldForm
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
              建立自訂欄位
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

function CustomFieldForm({
  onCancel,
  onCreated,
  onError,
}: {
  onCancel: () => void;
  onCreated: () => void;
  onError: (e: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<PresetFieldType>("SINGLE_SELECT");
  const [optionsText, setOptionsText] = useState("");
  const [saving, setSaving] = useState(false);

  const needsOptions =
    fieldType === "SINGLE_SELECT" || fieldType === "MULTI_SELECT";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError(null);
    const res = await fetch("/api/fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        fieldType,
        options: needsOptions
          ? optionsText.split(/[,,\n]/).map((s) => s.trim()).filter(Boolean)
          : undefined,
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
          欄位名稱
        </label>
        <input
          className={input}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例如:市場結構"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-[0.8rem] font-semibold text-text-secondary">
          型別
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(FIELD_TYPE_LABEL) as PresetFieldType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFieldType(t)}
              aria-pressed={fieldType === t}
              className={`rounded-full border px-3 py-1 text-[0.8rem] ${
                fieldType === t
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-border bg-canvas text-text-secondary hover:text-text"
              }`}
            >
              {FIELD_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      {needsOptions && (
        <div>
          <label className="mb-1 block text-[0.8rem] font-semibold text-text-secondary">
            選項(用逗號或換行分隔)
          </label>
          <textarea
            className={input}
            rows={2}
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="看多, 看空, 觀望"
            required
          />
        </div>
      )}
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

function Chevron({ dir }: { dir: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d={dir === "up" ? "M5 12l5-5 5 5" : "M5 8l5 5 5-5"} />
    </svg>
  );
}
