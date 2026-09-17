-- CreateIndex
CREATE INDEX "shopping_sessions_status_completedAt_idx" ON "shopping_sessions"("status", "completedAt");
