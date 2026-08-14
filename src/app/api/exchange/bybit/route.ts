import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt, maskApiKey } from "@/lib/crypto";
import { validateReadOnlyKey } from "@/lib/bybit";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// 連線狀態。回傳內容刻意只有遮罩後的 key,secret 永遠不出後端。
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const conn = await prisma.bybitConnection.findUnique({
    where: { userId: user.id },
    select: { apiKeyCipher: true, lastSyncedAt: true, createdAt: true },
  });

  if (!conn) return NextResponse.json({ connected: false });

  // apiKey 本身不是機密(機密是 secret),但仍只回遮罩版,避免不必要的暴露
  return NextResponse.json({
    connected: true,
    maskedApiKey: maskApiKey(decrypt(conn.apiKeyCipher)),
    lastSyncedAt: conn.lastSyncedAt,
    connectedAt: conn.createdAt,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  // 每次都會真的打一次 Bybit API 驗證金鑰,擋掉短時間內反覆嘗試
  // (誤觸發或亂猜金鑰)把我們的伺服器 IP 耗用在 Bybit 那邊的額度燒光。
  const rl = await checkRateLimit("bybit-connect", user.id, { limit: 10, windowSeconds: 600 });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  let body: { apiKey?: unknown; apiSecret?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiSecret =
    typeof body.apiSecret === "string" ? body.apiSecret.trim() : "";

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "API Key 與 Secret 都必須填寫" },
      { status: 400 },
    );
  }

  // 先跟 Bybit 驗證,確認金鑰有效「而且是唯讀」才存(規劃書 §5.3)。
  // 驗不過就直接退回,不留下任何紀錄。
  const validation = await validateReadOnlyKey({ apiKey, apiSecret });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  await prisma.bybitConnection.upsert({
    where: { userId: user.id },
    update: {
      apiKeyCipher: encrypt(apiKey),
      apiSecretCipher: encrypt(apiSecret),
    },
    create: {
      userId: user.id,
      apiKeyCipher: encrypt(apiKey),
      apiSecretCipher: encrypt(apiSecret),
    },
  });

  return NextResponse.json({
    connected: true,
    maskedApiKey: maskApiKey(apiKey),
    boundIps: validation.info.ips ?? [],
  });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  await prisma.bybitConnection.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ connected: false });
}
