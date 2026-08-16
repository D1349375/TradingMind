-- AI 週報/月報(規劃書 Phase 3,設計文件已定案)+ 訂閱層級欄位骨架
-- (2026-08-16)。全新表 + 帶預設值的新欄位,不需要資料回填。

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'STANDARD', 'ADVANCED');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('WEEK', 'MONTH');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "PeriodReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" "PeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "persona" TEXT NOT NULL,
    "statsSnapshot" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PeriodReport_userId_createdAt_idx" ON "PeriodReport"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PeriodReport" ADD CONSTRAINT "PeriodReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
