/*
  Warnings:

  - Added the required column `normalizedName` to the `products_brands` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "products_brands" ADD COLUMN     "normalizedName" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "products_brands_normalizedName_idx" ON "products_brands"("normalizedName");
