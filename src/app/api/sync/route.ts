import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedAccount } from "@/lib/accounts";
import { syncExchangeTrades } from "@/lib/sync";
import { BybitError } from "@/lib/bybit";
import { OkxError } from "@/lib/okx";
import { BinanceError } from "@/lib/binance";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// 手動觸發同步(指定某個帳戶模板)。定時排程(pg_cron / inngest)之後會呼叫
// 同一支 syncExchangeTrades,邏輯只寫一份,依連線的 provider 分派到正確的
// 交易所同步邏輯(見 lib/sync.ts)。
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: { accountId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  if (!accountId || !(await getOwnedAccount(user.id, accountId))) {
    return NextResponse.json({ error: "找不到這個帳戶模板" }, { status: 404 });
  }

  // Bybit closed-pnl 單次查得到的區間本來就固定,連續狂按不會拿到更多資料,
  // 只會浪費 Bybit API 額度,擋在這裡。
  const rl = await checkRateLimit("sync", `${user.id}:${accountId}`, {
    limit: 6,
    windowSeconds: 300,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  try {
    const result = await syncExchangeTrades(accountId, user.id);
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof BybitError || e instanceof OkxError || e instanceof BinanceError
        ? e.message
        : e instanceof Error
          ? e.message
          : "同步失敗";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
