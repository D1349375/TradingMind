import type { Metadata } from "next";
import { BackButton } from "@/components/back-button";

export const metadata: Metadata = {
  title: "服務條款 · TradeMind",
};

// 草稿(2026-08-15)——第 5/9/12 節內容已依使用者確認的商業條件補齊,
// 但整份條款仍建議正式上線前諮詢法律意見過目一次,不能只憑本頁文字上線。
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-14 text-text">
      <BackButton />
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
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Credit 儲值包完成付款後 <strong>7 日內</strong>,若該筆訂單購買的 Credit
            <strong>完全未使用</strong>(未曾用於 AI 分析等任何加值功能),你可以透過下方聯絡方式申請全額退款。
          </li>
          <li>
            超過 7 日,或該筆訂單購買的 Credit 已有任一部分被使用,即視為服務已提供完成,不接受退款。你帳號內的 Credit
            餘額若混合多筆訂單,退款申請以「先進先出」認定該筆訂單的 Credit 是否已被消耗。
          </li>
          <li>
            未來推出的訂閱方案,扣款週期與取消規則屆時另行公告,取消訂閱僅停止下一期扣款,當期已付費用不予退還。
          </li>
          <li>
            若因本服務端可歸責之重大事由(例如系統錯誤導致重複扣款、功能長期無法使用)致你無法正常使用已購買的 Credit,不受上述期限限制,請透過下方聯絡方式與我們聯繫處理。
          </li>
        </ul>
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
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            本服務依「現況」（as is）與「現有」（as available）狀態提供,不保證服務不中斷、無錯誤、完全安全,或符合你的特定需求。
          </li>
          <li>
            在法律允許的最大範圍內,本服務對於間接、附帶、特殊或衍生性損害(包括但不限於交易決策損失、資料遺失、營業中斷)不負賠償責任,不論該責任基礎為契約、侵權行為或其他。
          </li>
          <li>
            若本服務就特定事由仍須負賠償責任,累計賠償總額以你於求償事由發生前 <strong>12 個月內</strong>
            實際支付予本服務之金額為上限;若你尚未有任何付費紀錄,則以新臺幣 1,000 元為上限。
          </li>
          <li>
            本條款不排除或限制依消費者保護法或其他強制性法規不得排除或限制之責任。
          </li>
        </ul>
        <p className="text-text-tertiary text-[0.82rem]">
          （本節為通用 SaaS 責任限制條款草擬版本,實際數字與範圍建議諮詢法律意見後確認。）
        </p>
      </Section>

      <Section title="10. 服務變更與條款修改">
        <p>本服務保留隨時修改、暫停或終止部分或全部功能的權利。條款如有重大修改,將以站內通知或 Email 告知,你於修改後繼續使用本服務即視為同意新條款。</p>
      </Section>

      <Section title="11. 準據法與管轄">
        <p>本條款以中華民國法律為準據法。因本服務所生之爭議,雙方同意以台灣台北地方法院為第一審管轄法院。</p>
      </Section>

      <Section title="12. 聯絡我們">
        <p>若你對本服務條款有任何疑問,或需要申請退款、行使個人資料相關權利,請透過以下 Email 聯繫我們:cyc950831@gmail.com</p>
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
