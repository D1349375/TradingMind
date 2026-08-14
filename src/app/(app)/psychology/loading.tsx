import { Bar, CardSkeleton, PageHeaderSkeleton, StatGridSkeleton } from "@/components/shell/skeleton";

export default function PsychologyLoading() {
  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <PageHeaderSkeleton titleW="110px" />
        <StatGridSkeleton cols={4} />
        <div className="grid grid-cols-2 gap-4">
          <CardSkeleton className="space-y-3">
            <Bar w="35%" />
            <div className="h-[140px] w-full animate-pulse rounded bg-skeleton" />
          </CardSkeleton>
          <CardSkeleton className="space-y-3">
            <Bar w="35%" />
            <div className="h-[140px] w-full animate-pulse rounded bg-skeleton" />
          </CardSkeleton>
        </div>
      </div>
    </div>
  );
}
