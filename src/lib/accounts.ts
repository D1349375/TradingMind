import { prisma } from "@/lib/prisma";

// 擁有權驗證:防止跨帳號存取(比照 Trade PATCH 的 userId 綁定模式)。
// 回傳 null 代表這個 accountId 不存在,或不屬於這個使用者。
export async function getOwnedAccount(userId: string, accountId: string) {
  return prisma.tradingAccount.findFirst({
    where: { id: accountId, userId },
  });
}
