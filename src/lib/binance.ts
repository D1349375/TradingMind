import { createHmac } from "node:crypto";

// Binance USDS-M 合約 API client。只做唯讀查詢,這個檔案不提供任何下單/
// 轉帳/提領/劃轉的呼叫——跟 lib/bybit.ts / lib/okx.ts 同一個定位。
//
// 2026-08-19 用真實唯讀 Key 實測過:
// - 帳戶讀取(SPOT host 的 apiRestrictions、FAPI host 的 account)不需要
//   enableFutures 這個交易權限打開,純讀取跟「能不能下單」是分開的兩件事。
// - 簽章是 HMAC-SHA256 → 十六進位字串(跟 Bybit 同格式,不是 OKX 的
//   Base64),header 是 X-MBX-APIKEY。
const BINANCE_FAPI_URL = "https://fapi.binance.com"; // 合約帳戶/交易紀錄
const BINANCE_SAPI_URL = "https://api.binance.com"; // apiRestrictions 只在現貨站這邊

export type BinanceCredentials = {
  apiKey: string;
  apiSecret: string;
};

export class BinanceError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "BinanceError";
  }
}

function sign(secret: string, query: string): string {
  return createHmac("sha256", secret).update(query).digest("hex");
}

async function signedGet<T>(
  creds: BinanceCredentials,
  base: string,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const query = new URLSearchParams({ ...params, timestamp: Date.now().toString(), recvWindow: "5000" }).toString();
  const signature = sign(creds.apiSecret, query);

  let res: Response;
  try {
    res = await fetch(`${base}${path}?${query}&signature=${signature}`, {
      headers: { "X-MBX-APIKEY": creds.apiKey },
      cache: "no-store",
    });
  } catch (e) {
    throw new BinanceError(`無法連線到 Binance:${e instanceof Error ? e.message : "未知錯誤"}`);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const code = typeof json?.code === "number" ? json.code : undefined;
    const msg = typeof json?.msg === "string" ? json.msg : `HTTP ${res.status}`;
    throw new BinanceError(translateCode(code, msg), code);
  }
  return json as T;
}

// Binance 常見錯誤碼轉繁中。沒對應到的保留原文,不要吞掉真正的錯誤內容。
function translateCode(code: number | undefined, msg: string): string {
  const map: Record<number, string> = {
    "-1002": "未授權,請確認 API Key 正確",
    "-1021": "請求時間戳過期,請確認伺服器時間正確",
    "-1022": "簽章驗證失敗,請確認 API Secret 是否正確",
    "-2008": "API Key 格式不正確",
    "-2014": "API Key 格式不正確",
    "-2015": "API Key 無效,或沒有這個操作需要的權限,或 IP 白名單擋下",
  };
  return code !== undefined && map[code] ? map[code] : `${msg}${code !== undefined ? `(代碼 ${code})` : ""}`;
}

export type ApiRestrictions = {
  enableReading: boolean;
  enableSpotAndMarginTrading: boolean;
  enableWithdrawals: boolean;
  enableInternalTransfer: boolean;
  permitsUniversalTransfer: boolean;
  enableVanillaOptions: boolean;
  enableFutures: boolean;
  enablePortfolioMarginTrading: boolean;
  enableFixApiTrade: boolean;
  enableMargin: boolean;
};

export async function getApiRestrictions(creds: BinanceCredentials): Promise<ApiRestrictions> {
  return signedGet<ApiRestrictions>(creds, BINANCE_SAPI_URL, "/sapi/v1/account/apiRestrictions");
}

// 規劃書 §5.3 要求強制唯讀金鑰,這裡不只是 UI 提示,是真的擋下來。
// Binance 的權限比 Bybit/OKX 更細(一堆各自獨立的布林值),判斷邏輯是
// enableReading 一定要開,其餘全部風險權限一定要關——不特別放行
// enableFutures(這個是「能不能下單」,不是「能不能讀取合約帳戶」,
// 已用真實Key驗證過讀取不需要這個權限開著)。
export type KeyValidation =
  | { ok: true; restrictions: ApiRestrictions }
  | { ok: false; reason: string };

export async function validateReadOnlyKey(creds: BinanceCredentials): Promise<KeyValidation> {
  let restrictions: ApiRestrictions;
  try {
    restrictions = await getApiRestrictions(creds);
  } catch (e) {
    return { ok: false, reason: e instanceof BinanceError ? e.message : "無法驗證這組 API Key" };
  }

  if (!restrictions.enableReading) {
    return { ok: false, reason: "這組 API Key 沒有開啟讀取權限,請到 Binance 重新建立。" };
  }

  const risky = collectRiskyPermissions(restrictions);
  if (risky.length > 0) {
    return {
      ok: false,
      reason:
        `這組 API Key 不是唯讀金鑰,帶有${risky.join("、")}權限。` +
        "TradeMind 只需要讀取交易紀錄,請到 Binance 重新建立一組只勾「啟用讀取」的 API Key。",
    };
  }

  return { ok: true, restrictions };
}

function collectRiskyPermissions(r: ApiRestrictions): string[] {
  const RISKY_LABEL: Partial<Record<keyof ApiRestrictions, string>> = {
    enableSpotAndMarginTrading: "現貨/槓桿交易",
    enableWithdrawals: "提領",
    enableInternalTransfer: "內部劃轉",
    permitsUniversalTransfer: "萬能劃轉",
    enableVanillaOptions: "期權交易",
    enableFutures: "合約交易",
    enablePortfolioMarginTrading: "統一帳戶交易",
    enableFixApiTrade: "FIX API 交易",
    enableMargin: "槓桿",
  };
  return Object.entries(RISKY_LABEL)
    .filter(([key]) => r[key as keyof ApiRestrictions])
    .map(([, label]) => label as string);
}

export type WalletBalance = {
  totalEquity: string;
};

// 合約帳戶總資金(totalMarginBalance = 錢包餘額+未實現損益)——唯讀權限
// 就能查,不需要交易權限(已用真實Key驗證過)。
export async function getWalletBalance(creds: BinanceCredentials): Promise<WalletBalance> {
  const account = await signedGet<{ totalMarginBalance: string }>(creds, BINANCE_FAPI_URL, "/fapi/v2/account");
  return { totalEquity: account.totalMarginBalance };
}

export type UserTrade = {
  id: number;
  orderId: number;
  symbol: string;
  side: string; // "BUY" | "SELL"
  positionSide: string; // "LONG" | "SHORT" | "BOTH"(單向持倉模式固定是BOTH)
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  realizedPnl: string; // 開倉的那筆固定是"0",只有平倉/減倉的成交才有值
  time: number; // ms epoch
};

// ⚠️ TODO(2026-08-19,使用者要求記錄待辦):Binance 沒有像 Bybit
// closed-pnl / OKX positions-history 那種一次給完整一筆「已平倉交易」
// (進場價/出場價/數量/損益)的端點,只有這支逐筆成交明細——一個已平倉
// 部位如果分批進出場,會對應好幾筆成交。這裡先用簡單版:只挑
// realizedPnl!=0 的「平倉成交」,每一筆直接存成一筆 Trade,不合併同一個
// 部位的多筆成交。等之後真的有 Binance 真實交易資料可以驗證,應該把這裡
// 升級成「同商品+時間相近+同方向的多筆成交合併成一筆交易」的邏輯,現在
// 這版對分批進出場的使用者統計數字(筆數/平均倉位)會失真。
export async function getUserTrades(
  creds: BinanceCredentials,
  options: { symbol: string; startTime?: number; endTime?: number; limit?: number },
): Promise<UserTrade[]> {
  const params: Record<string, string> = {
    symbol: options.symbol,
    limit: String(options.limit ?? 100),
  };
  if (options.startTime) params.startTime = String(options.startTime);
  if (options.endTime) params.endTime = String(options.endTime);

  return signedGet<UserTrade[]>(creds, BINANCE_FAPI_URL, "/fapi/v1/userTrades", params);
}

// 帳戶目前有部位/曾經交易過的商品清單——userTrades 要求帶 symbol
// 逐一查,不像 Bybit/OKX 可以不帶商品一次抓全部,所以同步前要先知道
// 「該查哪些商品」。用 income 記錄反推有真實資金流動過的商品,比對
// exchangeInfo 列出的上千個商品一一去查快很多。
export async function getActiveSymbols(
  creds: BinanceCredentials,
  options: { startTime?: number; endTime?: number } = {},
): Promise<string[]> {
  const params: Record<string, string> = { incomeType: "REALIZED_PNL", limit: "1000" };
  if (options.startTime) params.startTime = String(options.startTime);
  if (options.endTime) params.endTime = String(options.endTime);

  const income = await signedGet<{ symbol: string }[]>(creds, BINANCE_FAPI_URL, "/fapi/v1/income", params);
  return [...new Set(income.map((i) => i.symbol).filter(Boolean))];
}
