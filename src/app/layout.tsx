import type { Metadata } from "next";
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
