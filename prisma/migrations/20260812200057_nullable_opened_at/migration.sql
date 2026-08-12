-- DropIndex
DROP INDEX "Trade_userId_openedAt_idx";

-- AlterTable
ALTER TABLE "Trade" ALTER COLUMN "openedAt" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Trade_userId_closedAt_idx" ON "Trade"("userId", "closedAt");
