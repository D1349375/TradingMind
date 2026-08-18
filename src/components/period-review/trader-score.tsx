import type { TraderScore } from "@/lib/stats";
import { HelpTooltip } from "@/components/ui/help-tooltip";

// 綜合評分的呈現。公式本身在 lib/stats.ts 的 computeTraderScore,這裡只管
// 顯示——完整卡片版(頁面內文用,列出四個子分數)跟蓋章版(分享圖卡用,
// 只有一個圓形數字)共用同一份說明文字,避免兩處各寫一次容易對不上。

const SCORE_EXPLANATION =
  "四個子分數(獲利能力35%/風險控管25%/一致性20%/紀律20%)依權重加權平均。獲利能力看獲利因子,風險控管優先用Sharpe(樣本不足時退回回撤/毛利比),一致性看最大單筆獲利占毛利的集中度,紀律沿用紀律遵守率。任何子分數算不出來時不會拿假設值頂替,只用算得出來的子項重新歸一化計算。已平倉且有輸贏結果的交易少於10筆時不評分。";

function scoreTone(score: number): "profit" | "warning" | "loss" {
  if (score >= 70) return "profit";
  if (score >= 40) return "warning";
  return "loss";
}

const TONE_CLASS: Record<"profit" | "warning" | "loss", string> = {
  profit: "text-profit border-profit",
  warning: "text-warning border-warning",
  loss: "text-loss border-loss",
};

export function TraderScoreCard({ score }: { score: TraderScore }) {
  if (score.overall === null) {
    return (
      <div className="rounded border border-dashed border-border bg-canvas px-4 py-4 text-center">
        <p className="text-[0.82rem] text-text-secondary">{score.unavailableReason}</p>
      </div>
    );
  }
  const tone = scoreTone(score.overall);
  const rows: { label: string; comp: TraderScore["profitability"] }[] = [
    { label: "獲利能力", comp: score.profitability },
    { label: "風險控管", comp: score.riskControl },
    { label: "一致性", comp: score.consistency },
    { label: "紀律", comp: score.discipline },
  ];
  return (
    <div>
      <div className="flex items-center gap-4">
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 text-[1.5rem] font-bold ${TONE_CLASS[tone]}`}
        >
          {score.overall}
        </div>
        <div className="flex-1 space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 text-[0.78rem]">
              <span className="w-14 shrink-0 text-text-secondary">{r.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                {r.comp.score !== null && (
                  <div
                    className={`h-full rounded-full ${
                      scoreTone(r.comp.score) === "profit"
                        ? "bg-profit"
                        : scoreTone(r.comp.score) === "warning"
                          ? "bg-warning"
                          : "bg-loss"
                    }`}
                    style={{ width: `${r.comp.score}%` }}
                  />
                )}
              </div>
              <span className="num w-8 shrink-0 text-right text-text-secondary">
                {r.comp.score === null ? "—" : r.comp.score}
              </span>
            </div>
          ))}
        </div>
      </div>
      {score.sampleCaveat && (
        <p className="mt-2.5 text-[0.72rem] text-text-tertiary">{score.sampleCaveat}</p>
      )}
    </div>
  );
}

export function TraderScoreHelp() {
  return <HelpTooltip>{SCORE_EXPLANATION}</HelpTooltip>;
}

// 分享圖卡用的「蓋章」版本——圓形徽章、輕微旋轉,視覺上像蓋章而不是頁面裡的
// 一般數據卡片。分數不可用時直接不渲染(呼叫端負責判斷),不在分享圖卡上
// 放一個「—」的空章,沒有意義。
export function TraderScoreStamp({ score, size = 84 }: { score: number; size?: number }) {
  const tone = scoreTone(score);
  // 固定用淺色主題的色票(不吃 CSS variables)——這個徽章會被 html-to-image
  // 截圖進分享圖卡,分享出去的圖不該因為使用者當下是深色模式而跟著變色。
  const borderColor =
    tone === "profit" ? "#0f7a56" : tone === "warning" ? "#96640d" : "#b83c30";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        border: `3px solid ${borderColor}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transform: "rotate(-6deg)",
        background: "rgba(255,255,255,0.65)",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: size * 0.34, fontWeight: 700, color: borderColor, lineHeight: 1 }}>
        {score}
      </span>
      <span style={{ fontSize: size * 0.12, color: borderColor, letterSpacing: 1, marginTop: 2 }}>
        SCORE
      </span>
    </div>
  );
}
