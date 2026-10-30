-- When an account was deleted (it is anonymised, not removed).
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
