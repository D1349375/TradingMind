import { Bar, CardSkeleton, PageHeaderSkeleton } from "@/components/shell/skeleton";

export default function PlaybookLoading() {
  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <PageHeaderSkeleton titleW="100px" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <Bar w="160px" h="1rem" />
                <Bar w="70px" />
              </div>
              <Bar w="90%" />
              <Bar w="60%" />
            </CardSkeleton>
          ))}
        </div>
      </div>
    </div>
  );
}
