import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEcpayCallback } from "@/lib/ecpay";
import { activateSubscriptionOps, addOneMonth } from "@/lib/subscriptions";
import { findSubscriptionPlan } from "@/lib/subscription-plans";

// 綠界的 PeriodReturnURL——每次定期定額扣款(含第一次授權)都會打這裡。
// 跟 /api/billing/ecpay/callback(一次性儲值包)同一套驗簽+回應規則,
// 差別是這裡的訂單是「持續關係」不是「一次性交易」,成功時要順便發放
// 當月Credit額度、更新下次到期日。
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    fields[key] = String(value);
  }

  if (!verifyEcpayCallback(fields)) {
    console.error("[ecpay-period-callback] CheckMacValue 驗證失敗", fields);
    return new Response("0|CheckMacValue Error", { status: 400 });
  }

  const merchantTradeNo = fields.MerchantTradeNo;
  const order = await prisma.subscriptionOrder.findUnique({ where: { merchantTradeNo } });
  if (!order) {
    console.error("[ecpay-period-callback] 找不到對應訂單", merchantTradeNo);
    return new Response("1|OK");
  }

  const succeeded = fields.RtnCode === "1";

  if (!succeeded) {
    // 第一次授權就失敗:訂單從未真正啟用過,標記 FAILED。
    // 後續週期扣款失敗:訂單已經是 ACTIVE,單次失敗不用做任何事——
    // 綠界會在下個週期自動重試,連續失敗6次後綠界自己會終止,我們這邊
    // 不重刻這個邏輯(見規劃書/ToS 已經寫清楚這個行為)。
    if (order.status === "PENDING") {
      await prisma.subscriptionOrder.update({ where: { merchantTradeNo }, data: { status: "FAILED" } });
    }
    return new Response("1|OK");
  }

  // 已經處理過這次成功通知(綠界重送)就不要重複發放 Credit。
  // 用 order.status 分兩種情況:PENDING→ACTIVE 是第一次;已經是 ACTIVE
  // 的話,只有當這次通知代表「新一期」才要處理——用 Subscription 目前記錄
  // 的 currentPeriodEnd 是否已經過了當次授權時間來判斷,避免綠界對同一次
  // 授權重送 callback 時重複發錢。
  const plan = findSubscriptionPlan(order.tier);
  if (!plan) {
    console.error("[ecpay-period-callback] 訂單記錄的方案不存在", order.tier);
    return new Response("1|OK");
  }

  const sub = await prisma.subscription.findUnique({ where: { userId: order.userId } });
  const alreadyProcessedThisCycle =
    sub?.ecpayMerchantTradeNo === merchantTradeNo &&
    sub.currentPeriodEnd !== null &&
    sub.currentPeriodEnd > new Date();
  if (alreadyProcessedThisCycle) {
    return new Response("1|OK");
  }

  const newPeriodEnd = addOneMonth(new Date());

  await prisma.$transaction([
    ...(order.status === "PENDING"
      ? [prisma.subscriptionOrder.update({ where: { merchantTradeNo }, data: { status: "ACTIVE", activatedAt: new Date(), ecpayTradeNo: fields.gwsr ?? null } })]
      : []),
    ...activateSubscriptionOps({
      userId: order.userId,
      tier: order.tier,
      merchantTradeNo,
      periodAmount: order.periodAmount,
      monthlyCredits: plan.monthlyCredits,
      currentPeriodEnd: newPeriodEnd,
    }),
  ]);

  return new Response("1|OK");
}
