import { Bar, CardSkeleton, PageHeaderSkeleton } from "@/components/shell/skeleton";

export default function JournalLoading() {
  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[840px]">
        <PageHeaderSkeleton titleW="110px" />
        <CardSkeleton className="space-y-3">
          <Bar w="140px" />
          <div className="h-[220px] w-full animate-pulse rounded bg-skeleton" />
        </CardSkeleton>
      </div>
    </div>
  );
}
