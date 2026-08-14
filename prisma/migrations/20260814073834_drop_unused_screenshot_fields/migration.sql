/*
  Warnings:

  - You are about to drop the column `screenshotAfterUrl` on the `Trade` table. All the data in the column will be lost.
  - You are about to drop the column `screenshotBeforeUrl` on the `Trade` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "screenshotAfterUrl",
DROP COLUMN "screenshotBeforeUrl";
