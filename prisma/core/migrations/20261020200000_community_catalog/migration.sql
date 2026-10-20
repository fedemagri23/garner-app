-- CreateEnum
CREATE TYPE "CatalogOrigin" AS ENUM ('VERIFIED', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('ACTIVE', 'UNDER_REVIEW', 'HIDDEN', 'MERGED');

-- CreateEnum
CREATE TYPE "FlagTarget" AS ENUM ('PRODUCT', 'STORE');

-- CreateEnum
CREATE TYPE "FlagReason" AS ENUM ('DUPLICATE', 'WRONG_INFO', 'NOT_EXIST', 'INAPPROPRIATE');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "origin" "CatalogOrigin" NOT NULL DEFAULT 'VERIFIED',
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "mergedIntoId" UUID,
ADD COLUMN     "weight" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "confirmationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "flagCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActivityAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "supermarkets" ADD COLUMN     "origin" "CatalogOrigin" NOT NULL DEFAULT 'VERIFIED',
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "store_locations" ADD COLUMN     "origin" "CatalogOrigin" NOT NULL DEFAULT 'VERIFIED',
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "pricedProductCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contributorCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "publishedAt" TIMESTAMPTZ(3),
ADD COLUMN     "flagCount" INTEGER NOT NULL DEFAULT 0;

-- Every shop there is today is the team's, and visible.
UPDATE "store_locations" SET "publishedAt" = "createdAt";

-- CreateTable
CREATE TABLE "product_confirmations" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_flags" (
    "id" UUID NOT NULL,
    "targetType" "FlagTarget" NOT NULL,
    "targetId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reason" "FlagReason" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_price_contributors" (
    "id" UUID NOT NULL,
    "storeLocationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "firstAcceptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_price_contributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_audit_log" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_confirmations_userId_idx" ON "product_confirmations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "product_confirmations_productId_userId_key" ON "product_confirmations"("productId", "userId");

-- CreateIndex
CREATE INDEX "content_flags_targetType_targetId_idx" ON "content_flags"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "content_flags_userId_idx" ON "content_flags"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "content_flags_targetType_targetId_userId_key" ON "content_flags"("targetType", "targetId", "userId");

-- CreateIndex
CREATE INDEX "store_price_contributors_storeLocationId_idx" ON "store_price_contributors"("storeLocationId");

-- CreateIndex
CREATE INDEX "store_price_contributors_userId_idx" ON "store_price_contributors"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "store_price_contributors_storeLocationId_productId_userId_key" ON "store_price_contributors"("storeLocationId", "productId", "userId");

-- CreateIndex
CREATE INDEX "catalog_audit_log_targetType_targetId_idx" ON "catalog_audit_log"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "catalog_audit_log_actorId_createdAt_idx" ON "catalog_audit_log"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "products_origin_moderationStatus_weight_idx" ON "products"("origin", "moderationStatus", "weight");

-- CreateIndex
CREATE INDEX "products_createdById_createdAt_idx" ON "products"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "store_locations_origin_publishedAt_idx" ON "store_locations"("origin", "publishedAt");

-- CreateIndex
CREATE INDEX "store_locations_createdById_createdAt_idx" ON "store_locations"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supermarkets" ADD CONSTRAINT "supermarkets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_locations" ADD CONSTRAINT "store_locations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_confirmations" ADD CONSTRAINT "product_confirmations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_confirmations" ADD CONSTRAINT "product_confirmations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_price_contributors" ADD CONSTRAINT "store_price_contributors_storeLocationId_fkey" FOREIGN KEY ("storeLocationId") REFERENCES "store_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_price_contributors" ADD CONSTRAINT "store_price_contributors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
