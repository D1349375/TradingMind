-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "stopLossPrice" DECIMAL(65,30),
ADD COLUMN     "takeProfitPrice" DECIMAL(65,30);
