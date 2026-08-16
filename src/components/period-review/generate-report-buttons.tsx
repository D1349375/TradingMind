"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 「本週/本月至今」的起訖時間在瀏覽器端算(用使用者的本地時區),伺服器只
// 照給定的起訖時間查詢,不用猜測時區——理由同 Dashboard 日曆卡/CSV 匯入
// 的時區處理慣例。週從週一算起。
function getWeekStart(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0=週日 1=週一 ... 6=週六
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}
function getMonthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const PERSONAS = [
  { key: "ict", label: "ICT" },
  { key: "tjr", label: "TJR" },
  { key: "emperorbtc", label: "EmperorBTC" },
] as const;

const COST = { WEEK: 8, MONTH: 20 } as const;

export function GenerateReportButtons() {
  const router = useRouter();
  const [persona, setPersona] = useState<(typeof PERSONAS)[number]["key"]>("ict");
  const [loading, setLoading] = useState<"WEEK" | "MONTH" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  async function generate(periodType: "WEEK" | "MONTH") {
    setLoading(periodType);
    setError(null);
    setNotConfigured(false);

    const now = new Date();
    const periodStart = periodType === "WEEK" ? getWeekStart(now) : getMonthStart(now);
    const utcOffsetMinutes = -now.getTimezoneOffset();

    try {
      const res = await fetch("/api/period-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodType,
          periodStart: periodStart.toISOString(),
          periodEnd: now.toISOString(),
          utcOffsetMinutes,
          persona,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 503) setNotConfigured(true);
        setError(
          res.status === 402
            ? `Credit 餘額不足(需要 ${data.required},目前 ${data.balance})`
            : (data.error ?? "生成失敗"),
        );
        return;
      }
      router.push(`/period-review/${data.reportId}`);
    } catch {
      setError("網路錯誤,請稍後再試");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mb-5 rounded border border-border bg-surface px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[0.8rem] font-semibold text-text-secondary">人格</span>
        {PERSONAS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPersona(p.key)}
            aria-pressed={persona === p.key}
            className={`rounded-full border px-3 py-1.5 text-[0.82rem] ${
              persona === p.key
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-border bg-canvas text-text-secondary hover:border-accent hover:text-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => generate("WEEK")}
          disabled={loading !== null}
          className="rounded bg-accent px-3 py-1.5 text-[0.82rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading === "WEEK" ? "生成中…" : `產生本週報告(${COST.WEEK} Credits)`}
        </button>
        <button
          type="button"
          onClick={() => generate("MONTH")}
          disabled={loading !== null}
          className="rounded border border-border bg-surface px-3 py-1.5 text-[0.82rem] font-semibold text-text hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {loading === "MONTH" ? "生成中…" : `產生本月報告(${COST.MONTH} Credits)`}
        </button>
      </div>

      {error && !notConfigured && (
        <div role="alert" className="mt-3 rounded border border-loss bg-loss-bg px-3 py-2.5 text-[0.82rem] text-loss">
          {error}
        </div>
      )}

      {notConfigured && (
        <div className="mt-3 rounded border border-dashed border-border bg-canvas px-4 py-4">
          <div className="mb-1 text-[0.85rem] font-semibold text-text-secondary">
            AI 週報/月報尚未開放
          </div>
          <p className="text-[0.8rem] leading-relaxed text-text-secondary">
            這個功能還沒有接上 AI 服務,還不會扣 Credit。等後台設定好之後就能直接使用。
          </p>
        </div>
      )}
    </div>
  );
}
