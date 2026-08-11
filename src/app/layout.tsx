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
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
