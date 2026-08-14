// 瀏覽器端 Sentry 初始化(Next.js 會自動載入這個檔案,取代舊版
// sentry.client.config.ts 的角色)。沒設 DSN 時 SDK 靜默停用。
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // 只在真的有錯誤時才錄 replay,平常不錄,省額度也降低隱私疑慮。
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.5,
  integrations: [Sentry.replayIntegration()],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
