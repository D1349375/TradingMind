import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Dashboard · TradeMind",
};

// 真正的 Dashboard(統計格/損益曲線/目標與風控)還沒做,
// 這裡先顯示同步進度,讓使用者知道資料有沒有進來。
export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [tradeCount, conn] = await Promise.all([
    prisma.trade.count({ where: { userId: user!.id } }),
    prisma.bybitConnection.findUnique({
      where: { userId: user!.id },
      select: { lastSyncedAt: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-9 py-8">
      <div className="mb-6">
        <h1 className="text-[1.4rem] font-semibold">Dashboard</h1>
        <p className="mt-0.5 text-[0.84rem] text-text-secondary">
          {conn?.lastSyncedAt
            ? `上次同步:${conn.lastSyncedAt.toLocaleString("zh-TW")}`
            : "尚未同步"}
        </p>
      </div>

      <div className="rounded border border-border bg-surface px-5 py-6">
        <div className="mb-1 text-[0.9rem] font-semibold">
          目前有 {tradeCount} 筆交易紀錄
        </div>
        <p className="text-[0.84rem] leading-relaxed text-text-secondary">
          統計面板(總損益、勝率、獲利因子、累計曲線、目標與風控)依建置順序排在
          交易記錄頁之後。版面設計見 prototype/index.html 與 design.md。
        </p>
      </div>
    </div>
  );
}
