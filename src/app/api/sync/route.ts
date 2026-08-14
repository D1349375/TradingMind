import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { syncBybitTrades } from "@/lib/sync";
import { BybitError } from "@/lib/bybit";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// 手動觸發同步。定時排程(pg_cron / inngest)之後會呼叫同一支 syncBybitTrades,
// 邏輯只寫一份。
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  // Bybit closed-pnl 單次查得到的區間本來就固定,連續狂按不會拿到更多資料,
  // 只會浪費 Bybit API 額度,擋在這裡。
  const rl = await checkRateLimit("sync", user.id, { limit: 6, windowSeconds: 300 });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  try {
    const result = await syncBybitTrades(user.id);
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof BybitError
        ? e.message
        : e instanceof Error
          ? e.message
          : "同步失敗";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
