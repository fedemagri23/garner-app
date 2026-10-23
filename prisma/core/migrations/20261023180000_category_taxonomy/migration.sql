-- The category taxonomy as data (data/taxonomy.json, applied by taxonomy:sync).
ALTER TABLE "categories" ADD COLUMN "icon" VARCHAR(60);
ALTER TABLE "categories" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "categories" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "categories" ADD COLUMN "replacedById" UUID;
ALTER TABLE "categories" ADD COLUMN "synonyms" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "categories" ADD COLUMN "offTags" JSONB NOT NULL DEFAULT '[]';
