import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedAccount } from "@/lib/accounts";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt, maskApiKey } from "@/lib/crypto";
import { validateReadOnlyKey as validateBybitKey } from "@/lib/bybit";
import { validateReadOnlyKey as validateOkxKey } from "@/lib/okx";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// 通用交易所連線 route(2026-08-19 從 /api/exchange/bybit 通用化而來)。
// 每家交易所驗證邏輯不同(見 lib/bybit.ts / lib/okx.ts),但 CRUD 骨架
// 共用同一支路由,靠 body/query 帶的 provider 分派。
const PROVIDERS = ["BYBIT", "OKX"] as const;
type Provider = (typeof PROVIDERS)[number];
function isProvider(v: unknown): v is Provider {
  return typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);
}

// 連線狀態。回傳內容刻意只有遮罩後的 key,secret/passphrase 永遠不出後端。
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId || !(await getOwnedAccount(user.id, accountId))) {
    return NextResponse.json({ error: "找不到這個帳戶模板" }, { status: 404 });
  }

  const conn = await prisma.exchangeConnection.findUnique({
    where: { accountId },
    select: { provider: true, apiKeyCipher: true, lastSyncedAt: true, createdAt: true },
  });

  if (!conn) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    provider: conn.provider,
    maskedApiKey: maskApiKey(decrypt(conn.apiKeyCipher)),
    lastSyncedAt: conn.lastSyncedAt,
    connectedAt: conn.createdAt,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  // 每次都會真的打一次交易所 API 驗證金鑰,擋掉短時間內反覆嘗試
  // (誤觸發或亂猜金鑰)把我們的伺服器 IP 耗用在對方那邊的額度燒光。
  const rl = await checkRateLimit("exchange-connect", user.id, { limit: 10, windowSeconds: 600 });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  let body: { accountId?: unknown; provider?: unknown; apiKey?: unknown; apiSecret?: unknown; passphrase?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  if (!accountId || !(await getOwnedAccount(user.id, accountId))) {
    return NextResponse.json({ error: "找不到這個帳戶模板" }, { status: 404 });
  }

  if (!isProvider(body.provider)) {
    return NextResponse.json({ error: "交易所參數不正確" }, { status: 400 });
  }
  const provider = body.provider;

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiSecret = typeof body.apiSecret === "string" ? body.apiSecret.trim() : "";
  const passphrase = typeof body.passphrase === "string" ? body.passphrase.trim() : "";

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "API Key 與 Secret 都必須填寫" }, { status: 400 });
  }
  if (provider === "OKX" && !passphrase) {
    return NextResponse.json({ error: "OKX 還需要填寫 Passphrase" }, { status: 400 });
  }

  // 先跟交易所驗證,確認金鑰有效「而且是唯讀」才存(規劃書 §5.3)。
  // 驗不過就直接退回,不留下任何紀錄。
  let boundIps: string[] = [];
  if (provider === "BYBIT") {
    const validation = await validateBybitKey({ apiKey, apiSecret });
    if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 400 });
    boundIps = validation.info.ips ?? [];
  } else {
    const validation = await validateOkxKey({ apiKey, apiSecret, passphrase });
    if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  await prisma.exchangeConnection.upsert({
    where: { accountId },
    update: {
      provider,
      apiKeyCipher: encrypt(apiKey),
      apiSecretCipher: encrypt(apiSecret),
      apiPassphraseCipher: passphrase ? encrypt(passphrase) : null,
    },
    create: {
      accountId,
      provider,
      apiKeyCipher: encrypt(apiKey),
      apiSecretCipher: encrypt(apiSecret),
      apiPassphraseCipher: passphrase ? encrypt(passphrase) : null,
    },
  });

  return NextResponse.json({
    connected: true,
    provider,
    maskedApiKey: maskApiKey(apiKey),
    boundIps,
  });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId || !(await getOwnedAccount(user.id, accountId))) {
    return NextResponse.json({ error: "找不到這個帳戶模板" }, { status: 404 });
  }

  await prisma.exchangeConnection.deleteMany({ where: { accountId } });
  return NextResponse.json({ connected: false });
}
