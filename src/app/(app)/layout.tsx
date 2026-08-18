import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSidebarData } from "@/lib/sidebar-data";
import { resolveAccountScope } from "@/lib/account-filter";
import { Sidebar } from "@/components/shell/sidebar";
import { countPendingReview } from "@/lib/notifications";

// 登入後的共用外框(對應 prototype 的 .shell)。
// 所有需要登入的頁面都放在這個 route group 底下。
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const scope = await resolveAccountScope(user.id);

  // 側邊欄資料快取 30 秒(見 lib/sidebar-data.ts 註解)——這個 layout 在
  // 每次頁面切換都會重新執行,不快取的話等於每點一次連結就重查 4 次資料庫。
  const { credits, reviewTrades, recentTrades, goal } =
    await getSidebarData(user.id, scope.accountIds, scope.isFiltered);

  return (
    <div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible">
      <Sidebar
        email={user.email}
        credits={credits}
        pendingReview={countPendingReview(reviewTrades)}
        recentTrades={recentTrades}
        goal={goal}
        accountFilter={scope}
      />
      {/* h-screen+overflow-hidden 在螢幕上是為了讓側邊欄固定、內容區自己捲動,
          但列印時會把內容裁切成只有一個螢幕高度——print: 變體解除這個限制,
          讓瀏覽器的列印分頁邏輯接手。 */}
      <main className="flex-1 overflow-y-auto bg-canvas print:h-auto print:overflow-visible">
        {children}
      </main>
    </div>
  );
}
