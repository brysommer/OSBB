-- AlterTable
ALTER TABLE "public"."Reading"
ADD COLUMN "clientSyncId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Reading_clientSyncId_key" ON "public"."Reading"("clientSyncId");
