"use client";

import { forwardRef, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { PeriodReportResult } from "@/lib/period-report";
import type { PeriodStatsSnapshot } from "@/lib/period-stats";
import { TraderScoreStamp } from "./trader-score";

// 分享圖卡(對照 Startup Guide app 的分享圖卡功能,mobile/components/
// ShareCardFrame.tsx 用 react-native-view-shot 截圖固定尺寸的 View;網頁版
// 沒有原生截圖 API,改用 html-to-image 在瀏覽器端把一個固定尺寸的 DOM
// 節點轉成 PNG,概念完全一樣,不需要伺服器端 Puppeteer 之類的重依賴)。
//
// 固定欄位(persona/期間/AI金句/趨勢/分數蓋章/品牌頁尾)之外,使用者可以
// 自己挑數字欄位要不要放進圖卡,但上限 4 個——圖卡尺寸有限,選太多會擠爆
// 版面,這是刻意的產品限制不是技術限制。

const CARD_W = 360;
const CARD_H = 640;
const MAX_SELECTED = 4;

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;

const TREND_LABEL: Record<string, string> = {
  IMPROVING: "進步中",
  STABLE: "持平",
  DECLINING: "下滑",
  NO_PRIOR_DATA: "尚無對照期間",
};

type StatField = { key: string; label: string; value: string };

function buildSelectableFields(stats: PeriodStatsSnapshot): StatField[] {
  const c = stats.current;
  const fields: StatField[] = [{ key: "totalPnl", label: "總損益", value: `${signed(c.totalPnl)}U` }];
  if (c.winRate !== null) fields.push({ key: "winRate", label: "勝率", value: `${fmt(c.winRate, 1)}%` });
  if (c.profitFactor !== null) fields.push({ key: "profitFactor", label: "獲利因子", value: fmt(c.profitFactor) });
  if (c.avgR !== null) fields.push({ key: "avgR", label: "平均 R", value: `${fmt(c.avgR)}R` });
  fields.push({ key: "maxDrawdown", label: "最大回撤", value: `${fmt(c.maxDrawdown)}U` });
  fields.push({ key: "tradeCount", label: "交易筆數", value: String(c.tradeCount) });
  if (c.disciplineMarked > 0 && c.disciplineRate !== null) {
    fields.push({ key: "disciplineRate", label: "紀律遵守率", value: `${fmt(c.disciplineRate, 1)}%` });
  }
  if (stats.topSetups.length > 0) {
    const best = stats.topSetups[0];
    fields.push({ key: "bestSetup", label: "最佳 Setup", value: `${best.name} ${signed(best.pnl)}U` });
  }
  return fields;
}

type FaceProps = {
  periodType: "WEEK" | "MONTH";
  periodStartLabel: string;
  periodEndLabel: string;
  personaLabel: string;
  result: PeriodReportResult;
  stats: PeriodStatsSnapshot;
  fields: StatField[];
};

// 固定用淺色配色,不吃 CSS variables/深色模式——分享出去的圖不該因分享者
// 當下的主題設定而變,理由跟 globals.css 的 @media print 區塊一致。
const CARD_COLORS = {
  paper: "#fdfcfa",
  ink: "#37352f",
  inkSecondary: "#5c5a54",
  inkTertiary: "#83807a",
  accent: "#2f6fed",
  border: "#e4e1d8",
};

const ShareCardFace = forwardRef<HTMLDivElement, FaceProps>(function ShareCardFace(
  { periodType, periodStartLabel, periodEndLabel, personaLabel, result, stats, fields },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        width: CARD_W,
        height: CARD_H,
        background: CARD_COLORS.paper,
        color: CARD_COLORS.ink,
        padding: 28,
        display: "flex",
        flexDirection: "column",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 1.5, color: CARD_COLORS.accent, fontWeight: 700 }}>
            {personaLabel} · {periodType === "WEEK" ? "週報" : "月報"}
          </div>
          <div style={{ fontSize: 12, color: CARD_COLORS.inkTertiary, marginTop: 3 }}>
            {periodStartLabel} – {periodEndLabel}
          </div>
        </div>
        {stats.traderScore.overall !== null && <TraderScoreStamp score={stats.traderScore.overall} size={68} />}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
        <div style={{ fontSize: 21, lineHeight: 1.5, fontWeight: 600 }}>
          「{result.signatureLine}」
        </div>
        <div style={{ fontSize: 13, color: CARD_COLORS.inkSecondary }}>— {personaLabel}</div>
        <div
          style={{
            marginTop: 4,
            alignSelf: "flex-start",
            fontSize: 11,
            fontWeight: 700,
            color: CARD_COLORS.accent,
            border: `1px solid ${CARD_COLORS.accent}`,
            borderRadius: 999,
            padding: "3px 10px",
          }}
        >
          趨勢 · {TREND_LABEL[result.trend] ?? result.trend}
        </div>
      </div>

      {fields.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {fields.map((f) => (
            <div
              key={f.key}
              style={{
                border: `1px solid ${CARD_COLORS.border}`,
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              <div style={{ fontSize: 10.5, color: CARD_COLORS.inkTertiary }}>{f.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          borderTop: `1px solid ${CARD_COLORS.border}`,
          paddingTop: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>TradeMind</div>
        <div style={{ fontSize: 10.5, color: CARD_COLORS.inkTertiary }}>AI 週期回顧</div>
      </div>
    </div>
  );
});

export function ShareCardPanel(props: {
  periodType: "WEEK" | "MONTH";
  periodStartLabel: string;
  periodEndLabel: string;
  personaLabel: string;
  result: PeriodReportResult;
  stats: PeriodStatsSnapshot;
}) {
  const { periodStartLabel, periodType, stats } = props;
  const fields = useMemo(() => buildSelectableFields(stats), [stats]);
  const [selected, setSelected] = useState<string[]>(() => fields.slice(0, 2).map((f) => f.key));
  const cardRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, key];
    });
  }

  const selectedFields = fields.filter((f) => selected.includes(f.key));

  async function generate() {
    if (!cardRef.current) return;
    setGenerating(true);
    setError(null);
    try {
      // pixelRatio:2 讓輸出解析度夠社群平台使用。skipFonts:卡片只用系統
      // 字型堆疊,不需要 html-to-image 內部等 document.fonts.ready 再嵌
      // 字型。逾時保護:toPng() 極少數情況下可能卡住不回應(字型/圖片
      // decode 相關的已知問題),8 秒沒回應就當失敗處理,不讓使用者卡在
      // 「產生中」的按鈕前不知道要不要繼續等。
      const dataUrl = await Promise.race([
        toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, skipFonts: true }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("圖片產生逾時")), 8000)),
      ]);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `TradeMind_分享圖卡_${periodType === "WEEK" ? "週報" : "月報"}_${periodStartLabel.replace(/\//g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setError("圖片產生失敗,請稍後再試。");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded border border-border bg-surface px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.82rem] font-semibold text-text-secondary">分享圖卡</h3>
        <span className="text-[0.72rem] text-text-tertiary">
          數字欄位最多選 {MAX_SELECTED} 個({selected.length}/{MAX_SELECTED})
        </span>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-1 flex-wrap content-start gap-1.5" style={{ minWidth: 200 }}>
          {fields.map((f) => {
            const checked = selected.includes(f.key);
            const disabled = !checked && selected.length >= MAX_SELECTED;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggle(f.key)}
                disabled={disabled}
                aria-pressed={checked}
                className={`rounded-full border px-2.5 py-1 text-[0.74rem] ${
                  checked
                    ? "border-accent bg-accent-soft font-semibold text-accent"
                    : "border-border bg-canvas text-text-secondary"
                } ${disabled ? "opacity-40" : "hover:text-text"}`}
              >
                {f.label}
              </button>
            );
          })}
          <p className="mt-1 w-full text-[0.72rem] text-text-tertiary">
            人格金句/期間/趨勢/綜合評分是固定欄位,一定會出現在圖卡上。
          </p>
        </div>
        <div
          className="shrink-0 overflow-hidden rounded border border-border"
          style={{ width: CARD_W / 2, height: CARD_H / 2 }}
        >
          {/* 純預覽用,縮小顯示,不接 ref——避免截圖目標節點本身被 CSS
              transform 縮放過(見下方離屏節點的說明)。 */}
          <div style={{ width: CARD_W, height: CARD_H, transform: "scale(0.5)", transformOrigin: "top left" }}>
            <ShareCardFace {...props} fields={selectedFields} />
          </div>
        </div>
      </div>
      {/* 實際截圖目標,原始尺寸、零 transform。用 opacity:0 藏起來而不是
          位移到螢幕外——部分瀏覽器對距離視窗很遠的離屏節點會跳過繪製
          (viewport culling),html-to-image 讀不到正確內容就會卡住,
          opacity:0 仍在正常視窗範圍內、仍會被繪製,只是看不見。 */}
      <div style={{ position: "absolute", top: 0, left: 0, opacity: 0, pointerEvents: "none", zIndex: -1 }}>
        <ShareCardFace ref={cardRef} {...props} fields={selectedFields} />
      </div>
      <button
        type="button"
        onClick={generate}
        disabled={generating}
        className="mt-3 w-full rounded border border-border bg-surface px-3 py-1.5 text-[0.8rem] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {generating ? "產生中…" : "下載分享圖卡"}
      </button>
      {error && <p className="mt-1.5 text-[0.76rem] text-loss">{error}</p>}
    </div>
  );
}
