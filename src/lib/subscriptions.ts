import { prisma } from "@/lib/prisma";
import type { SubscriptionTier } from "@prisma/client";

// 降級/取消排定的變更,到期時才真的套用——懶惰檢查模式,跟
// lib/credits.ts 的 grantedCredits 歸零、lib/rate-limit.ts 的固定窗口
// 計數器同一套做法,不用另外排 cron job。從 lib/auth.ts 的
// getCurrentUser() 呼叫,保證每個登入後的 request 都會經過這裡一次。
//
// 綠界定期定額沒有「排定未來某天才開始扣款」這個功能(已查證),所以
// 降級到期後**不會**自動幫使用者建立新方案的訂單去扣款——這裡只把
// tier 降下來,新訂閱要使用者自己在畫面上重新走一次結帳流程。
// 回傳值:套用了變更就回傳新的 tier,沒有變更就回傳 null——呼叫端(目前
// 只有 lib/auth.ts)可以用這個判斷要不要重新讀一次 user,不用每個 request
// 都白白多查一次。
export async function resolvePendingTierChange(userId: string): Promise<SubscriptionTier | null> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub || sub.pendingTier === null || sub.currentPeriodEnd === null) return null;
  if (sub.currentPeriodEnd > new Date()) return null;

  const newTier = sub.pendingTier;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { subscriptionTier: newTier },
    }),
    prisma.subscription.update({
      where: { userId },
      data: { pendingTier: null, currentPeriodEnd: null },
    }),
  ]);
  return newTier;
}

// 每期扣款成功後要做的事:更新訂閱狀態+發放當月Credit額度。
// grantedCredits 直接設成新額度、grantedCreditsResetAt 設成下次預期
// 續扣日——重用 lib/credits.ts 既有的懶惰歸零機制,不用另外做「每月
// 發放」的排程:就算之後真的沒續扣成功,舊額度到了resetAt也會被
// getSpendableBalance()自然清空,不會憑空一直留著。
export function activateSubscriptionOps(params: {
  userId: string;
  tier: SubscriptionTier;
  merchantTradeNo: string;
  periodAmount: number;
  monthlyCredits: number;
  currentPeriodEnd: Date;
}) {
  return [
    prisma.user.update({
      where: { id: params.userId },
      data: { subscriptionTier: params.tier },
    }),
    prisma.subscription.upsert({
      where: { userId: params.userId },
      update: {
        ecpayMerchantTradeNo: params.merchantTradeNo,
        periodAmount: params.periodAmount,
        currentPeriodEnd: params.currentPeriodEnd,
        pendingTier: null,
      },
      create: {
        userId: params.userId,
        ecpayMerchantTradeNo: params.merchantTradeNo,
        periodAmount: params.periodAmount,
        currentPeriodEnd: params.currentPeriodEnd,
      },
    }),
    prisma.creditBalance.upsert({
      where: { userId: params.userId },
      update: { grantedCredits: params.monthlyCredits, grantedCreditsResetAt: params.currentPeriodEnd },
      create: {
        userId: params.userId,
        grantedCredits: params.monthlyCredits,
        grantedCreditsResetAt: params.currentPeriodEnd,
      },
    }),
    prisma.creditTransaction.create({
      data: { userId: params.userId, amount: params.monthlyCredits, reason: `subscription_grant:${params.merchantTradeNo}` },
    }),
  ] as const;
}

export function addOneMonth(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  return d;
}
