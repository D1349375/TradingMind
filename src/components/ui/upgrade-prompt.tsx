// 統一的升級提示卡——分級鎖(Dashboard/Setup分析/心態分析局部區塊、績效
// 分析整頁、多帳戶合併等)都用同一個元件,不要每個地方各自寫一段文案。
// 刻意顯示「被鎖住的東西長什麼樣子」的說明文字而不是整個消失不見,
// 呼應這個 app 一貫「誠實告知限制」的原則,不要讓使用者以為功能不存在。
export function UpgradePrompt({ feature, requiredTier = "STANDARD" }: { feature: string; requiredTier?: "STANDARD" | "ADVANCED" }) {
  return (
    <div className="rounded border border-dashed border-border bg-canvas px-4 py-6 text-center text-[0.85rem] text-text-secondary">
      <p className="mb-2">
        {feature}需要訂閱 <span className="font-semibold text-text">{requiredTier}</span> 方案才能使用
      </p>
      <a
        href="/settings?tab=subscription"
        className="inline-block rounded bg-accent px-3.5 py-1.5 text-[0.82rem] font-semibold text-white hover:opacity-90"
      >
        查看訂閱方案
      </a>
    </div>
  );
}
