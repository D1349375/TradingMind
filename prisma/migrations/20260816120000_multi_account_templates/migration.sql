-- 多模板帳戶架構(規劃書 5.5/Q23,2026-08-16)
-- BybitConnection / Goal 從 userId 唯一改成 accountId 唯一。
-- TradingAccount 目前是空表(從沒有 UI/程式碼建立過任何一列),所以先幫每個
-- 既有 User 建一個預設模板,再把既有的 BybitConnection/Goal/Trade 全部回填
-- 掛到這個預設模板底下——遷移前後對「只有一個帳戶」的既有使用者來說行為
-- 應該完全一樣,只是資料底層多了一層可擴充的模板結構。

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('CRYPTO', 'FUTURES', 'STOCK', 'FOREX', 'OPTIONS');

-- AlterTable: TradingAccount 加資產類別欄位(只有手動、未綁交易所的模板會用到)
ALTER TABLE "TradingAccount" ADD COLUMN "assetClass" "AssetClass";

-- 資料回填 1:每個既有 User 都建一個預設模板「我的帳戶」
INSERT INTO "TradingAccount" ("id", "userId", "label", "kind", "createdAt")
SELECT gen_random_uuid(), "id", '我的帳戶', 'LIVE', now()
FROM "User"
WHERE NOT EXISTS (
  SELECT 1 FROM "TradingAccount" ta WHERE ta."userId" = "User"."id"
);

-- AlterTable: BybitConnection 先加 accountId(允許 null,回填完才收緊)
ALTER TABLE "BybitConnection" ADD COLUMN "accountId" TEXT;

-- 資料回填 2:BybitConnection 掛到該使用者的預設模板
UPDATE "BybitConnection" bc
SET "accountId" = (
  SELECT ta."id" FROM "TradingAccount" ta
  WHERE ta."userId" = bc."userId"
  ORDER BY ta."createdAt" ASC
  LIMIT 1
)
WHERE bc."accountId" IS NULL;

-- DropForeignKey / DropIndex / DropColumn:拿掉舊的 userId 唯一鍵
ALTER TABLE "BybitConnection" DROP CONSTRAINT "BybitConnection_userId_fkey";
DROP INDEX "BybitConnection_userId_key";
ALTER TABLE "BybitConnection" DROP COLUMN "userId";

-- 收緊 accountId:NOT NULL + UNIQUE + FK
ALTER TABLE "BybitConnection" ALTER COLUMN "accountId" SET NOT NULL;
CREATE UNIQUE INDEX "BybitConnection_accountId_key" ON "BybitConnection"("accountId");
ALTER TABLE "BybitConnection" ADD CONSTRAINT "BybitConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Goal 走同樣的四步(加欄位 -> 回填 -> 拿掉舊唯一鍵 -> 收緊新唯一鍵)
ALTER TABLE "Goal" ADD COLUMN "accountId" TEXT;

UPDATE "Goal" g
SET "accountId" = (
  SELECT ta."id" FROM "TradingAccount" ta
  WHERE ta."userId" = g."userId"
  ORDER BY ta."createdAt" ASC
  LIMIT 1
)
WHERE g."accountId" IS NULL;

ALTER TABLE "Goal" DROP CONSTRAINT "Goal_userId_fkey";
DROP INDEX "Goal_userId_key";
ALTER TABLE "Goal" DROP COLUMN "userId";

ALTER TABLE "Goal" ALTER COLUMN "accountId" SET NOT NULL;
CREATE UNIQUE INDEX "Goal_accountId_key" ON "Goal"("accountId");
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 資料回填 3:既有交易(同步/CSV匯入/手動,accountId 從沒被寫入過,一律是
-- null)全部掛回該使用者的預設模板,之後帳戶篩選器才看得到這些舊資料。
UPDATE "Trade" t
SET "accountId" = (
  SELECT ta."id" FROM "TradingAccount" ta
  WHERE ta."userId" = t."userId"
  ORDER BY ta."createdAt" ASC
  LIMIT 1
)
WHERE t."accountId" IS NULL;
