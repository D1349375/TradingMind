import { createHmac } from "node:crypto";

// BingX 合約(swap v2)API client。只做唯讀查詢,不提供下單/轉帳/提領。
//
// 2026-08-19 用真實唯讀 Key 實測過:
// - 簽章:把參數(不含signature本身)依 key 字母排序、組成
//   `key=value&key=value`(不做 URL encode)、HMAC-SHA256 取十六進位字串。
//   **踩坑記錄**:一開始用 `URLSearchParams` 組最終送出的 URL,結果拿去
//   簽章的字串跟實際送出的字串經過 URLSearchParams 重新序列化後不完全
//   一樣(順序/編碼有落差),導致簽章一律驗證失敗。修法是直接用同一個
//   canonical 字串串接進最終 URL,不要讓兩份字串走不同的組裝路徑。
// - 帳戶讀取(`user/balance`)不需要開 Futures 交易權限,純讀取跟「能不能
//   下單」是分開的兩件事,跟 Binance 同款設計。
// - 權限驗證用 `account/apiRestrictions`,回傳格式(`enableReading`+一堆
//   各自獨立的布林值)幾乎跟 Binance 一模一樣。
const BINGX_BASE_URL = "https://open-api.bingx.com";

export type BingxCredentials = {
  apiKey: string;
  apiSecret: string;
};

export class BingxError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "BingxError";
  }
}

function sign(secret: string, canonical: string): string {
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

async function signedGet<T>(
  creds: BingxCredentials,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const all: Record<string, string> = { ...params, timestamp: Date.now().toString(), recvWindow: "5000" };
  // 排序+不做 URL encode 才是真的被拿去簽章的字串,務必跟最終送出的
  // query string 完全一致(見檔案開頭的踩坑記錄)。
  const canonical = Object.keys(all)
    .sort()
    .map((k) => `${k}=${all[k]}`)
    .join("&");
  const signature = sign(creds.apiSecret, canonical);

  let res: Response;
  try {
    res = await fetch(`${BINGX_BASE_URL}${path}?${canonical}&signature=${signature}`, {
      headers: { "X-BX-APIKEY": creds.apiKey },
      cache: "no-store",
    });
  } catch (e) {
    throw new BingxError(`無法連線到 BingX:${e instanceof Error ? e.message : "未知錯誤"}`);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || (typeof json?.code === "number" && json.code !== 0)) {
    const code = typeof json?.code === "number" ? json.code : undefined;
    const msg = typeof json?.msg === "string" && json.msg ? json.msg : `HTTP ${res.status}`;
    throw new BingxError(translateCode(code, msg), code);
  }
  return (json?.data ?? json) as T;
}

// BingX 常見錯誤碼轉繁中。100413 是實測拿假金鑰打出來確認的(不是照文件
// 猜的),其餘目前沒對應到的保留 BingX 原文,不要吞掉真正的錯誤內容
// (踩過的教訓:code 100413 一開始誤植成「IP白名單」,實測後才發現是
// 「API Key 無效」,寧可保留原文也不要放錯誤但看起來像對的翻譯)。
function translateCode(code: number | undefined, msg: string): string {
  const map: Record<number, string> = {
    100001: "簽章驗證失敗,請確認 API Secret 是否正確",
    100413: "API Key 無效,請確認是否正確複製",
  };
  return code !== undefined && map[code] ? map[code] : `${msg}${code !== undefined ? `(代碼 ${code})` : ""}`;
}

export type ApiRestrictions = {
  enableReading: boolean;
  enableFutures: boolean;
  enableSpotAndMarginTrading: boolean;
  permitsUniversalTransfer: boolean;
};

export async function getApiRestrictions(creds: BingxCredentials): Promise<ApiRestrictions> {
  return signedGet<ApiRestrictions>(creds, "/openApi/v1/account/apiRestrictions");
}

// 規劃書 §5.3 要求強制唯讀金鑰,這裡不只是 UI 提示,是真的擋下來。
// 判斷邏輯跟 lib/binance.ts 一致:enableReading 一定要開,其餘全部風險
// 權限一定要關(含 enableFutures——已驗證讀取不需要這個權限開著)。
export type KeyValidation =
  | { ok: true; restrictions: ApiRestrictions }
  | { ok: false; reason: string };

export async function validateReadOnlyKey(creds: BingxCredentials): Promise<KeyValidation> {
  let restrictions: ApiRestrictions;
  try {
    restrictions = await getApiRestrictions(creds);
  } catch (e) {
    return { ok: false, reason: e instanceof BingxError ? e.message : "無法驗證這組 API Key" };
  }

  if (!restrictions.enableReading) {
    return { ok: false, reason: "這組 API Key 沒有開啟讀取權限,請到 BingX 重新建立。" };
  }

  const risky = collectRiskyPermissions(restrictions);
  if (risky.length > 0) {
    return {
      ok: false,
      reason:
        `這組 API Key 不是唯讀金鑰,帶有${risky.join("、")}權限。` +
        "TradeMind 只需要讀取交易紀錄,請到 BingX 重新建立一組只勾「讀取」的 API Key。",
    };
  }

  return { ok: true, restrictions };
}

function collectRiskyPermissions(r: ApiRestrictions): string[] {
  const RISKY_LABEL: Partial<Record<keyof ApiRestrictions, string>> = {
    enableFutures: "合約交易",
    enableSpotAndMarginTrading: "現貨/槓桿交易",
    permitsUniversalTransfer: "萬能劃轉",
  };
  return Object.entries(RISKY_LABEL)
    .filter(([key]) => r[key as keyof ApiRestrictions])
    .map(([, label]) => label as string);
}

export type WalletBalance = {
  totalEquity: string;
};

export async function getWalletBalance(creds: BingxCredentials): Promise<WalletBalance> {
  const result = await signedGet<{ balance: { equity: string } }>(creds, "/openApi/swap/v2/user/balance");
  return { totalEquity: result.balance?.equity ?? "0" };
}

// ⚠️ 跟 lib/binance.ts 同一個已知限制(見那份檔案開頭的說明),而且比
// Binance 更不確定:這把測試 Key 沒有真實交易紀錄,底下的欄位名稱參考
// CCXT(社群已驗證過的開源實作)而不是自己對著空資料亂猜,但**還沒有用
// 真實 BingX 成交資料驗證過**,欄位名稱可能有誤。之後真的有 BingX 交易
// 資料時,第一件事是先核對這裡的欄位對不對,再考慮要不要順便做多筆成交
// 合併升級(同 Binance 那個 TODO)。
export type FillOrder = {
  symbol: string;
  side: string; // "BUY" | "SELL"(CCXT bingx.py 的 parse_trade 用這個欄位)
  positionSide?: string; // "LONG" | "SHORT"(雙向持倉模式才有)
  price: string;
  qty: string;
  commission: string; // 通常是負值(扣款)
  realizedPnl: string;
  filledTime: number; // ms epoch
  orderId: string;
};

export async function getFillOrders(
  creds: BingxCredentials,
  options: { symbol: string; startTime?: number; endTime?: number; limit?: number },
): Promise<FillOrder[]> {
  const params: Record<string, string> = {
    symbol: options.symbol,
    limit: String(options.limit ?? 100),
  };
  if (options.startTime) params.startTime = String(options.startTime);
  if (options.endTime) params.endTime = String(options.endTime);

  const result = await signedGet<{ fill_orders: FillOrder[] }>(creds, "/openApi/swap/v2/trade/allFillOrders", params);
  return result.fill_orders ?? [];
}

// 同 lib/binance.ts 的 getActiveSymbols:allFillOrders 要求帶 symbol,
// 用 income(REALIZED_PNL)反推同步窗口內有交易過哪些商品。
export async function getActiveSymbols(
  creds: BingxCredentials,
  options: { startTime?: number; endTime?: number } = {},
): Promise<string[]> {
  const params: Record<string, string> = { incomeType: "REALIZED_PNL", limit: "1000" };
  if (options.startTime) params.startTime = String(options.startTime);
  if (options.endTime) params.endTime = String(options.endTime);

  const income = await signedGet<{ symbol: string }[] | null>(creds, "/openApi/swap/v2/user/income", params);
  return [...new Set((income ?? []).map((i) => i.symbol).filter(Boolean))];
}
