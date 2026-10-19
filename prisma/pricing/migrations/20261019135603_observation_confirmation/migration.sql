-- AlterTable
ALTER TABLE "import_runs" ADD COLUMN     "observationsConfirmed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "price_observations" ADD COLUMN     "lastConfirmedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "price_observations_lastConfirmedAt_idx" ON "price_observations"("lastConfirmedAt");
