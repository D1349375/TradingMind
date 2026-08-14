import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCheckoutHtml, generateMerchantTradeNo } from "@/lib/ecpay";
import { findCreditPack } from "@/lib/credit-packs";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// 瀏覽器直接導頁進來(不是 fetch),所以用 GET——回傳的是會自動送出的
// HTML 表單,靠 window.location 整頁導頁才會真的觸發表單送出。
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("未登入", { status: 401 });

  const rl = await checkRateLimit("billing-checkout", user.id, {
    limit: 20,
    windowSeconds: 3600,
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const packId = request.nextUrl.searchParams.get("pack") ?? "";
  const pack = findCreditPack(packId);
  if (!pack) return new Response("找不到這個儲值方案", { status: 400 });

  const merchantTradeNo = generateMerchantTradeNo();
  await prisma.creditPurchase.create({
    data: {
      userId: user.id,
      merchantTradeNo,
      creditAmount: pack.credits,
      priceTwd: pack.priceTwd,
    },
  });

  const origin = request.nextUrl.origin;
  const html = buildCheckoutHtml({
    merchantTradeNo,
    totalAmount: pack.priceTwd,
    itemName: `TradeMind Credit x${pack.credits}`,
    returnUrl: `${origin}/api/billing/ecpay/callback`,
    clientBackUrl: `${origin}/settings?tab=billing`,
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
