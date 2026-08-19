import { createHmac } from "node:crypto";

// OKX V5 API client。只做唯讀查詢,這個檔案不提供任何下單/轉帳/提領的
// 呼叫——跟 lib/bybit.ts 同一個定位:交易日誌不碰下單,少一條攻擊面。
//
// 跟 Bybit 的關鍵差異(2026-08-19 用真實唯讀 Key 實測過,見
// TradeMind_產品規劃書.md Phase 3 待辦註記):
// 1. 簽章是 HMAC-SHA256 → Base64(Bybit 是十六進位字串),且多一道
//    Passphrase(建立 Key 時使用者自己設的密碼,不是 OKX 給的)。
// 2. 唯讀驗證直接查 GET /api/v5/account/config 的 `perm` 欄位,值是
//    "read_only" 就代表安全——OKX 沒有像 Bybit `/v5/user/query-api` 那種
//    一次列出全部細項權限的端點,但 perm 這個欄位已經是等價的判斷依據
//    (實測交叉驗證過:perm=read_only 時,cancel-order/cancel-withdrawal
//    這類需要 Trade/Withdraw 權限的呼叫確實會被擋下,回傳權限錯誤)。

const OKX_BASE_URL = "https://www.okx.com";

export type OkxCredentials = {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
};

export class OkxError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "OkxError";
  }
}

function sign(secret: string, timestamp: string, method: string, path: string, body: string): string {
  return createHmac("sha256", secret).update(timestamp + method + path + body).digest("base64");
}

async function signedRequest<T>(
  creds: OkxCredentials,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const query = method === "GET" ? new URLSearchParams(params).toString() : "";
  const body = method === "POST" ? JSON.stringify(params) : "";
  const requestPath = query ? `${path}?${query}` : path;
  const timestamp = new Date().toISOString();
  const signature = sign(creds.apiSecret, timestamp, method, requestPath, body);

  let res: Response;
  try {
    res = await fetch(`${OKX_BASE_URL}${requestPath}`, {
      method,
      headers: {
        "OK-ACCESS-KEY": creds.apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": creds.passphrase,
        "Content-Type": "application/json",
      },
      body: method === "POST" ? body : undefined,
      cache: "no-store",
    });
  } catch (e) {
    throw new OkxError(`無法連線到 OKX:${e instanceof Error ? e.message : "未知錯誤"}`);
  }

  const json = (await res.json().catch(() => null)) as { code: string; msg: string; data: T } | null;
  if (!json) {
    throw new OkxError(`OKX 回應 HTTP ${res.status}`);
  }
  if (json.code !== "0") {
    throw new OkxError(translateCode(json.code, json.msg), json.code);
  }
  return json.data;
}

// OKX 常見錯誤碼轉繁中。沒對應到的保留原文,不要吞掉真正的錯誤內容。
function translateCode(code: string, msg: string): string {
  const map: Record<string, string> = {
    "50100": "API Key 格式不正確",
    "50101": "API Key 與目前環境不符(正式站/模擬盤混用)",
    "50102": "請求時間戳過期,請確認伺服器時間正確",
    "50103": "缺少 OK-ACCESS-KEY 標頭",
    "50104": "缺少 OK-ACCESS-PASSPHRASE 標頭",
    "50105": "OK-ACCESS-PASSPHRASE 不正確",
    "50106": "缺少 OK-ACCESS-SIGN 標頭",
    "50107": "缺少 OK-ACCESS-TIMESTAMP 標頭",
    "50111": "API Key 無效",
    "50112": "OK-ACCESS-TIMESTAMP 格式不正確",
    "50113": "簽章驗證失敗,請確認 API Secret 是否正確",
    "50114": "這組 API Key 已被凍結",
    "50119": "這組 API Key 不存在或已被刪除",
    "50120": "這組 API Key 沒有權限執行這個操作",
  };
  return map[code] ?? `${msg}(代碼 ${code})`;
}

export type AccountConfig = {
  uid: string;
  label: string;
  perm: string; // "read_only" | "read_trade" | "read_withdraw" | "read_trade_withdraw" 等組合
};

export async function getAccountConfig(creds: OkxCredentials): Promise<AccountConfig> {
  const result = await signedRequest<AccountConfig[]>(creds, "GET", "/api/v5/account/config");
  const config = result[0];
  if (!config) throw new OkxError("查不到這組 API Key 的帳戶設定");
  return config;
}

// 規劃書 §5.3 要求強制唯讀金鑰,這裡不只是 UI 提示,是真的擋下來。
export type KeyValidation =
  | { ok: true; config: AccountConfig }
  | { ok: false; reason: string };

export async function validateReadOnlyKey(creds: OkxCredentials): Promise<KeyValidation> {
  let config: AccountConfig;
  try {
    config = await getAccountConfig(creds);
  } catch (e) {
    return { ok: false, reason: e instanceof OkxError ? e.message : "無法驗證這組 API Key" };
  }

  if (config.perm !== "read_only") {
    return {
      ok: false,
      reason:
        `這組 API Key 不是唯讀金鑰(權限:${config.perm})。` +
        "TradeMind 只需要讀取交易紀錄,請到 OKX 重新建立一組只勾「讀取」的 API Key。",
    };
  }

  return { ok: true, config };
}

export type WalletBalance = {
  totalEquity: string;
};

// 帳戶總資金——唯讀權限即可查詢,不需要交易權限。
export async function getWalletBalance(creds: OkxCredentials): Promise<WalletBalance> {
  const result = await signedRequest<{ totalEq: string }[]>(creds, "GET", "/api/v5/account/balance");
  const account = result[0];
  if (!account) throw new OkxError("這組帳戶沒有可讀取的餘額資料");
  return { totalEquity: account.totalEq };
}

export type ClosedPositionItem = {
  posId: string;
  instId: string; // 例如 BTC-USDT-SWAP
  // "long"/"short",跟 Bybit 的 side 不同,這裡直接就是持倉方向,不用反轉
  direction: string;
  openAvgPx: string;
  closeAvgPx: string;
  closeTotalPos: string; // 平倉數量
  // ⚠️ realizedPnl 是「只看價格變動」的毛損益,不是最終淨損益——OKX 官方
  // 說明 pnl 才是扣掉 fee+fundingFee 之後的最終淨結果,對應規劃書「手續費
  // 從損益分開列」的定義,sync.ts 要用 pnl 存進 Trade.realizedPnl,不要
  // 誤用 realizedPnl 這個欄位(名字很像但語意不同,踩坑記錄見下)。
  realizedPnl: string;
  pnl: string; // 最終淨損益(已扣 fee+fundingFee),對應 Trade.realizedPnl
  fee: string; // 開倉+平倉手續費合計(通常是負值)
  fundingFee: string; // 資金費率(可正可負)
  lever: string;
  openMaxPos: string;
  uTime: string; // ms epoch,最後更新(平倉)時間
  cTime: string; // ms epoch,建倉時間
};

// 已平倉部位損益,是交易紀錄的主要資料源,語意對應 Bybit 的 closed-pnl。
// OKX 這支端點單次查詢區間也是有限制的(近 3 個月),分頁邏輯留給呼叫端
// (sync.ts)依 before/after cursor 處理,跟 Bybit 的 cursor 分頁不同機制。
export async function getClosedPositionsHistory(
  creds: OkxCredentials,
  options: {
    instType?: "SWAP" | "FUTURES";
    before?: string;
    after?: string;
    limit?: number;
  } = {},
): Promise<ClosedPositionItem[]> {
  const params: Record<string, string> = {
    instType: options.instType ?? "SWAP",
    limit: String(options.limit ?? 100),
  };
  if (options.before) params.before = options.before;
  if (options.after) params.after = options.after;

  return signedRequest(creds, "GET", "/api/v5/account/positions-history", params);
}
