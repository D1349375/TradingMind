"use client";

import { useEffect, useRef, useState } from "react";
import type { PresetFieldType } from "@/lib/field-presets";

export type FieldDef = {
  id: string;
  key: string;
  label: string;
  fieldType: PresetFieldType;
  options: string[] | null;
};

export type FieldValues = Record<string, unknown>;

// 交易詳情頁的自訂欄位——2026-08-14 起併入「記錄」分頁左欄,改成
// Tradezella 式下拉選單(原本單選/多選是一排排 pill 按鈕,欄位一多整欄
// 拉得很長,是「紀錄介面太小」抱怨的主因之一)。每個欄位一行,標籤在左、
// 控制項在右,單選/多選都收進下拉選單裡,不常駐佔垂直空間。
export function CustomFields({
  fields,
  initialValues,
  onSave,
}: {
  fields: FieldDef[];
  initialValues: FieldValues;
  onSave: (values: FieldValues) => void;
}) {
  const [values, setValues] = useState<FieldValues>(initialValues);

  function set(fieldId: string, value: unknown) {
    const next = { ...values, [fieldId]: value };
    setValues(next);
    onSave({ [fieldId]: value });
  }

  if (fields.length === 0) {
    return (
      <div className="rounded border border-dashed border-border bg-canvas px-3.5 py-3.5 text-[0.8rem] leading-relaxed text-text-secondary">
        還沒有啟用任何自訂欄位。到「設定 → 欄位自訂」從欄位庫挑選(例如情緒狀態、
        交易時區、做單週期),啟用後就能在這裡逐筆記錄,對應的分析頁也會跟著活起來。
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {fields.map((f) => (
        <div key={f.id} className="flex items-center gap-2.5">
          <div className="w-[86px] shrink-0 truncate text-[0.8rem] text-text-secondary" title={f.label}>
            {f.label}
          </div>
          <div className="min-w-0 flex-1">
            <FieldInput field={f} value={values[f.id]} onChange={(v) => set(f.id, v)} />
          </div>
        </div>
      ))}
    </div>
  );
}

const controlClass =
  "w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[0.85rem] text-text outline-none focus:border-accent";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.fieldType === "SINGLE_SELECT") {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={controlClass}
      >
        <option value="">未設定</option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (field.fieldType === "MULTI_SELECT") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <MultiSelectDropdown
        options={field.options ?? []}
        selected={arr}
        onToggle={(o) => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])}
      />
    );
  }

  if (field.fieldType === "BOOLEAN") {
    const current = value === true ? "true" : value === false ? "false" : "";
    return (
      <select
        value={current}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "true")}
        className={controlClass}
      >
        <option value="">未設定</option>
        <option value="true">是</option>
        <option value="false">否</option>
      </select>
    );
  }

  if (field.fieldType === "NUMBER") {
    return (
      <input
        type="number"
        step="any"
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={`${controlClass} text-right`}
      />
    );
  }

  return (
    <input
      type="text"
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      className={controlClass}
    />
  );
}

function MultiSelectDropdown({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${controlClass} flex items-center justify-between text-left`}
      >
        <span className={`truncate ${selected.length === 0 ? "text-text-tertiary" : ""}`}>
          {selected.length === 0 ? "未設定" : selected.join("、")}
        </span>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="ml-1 h-3 w-3 shrink-0">
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-10 max-h-56 w-full min-w-[180px] overflow-y-auto rounded border border-border bg-surface p-1 shadow-lg">
          {options.map((o) => {
            const on = selected.includes(o);
            return (
              <label
                key={o}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[0.83rem] hover:bg-canvas"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(o)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                {o}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
