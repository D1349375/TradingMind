import { loadPersonaContent, type PersonaKey } from "@/lib/personas";
import type { PeriodStatsForLLM } from "@/lib/period-stats";

// AI 週報/月報。設計依據見
// `TradeMind_AI週報月報_設計文件.md`(六之二節是實測+反饋後定案的輸出
// schema)。跟 TraderDebate(lib/trader-debate.ts,點評單筆交易)共用同一套
// 「不能用損益倒推紀律好壞」「不能講空話,要點名具體心智模型」紀律,但任務
// 換成「回顧一段期間的整體交易行為,且必須跟上一期比較才有意義」。

const TASK_INSTRUCTIONS = `你是 TradeMind「週期回顧」的 persona 執行者。這是回顧使用者過去一段期間
(週/月)的整體交易行為,不是評論單一一筆交易。

嚴格依序執行:
1. 完全代入你的角色設定(見上方人格框架)
2. 閱讀下方 [期間統計],這是程式已經算好的事實,不要自己重新計算、質疑或
   推翻這些數字
3. 用這個人格的心智模型/決策啟發式/口吻,寫一段這段期間的回顧

判斷紀律(嚴格遵守,違反視為輸出失敗):
- [期間統計] 裡的 trend 欄位已經是程式算好的趨勢判斷(比較這期跟上一期),
  輸出時直接引用同一個值,不要自己重新判斷或給出矛盾的說法。trend 是
  "NO_PRIOR_DATA" 時,代表這是第一次追蹤到的期間,誠實說明沒有上一期可以
  比較,不要假裝有變好或變差。
- 不能用這期損益的正負去反推紀律好壞——賺錢的期間可能紀律很差(運氣好),
  虧錢的期間可能紀律其實在進步(只是還沒反映到損益)。
- narrative 不能只挑好的講——如果這期紀律變差、回撤變大、behaviorAlerts
  裡有偵測到異常,必須誠實點出來,人格點評的可信度建立在「連缺點都敢講」。
  behaviorAlerts 裡 available 為 false 的項目代表這次算不出來(不是沒有
  異常),要跟「available 為 true 但 count 為 0」(真的沒異常)分開講清楚。
- key_model_applied 必須具體點名框架裡的哪一條心智模型或決策啟發式(用它
  原本的名稱),不能講任何人格都通用的空話。
- next_action 必須是根據 [期間統計] 裡實際數字導出的具體行動,不能是「繼續
  保持紀律」這種放諸四海皆準的空話。
- 只能根據 [期間統計] 裡實際出現的欄位判斷。topSetups 是空陣列時代表這期
  沒有已標記 Setup 的交易,誠實反映、列進 data_gaps,不要編造。
- signature_line 要維持這個人格的表達 DNA(語氣/用詞/口頭禪),但內容必須
  掛鉤這期的實際數據,不能是可以套在任何期間上的通用金句。

輸出必須是嚴格 JSON(無其他文字、無 code fence、不要有任何前言或解釋),欄位:
{
  "period_summary": "純數字摘要,不帶評價,≤80字",
  "trend": "直接引用 [期間統計] 裡的 trend 值",
  "key_model_applied": "短句,必須點名框架裡具體哪一條心智模型/決策啟發式",
  "narrative": "150-250字的完整教練筆記,把數字/紀律/行為警訊/Setup表現串成一段連貫的敘事,不是短句拼接,好壞都要誠實講",
  "next_action": "根據這期數據導出的具體行動,不能是空話",
  "signature_line": "≤40字,人格招牌語氣,適合截圖分享",
  "data_gaps": ["..."] 或 null
}`;

export type PeriodReportResult = {
  periodSummary: string;
  trend: string;
  keyModelApplied: string;
  narrative: string;
  nextAction: string;
  signatureLine: string;
  dataGaps: string[] | null;
};

function parsePeriodReportJson(text: string): PeriodReportResult {
  // 模型偶爾還是會不聽話包 code fence,做最基本的容錯拆除,不做更多寬容——
  // 格式不對就是不對,讓呼叫端知道要重試,而不是硬猜一個殘缺結果。
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
  const raw = JSON.parse(cleaned);

  if (
    typeof raw.period_summary !== "string" ||
    typeof raw.trend !== "string" ||
    typeof raw.key_model_applied !== "string" ||
    typeof raw.narrative !== "string" ||
    typeof raw.next_action !== "string" ||
    typeof raw.signature_line !== "string" ||
    (raw.data_gaps !== null && !Array.isArray(raw.data_gaps))
  ) {
    throw new Error("回應缺少必要欄位或型別不符");
  }

  return {
    periodSummary: raw.period_summary,
    trend: raw.trend,
    keyModelApplied: raw.key_model_applied,
    narrative: raw.narrative,
    nextAction: raw.next_action,
    signatureLine: raw.signature_line,
    dataGaps: raw.data_gaps,
  };
}

export class PeriodReportNotConfiguredError extends Error {}

// 呼叫 Anthropic Messages API。人格框架 + 任務指令放 system(同一人格每次
// 呼叫都一樣,是 prompt caching 的目標),期間統計放 user message(每次都
// 不同)。跟 lib/trader-debate.ts 的 runPersonaAnalysis 完全同一套結構。
export async function runPeriodReport(
  persona: PersonaKey,
  stats: PeriodStatsForLLM,
): Promise<PeriodReportResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) {
    throw new PeriodReportNotConfiguredError(
      "AI 週報/月報尚未設定(缺 ANTHROPIC_API_KEY 或 ANTHROPIC_MODEL 環境變數)",
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
      // 900 實測不夠——narrative 欄位就要求150-250字,中文字在這個
      // tokenizer 下不是 1 字 1 token,加上其他欄位跟 JSON 語法開銷,
      // 900 上限真的會在輸出寫到一半被截斷(JSON.parse 直接噴
      // "Unexpected end of JSON input")。拉高到 2000 留足夠餘裕,
      // 費用差距可忽略(只按實際輸出token數計費,不是上限本身)。
      max_tokens: 2000,
      // 同 lib/trader-debate.ts 的說明:Claude Sonnet 5 預設開啟 adaptive
      // thinking,會跟固定 max_tokens 搶額度,實測過真的把整個上限花在
      // thinking 上導致輸出文字被截斷成空字串。這裡是固定 schema 短篇
      // 輸出,不需要深度推理,明確關閉 thinking。
      thinking: { type: "disabled" },
      system,
      messages: [
        {
          role: "user",
          content: `[期間統計]\n${JSON.stringify(stats, null, 2)}`,
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
  return parsePeriodReportJson(text);
}
