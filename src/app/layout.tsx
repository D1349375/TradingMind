import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradeMind",
  description: "交易日誌平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning:下方的 script 會在 hydration 前就把
    // data-theme 與 font-size 寫到 <html> 上,React 端沒有這些屬性,
    // 不抑制的話每次載入都會噴 hydration 警告。只影響這個節點本身。
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        {/* 在首次繪製前套用主題與字級,避免閃爍。
            對應 design.md 第三節:介面外殼固定 px、內容區用 rem。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              var t=localStorage.getItem('tm-theme');
              if(t)document.documentElement.setAttribute('data-theme',t);
              var s=localStorage.getItem('tm-scale');
              if(s)document.documentElement.style.fontSize=s+'px';
            }catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        {/* 點擊當下立刻出現,不用等伺服器回應——先讓使用者知道「有反應」,
            跟頁面本身的 loading.tsx 骨架畫面互補,不是取代。顏色用
            --accent 讓淺/深色主題自動一致,不寫死其中一個。 */}
        <NextTopLoader
          color="var(--accent)"
          height={2}
          showSpinner={false}
          shadow={false}
        />
        {children}
      </body>
    </html>
  );
}
