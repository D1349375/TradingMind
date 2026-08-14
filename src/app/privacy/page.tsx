import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隱私權政策 · TradeMind",
};

// 草稿(2026-08-15)——內容需使用者/法律審閱後才能視為定案。依中華民國
// 個人資料保護法(個資法)架構撰寫,但實際蒐集項目/第三方名單需要跟著
// 程式碼異動同步更新,不是一次寫完就不用管。
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-14 text-text">
      <h1 className="mb-1 text-[1.6rem] font-semibold">隱私權政策</h1>
      <p className="mb-8 text-[0.82rem] text-text-tertiary">
        最後更新:2026 年 8 月 15 日(草稿版本,尚未正式生效)
      </p>

      <Section title="1. 我們蒐集哪些資料">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>帳號資料</strong>:Email、密碼(加密儲存,或透過 Google 第三方登入不經手密碼)。</li>
          <li><strong>交易資料</strong>:你連接交易所帳戶、CSV 匯入或手動輸入的交易紀錄(商品、價格、損益、時間等)。</li>
          <li><strong>交易所 API 金鑰</strong>:僅限唯讀權限,以 AES-256-GCM 加密儲存,明文不落地,我們自己也無法讀出明文。</li>
          <li><strong>你主動填寫的內容</strong>:反思筆記、標籤、截圖、自訂欄位、紀律規則設定等。</li>
          <li><strong>使用紀錄</strong>:登入時間、功能使用狀況,用於維運與防止濫用(例如異常頻繁的 API 呼叫)。</li>
        </ul>
      </Section>

      <Section title="2. 蒐集目的">
        <p>上述資料僅用於:提供交易日誌記錄與分析服務本身、帳號驗證與安全維護、處理你的 Credit 儲值與付款、在你主動使用 AI 分析功能時產生分析結果、以及依法令要求配合調查。我們不會將你的個人交易資料用於與提供服務無關的行銷或販售給第三方。</p>
      </Section>

      <Section title="3. 資料保存期限">
        <p>你的資料會保存至你主動刪除該筆資料,或你依「設定 → 帳戶」頁面刪除整個帳號為止(帳號刪除為立即生效且不可復原)。若法令另有較長的保存義務(例如金流交易紀錄),依相關法令規定保存。</p>
      </Section>

      <Section title="4. 資料會分享給哪些第三方">
        <p>我們使用以下第三方服務供應商處理部分資料,他們僅依我們的指示、為了提供服務目的處理資料:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Supabase</strong>——資料庫儲存與帳號驗證。</li>
          <li><strong>Anthropic(Claude API)</strong>——當你主動使用 AI 分析功能時,你「該筆交易」的資料會傳送給 Anthropic 處理以產生分析結果;未使用 AI 分析功能的資料不會傳送。</li>
          <li><strong>綠界科技(ECPay)</strong>——處理 Credit 儲值的金流交易,我們不會接觸、儲存你的完整信用卡卡號。</li>
          <li><strong>Netlify</strong>——網站主機服務。</li>
        </ul>
        <p>除上述服務供應商外,我們不會將你的個人資料提供給其他第三方,除非取得你的同意或法律要求。</p>
      </Section>

      <Section title="5. 跨境資料傳輸">
        <p>上述服務供應商的伺服器可能位於台灣以外地區(例如美國)。你的資料因此可能會傳輸至境外處理,我們會要求合作的服務供應商採取合理的資料保護措施。</p>
      </Section>

      <Section title="6. 資料安全措施">
        <p>交易所 API 金鑰採 AES-256-GCM 加密儲存;帳號密碼經雜湊處理不以明文儲存;連接交易所時,系統會主動驗證金鑰權限,拒絕儲存帶有交易或提領權限的金鑰,降低金鑰外洩時的曝險上限——外洩的是資料,不是資金,因為本服務本身不代管、不能動用任何資金。</p>
      </Section>

      <Section title="7. 你的權利">
        <p>依中華民國個人資料保護法,你就我們保有的你的個人資料,享有查詢、請求閱覽、請求製給複製本、請求補充或更正、請求停止蒐集/處理/利用、請求刪除等權利。你可以直接透過「設定」頁面管理大部分資料,或透過下方聯絡方式提出請求。</p>
      </Section>

      <Section title="8. Cookie 使用">
        <p>本服務使用必要性 Cookie 維持你的登入狀態,以及儲存你的主題(淺色/深色)、字級等介面偏好設定於瀏覽器本機。我們目前不使用第三方廣告追蹤 Cookie。</p>
      </Section>

      <Section title="9. 未成年人使用">
        <p>本服務不主動蒐集未滿使用資格年齡者的個人資料。若你發現未成年人在未經監護人同意下使用本服務並提供了個人資料,請透過下方聯絡方式通知我們,我們會盡快處理。</p>
      </Section>

      <Section title="10. 政策修改">
        <p>本政策如有修改,將更新本頁面的「最後更新」日期,重大變更會另外以站內通知或 Email 告知。</p>
      </Section>

      <Section title="11. 聯絡我們">
        <p className="text-text-tertiary">[待補:客服/資料保護聯絡 Email]</p>
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
