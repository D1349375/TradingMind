"use client";

import { useState } from "react";
import { toPng } from "html-to-image";
import type { PeriodReportResult } from "@/lib/period-report";
import type { PeriodStatsSnapshot } from "@/lib/period-stats";
import { ShareCardPanel } from "./share-card";

// PDF 用瀏覽器原生列印(globals.css 的 @media print 已經處理好隱藏側邊欄/
// 強制淺色配色),Word 走伺服器端 docx 產生後下載,「完整報告圖片」用
// html-to-image 在瀏覽器端把整個報告容器截成一張長圖,「分享圖卡」則是
// 精選重點的截圖(見 share-card.tsx)——四條匯出路徑技術上都不同,但對
// 使用者來說都是「把這份報告帶走」。
export function ExportButtons(props: {
  reportId: string;
  periodType: "WEEK" | "MONTH";
  periodStartLabel: string;
  periodEndLabel: string;
  personaLabel: string;
  result: PeriodReportResult;
  stats: PeriodStatsSnapshot;
}) {
  const { reportId, periodType, periodStartLabel } = props;
  const [downloading, setDownloading] = useState(false);
  const [capturingFull, setCapturingFull] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadDocx() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/period-reports/${reportId}/export`);
      if (!res.ok) {
        setError("匯出失敗,請稍後再試。");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const filename = match ? decodeURIComponent(match[1]) : "period-report.docx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("網路錯誤,請稍後再試。");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadFullReportImage() {
    const node = document.getElementById("period-report-root");
    if (!node) return;
    setCapturingFull(true);
    setError(null);
    try {
      // 完整報告長圖是備份用的完整截圖,不像分享圖卡需要固定尺寸——直接
      // 用容器實際渲染高度即可,不用另外指定 width/height。
      // skipFonts:同 share-card.tsx 的說明——避免 html-to-image 等待
      // document.fonts.ready 卡住不回應,頁面本來就只用系統字型堆疊。
      // 逾時保護同理:報告內容比分享圖卡大很多(含長條圖/多張表格),
      // 給 20 秒,超過就當失敗處理。
      const dataUrl = await Promise.race([
        toPng(node, { pixelRatio: 2, backgroundColor: "#fdfcfa", cacheBust: true, skipFonts: true }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("圖片產生逾時")), 20000)),
      ]);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `TradeMind_${periodType === "WEEK" ? "週報" : "月報"}_完整報告_${periodStartLabel.replace(/\//g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setError("圖片產生失敗,請稍後再試。");
    } finally {
      setCapturingFull(false);
    }
  }

  return (
    <div className="no-print">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-border bg-surface px-3 py-1.5 text-[0.8rem] text-text-secondary hover:border-accent hover:text-accent"
        >
          列印 / 匯出 PDF
        </button>
        <button
          type="button"
          onClick={downloadDocx}
          disabled={downloading}
          className="rounded border border-border bg-surface px-3 py-1.5 text-[0.8rem] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {downloading ? "產生中…" : "下載 Word"}
        </button>
        <button
          type="button"
          onClick={downloadFullReportImage}
          disabled={capturingFull}
          className="rounded border border-border bg-surface px-3 py-1.5 text-[0.8rem] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {capturingFull ? "截圖中…" : "完整報告圖片"}
        </button>
        <button
          type="button"
          onClick={() => setShareOpen((v) => !v)}
          aria-pressed={shareOpen}
          className={`rounded border px-3 py-1.5 text-[0.8rem] ${
            shareOpen
              ? "border-accent bg-accent-soft font-semibold text-accent"
              : "border-border bg-surface text-text-secondary hover:border-accent hover:text-accent"
          }`}
        >
          分享圖卡
        </button>
      </div>
      {error && <p className="mt-1.5 text-right text-[0.76rem] text-loss">{error}</p>}
      {shareOpen && (
        <div className="mt-3 w-[420px] max-w-full">
          <ShareCardPanel
            periodType={props.periodType}
            periodStartLabel={props.periodStartLabel}
            periodEndLabel={props.periodEndLabel}
            personaLabel={props.personaLabel}
            result={props.result}
            stats={props.stats}
          />
        </div>
      )}
    </div>
  );
}
