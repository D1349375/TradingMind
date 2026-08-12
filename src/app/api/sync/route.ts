import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { syncBybitTrades } from "@/lib/sync";
import { BybitError } from "@/lib/bybit";

// 手動觸發同步。定時排程(pg_cron / inngest)之後會呼叫同一支 syncBybitTrades,
// 邏輯只寫一份。
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

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
