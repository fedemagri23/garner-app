-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('STARTED', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductMatchMethod" AS ENUM ('BARCODE', 'EXTERNAL_ID', 'NORMALIZED_IDENTITY', 'MANUAL');

-- CreateEnum
CREATE TYPE "ExternalProductLinkStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'IGNORED');

-- CreateTable
CREATE TABLE "external_price_sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "supermarketId" UUID NOT NULL,
    "adapterKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduleHourUtc" INTEGER NOT NULL DEFAULT 8,
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastRunAt" TIMESTAMPTZ(3),
    "lastSuccessfulRunAt" TIMESTAMPTZ(3),
    "lastStatus" "ImportRunStatus",
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "external_price_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "runKey" TEXT NOT NULL,
    "status" "ImportRunStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "productsSeen" INTEGER NOT NULL DEFAULT 0,
    "pricesSeen" INTEGER NOT NULL DEFAULT 0,
    "observationsCreated" INTEGER NOT NULL DEFAULT 0,
    "matchedProducts" INTEGER NOT NULL DEFAULT 0,
    "unmatchedProducts" INTEGER NOT NULL DEFAULT 0,
    "skippedPrices" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_product_links" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "productId" UUID,
    "externalName" TEXT NOT NULL,
    "externalBarcode" TEXT,
    "matchMethod" "ProductMatchMethod",
    "status" "ExternalProductLinkStatus" NOT NULL DEFAULT 'UNMATCHED',
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "external_product_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_store_links" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalStoreId" TEXT NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_store_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_price_sources_slug_key" ON "external_price_sources"("slug");

-- CreateIndex
CREATE INDEX "external_price_sources_isEnabled_scheduleHourUtc_idx" ON "external_price_sources"("isEnabled", "scheduleHourUtc");

-- CreateIndex
CREATE INDEX "import_runs_sourceId_startedAt_idx" ON "import_runs"("sourceId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "import_runs_sourceId_runKey_key" ON "import_runs"("sourceId", "runKey");

-- CreateIndex
CREATE INDEX "external_product_links_sourceId_status_idx" ON "external_product_links"("sourceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "external_product_links_sourceId_externalProductId_key" ON "external_product_links"("sourceId", "externalProductId");

-- CreateIndex
CREATE UNIQUE INDEX "external_store_links_sourceId_externalStoreId_key" ON "external_store_links"("sourceId", "externalStoreId");

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "external_price_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_product_links" ADD CONSTRAINT "external_product_links_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "external_price_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_store_links" ADD CONSTRAINT "external_store_links_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "external_price_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
