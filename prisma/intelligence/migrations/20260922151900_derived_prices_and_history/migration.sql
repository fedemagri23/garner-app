-- CreateEnum
CREATE TYPE "PriceConfidenceLevel" AS ENUM ('VERY_RECENT', 'RECENTLY_VERIFIED', 'LIKELY_CURRENT', 'POSSIBLY_OUTDATED');

-- CreateTable
CREATE TABLE "derived_prices" (
    "productId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "minPriceCents" INTEGER NOT NULL,
    "maxPriceCents" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "confidenceLevel" "PriceConfidenceLevel" NOT NULL,
    "observationCount" INTEGER NOT NULL,
    "lastObservedAt" TIMESTAMPTZ(3) NOT NULL,
    "computedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "derived_prices_pkey" PRIMARY KEY ("productId","storeId")
);

-- CreateTable
CREATE TABLE "daily_price_history" (
    "productId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "weightedAverageCents" INTEGER NOT NULL,
    "minPriceCents" INTEGER NOT NULL,
    "maxPriceCents" INTEGER NOT NULL,
    "observationCount" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "isAnomalous" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_price_history_pkey" PRIMARY KEY ("productId","storeId","date")
);

-- CreateIndex
CREATE INDEX "derived_prices_productId_priceCents_idx" ON "derived_prices"("productId", "priceCents");

-- CreateIndex
CREATE INDEX "derived_prices_computedAt_idx" ON "derived_prices"("computedAt");

-- CreateIndex
CREATE INDEX "daily_price_history_productId_date_idx" ON "daily_price_history"("productId", "date");
