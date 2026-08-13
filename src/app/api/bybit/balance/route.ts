import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getWalletBalance, BybitError } from "@/lib/bybit";

// 帳戶總資金——唯讀金鑰就能查,不需要另外要求交易權限。
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const conn = await prisma.bybitConnection.findUnique({
    where: { userId: user.id },
  });
  if (!conn) {
    return NextResponse.json({ error: "尚未連接 Bybit" }, { status: 400 });
  }

  try {
    const balance = await getWalletBalance({
      apiKey: decrypt(conn.apiKeyCipher),
      apiSecret: decrypt(conn.apiSecretCipher),
    });
    return NextResponse.json({
      totalEquity: Number(balance.totalEquity),
    });
  } catch (e) {
    const message = e instanceof BybitError ? e.message : "抓取失敗";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
