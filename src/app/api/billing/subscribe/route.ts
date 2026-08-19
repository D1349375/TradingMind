import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildPeriodCheckoutHtml, cancelPeriodOrder, generateMerchantTradeNo } from "@/lib/ecpay";
import { findSubscriptionPlan } from "@/lib/subscription-plans";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// 訂閱結帳——新訂閱、升級、降級到期後的重新訂閱,三種情境共用同一支
// route:只要目前有正在扣款中的舊訂單,一律先取消再開新單,不特別分流
// (升級/重新訂閱在使用者視角是同一個動作「我現在要訂閱這個方案」)。
// GET 是因為要導頁到綠界結帳頁(自動送出表單),不是 fetch API。
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("未登入", { status: 401 });

  const rl = await checkRateLimit("billing-subscribe", user.id, { limit: 10, windowSeconds: 3600 });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const tierParam = request.nextUrl.searchParams.get("tier") ?? "";
  const plan = findSubscriptionPlan(tierParam);
  if (!plan) return new Response("找不到這個訂閱方案", { status: 400 });

  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });

  // 已經有正在扣款中的訂單(這是升級,或重複點了同一個方案)——先終止
  // 舊訂單再開新的,避免同時有兩筆訂單在扣同一個使用者的錢。
  if (sub?.ecpayMerchantTradeNo) {
    try {
      await cancelPeriodOrder(sub.ecpayMerchantTradeNo);
    } catch (e) {
      console.error("[billing-subscribe] 取消舊訂單失敗", sub.ecpayMerchantTradeNo, e);
      return new Response("處理現有訂閱時發生錯誤,請稍後再試或聯絡客服", { status: 500 });
    }
    await prisma.subscriptionOrder.updateMany({
      where: { merchantTradeNo: sub.ecpayMerchantTradeNo, status: "ACTIVE" },
      data: { status: "CANCELED" },
    });
  }

  const merchantTradeNo = generateMerchantTradeNo();
  await prisma.subscriptionOrder.create({
    data: {
      userId: user.id,
      merchantTradeNo,
      tier: plan.tier,
      periodAmount: plan.priceTwd,
    },
  });

  const origin = request.nextUrl.origin;
  const html = buildPeriodCheckoutHtml({
    merchantTradeNo,
    periodAmount: plan.priceTwd,
    itemName: `TradeMind ${plan.label} 訂閱`,
    periodReturnUrl: `${origin}/api/billing/ecpay/period-callback`,
    clientBackUrl: `${origin}/settings?tab=billing`,
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
