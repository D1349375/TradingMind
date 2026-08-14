import { Bar, CardSkeleton, CalendarGridSkeleton, PageHeaderSkeleton } from "@/components/shell/skeleton";

export default function CalendarLoading() {
  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <PageHeaderSkeleton titleW="110px" />
        <CardSkeleton>
          <div className="mb-3 flex items-center justify-between">
            <Bar w="140px" />
            <div className="flex gap-4">
              <Bar w="100px" />
              <Bar w="120px" />
            </div>
          </div>
          <CalendarGridSkeleton weeks={5} />
        </CardSkeleton>
      </div>
    </div>
  );
}
