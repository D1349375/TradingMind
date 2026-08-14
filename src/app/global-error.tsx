"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// App Router 的根層級錯誤邊界——一般 error.tsx 抓不到 layout.tsx 本身炸掉的情況,
// 只有 global-error.tsx 抓得到,所以 Sentry 官方建議兩者都要有。
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="zh-Hant">
      <body>
        <div style={{ padding: "4rem 1.5rem", textAlign: "center", fontFamily: "sans-serif" }}>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            發生了未預期的錯誤
          </h1>
          <p style={{ color: "#666" }}>請重新整理頁面,問題持續發生的話請通知我們。</p>
        </div>
      </body>
    </html>
  );
}
