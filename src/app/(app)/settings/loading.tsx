import { Bar, CardSkeleton, PageHeaderSkeleton } from "@/components/shell/skeleton";

export default function SettingsLoading() {
  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <PageHeaderSkeleton titleW="70px" />
        <div className="mb-5 flex gap-5 border-b border-border pb-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Bar key={i} w="64px" h="0.85rem" />
          ))}
        </div>
        <div className="max-w-[640px]">
          <CardSkeleton className="space-y-3">
            <Bar w="40%" />
            <Bar w="100%" />
            <Bar w="100%" />
            <Bar w="30%" h="2rem" />
          </CardSkeleton>
        </div>
      </div>
    </div>
  );
}
