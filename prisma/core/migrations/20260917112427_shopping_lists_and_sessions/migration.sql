-- CreateEnum
CREATE TYPE "ShoppingListSortMode" AS ENUM ('MANUAL', 'NAME', 'CATEGORY', 'STORE');

-- CreateEnum
CREATE TYPE "ShoppingSessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "currency" CHAR(3) NOT NULL,
    "sortMode" "ShoppingListSortMode" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "notes" TEXT,
    "expectedUnitPriceCents" INTEGER,
    "selectedStoreId" UUID,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_sessions" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "listId" UUID,
    "listName" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "storeId" UUID,
    "status" "ShoppingSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "abandonedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shopping_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_session_items" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "sourceListItemId" UUID,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "notes" TEXT,
    "expectedUnitPriceCents" INTEGER,
    "actualUnitPriceCents" INTEGER,
    "storeId" UUID,
    "isPurchased" BOOLEAN NOT NULL DEFAULT false,
    "purchasedAt" TIMESTAMPTZ(3),
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shopping_session_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shopping_lists_ownerId_updatedAt_idx" ON "shopping_lists"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "shopping_list_items_listId_position_idx" ON "shopping_list_items"("listId", "position");

-- CreateIndex
CREATE INDEX "shopping_list_items_productId_idx" ON "shopping_list_items"("productId");

-- CreateIndex
CREATE INDEX "shopping_sessions_ownerId_status_idx" ON "shopping_sessions"("ownerId", "status");

-- CreateIndex
CREATE INDEX "shopping_sessions_listId_status_idx" ON "shopping_sessions"("listId", "status");

-- CreateIndex
CREATE INDEX "shopping_session_items_sessionId_position_idx" ON "shopping_session_items"("sessionId", "position");

-- CreateIndex
CREATE INDEX "shopping_session_items_productId_idx" ON "shopping_session_items"("productId");

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_listId_fkey" FOREIGN KEY ("listId") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_selectedStoreId_fkey" FOREIGN KEY ("selectedStoreId") REFERENCES "store_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_sessions" ADD CONSTRAINT "shopping_sessions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_sessions" ADD CONSTRAINT "shopping_sessions_listId_fkey" FOREIGN KEY ("listId") REFERENCES "shopping_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_sessions" ADD CONSTRAINT "shopping_sessions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "store_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_session_items" ADD CONSTRAINT "shopping_session_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "shopping_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_session_items" ADD CONSTRAINT "shopping_session_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_session_items" ADD CONSTRAINT "shopping_session_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "store_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
