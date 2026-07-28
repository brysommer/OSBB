-- DropIndex
DROP INDEX "public"."Reading_meterId_period_key";

-- CreateIndex
CREATE INDEX "Reading_meterId_period_createdAt_idx"
ON "public"."Reading"("meterId", "period", "createdAt");
