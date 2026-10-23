-- What push and email are written in, and category names in other languages.
ALTER TABLE "users" ADD COLUMN "locale" VARCHAR(5) NOT NULL DEFAULT 'es';
ALTER TABLE "categories" ADD COLUMN "translations" JSONB NOT NULL DEFAULT '{}';
