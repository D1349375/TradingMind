// 骨架畫面共用元件。loading.tsx 用這些拼出跟真實版面同形狀的佔位區塊,
// 資料到了之後無縫換成真內容,版面不會跳動。顏色一律用 --skeleton token,
// 不要在個別 loading.tsx 裡另外挑色。

export function Bar({
  w = "100%",
  h = "0.85rem",
  className = "",
}: {
  w?: string;
  h?: string;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded bg-skeleton ${className}`}
      style={{ width: w, height: h }}
    />
  );
}

// 對應每一頁共用的「標題+副標」頭部(px-9 py-8 外層搭配)。
export function PageHeaderSkeleton({ titleW = "140px" }: { titleW?: string }) {
  return (
    <div className="mb-5">
      <Bar w={titleW} h="1.4rem" className="mb-2" />
      <Bar w="220px" h="0.84rem" />
    </div>
  );
}

export function CardSkeleton({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded border border-border bg-surface px-4 py-4 ${className}`}>
      {children}
    </div>
  );
}

// 對應 Dashboard/StatGrid 那種 N 欄併排的緊湊數據格。
export function StatGridSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <div
      className="mb-5 grid gap-px overflow-hidden rounded border border-border bg-border"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="bg-surface px-4 py-3.5">
          <Bar w="60%" h="0.78rem" className="mb-2" />
          <Bar w="80%" h="1.29rem" />
        </div>
      ))}
    </div>
  );
}

// 對應表格/清單那種一列一列的形狀。
export function RowsSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Bar key={j} w={j === 0 ? "26%" : "14%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

// 對應日曆格那種 7 欄網格。
export function CalendarGridSkeleton({ weeks = 5 }: { weeks?: number }) {
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-border bg-border">
      {Array.from({ length: weeks * 7 }).map((_, i) => (
        <div key={i} className="min-h-[62px] bg-surface p-1.5">
          <Bar w="16px" h="0.78rem" />
        </div>
      ))}
    </div>
  );
}
