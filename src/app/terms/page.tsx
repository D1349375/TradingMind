import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "服務條款 · TradeMind",
};

// 草稿(2026-08-15)——內容需使用者/法律審閱後才能視為定案,尤其第 5/9 節
// (退款政策、責任限制)牽涉台灣消保法與實際商業條件,不能只憑本頁文字上線。
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-14 text-text">
      <h1 className="mb-1 text-[1.6rem] font-semibold">服務條款</h1>
      <p className="mb-8 text-[0.82rem] text-text-tertiary">
        最後更新:2026 年 8 月 15 日(草稿版本,尚未正式生效)
      </p>

      <Section title="1. 服務說明">
        <p>
          TradeMind(以下稱「本服務」)是一個交易日誌記錄與分析平台,協助使用者記錄、整理並分析自己的交易紀錄。
        </p>
        <p>
          <strong>本服務不是交易所、不是證券期貨商、不是投資顧問事業,也不會、不能代使用者下單、轉帳或提領任何資金或資產。</strong>
          本服務僅以唯讀方式讀取使用者授權的交易紀錄,或由使用者自行以 CSV 匯入、手動輸入交易資料。
        </p>
      </Section>

      <Section title="2. 帳號註冊與使用資格">
        <p>使用本服務須註冊帳號(Email 或 Google 登入)。你必須年滿 18 歲或所在地區法定成年年齡,並提供真實有效的資訊。你有責任保管好自己的帳號密碼,任何透過你帳號進行的操作視為你本人所為。</p>
      </Section>

      <Section title="3. 交易所連線與資料存取">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>連接交易所(如 Bybit)時,你提供的 API 金鑰僅限「唯讀」權限。本服務會在儲存前向交易所驗證金鑰權限,帶有交易或提領權限的金鑰會被拒絕儲存。</li>
          <li>API 金鑰以 AES-256-GCM 加密後儲存,明文不落地。</li>
          <li>本服務僅讀取交易紀錄用於顯示與分析,不會、也沒有能力用你的 API 金鑰下單、修改倉位或轉移資金。</li>
          <li>你可以隨時在「設定」頁面移除交易所連線,或直接在交易所後台刪除該組 API 金鑰。</li>
        </ul>
      </Section>

      <Section title="4. AI 分析功能的重要聲明">
        <p>
          本服務可能提供 AI 輔助分析功能(例如 TraderDebate 交易點評、AI 週期報告)。這些功能：
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>不構成投資建議、不是市場預測、不是買賣訊號</strong>,僅針對你自己已完成(已平倉)的歷史交易,分析執行過程是否符合你自訂的交易框架或紀律規則。</li>
          <li>由第三方 AI 服務(Anthropic Claude API)產生,可能包含錯誤或不準確之處,不保證分析結果的正確性或完整性。</li>
          <li>你的交易資料在呼叫 AI 分析功能時,會傳送給第三方 AI 服務供應商處理,詳見隱私權政策。</li>
        </ul>
        <p>本服務不對任何依據 AI 分析內容所做的交易決策或其後果負責。</p>
      </Section>

      <Section title="5. 付費方案與退款政策">
        <p>
          本服務提供 Credit 點數儲值包與(未來將提供的)訂閱方案,透過綠界科技(ECPay)處理金流。Credit 用於兌換 AI 分析等加值功能之使用額度。
        </p>
        <p className="text-text-tertiary">
          [待補:具體退款條件、猶豫期是否適用、已消耗 Credit 是否可退——這段需要你確認實際商業條件與是否諮詢法律意見後填入,本草稿刻意不自行認定。]
        </p>
      </Section>

      <Section title="6. 使用者內容">
        <p>你在本服務中建立的反思筆記、標籤、截圖等內容,著作權歸你所有。你授權本服務為了提供服務本身(顯示、儲存、備份)之目的使用這些內容,本服務不會將你的個人交易內容用於行銷或提供給第三方,除非取得你的同意或法律另有規定。</p>
      </Section>

      <Section title="7. 禁止行為">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>不得以任何方式嘗試繞過安全機制、竄改他人資料或未經授權存取他人帳號。</li>
          <li>不得利用本服務從事洗錢、詐欺或其他違法行為。</li>
          <li>不得對本服務進行逆向工程、大量自動化爬取或影響服務穩定性的行為。</li>
        </ul>
      </Section>

      <Section title="8. 帳號終止與資料刪除">
        <p>你可以隨時在「設定 → 帳戶」頁面永久刪除自己的帳號,此操作會同時刪除你的交易紀錄、反思筆記、截圖、Setup、Playbook、紀律規則與交易所連線設定,且無法復原。若你違反本條款,本服務保留暫停或終止你帳號的權利。</p>
      </Section>

      <Section title="9. 責任限制與免責聲明">
        <p className="text-text-tertiary">
          [待補:標準責任限制條款——本服務「現況」提供、不保證不中斷或無錯誤、賠償上限等,這段建議諮詢法律意見後定案,不宜直接套用通用範本。]
        </p>
      </Section>

      <Section title="10. 服務變更與條款修改">
        <p>本服務保留隨時修改、暫停或終止部分或全部功能的權利。條款如有重大修改,將以站內通知或 Email 告知,你於修改後繼續使用本服務即視為同意新條款。</p>
      </Section>

      <Section title="11. 準據法與管轄">
        <p>本條款以中華民國法律為準據法。因本服務所生之爭議,雙方同意以台灣台北地方法院為第一審管轄法院。</p>
      </Section>

      <Section title="12. 聯絡我們">
        <p className="text-text-tertiary">[待補:客服/聯絡 Email]</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2.5 text-[1.02rem] font-semibold">{title}</h2>
      <div className="space-y-2.5 text-[0.9rem] leading-relaxed text-text-secondary">{children}</div>
    </section>
  );
}
