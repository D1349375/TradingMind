import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Credit 分兩個桶:balance(儲值包買的,不會過期)、grantedCredits(訂閱
// 每月贈送,用不完歸零)。消費時優先扣 grantedCredits,讓使用者「划算」
// 的贈送額度先用掉,儲值包留到真的超額才動用——呼應
// `TradeMind_Credit定價與營收策略.md` 第三節的定價邏輯。
//
// 目前綠界只接了一次性儲值包,定期定額訂閱購買流程還沒做,所以現在完全
// 沒有任何地方會把 grantedCredits 設成正數——這支檔案是先建好的地基,
// 唯一會執行到的路徑是「歸零」(0歸零還是0),不影響任何現有行為。等
// 訂閱購買流程接上、在那裡呼叫更新 grantedCredits/grantedCreditsResetAt
// 之後,這裡的優先扣款邏輯才會真的生效。

export type SpendableBalance = { balance: number; grantedCredits: number; total: number };

export async function getSpendableBalance(userId: string): Promise<SpendableBalance | null> {
  const row = await prisma.creditBalance.findUnique({ where: { userId } });
  if (!row) return null;

  const expired = row.grantedCreditsResetAt !== null && row.grantedCreditsResetAt < new Date();
  if (!expired) {
    return { balance: row.balance, grantedCredits: row.grantedCredits, total: row.balance + row.grantedCredits };
  }

  // 過了重置日期但欄位裡還留著舊額度沒清——查詢當下順便寫回歸零,不用
  // 額外排 cron job。這個 app 其他懶重置也是同一套模式(見
  // lib/rate-limit.ts 的固定窗口計數器)。
  const updated = await prisma.creditBalance.update({
    where: { userId },
    data: { grantedCredits: 0 },
  });
  return { balance: updated.balance, grantedCredits: 0, total: updated.balance };
}

export type CreditSpend = { grantedSpent: number; balanceSpent: number };

// 算出這筆花費要怎麼拆:優先扣 grantedCredits,不夠再扣 balance。
export function planCreditSpend(available: SpendableBalance, cost: number): CreditSpend {
  const grantedSpent = Math.min(available.grantedCredits, cost);
  const balanceSpent = cost - grantedSpent;
  return { grantedSpent, balanceSpent };
}

// 回傳要塞進呼叫端既有 `prisma.$transaction([...])` 陣列的操作,不獨立
// 開自己的交易——這個專案在 Supabase pooler 上踩過互動式 transaction
// 逾時的坑(見 [[trademind-project]] 既有記錄),所有寫入一律走批次陣列
// 形式,這支函式要跟呼叫端其他寫入(訊息紀錄等)合併進同一個陣列一起送出。
export function creditSpendOps(
  userId: string,
  spend: CreditSpend,
  cost: number,
  reason: string,
): [Prisma.PrismaPromise<unknown>, Prisma.PrismaPromise<unknown>] {
  return [
    prisma.creditBalance.update({
      where: { userId },
      data: {
        grantedCredits: { decrement: spend.grantedSpent },
        balance: { decrement: spend.balanceSpent },
        totalSpent: { increment: cost },
      },
    }),
    prisma.creditTransaction.create({
      data: { userId, amount: -cost, reason },
    }),
  ];
}
