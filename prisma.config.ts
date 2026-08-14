import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js 讀 .env.local,Prisma CLI 預設只讀 .env,這裡明確指定
config({ path: ".env.local" });

// Prisma 7 的 config API(@prisma/config 的 Datasource 型別)只有 url/
// shadowDatabaseUrl,沒有舊版 schema.prisma 才有的 directUrl 欄位——這裡是
// CLI(migrate/generate)專用設定,跟 src/lib/prisma.ts 的 app 執行期連線
// (讀 DATABASE_URL,走 transaction-mode pooler)完全分開,改這裡不影響 app。
// 踩坑記錄:`prisma migrate dev` 用 Supabase transaction-mode pooler(6543)
// 會整個掛住不回應(PgBouncer transaction 模式跟 migration engine 的
// advisory lock 機制不相容),必須用 session-mode pooler(5432,即 DIRECT_URL)
// 才會正常跑完。沒設 DIRECT_URL 時退回 DATABASE_URL,避免本機沒設定時直接炸掉。
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
