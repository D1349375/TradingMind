import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cancelPeriodOrder } from "@/lib/ecpay";
import { compareTiers } from "@/lib/subscription-plans";

// 降級或完全取消訂閱。兩者機制相同(立即停止後續扣款,當期已付費權限
// 保留到到期日),差別只在 pendingTier 是 STANDARD 還是 FREE——見
// lib/subscriptions.ts 開頭的說明跟 ToS 第5節,到期後不會自動幫使用者
// 訂閱新方案,需要使用者自己重新走一次 /api/billing/subscribe。
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: { targetTier?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const targetTier = body.targetTier === "STANDARD" ? "STANDARD" : body.targetTier === "FREE" ? "FREE" : null;
  if (!targetTier) {
    return NextResponse.json({ error: "targetTier 必須是 STANDARD 或 FREE" }, { status: 400 });
  }
  if (compareTiers(targetTier, user.subscriptionTier) >= 0) {
    return NextResponse.json({ error: "只能降級或取消,不能透過這個端點升級" }, { status: 400 });
  }

  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (!sub?.ecpayMerchantTradeNo) {
    return NextResponse.json({ error: "目前沒有正在扣款中的訂閱" }, { status: 400 });
  }

  try {
    await cancelPeriodOrder(sub.ecpayMerchantTradeNo);
  } catch (e) {
    console.error("[subscription-cancel] 取消綠界訂單失敗", sub.ecpayMerchantTradeNo, e);
    return NextResponse.json({ error: "取消訂閱時發生錯誤,請稍後再試或聯絡客服" }, { status: 500 });
  }

  await prisma.$transaction([
    prisma.subscriptionOrder.updateMany({
      where: { merchantTradeNo: sub.ecpayMerchantTradeNo, status: "ACTIVE" },
      data: { status: "CANCELED" },
    }),
    prisma.subscription.update({
      where: { userId: user.id },
      data: { ecpayMerchantTradeNo: null, periodAmount: null, pendingTier: targetTier },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    effectiveUntil: sub.currentPeriodEnd,
    downgradesTo: targetTier,
  });
}
