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
// 隱含在連線本身裡(目前 Bybit/OKX 都是純加密貨幣交易所,一律是 CRYPTO);
// 未連接的手動模板則讀使用者自己宣告的 assetClass,沒宣告的視為「未知」
// 也要算進「混合」判斷,不能悄悄當成跟其他模板同一類。即使只選了 1 個
// 模板也要算出 classes(不能提早return空陣列),因為空狀態文案(「連接
// 交易所同步」提示)也要看這個結果決定要不要顯示,不是只有多模板混合
// 檢查在用。
export async function resolveAssetClassMix(
  accountIds: string[],
): Promise<{ mixed: boolean; classes: string[] }> {
  if (accountIds.length === 0) return { mixed: false, classes: [] };

  const accounts = await prisma.tradingAccount.findMany({
    where: { id: { in: accountIds } },
    select: { assetClass: true, exchangeConnection: { select: { id: true } } },
  });

  const classes = new Set(
    accounts.map((a) => (a.exchangeConnection ? "CRYPTO" : (a.assetClass ?? "未知"))),
  );

  return { mixed: classes.size > 1, classes: Array.from(classes) };
}

// 目前支援自動同步的交易所(Bybit/OKX)都是純加密貨幣交易所。空狀態文案
// 建議「連接交易所同步」之前,先確認目前篩選範圍不是已經明確宣告成
// 非加密貨幣資產類別(如期貨/股票/外匯/選擇權)——沒宣告過(「未知」)
// 或本來就是加密貨幣則仍然適用建議連接。
export function canSuggestExchangeSync(classes: string[]): boolean {
  return classes.length === 0 || classes.some((c) => c === "CRYPTO" || c === "未知");
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
