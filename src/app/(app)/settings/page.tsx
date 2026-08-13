import Link from "next/link";
import type { Metadata } from "next";
import { BybitConnection } from "@/components/settings/bybit-connection";
import { GoalSettings } from "@/components/settings/goal-settings";

export const metadata: Metadata = {
  title: "設定 · TradeMind",
};

// 分頁對應 prototype/index.html 的設定頁四分頁。
// 目前只有「交易所連線」是實作的,其餘照建置順序之後補。
const TABS = [
  { key: "exchange", label: "交易所連線" },
  { key: "fields", label: "欄位自訂" },
  { key: "notify", label: "通知設定" },
  { key: "goals", label: "目標設定" },
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  // 登入檢查在 (app)/layout.tsx 統一處理
  const active =
    TABS.find((t) => t.key === searchParams.tab)?.key ?? "exchange";

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">設定</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            欄位、交易所連線、通知與目標
          </p>
        </div>

        <div className="mb-5 flex gap-5 border-b border-border">
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={`/settings?tab=${tab.key}`}
                className={
                  isActive
                    ? "border-b-2 border-accent pb-2 text-[0.85rem] font-semibold text-text"
                    : "border-b-2 border-transparent pb-2 text-[0.85rem] text-text-secondary hover:text-text"
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <div className="max-w-[640px]">
          {active === "exchange" ? (
            <BybitConnection />
          ) : active === "goals" ? (
            <GoalSettings />
          ) : (
            <div className="rounded border border-border bg-surface px-5 py-10 text-center">
              <div className="mb-1 text-[0.9rem] font-semibold text-text-secondary">
                尚未實作
              </div>
              <p className="text-[0.82rem] text-text-secondary">
                版面設計已在 prototype/index.html 定稿,依建置順序後續補上。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
