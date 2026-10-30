-- Which terms an account accepted, and when.
ALTER TABLE "users" ADD COLUMN "termsVersion" VARCHAR(20);
ALTER TABLE "users" ADD COLUMN "termsAcceptedAt" TIMESTAMPTZ(3);
