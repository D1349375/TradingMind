import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dashboard · TradeMind",
};

// 目前只是「登入後有東西可看」的落地頁,用來驗證身份驗證串通。
// 真正的 Dashboard(統計格/損益曲線/目標與風控)照建置順序排在交易記錄頁之後。
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-canvas px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[1.4rem] font-semibold">Dashboard</h1>
            <p className="mt-0.5 text-[0.84rem] text-text-secondary">
              已登入:{user.email}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded border border-border bg-surface px-3 py-1.5 text-[0.84rem] text-text transition-colors hover:border-accent hover:text-accent"
            >
              登出
            </button>
          </form>
        </div>

        <div className="rounded border border-border bg-surface px-5 py-6">
          <div className="mb-1 text-[0.9rem] font-semibold">
            身份驗證已串通
          </div>
          <p className="text-[0.84rem] text-text-secondary">
            接下來依建置順序:Bybit API 安全連線 → 定時同步任務 → 交易記錄頁 →
            統計面板。版面設計見 prototype/index.html 與 design.md。
          </p>
        </div>
      </div>
    </main>
  );
}
