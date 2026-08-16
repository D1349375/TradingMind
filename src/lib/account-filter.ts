import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_FILTER_COOKIE } from "@/lib/account-filter-cookie";

// 分析頁的全域帳戶篩選器(規劃書 5.5:預設「全部模板合併檢視」,可切換成
// 單一或複選幾個模板)。用 cookie 存目前選取的模板 id 清單而不是 URL query
// param——這樣側邊欄跟每一個分析頁才能共用同一個篩選狀態,不用逐頁自己
// 傳參數。cookie 內容是使用者自己可以竄改的,所以每次讀取都要重新對照
// 這個使用者實際擁有的模板清單做交集,不能直接信任。
export { ACCOUNT_FILTER_COOKIE };

export type AccountScope = {
  // 目前實際生效、已驗證過擁有權的帳戶 id 清單——沒有篩選時等於 allAccountIds。
  accountIds: string[];
  allAccountIds: string[];
  // 使用者是否主動選了子集合(而不是預設的全部合併)
  isFiltered: boolean;
};

// 混合資產類別檢查(規劃書 5.5 補充,Q16-Q18)——已連接交易所的模板資產類別
// 隱含在連線本身裡(目前只有 Bybit,一律是 CRYPTO);未連接的手動模板則讀
// 使用者自己宣告的 assetClass,沒宣告的視為「未知」也要算進「混合」判斷,
// 不能悄悄當成跟其他模板同一類。
export async function resolveAssetClassMix(
  accountIds: string[],
): Promise<{ mixed: boolean; classes: string[] }> {
  if (accountIds.length <= 1) return { mixed: false, classes: [] };

  const accounts = await prisma.tradingAccount.findMany({
    where: { id: { in: accountIds } },
    select: { assetClass: true, bybitConnection: { select: { id: true } } },
  });

  const classes = new Set(
    accounts.map((a) => (a.bybitConnection ? "CRYPTO" : (a.assetClass ?? "未知"))),
  );

  return { mixed: classes.size > 1, classes: Array.from(classes) };
}

export async function resolveAccountScope(userId: string): Promise<AccountScope> {
  const allAccounts = await prisma.tradingAccount.findMany({
    where: { userId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const allAccountIds = allAccounts.map((a) => a.id);

  const raw = cookies().get(ACCOUNT_FILTER_COOKIE)?.value ?? "";
  const requested = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const validSet = new Set(allAccountIds);
  const filtered = requested.filter((id) => validSet.has(id));

  if (filtered.length === 0) {
    return { accountIds: allAccountIds, allAccountIds, isFiltered: false };
  }
  return { accountIds: filtered, allAccountIds, isFiltered: true };
}
