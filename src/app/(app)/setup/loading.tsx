import { Bar, CardSkeleton, PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/skeleton";

export default function SetupLoading() {
  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <PageHeaderSkeleton titleW="130px" />
        <div className="grid grid-cols-2 gap-4">
          <CardSkeleton>
            <Bar w="30%" className="mb-3" />
            <RowsSkeleton rows={5} cols={3} />
          </CardSkeleton>
          <CardSkeleton>
            <Bar w="30%" className="mb-3" />
            <RowsSkeleton rows={5} cols={3} />
          </CardSkeleton>
        </div>
      </div>
    </div>
  );
}
