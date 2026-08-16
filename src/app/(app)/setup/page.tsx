import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getSetupPageData } from "@/lib/page-cache";
import { SetupView } from "@/components/analysis/setup-view";

export const metadata: Metadata = {
  title: "Setup 分析 · TradeMind",
};

export default async function SetupPage() {
  const user = await getCurrentUser();
  const { trades, enabledFieldKeys } = await getSetupPageData(user!.id);

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">Setup 分析</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            哪個策略最賺錢、哪個維度表現最穩定
          </p>
        </div>
        <SetupView trades={trades} enabledFieldKeys={enabledFieldKeys} />
      </div>
    </div>
  );
}
