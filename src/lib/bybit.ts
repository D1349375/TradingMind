import { createHmac } from "node:crypto";

// Bybit V5 API client。只做唯讀查詢,這個檔案不提供任何下單/轉帳的呼叫——
// 產品定位是交易日誌,不碰下單,少一條攻擊面。

const BYBIT_BASE_URL = "https://api.bybit.com";
const RECV_WINDOW = "5000";

export type BybitCredentials = {
  apiKey: string;
  apiSecret: string;
};

export class BybitError extends Error {
  constructor(
    message: string,
    public readonly retCode?: number,
  ) {
    super(message);
    this.name = "BybitError";
  }
}

// V5 簽章:GET 用 timestamp + apiKey + recvWindow + queryString
function sign(
  secret: string,
  timestamp: string,
  apiKey: string,
  payload: string,
): string {
  return createHmac("sha256", secret)
    .update(timestamp + apiKey + RECV_WINDOW + payload)
    .digest("hex");
}

async function signedGet<T>(
  creds: BybitCredentials,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const queryString = new URLSearchParams(params).toString();
  const timestamp = Date.now().toString();
  const signature = sign(
    creds.apiSecret,
    timestamp,
    creds.apiKey,
    queryString,
  );

  const url = `${BYBIT_BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "X-BAPI-API-KEY": creds.apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": RECV_WINDOW,
        "X-BAPI-SIGN": signature,
      },
      cache: "no-store",
    });
  } catch (e) {
    throw new BybitError(
      `無法連線到 Bybit:${e instanceof Error ? e.message : "未知錯誤"}`,
    );
  }

  if (!res.ok) {
    throw new BybitError(`Bybit 回應 HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    retCode: number;
    retMsg: string;
    result: T;
  };

  if (json.retCode !== 0) {
    throw new BybitError(translateRetMsg(json.retCode, json.retMsg), json.retCode);
  }

  return json.result;
}

// Bybit 常見錯誤碼轉繁中。沒對應到的保留原文,不要吞掉真正的錯誤內容。
function translateRetMsg(retCode: number, retMsg: string): string {
  const map: Record<number, string> = {
    10003: "API Key 無效",
    10004: "簽章驗證失敗,請確認 API Secret 是否正確",
    10005: "這組 API Key 權限不足",
    10006: "請求過於頻繁,請稍後再試",
    10010: "你的 IP 不在這組 API Key 的白名單內",
    10016: "Bybit 服務暫時無法使用",
    33004: "這組 API Key 已過期",
  };
  return map[retCode] ?? `${retMsg}(代碼 ${retCode})`;
}

export type ApiKeyInfo = {
  readOnly: number; // 0 = 可讀寫,1 = 唯讀
  ips: string[];
  note: string;
  expiredAt: string;
  permissions: Record<string, string[]>;
};

export async function getApiKeyInfo(
  creds: BybitCredentials,
): Promise<ApiKeyInfo> {
  return signedGet<ApiKeyInfo>(creds, "/v5/user/query-api");
}

// 規劃書 §5.3 要求強制唯讀金鑰。這裡不只是 UI 提示,是真的擋下來——
// 使用者貼上有交易/提領權限的金鑰時直接拒絕儲存。
export type KeyValidation =
  | { ok: true; info: ApiKeyInfo }
  | { ok: false; reason: string };

export async function validateReadOnlyKey(
  creds: BybitCredentials,
): Promise<KeyValidation> {
  let info: ApiKeyInfo;
  try {
    info = await getApiKeyInfo(creds);
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof BybitError ? e.message : "無法驗證這組 API Key",
    };
  }

  if (info.readOnly !== 1) {
    const risky = collectRiskyPermissions(info.permissions);
    return {
      ok: false,
      reason:
        `這組 API Key 不是唯讀金鑰${risky.length ? `,帶有 ${risky.join("、")} 權限` : ""}。` +
        "TradeMind 只需要讀取交易紀錄,請到 Bybit 重新建立一組「唯讀」API Key。",
    };
  }

  if (info.expiredAt && new Date(info.expiredAt).getTime() < Date.now()) {
    return { ok: false, reason: "這組 API Key 已經過期" };
  }

  return { ok: true, info };
}

// 把有寫入性質的權限挑出來,讓錯誤訊息能明確講出問題在哪
function collectRiskyPermissions(
  permissions: Record<string, string[]>,
): string[] {
  const RISKY = new Set([
    "Order",
    "Position",
    "SpotTrade",
    "DerivativesTrade",
    "Withdraw",
    "AccountTransfer",
    "SubMemberTransfer",
    "OptionsTrade",
    "NFTQueryProductList",
  ]);
  const found: string[] = [];
  for (const list of Object.values(permissions ?? {})) {
    for (const p of list ?? []) {
      if (RISKY.has(p)) found.push(p);
    }
  }
  return [...new Set(found)];
}

export type ClosedPnlItem = {
  orderId: string;
  symbol: string;
  side: string; // "Buy" | "Sell" —— 這是平倉方向,持倉方向要反過來
  qty: string;
  orderPrice: string;
  avgEntryPrice: string;
  avgExitPrice: string;
  closedPnl: string;
  leverage: string;
  cumEntryValue: string;
  cumExitValue: string;
  createdTime: string; // ms epoch
  updatedTime: string;
};

// 已平倉損益,是交易紀錄的主要資料源(規劃書 §5.1)
export async function getClosedPnl(
  creds: BybitCredentials,
  options: {
    category?: "linear" | "inverse";
    startTime?: number;
    endTime?: number;
    limit?: number;
    cursor?: string;
  } = {},
): Promise<{ list: ClosedPnlItem[]; nextPageCursor: string }> {
  const params: Record<string, string> = {
    category: options.category ?? "linear",
    limit: String(options.limit ?? 100),
  };
  if (options.startTime) params.startTime = String(options.startTime);
  if (options.endTime) params.endTime = String(options.endTime);
  if (options.cursor) params.cursor = options.cursor;

  return signedGet(creds, "/v5/position/closed-pnl", params);
}
