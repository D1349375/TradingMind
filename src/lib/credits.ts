import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Credit 分兩個桶:balance(儲值包買的,不會過期)、grantedCredits(訂閱
// 每月贈送,用不完歸零)。消費時優先扣 grantedCredits,讓使用者「划算」
// 的贈送額度先用掉,儲值包留到真的超額才動用——呼應
// `TradeMind_Credit定價與營收策略.md` 第三節的定價邏輯。

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

// 2026-08-20 修正(security-review 抓到的競態條件):原本是「先用
// getSpendableBalance() 讀一次餘額判斷夠不夠 → 呼叫真的要付費的 LLM →
// 事後才在最後的 $transaction 裡扣款」,讀跟扣之間隔著一次外部 API 呼叫
// 的時間差——同一個使用者同時發出好幾個並發請求,全部都會在扣款前讀到
// 同一份「扣款前」餘額、全部通過檢查,可以超扣,餘額也沒有下限保護會
// 變負數。
//
// 改成一句原子 SQL UPDATE 把「檢查夠不夠」跟「真的扣款」合成同一個資料庫
// 操作——WHERE 子句裡的 (balance + "grantedCredits") >= cost 用的是這一列
// 被這句 UPDATE 鎖定當下的即時值,不是呼叫前讀到的舊快照,並發請求會被
// 資料庫本身序列化(後到的那個會看到已經扣過的新值,可能因此不夠而失敗),
// 不可能兩個同時通過。SET 子句裡的欄位自我參照(如 "grantedCredits" -
// LEAST(...))在同一句 UPDATE 內一律讀到的是舊值,不會被同一句裡其他 SET
// 項目污染,這是 SQL 標準行為。
//
// 呼叫端流程:呼叫 LLM 之前先 reserveCredits(),失敗(餘額不夠)直接
// 402、不呼叫 LLM;成功才呼叫 LLM;LLM 失敗要 refundCredits() 退回;LLM
// 成功才用 creditSpendOps() 額外記一筆 CreditTransaction 稽核紀錄——扣款
// 本身已經在 reserve 那一步做完,這裡不重複扣。
export async function reserveCredits(userId: string, cost: number): Promise<boolean> {
  if (cost <= 0) return true; // 0 元(如 ADVANCED 額度內的週報)不用真的扣,視為必定成功
  const affected = await prisma.$executeRaw`
    UPDATE "CreditBalance"
    SET
      "grantedCredits" = "grantedCredits" - LEAST("grantedCredits", ${cost}),
      balance = balance - GREATEST(${cost} - "grantedCredits", 0),
      "totalSpent" = "totalSpent" + ${cost}
    WHERE "userId" = ${userId} AND (balance + "grantedCredits") >= ${cost}
  `;
  return affected > 0;
}

// reserveCredits() 扣完之後,LLM 呼叫本身失敗(例如尚未設定 API 金鑰、
// 呼叫逾時)要把扣掉的量退回——失敗的呼叫不該讓使用者付錢。一律退回
// balance(不會過期的那個桶),不嘗試還原 reserve 當下 grantedCredits/
// balance 的精確拆分比例,對使用者只會更有利(退回的額度不會不小心過期),
// 不是計費正確性或安全問題。
export async function refundCredits(userId: string, cost: number): Promise<void> {
  if (cost <= 0) return;
  await prisma.creditBalance.update({
    where: { userId },
    data: { balance: { increment: cost }, totalSpent: { decrement: cost } },
  });
}

// 回傳要塞進呼叫端既有 `prisma.$transaction([...])` 陣列的稽核紀錄寫入,
// 不獨立開自己的交易——這個專案在 Supabase pooler 上踩過互動式
// transaction 逾時的坑(見 [[trademind-project]] 既有記錄),所有寫入一律
// 走批次陣列形式。真正的扣款已經在上面的 reserveCredits() 完成,這支
// 函式只負責留一筆 CreditTransaction 歷史紀錄,不重複扣款。
export function creditSpendOps(
  userId: string,
  cost: number,
  reason: string,
): [Prisma.PrismaPromise<unknown>] {
  return [
    prisma.creditTransaction.create({
      data: { userId, amount: -cost, reason },
    }),
  ];
}
