import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ecpay_aio_nodejs 在建構 CheckMacValue 時用 `__dirname` 讀自己套件內的
  // ECpayPayment.xml——webpack 打包會改寫 __dirname 指到 .next/ 底下,檔案
  // 就找不到了(ENOENT)。排除讓它在 server 端維持原生 require,__dirname
  // 才會是 node_modules 裡的真實路徑。
  experimental: {
    serverComponentsExternalPackages: ["ecpay_aio_nodejs"],
  },
};

// 沒設 SENTRY_AUTH_TOKEN 時,source map 上傳這類建置期功能會被跳過並印警告,
// 不會讓 build 失敗——本機開發/沒申請 Sentry 帳號時完全不受影響。
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
