-- CreateEnum
CREATE TYPE "OptimizationMode" AS ENUM ('CHEAPEST', 'BEST_BALANCE', 'SIMPLEST');

-- CreateEnum
CREATE TYPE "OptimizationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "optimization_preferences" (
    "userId" UUID NOT NULL,
    "maxStores" INTEGER NOT NULL DEFAULT 2,
    "maxAdditionalDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "maxAdditionalMinutes" INTEGER NOT NULL DEFAULT 20,
    "minSavingsCentsPerExtraStore" INTEGER NOT NULL DEFAULT 400,
    "mode" "OptimizationMode" NOT NULL DEFAULT 'BEST_BALANCE',
    "preferredSupermarketIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedSupermarketIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "optimization_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "optimization_requests" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "listId" UUID,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL,
    "maxStores" INTEGER NOT NULL,
    "maxAdditionalDistanceKm" DOUBLE PRECISION NOT NULL,
    "maxAdditionalMinutes" INTEGER NOT NULL,
    "minSavingsCentsPerExtraStore" INTEGER NOT NULL,
    "mode" "OptimizationMode" NOT NULL,
    "preferredSupermarketIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedSupermarketIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "OptimizationStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "error" TEXT,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB,
    "recommendedTotalCents" INTEGER,
    "recommendedStoreCount" INTEGER,

    CONSTRAINT "optimization_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "optimization_requests_ownerId_requestedAt_idx" ON "optimization_requests"("ownerId", "requestedAt");

-- CreateIndex
CREATE INDEX "optimization_requests_listId_fingerprint_completedAt_idx" ON "optimization_requests"("listId", "fingerprint", "completedAt");

-- AddForeignKey
ALTER TABLE "optimization_preferences" ADD CONSTRAINT "optimization_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_requests" ADD CONSTRAINT "optimization_requests_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_requests" ADD CONSTRAINT "optimization_requests_listId_fkey" FOREIGN KEY ("listId") REFERENCES "shopping_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
