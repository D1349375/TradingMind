import { prisma } from "@/lib/prisma";

// 固定窗口計數器,存在 Postgres(不另外接 Redis)。用 unique key 的
// INSERT ... ON CONFLICT 保證同一個 key 的併發請求是原子遞增,不會因為
// serverless 多個 instance 同時打而漏算。
//
// 只套用在會花錢或會打外部 API 的端點(Bybit 連線驗證/同步、Claude 分析),
// 一般讀取端點不需要。

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export async function checkRateLimit(
  scope: string,
  identity: string,
  opts: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const windowStart = Math.floor(Date.now() / 1000 / opts.windowSeconds);
  const key = `${scope}:${identity}:${windowStart}`;
  const expiresAt = new Date((windowStart + 1) * opts.windowSeconds * 1000);

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt")
    VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"
  `;
  const count = rows[0]?.count ?? 1;

  // 隨手清過期的舊窗口,機率性觸發,不需要另外排 cron job
  if (Math.random() < 0.02) {
    prisma.rateLimitBucket
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => {});
  }

  if (count > opts.limit) {
    const retryAfterSeconds = expiresAt.getTime() - Date.now();
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds / 1000)) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return Response.json(
    { error: `請求太頻繁,請 ${retryAfterSeconds} 秒後再試` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
