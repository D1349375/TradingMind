import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

// Credit 餘額刻意不跟其他側邊欄資料一起快取——使用者花費 Credit(發訊息/
// 單筆分析/週報月報)之後預期馬上看到餘額變化,這跟「待補充筆數/近3天
// 損益」那種慢個幾十秒沒差的資訊不是同一類。單獨查詢的成本很低(單一
// indexed lookup),不需要為了省這一條查詢去換使用者對扣款金額的信任感。
// 呼叫端(各個花費 Credit 的 client component)還要記得在動作成功後呼叫
// `router.refresh()`,不然 Next.js 不會重新跑這個 layout,單靠這裡不快取
// 沒有用——這支函式解決的是「快取太舊」,不是「什麼時候該重新整理」。
export async function getSidebarCredits(userId: string): Promise<number> {
  const balance = await prisma.creditBalance.findUnique({
    where: { userId },
    select: { balance: true },
  });
  return balance?.balance ?? 0;
}

// 側邊欄用的其他資料(待補充提醒/近3天損益/目標設定,不含 Credit 餘額,
// 見上面 getSidebarCredits 的說明)。這幾個查詢原本直接寫在
// (app)/layout.tsx 裡,問題是所有登入後頁面都共用這個 layout,而目前
// 每個路由都是 force-dynamic(靠 cookies() 驗證身份),Next.js 對 dynamic
// 路由不會沿用 Router Cache——結果是使用者每點一次側邊欄的任何連結,都會
// 重新對資料庫打查詢,即使目的頁面內容跟這些側邊欄資料完全無關。這幾個
// 數字本來就不需要毫秒級新鮮(慢個幾十秒才更新使用者感覺不出來),用
// unstable_cache 給 30 秒的快取窗口,同一個使用者在這段時間內連續切頁
// 不會重複打資料庫。
//
// 回傳值必須是 unstable_cache 可以安全序列化的純資料(number/string/null),
// 不能直接回傳 Prisma 的 Decimal/Date 物件,所以轉換都在這裡做完,
// 呼叫端(layout.tsx)拿到的就是能直接塞進 props 的形狀。
export const getSidebarData = unstable_cache(
  async (userId: string, accountIds: string[], isFiltered: boolean) => {
    // 沒有主動篩選(預設全部模板合併)時不加 accountId 條件,而不是塞
    // `{in: accountIds}`——後者會漏掉模板被刪除後留下的「未分類」交易
    // (accountId=null),見 lib/page-cache.ts 開頭的同一個說明。
    const tradeAccountId = isFiltered ? { in: accountIds } : undefined;
    const [reviewTrades, recentTrades, goals] = await Promise.all([
      prisma.trade.findMany({
        where: { userId, accountId: tradeAccountId },
        select: { closedAt: true, grade: true, reflectionNote: true },
      }),
      prisma.trade.findMany({
        where: {
          userId,
          accountId: tradeAccountId,
          closedAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        },
        select: { closedAt: true, realizedPnl: true },
      }),
      prisma.goal.findMany({ where: { accountId: { in: accountIds } } }),
    ]);

    // 只有剛好篩選到 1 個模板「而且」那個模板真的有設定 Goal 時,側邊欄的
    // 今日虧損警示才有一組明確的數字可以比對——判斷依據是選了幾個帳戶,
    // 不是查到幾筆 Goal(選 2 個帳戶但只有 1 個設定過 Goal,不能把那筆數字
    // 當成整個合併範圍的代表值)。多模板合併時跟 Dashboard 的 GoalCards
    // 一樣不硬合併。
    const goal = accountIds.length === 1 && goals.length === 1 ? goals[0] : null;

    return {
      reviewTrades: reviewTrades.map((t) => ({
        closedAt: t.closedAt?.toISOString() ?? null,
        grade: t.grade,
        reflectionNote: t.reflectionNote,
      })),
      recentTrades: recentTrades.map((t) => ({
        closedAt: t.closedAt?.toISOString() ?? null,
        realizedPnl: t.realizedPnl === null ? null : Number(t.realizedPnl),
      })),
      goal: {
        lossLimitMode: goal?.lossLimitMode ?? ("FIXED" as const),
        dailyLossFixed: goal?.dailyLossFixed ? Number(goal.dailyLossFixed) : null,
        dailyLossPercent: goal?.dailyLossPercent ? Number(goal.dailyLossPercent) : null,
        totalCapital: goal?.totalCapital ? Number(goal.totalCapital) : null,
      },
    };
  },
  ["sidebar-data"],
  { revalidate: 30 },
);
