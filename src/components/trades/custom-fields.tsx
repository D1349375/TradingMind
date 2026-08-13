"use client";

import { useState } from "react";
import type { PresetFieldType } from "@/lib/field-presets";

export type FieldDef = {
  id: string;
  key: string;
  label: string;
  fieldType: PresetFieldType;
  options: string[] | null;
};

export type FieldValues = Record<string, unknown>;

// 交易詳情頁的「自訂欄位」分頁。欄位定義來自 Field Builder,
// 值存進 CustomFieldValue(EAV)。
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
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.id}>
          <div className="mb-1.5 text-[0.8rem] font-semibold text-text-secondary">
            {f.label}
          </div>
          <FieldInput
            field={f}
            value={values[f.id]}
            onChange={(v) => set(f.id, v)}
          />
        </div>
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const chip =
    "rounded-full border px-3 py-1 text-[0.82rem] transition-colors";
  const chipOff =
    "border-border bg-canvas text-text-secondary hover:border-accent hover:text-accent";
  const chipOn = "border-accent bg-accent-soft font-semibold text-accent";

  if (field.fieldType === "SINGLE_SELECT") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {(field.options ?? []).map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              // 再點一次取消選取,才不會選錯就無法清空
              onClick={() => onChange(on ? null : o)}
              aria-pressed={on}
              className={`${chip} ${on ? chipOn : chipOff}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.fieldType === "MULTI_SELECT") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {(field.options ?? []).map((o) => {
          const on = arr.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() =>
                onChange(on ? arr.filter((x) => x !== o) : [...arr, o])
              }
              aria-pressed={on}
              className={`${chip} ${on ? chipOn : chipOff}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.fieldType === "BOOLEAN") {
    return (
      <div className="flex gap-1.5">
        {[
          { v: true, l: "是" },
          { v: false, l: "否" },
        ].map((opt) => {
          const on = value === opt.v;
          return (
            <button
              key={opt.l}
              type="button"
              onClick={() => onChange(on ? null : opt.v)}
              aria-pressed={on}
              className={`${chip} ${on ? chipOn : chipOff}`}
            >
              {opt.l}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.fieldType === "NUMBER") {
    return (
      <input
        type="number"
        step="any"
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
        className="w-44 rounded border border-border bg-canvas px-2.5 py-1.5 text-right text-[0.87rem] text-text outline-none focus:border-accent"
      />
    );
  }

  return (
    <input
      type="text"
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      className="w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[0.87rem] text-text outline-none focus:border-accent"
    />
  );
}
