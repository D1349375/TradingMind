import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const [balance, orders] = await Promise.all([
    prisma.creditBalance.findUnique({ where: { userId: user.id } }),
    prisma.creditPurchase.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        merchantTradeNo: true,
        creditAmount: true,
        priceTwd: true,
        status: true,
        paymentType: true,
        createdAt: true,
        paidAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    balance: balance?.balance ?? 0,
    orders,
  });
}
