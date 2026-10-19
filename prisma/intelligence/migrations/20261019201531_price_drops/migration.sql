-- CreateTable
CREATE TABLE "price_drops" (
    "productId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "previousPriceCents" INTEGER NOT NULL,
    "droppedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_drops_pkey" PRIMARY KEY ("productId","storeId")
);

-- CreateIndex
CREATE INDEX "price_drops_storeId_droppedAt_idx" ON "price_drops"("storeId", "droppedAt");
