import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // 沒設 DSN 時 SDK 自己靜默停用,不影響 server 正常運作。
});
