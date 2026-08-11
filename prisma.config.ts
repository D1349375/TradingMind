import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Next.js 讀 .env.local,Prisma CLI 預設只讀 .env,這裡明確指定
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
