// 起始頁佔位——確認 design.md 的 token 有正確接到 Tailwind。
// 真正的 Dashboard 頁面留到規劃書建置順序圖的第 ⑥ 步(交易記錄頁)之後再做。
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="rounded border border-border bg-surface px-8 py-6 text-center">
        <div className="mb-1 text-lg font-semibold text-text">TradeMind</div>
        <div className="text-sm text-text-secondary">
          專案骨架已就緒,等待資料庫連線與身份驗證接上。
        </div>
      </div>
    </main>
  );
}
