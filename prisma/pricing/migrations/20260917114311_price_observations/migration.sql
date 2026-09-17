-- CreateEnum
CREATE TYPE "PriceSourceType" AS ENUM ('USER_REPORTED', 'USER_WITH_EVIDENCE', 'PURCHASE_CONFIRMED', 'EXTERNAL_API');

-- CreateEnum
CREATE TYPE "PriceObservationStatus" AS ENUM ('ACCEPTED', 'FLAGGED', 'REJECTED');

-- CreateTable
CREATE TABLE "price_observations" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" "PriceSourceType" NOT NULL,
    "status" "PriceObservationStatus" NOT NULL,
    "reviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" UUID,
    "shoppingSessionId" UUID,
    "dedupeKey" TEXT,
    "evidencePhotoKey" TEXT,
    "evidenceNote" TEXT,

    CONSTRAINT "price_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_contributions" (
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "observationCount" INTEGER NOT NULL,
    "skippedCount" INTEGER NOT NULL,
    "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_contributions_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_observations_dedupeKey_key" ON "price_observations"("dedupeKey");

-- CreateIndex
CREATE INDEX "price_observations_productId_storeId_status_observedAt_idx" ON "price_observations"("productId", "storeId", "status", "observedAt");

-- CreateIndex
CREATE INDEX "price_observations_productId_status_observedAt_idx" ON "price_observations"("productId", "status", "observedAt");

-- CreateIndex
CREATE INDEX "price_observations_userId_receivedAt_idx" ON "price_observations"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "price_observations_receivedAt_idx" ON "price_observations"("receivedAt");

-- CreateIndex
CREATE INDEX "session_contributions_processedAt_idx" ON "session_contributions"("processedAt");
