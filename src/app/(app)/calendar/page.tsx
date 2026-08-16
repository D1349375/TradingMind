import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getCalendarData } from "@/lib/page-cache";
import { resolveAccountScope } from "@/lib/account-filter";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = {
  title: "日曆視圖 · TradeMind",
};

export default async function CalendarPage() {
  const user = await getCurrentUser();
  const scope = await resolveAccountScope(user!.id);
  const trades = await getCalendarData(user!.id, scope.accountIds, scope.isFiltered);

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">日曆視圖</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            每日盈虧一覽 · 點日期看當天交易
          </p>
        </div>
        <CalendarView trades={trades} />
      </div>
    </div>
  );
}
