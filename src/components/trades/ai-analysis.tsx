"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PERSONAS = [
  { key: "ict", label: "ICT" },
  { key: "tjr", label: "TJR" },
  { key: "emperorbtc", label: "EmperorBTC" },
] as const;

const CREDIT_COST = 5;

type Result = {
  alignmentScore: number;
  keyModelApplied: string;
  whatWorked: string;
  whatDidnt: string;
  hypothetical: string;
  signatureLine: string;
  dataGaps: string[];
};

export function AiAnalysis({ tradeId }: { tradeId: string }) {
  const router = useRouter();
  const [persona, setPersona] = useState<(typeof PERSONAS)[number]["key"]>("ict");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    setResult(null);
    try {
      const res = await fetch(`/api/trades/${tradeId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 503) setNotConfigured(true);
        setError(data.error ?? "分析失敗");
        return;
      }
      setResult(data.result);
      // 扣款成功,側邊欄的Credit餘額要馬上反映——這個頁面本身沒有導覽,
      // 不主動refresh的話使用者要等下次點側邊欄連結才會看到新餘額。
      router.refresh();
    } catch {
      setError("網路錯誤,請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[0.82rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path d="M11 2L4 12h5l-1 6 7-10h-5l1-6z" />
          </svg>
          {loading ? "分析中…" : `分析(${CREDIT_COST} Credits)`}
        </button>
      </div>

      {error && !notConfigured && (
        <div role="alert" className="rounded border border-loss bg-loss-bg px-3 py-2.5 text-[0.82rem] text-loss">
          {error}
        </div>
      )}

      {notConfigured && (
        <div className="rounded border border-dashed border-border bg-canvas px-4 py-4">
          <div className="mb-1 text-[0.85rem] font-semibold text-text-secondary">
            AI 分析尚未開放
          </div>
          <p className="text-[0.8rem] leading-relaxed text-text-secondary">
            這個功能還沒有接上 AI 服務,還不會扣 Credit。等後台設定好之後就能直接使用。
          </p>
        </div>
      )}

      {!error && !result && !loading && (
        <p className="text-[0.82rem] leading-relaxed text-text-secondary">
          選一個人格,讓他用自己的框架點評這筆交易——不是看你賺賠打分,是看執行過程
          符不符合這個人格的心智模型。
        </p>
      )}

      {result && (
        <div className="space-y-3">
          <div className="rounded border border-accent bg-accent-soft px-4 py-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] font-semibold text-text-secondary">
              <span>吻合度</span>
              <span className="num text-[0.92rem] font-bold text-accent">{result.alignmentScore}</span>
            </div>
            <p className="text-[1rem] font-semibold leading-relaxed text-text">
              「{result.signatureLine}」
            </p>
            <p className="mt-1 text-[0.75rem] text-text-secondary">
              — {PERSONAS.find((p) => p.key === persona)?.label}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-border bg-surface px-3.5 py-3">
              <div className="mb-1 text-[0.75rem] font-semibold text-profit">做對的</div>
              <p className="text-[0.85rem] leading-relaxed">{result.whatWorked}</p>
            </div>
            <div className="rounded border border-border bg-surface px-3.5 py-3">
              <div className="mb-1 text-[0.75rem] font-semibold text-loss">沒做到的</div>
              <p className="text-[0.85rem] leading-relaxed">{result.whatDidnt}</p>
            </div>
          </div>

          <div className="rounded border border-border bg-surface px-3.5 py-3">
            <div className="mb-1 text-[0.75rem] font-semibold text-text-secondary">
              換成他會怎麼做
            </div>
            <p className="text-[0.85rem] leading-relaxed">{result.hypothetical}</p>
          </div>

          {result.dataGaps && result.dataGaps.length > 0 && (
            <div className="rounded border border-dashed border-border bg-canvas px-3.5 py-3">
              <div className="mb-1 text-[0.75rem] font-semibold text-text-secondary">
                這次判斷缺少的資訊
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-[0.78rem] text-text-secondary">
                {result.dataGaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
