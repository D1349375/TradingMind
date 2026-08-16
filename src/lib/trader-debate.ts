import { loadPersonaContent, type PersonaKey } from "@/lib/personas";

// 單一人格交易分析。設計依據見
// `TradeMind_TraderDebate_單一人格分析Prompt設計.md`(2026-08-14 定案)。

export type TradeDataForAnalysis = {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: string;
  exitPrice: string | null;
  positionSize: string;
  leverage: string | null;
  fee: string;
  realizedPnl: string | null;
  rMultiple: string | null;
  grade: string | null;
  holdingDuration: string | null;
  reflectionNote: string | null;
  setup: { name: string; entryLogic: string | null } | null;
  disciplineChecks: { rule: string; checked: boolean }[];
  customFields: Record<string, unknown>;
};

const TASK_INSTRUCTIONS = `你是 TradeMind「單一人格交易分析」的 persona 執行者。這是「事後點評使用者已經
平倉的一筆交易」,不是預測市場方向,跟原始人格框架設計時的「每日大盤判斷」是
不同任務,但共用同一套心智模型。

嚴格依序執行:
1. 完全代入你的角色設定(見上方人格框架)
2. 閱讀下方 [交易資料],那是使用者唯一提供給你的事實依據
3. 用這個人格的心智模型/決策啟發式/口吻,點評這筆已經平倉的交易

判斷紀律(嚴格遵守,違反視為輸出失敗):
- 只能根據 [交易資料] 裡實際出現的欄位判斷。沒有提供的欄位(例如沒有截圖、沒有
  填反思筆記、沒有標記 Setup)不得假裝看到、不得編造內容去填補判斷所需的資訊。
- 如果人格框架裡某個心智模型需要的資訊類型(例如 K 線結構、成交量、多時間框架)
  在 [交易資料] 裡完全沒有對應,誠實承認判斷不到那個維度,列進 data_gaps,不要
  跳過或含糊帶過。
- alignment_score 反映「有多少心智模型/決策啟發式真的對得上這筆交易的實際數據」,
  不是看交易賺賠去反推分數——賺錢不代表符合框架,虧錢不代表違反框架。
- key_model_applied 必須具體點名框架裡的哪一條心智模型或決策啟發式(用它原本的
  名稱),不能講任何人格都通用的空話。
- signature_line 要維持這個人格的表達 DNA(語氣/用詞/口頭禪),但內容必須掛鉤
  這筆交易的實際數據,不能是可以套在任何交易上的通用金句。

欄位語意:
- alignment_score:0-100整數
- key_model_applied:短句,必須點名框架裡具體哪一條心智模型/決策啟發式
- what_worked:≤60字
- what_didnt:≤60字
- hypothetical:≤60字,如果是這個人格會怎麼做
- signature_line:≤40字,人格招牌語氣,適合截圖分享
- data_gaps:字串陣列,沒有缺口就是空陣列`;

// 輸出格式改用 Claude API 的 structured outputs(output_config.format)在
// API 層面強制 schema,不再只靠 prompt 拜託模型「輸出嚴格JSON」——實測過
// 純靠 prompt 約束,模型偶爾會吐出不符 schema 的欄位(型別錯或缺欄位),
// 失敗時 Credit 不會被扣(只有成功才扣款),但真實 API 費用已經花掉,使用者
// 重新產生一次就是雙倍真實成本。structured outputs 讓 API 直接保證回應
// 符合這個 schema,從源頭消除這個失敗模式,而不是失敗後才重試。
// JSON Schema 限制:不支援 minLength/maxLength 等字數限制(所以上面欄位
// 說明裡的「≤60字」只能留在 prompt 裡當提示,無法用 schema 強制)、不支援
// additionalProperties 設 false 以外的值、data_gaps 用「沒有缺口就是空
// 陣列」取代 null,是因為 nullable 欄位在 anyOf 底下實測偶爾還是會被跳過。
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    alignment_score: { type: "integer" },
    key_model_applied: { type: "string" },
    what_worked: { type: "string" },
    what_didnt: { type: "string" },
    hypothetical: { type: "string" },
    signature_line: { type: "string" },
    data_gaps: { type: "array", items: { type: "string" } },
  },
  required: [
    "alignment_score",
    "key_model_applied",
    "what_worked",
    "what_didnt",
    "hypothetical",
    "signature_line",
    "data_gaps",
  ],
  additionalProperties: false,
} as const;

export type AnalysisResult = {
  alignmentScore: number;
  keyModelApplied: string;
  whatWorked: string;
  whatDidnt: string;
  hypothetical: string;
  signatureLine: string;
  dataGaps: string[];
};

function parseAnalysisJson(text: string): AnalysisResult {
  // structured outputs 已經在 API 層保證欄位型別跟必填,這裡只是把 snake_case
  // 轉成 camelCase,不用再做一次型別檢查——如果 JSON.parse 本身失敗,代表
  // 遇到 max_tokens 截斷或 refusal 之類更上層的問題,讓例外往上拋。
  const raw = JSON.parse(text);
  return {
    alignmentScore: raw.alignment_score,
    keyModelApplied: raw.key_model_applied,
    whatWorked: raw.what_worked,
    whatDidnt: raw.what_didnt,
    hypothetical: raw.hypothetical,
    signatureLine: raw.signature_line,
    dataGaps: raw.data_gaps,
  };
}

export class TraderDebateNotConfiguredError extends Error {}

// 呼叫 Anthropic Messages API。人格框架 + 任務指令放 system(同一人格每次
// 呼叫都一樣,是 prompt caching 的目標),交易資料放 user message(每次都不同)。
// 見設計文件第五節的架構調整說明。
export async function runPersonaAnalysis(
  persona: PersonaKey,
  trade: TradeDataForAnalysis,
): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) {
    throw new TraderDebateNotConfiguredError(
      "TraderDebate 尚未設定(缺 ANTHROPIC_API_KEY 或 ANTHROPIC_MODEL 環境變數)",
    );
  }

  const personaContent = loadPersonaContent(persona);
  const system = [
    { type: "text" as const, text: personaContent, cache_control: { type: "ephemeral" as const } },
    { type: "text" as const, text: TASK_INSTRUCTIONS, cache_control: { type: "ephemeral" as const } },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      // Claude Sonnet 5 執行 adaptive thinking 預設開啟,thinking 沒明講時
      // max_tokens 是「思考+輸出文字」共用的硬上限——這裡是固定 schema 的
      // 短篇 JSON 輸出,不需要深度推理,實測過模型會把整個 700 token 額度
      // 全部花在 thinking 上,留 0 給實際輸出導致 502。明確關閉 thinking
      // 確保額度全部留給輸出文字。
      thinking: { type: "disabled" },
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system,
      messages: [
        {
          role: "user",
          content: `[交易資料]\n${JSON.stringify(trade, null, 2)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM API 呼叫失敗(${res.status}):${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("LLM 回應格式不符預期,找不到文字內容");
  }
  return parseAnalysisJson(text);
}
