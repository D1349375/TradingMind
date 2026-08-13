// 行為偵測預設(對應 prototype/index.html 的四個偵測開關)。
// 閾值都是使用者自己設的,系統不定義什麼叫「上頭」——見 design.md 討論。

export type DetectionKind =
  | "REVENGE_TRADING"
  | "TILT_OVERTRADING"
  | "LOSING_STREAK"
  | "OVERSIZED_RISK";

export type ThresholdField = {
  key: string;
  label: string;
  suffix?: string;
  min?: number;
  step?: number;
};

export type DetectionDef = {
  kind: DetectionKind;
  label: string;
  description: string; // 帶 {key} 佔位,UI 用 threshold 值替換
  defaultEnabled: boolean;
  defaultThreshold: Record<string, number>;
  fields: ThresholdField[];
};

export const DETECTION_DEFS: DetectionDef[] = [
  {
    kind: "REVENGE_TRADING",
    label: "復仇交易偵測",
    description: "虧損後 {windowMinutes} 分鐘內開倉超過平常 {sizeMultiplier} 倍倉位",
    defaultEnabled: true,
    defaultThreshold: { windowMinutes: 10, sizeMultiplier: 2 },
    fields: [
      { key: "windowMinutes", label: "分鐘內", min: 1, step: 1 },
      { key: "sizeMultiplier", label: "倍倉位", min: 1, step: 0.5 },
    ],
  },
  {
    kind: "TILT_OVERTRADING",
    label: "上頭偵測(過度交易)",
    description: "單日交易次數超過平均的 {multiplier} 倍",
    defaultEnabled: true,
    defaultThreshold: { multiplier: 2 },
    fields: [{ key: "multiplier", label: "倍", min: 1, step: 0.5 }],
  },
  {
    kind: "LOSING_STREAK",
    label: "連續虧損警示",
    description: "連續 {count} 筆虧損時提醒",
    defaultEnabled: false,
    defaultThreshold: { count: 3 },
    fields: [{ key: "count", label: "筆", min: 2, step: 1 }],
  },
  {
    kind: "OVERSIZED_RISK",
    label: "單筆風險超標",
    description: "單筆倉位超過帳戶 {percent}% 時標記",
    defaultEnabled: false,
    defaultThreshold: { percent: 5 },
    fields: [{ key: "percent", label: "%", min: 0.1, step: 0.5 }],
  },
];
