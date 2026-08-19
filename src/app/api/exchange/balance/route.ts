import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedAccount } from "@/lib/accounts";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { getWalletBalance as getBybitBalance, BybitError } from "@/lib/bybit";
import { getWalletBalance as getOkxBalance, OkxError } from "@/lib/okx";

// 帳戶總資金——唯讀金鑰就能查,不需要另外要求交易權限。
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId || !(await getOwnedAccount(user.id, accountId))) {
    return NextResponse.json({ error: "找不到這個帳戶模板" }, { status: 404 });
  }

  const conn = await prisma.exchangeConnection.findUnique({ where: { accountId } });
  if (!conn) {
    return NextResponse.json({ error: "尚未連接交易所" }, { status: 400 });
  }

  try {
    if (conn.provider === "OKX") {
      if (!conn.apiPassphraseCipher) {
        return NextResponse.json({ error: "這組 OKX 連線缺少 Passphrase,請重新連接" }, { status: 400 });
      }
      const balance = await getOkxBalance({
        apiKey: decrypt(conn.apiKeyCipher),
        apiSecret: decrypt(conn.apiSecretCipher),
        passphrase: decrypt(conn.apiPassphraseCipher),
      });
      return NextResponse.json({ totalEquity: Number(balance.totalEquity) });
    }

    const balance = await getBybitBalance({
      apiKey: decrypt(conn.apiKeyCipher),
      apiSecret: decrypt(conn.apiSecretCipher),
    });
    return NextResponse.json({ totalEquity: Number(balance.totalEquity) });
  } catch (e) {
    const message = e instanceof BybitError || e instanceof OkxError ? e.message : "抓取失敗";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
