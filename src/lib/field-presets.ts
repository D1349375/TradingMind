// 規劃書 §4.2「可選欄位」的欄位庫。
//
// 刻意不放進這個庫的欄位,以及原因:
//   盈虧比 R / 交易評分 / 反思筆記 / MFE / MAE / 止損 / 止盈
//     → 已經是 Trade 的真欄位,不需要走 EAV
//   策略 Setup
//     → Setup 是第一級實體(要掛假設登記做統計驗證),不是自訂欄位
//   截圖
//     → 需要檔案儲存,不是欄位型別能表達的
//
// key 一旦上線就不要改:欄位值是用 fieldId 關聯,但分析頁靠 key 認欄位
// (例如情緒 × 損益要找 key = "emotion")。

export type PresetFieldType =
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "BOOLEAN"
  | "NUMBER"
  | "TEXT";

export type PresetField = {
  key: string;
  label: string;
  fieldType: PresetFieldType;
  options?: string[];
  /** 分析頁會用到這個欄位,說明用途讓使用者知道啟用的價值 */
  poweredAnalysis?: string;
};

export const FIELD_PRESETS: PresetField[] = [
  {
    key: "emotion",
    label: "情緒狀態",
    fieldType: "SINGLE_SELECT",
    options: ["冷靜", "自信", "焦慮", "FOMO", "恐懼", "憤怒"],
    poweredAnalysis: "心態分析的「情緒 × 損益」",
  },
  {
    key: "session",
    label: "交易時區",
    fieldType: "SINGLE_SELECT",
    options: ["Asian Session", "London Session", "New York Session"],
    poweredAnalysis: "Setup 分析的「交易時段」維度",
  },
  {
    key: "timeframe",
    label: "做單週期",
    fieldType: "MULTI_SELECT",
    options: ["1M", "5M", "15M", "30M", "1H", "4H", "1D"],
    poweredAnalysis: "Setup 分析的「時間週期」維度",
  },
  {
    key: "tradeType",
    label: "交易類型",
    fieldType: "SINGLE_SELECT",
    options: ["Day Trading", "Swing", "Scalp"],
    poweredAnalysis: "Setup 分析的「交易類型」維度",
  },
  {
    key: "outcome",
    label: "盈虧結果",
    fieldType: "SINGLE_SELECT",
    options: ["止盈", "止損", "手動平倉", "爆倉"],
  },
  {
    key: "orderType",
    label: "開單類型",
    fieldType: "SINGLE_SELECT",
    options: ["市價", "限價", "止損單"],
  },
  {
    key: "discipline",
    label: "紀律遵守",
    fieldType: "BOOLEAN",
  },
  {
    key: "dayOpen",
    label: "Day Open",
    fieldType: "SINGLE_SELECT",
    options: ["開高", "開低", "平開"],
  },
  {
    key: "bias",
    label: "日內 Bias",
    fieldType: "SINGLE_SELECT",
    options: ["多", "空", "中性"],
  },
  {
    key: "fakeMove",
    label: "假動作",
    fieldType: "SINGLE_SELECT",
    options: ["有假動作", "無"],
  },
  {
    key: "account",
    label: "帳號",
    fieldType: "SINGLE_SELECT",
    options: ["實盤", "模擬", "Prop Firm"],
  },
  {
    key: "tags",
    label: "標籤",
    fieldType: "MULTI_SELECT",
    options: ["復仇交易", "超量", "FOMO", "追高", "凹單", "提早出場"],
  },
];

export const FIELD_TYPE_LABEL: Record<PresetFieldType, string> = {
  SINGLE_SELECT: "單選",
  MULTI_SELECT: "多選",
  BOOLEAN: "是/否",
  NUMBER: "數值",
  TEXT: "文字",
};

// 基礎欄位(規劃書 §4.2,API 自動填入不可刪除),設定頁只用來顯示
export const BASE_FIELDS = [
  "交易日期",
  "商品名稱",
  "交易方向",
  "入場價格",
  "出場價格",
  "倉位大小",
  "槓桿",
  "手續費",
  "已實現損益",
];
