"use client";

import { useEffect, useState } from "react";
import { DETECTION_DEFS, type DetectionKind } from "@/lib/behavior-presets";

type Setting = {
  kind: DetectionKind;
  enabled: boolean;
  threshold: Record<string, number>;
};

export function BehaviorDetection() {
  const [settings, setSettings] = useState<Setting[] | null>(null);
  const [savingKind, setSavingKind] = useState<DetectionKind | null>(null);

  useEffect(() => {
    fetch("/api/behavior-settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => setSettings([]));
  }, []);

  async function save(next: Setting) {
    setSettings((prev) =>
      (prev ?? []).map((s) => (s.kind === next.kind ? next : s)),
    );
    setSavingKind(next.kind);
    await fetch("/api/behavior-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSavingKind(null);
  }

  if (settings === null) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-8 text-center text-[0.85rem] text-text-secondary">
        讀取偵測設定…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded border border-border bg-surface px-5 py-5">
        <h3 className="mb-3 text-[0.84rem] font-semibold text-text-secondary">
          勾選要系統自動偵測哪些行為模式
        </h3>
        {DETECTION_DEFS.map((def, i) => {
          const s = settings.find((x) => x.kind === def.kind);
          if (!s) return null;
          return (
            <div
              key={def.kind}
              className={`flex items-center justify-between gap-4 py-2.5 ${
                i < DETECTION_DEFS.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div>
                <div className="text-[0.9rem]">{def.label}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[0.78rem] text-text-secondary">
                  {renderDescription(def, s.threshold, (key, value) =>
                    save({
                      ...s,
                      threshold: { ...s.threshold, [key]: value },
                    }),
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => save({ ...s, enabled: !s.enabled })}
                disabled={savingKind === def.kind}
                aria-pressed={s.enabled}
                aria-label={`${s.enabled ? "關閉" : "開啟"}${def.label}`}
                className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
                  s.enabled ? "border-accent bg-accent" : "border-border bg-canvas"
                }`}
              >
                <span
                  className={`absolute top-[1px] h-[16px] w-[16px] rounded-full bg-white shadow transition-all ${
                    s.enabled ? "left-[17px]" : "left-[1px]"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </section>

      <div className="rounded border border-dashed border-border bg-surface px-4 py-4">
        <div className="mb-1 text-[0.85rem] font-semibold text-text-secondary">
          偵測結果會出現在心態分析頁的「行為偵測」區塊
        </div>
        <p className="text-[0.8rem] text-text-secondary">
          閾值都是你自己設的,不是系統幫你定義什麼叫「上頭」。
        </p>
      </div>
    </div>
  );
}

function renderDescription(
  def: (typeof DETECTION_DEFS)[number],
  threshold: Record<string, number>,
  onChange: (key: string, value: number) => void,
) {
  const parts = def.description.split(/\{(\w+)\}/g);
  return parts.map((part, i) => {
    const field = def.fields.find((f) => f.key === part);
    if (i % 2 === 1 && field) {
      return (
        <input
          key={part}
          type="number"
          min={field.min}
          step={field.step ?? 1}
          value={threshold[field.key] ?? ""}
          onChange={(e) => onChange(field.key, Number(e.target.value))}
          className="w-14 rounded border border-border bg-canvas px-1.5 py-0.5 text-center text-[0.78rem] text-text outline-none focus:border-accent"
        />
      );
    }
    return <span key={i}>{part}</span>;
  });
}
