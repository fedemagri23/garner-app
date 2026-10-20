-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "currency" CHAR(3),
ADD COLUMN     "previousPriceCents" INTEGER,
ADD COLUMN     "priceCents" INTEGER,
ADD COLUMN     "reason" "PriceAlertType";
