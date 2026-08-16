import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/page-cache";
import { resolveAccountScope, resolveAssetClassMix, canSuggestBybit } from "@/lib/account-filter";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard · TradeMind",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const scope = await resolveAccountScope(user!.id);
  const [{ trades, lastSyncedAt, goal: goals }, assetClassMix] = await Promise.all([
    getDashboardData(user!.id, scope.accountIds, scope.isFiltered),
    resolveAssetClassMix(scope.accountIds),
  ]);

  // 在伺服器端(固定 UTC 時區)格式化成字串再傳給 client component,
  // 避免把 Date 物件丟進去在瀏覽器端重新格式化導致 hydration 不一致。
  const lastSyncedText = lastSyncedAt
    ? `上次同步:${new Date(lastSyncedAt).toLocaleString("zh-TW", { timeZone: "UTC" })} (UTC)`
    : "尚未同步";

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <DashboardView
          trades={trades}
          goals={goals}
          lastSyncedText={lastSyncedText}
          assetClassMixed={assetClassMix.mixed}
          showBybitHint={canSuggestBybit(assetClassMix.classes)}
        />
      </div>
    </div>
  );
}
