-- CreateEnum
CREATE TYPE "MeterAskoeValidationStatus" AS ENUM ('PENDING', 'VALIDATED', 'VALIDATION_FAILED');

-- AlterTable
ALTER TABLE "Meter"
ADD COLUMN "askoeValidationStatus" "MeterAskoeValidationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "askoeValidatedAt" TIMESTAMP(3),
ADD COLUMN "askoeValidationNote" TEXT;
