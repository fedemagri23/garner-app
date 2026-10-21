-- The team's products rank above anything the community builds up
-- (`VERIFIED_BONUS` in community/domain/ranking-weight.ts).
UPDATE "products" SET "weight" = 150 WHERE "origin" = 'VERIFIED';

-- Shops are the team's, and public, unless a shopper adds one (which then
-- sets this to null until it is published).
ALTER TABLE "store_locations" ALTER COLUMN "publishedAt" SET DEFAULT CURRENT_TIMESTAMP;
