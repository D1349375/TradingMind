import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });

  return NextResponse.json({
    tier: user.subscriptionTier,
    active: sub?.ecpayMerchantTradeNo !== null && sub?.ecpayMerchantTradeNo !== undefined,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    pendingTier: sub?.pendingTier ?? null,
  });
}
