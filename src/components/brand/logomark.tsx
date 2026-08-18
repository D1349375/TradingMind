// 對應 brand/trademind-card-{light,dark}.svg 裡的 TM 標誌圖形,
// 抽出純圖形部分(不含外圈圓環)供小尺寸場景(側邊欄/登入頁)重複使用。
export function Logomark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="8" cy="3" r="1.3" fill="currentColor" />
      <rect x="3" y="6" width="18" height="2.4" fill="currentColor" />
      <rect x="6.8" y="6" width="2.4" height="15" fill="currentColor" />
      <rect x="12" y="9" width="2.2" height="12" fill="currentColor" />
      <rect x="18.8" y="9" width="2.2" height="12" fill="currentColor" />
      <line x1="13.1" y1="9" x2="16.5" y2="16" stroke="currentColor" strokeWidth="2.2" />
      <line x1="19.9" y1="9" x2="16.5" y2="16" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}
