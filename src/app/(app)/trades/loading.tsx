import { Bar, CardSkeleton, RowsSkeleton } from "@/components/shell/skeleton";

// 對應 trades/page.tsx 刻意不套 max-w 置中容器、左列表右詳情的版面。
export default function TradesLoading() {
  return (
    <div className="px-9 py-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <Bar w="120px" h="1.25rem" />
        <Bar w="90px" h="2rem" />
      </div>
      <div className="flex gap-4">
        <CardSkeleton className="w-[300px] shrink-0">
          <RowsSkeleton rows={8} cols={2} />
        </CardSkeleton>
        <CardSkeleton className="flex-1 space-y-4">
          <Bar w="30%" h="1.1rem" />
          <div className="flex gap-3 border-b border-border pb-2">
            <Bar w="60px" h="0.85rem" />
            <Bar w="60px" h="0.85rem" />
            <Bar w="60px" h="0.85rem" />
          </div>
          <div className="h-[300px] w-full animate-pulse rounded bg-skeleton" />
        </CardSkeleton>
      </div>
    </div>
  );
}
