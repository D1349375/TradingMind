import { randomUUID } from "node:crypto";
import ECPayPayment from "ecpay_aio_nodejs";

// 沒設定環境變數時 fallback 到綠界官方公開的測試特店資料(跟 SDK 自己的
// example/conf/config-example.js 用同一組),本機開發不用先申請帳號就能
// 跑通整條 checkout→callback 流程。正式環境一定要設定真實的特約商店資料,
// 這裡加一層警告,避免不小心把測試模式帶上線。
const TEST_MERCHANT_ID = "2000132";
const TEST_HASH_KEY = "5294y06JbISpM5x9";
const TEST_HASH_IV = "v77hoKGq4kWxNNIS";

function getEcpayClient() {
  const merchantId = process.env.ECPAY_MERCHANT_ID || TEST_MERCHANT_ID;
  const hashKey = process.env.ECPAY_HASH_KEY || TEST_HASH_KEY;
  const hashIv = process.env.ECPAY_HASH_IV || TEST_HASH_IV;
  const operationMode = process.env.ECPAY_ENV === "Production" ? "Production" : "Test";

  if (operationMode === "Test" && process.env.NODE_ENV === "production") {
    console.warn(
      "[ecpay] 正式環境仍在使用測試特店資料,綠界金流不會真的收到款——請設定 ECPAY_ENV/ECPAY_MERCHANT_ID/ECPAY_HASH_KEY/ECPAY_HASH_IV。",
    );
  }

  return new ECPayPayment({
    OperationMode: operationMode,
    MercProfile: { MerchantID: merchantId, HashKey: hashKey, HashIV: hashIv },
    IgnorePayment: [],
    IsProjectContractor: false,
  });
}

// ECPay 的 MerchantTradeNo 只能英數字、上限 20 碼。
export function generateMerchantTradeNo() {
  return `TM${randomUUID().replace(/-/g, "").slice(0, 18)}`.slice(0, 20);
}

// 綠界要求日期格式 yyyy/MM/dd HH:mm:ss,用台北時區(不依賴伺服器本機時區)。
function formatMerchantTradeDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

// 產生導向綠界結帳頁的自動送出表單(HTML)。回傳的字串直接當 response body,
// 瀏覽器收到後會自動 POST 到綠界、轉址過去。
export function buildCheckoutHtml(params: {
  merchantTradeNo: string;
  totalAmount: number;
  itemName: string;
  returnUrl: string;
  clientBackUrl: string;
}) {
  const client = getEcpayClient();
  return client.payment_client.aio_check_out_all({
    MerchantTradeNo: params.merchantTradeNo,
    MerchantTradeDate: formatMerchantTradeDate(new Date()),
    TotalAmount: String(params.totalAmount),
    TradeDesc: "TradeMind Credit 儲值",
    ItemName: params.itemName,
    ReturnURL: params.returnUrl,
    ClientBackURL: params.clientBackUrl,
  });
}

// 驗證綠界 ReturnURL callback 帶回的 CheckMacValue——用同一個 client 實例的
// 內部演算法重算(官方演算法本身有幾個容易做錯的細節:大小寫排序、.NET 風格
// URL encode、加解密模式,直接沿用 SDK 內部方法比自己重刻可靠)。
export function verifyEcpayCallback(fields: Record<string, string>): boolean {
  const { CheckMacValue, ...rest } = fields;
  if (!CheckMacValue) return false;
  const client = getEcpayClient();
  const mode = CheckMacValue.length === 32 ? 0 : 1; // 32碼=md5, 64碼=sha256
  const expected = client.payment_client.helper.gen_chk_mac_value(rest, mode);
  return expected === CheckMacValue.toUpperCase();
}
