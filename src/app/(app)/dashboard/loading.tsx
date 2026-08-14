import {
  Bar,
  CardSkeleton,
  PageHeaderSkeleton,
  CalendarGridSkeleton,
  StatGridSkeleton,
} from "@/components/shell/skeleton";

export default function DashboardLoading() {
  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <PageHeaderSkeleton titleW="110px" />
          <Bar w="140px" h="2rem" className="rounded" />
        </div>

        <div className="mb-5 flex items-center gap-5 border-b border-border pb-2">
          <Bar w="48px" h="0.9rem" />
          <Bar w="64px" h="0.9rem" />
        </div>

        <StatGridSkeleton cols={6} />

        <div className="mb-5 grid grid-cols-2 gap-4">
          <CardSkeleton className="flex items-center gap-[18px] py-5">
            <div className="h-[104px] w-[104px] shrink-0 animate-pulse rounded-full bg-skeleton" />
            <div className="flex-1 space-y-2">
              <Bar w="40%" />
              <Bar w="90%" />
            </div>
          </CardSkeleton>
          <CardSkeleton className="space-y-3 py-5">
            <Bar w="35%" />
            <Bar w="100%" h="0.5rem" className="rounded-full" />
          </CardSkeleton>
        </div>

        <div className="mb-4 grid grid-cols-[1.4fr_1fr] gap-4">
          <CardSkeleton>
            <Bar w="30%" className="mb-3" />
            <div className="h-[150px] w-full animate-pulse rounded bg-skeleton" />
          </CardSkeleton>
          <CardSkeleton className="space-y-3">
            <Bar w="40%" />
            <Bar w="100%" h="0.63rem" className="rounded-full" />
          </CardSkeleton>
        </div>

        <CardSkeleton>
          <Bar w="25%" className="mb-3" />
          <CalendarGridSkeleton weeks={5} />
        </CardSkeleton>
      </div>
    </div>
  );
}
