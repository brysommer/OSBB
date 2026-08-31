-- AlterTable
ALTER TABLE "public"."Meter"
ADD COLUMN "hiddenFromCollection" BOOLEAN NOT NULL DEFAULT false;
