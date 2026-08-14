// Server/edge 端 Sentry 初始化。沒設 NEXT_PUBLIC_SENTRY_DSN 時 Sentry SDK
// 自己就會靜默停用(不丟錯誤),比照 ANTHROPIC_API_KEY 的優雅降級慣例——
// 開發環境不用申請 Sentry 帳號也能正常跑。
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = async (
  ...args: Parameters<
    typeof import("@sentry/nextjs").captureRequestError
  >
) => {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
