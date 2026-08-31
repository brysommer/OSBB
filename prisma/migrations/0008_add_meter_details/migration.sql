-- CreateTable
CREATE TABLE "public"."MeterDetail" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "manufacturer" TEXT,
    "deviceType" TEXT,
    "deviceVersion" INTEGER,
    "deviceStatus" TEXT NOT NULL,
    "requestedAt" TEXT,
    "deviceAt" TEXT,
    "energy" DOUBLE PRECISION,
    "energyUnit" TEXT,
    "volume" DOUBLE PRECISION,
    "volumeUnit" TEXT,
    "power" DOUBLE PRECISION,
    "powerUnit" TEXT,
    "flow" DOUBLE PRECISION,
    "flowUnit" TEXT,
    "temperature1" DOUBLE PRECISION,
    "temperature1Unit" TEXT,
    "temperature2" DOUBLE PRECISION,
    "temperature2Unit" TEXT,
    "temperatureDifference" DOUBLE PRECISION,
    "temperatureDifferenceUnit" TEXT,
    "errorFlag" INTEGER,
    "statusField" TEXT,
    "operatingTime" INTEGER,
    "operatingTimeUnit" TEXT,
    "operatingTimeWithError" INTEGER,
    "operatingTimeWithErrorUnit" TEXT,
    "rawData" JSONB,
    "sourceFile" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meterId" TEXT,

    CONSTRAINT "MeterDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeterDetail_snapshotDate_serialNumber_manufacturer_key"
ON "public"."MeterDetail"("snapshotDate", "serialNumber", "manufacturer");

-- CreateIndex
CREATE INDEX "MeterDetail_serialNumber_idx" ON "public"."MeterDetail"("serialNumber");

-- CreateIndex
CREATE INDEX "MeterDetail_meterId_snapshotDate_idx"
ON "public"."MeterDetail"("meterId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "public"."MeterDetail"
ADD CONSTRAINT "MeterDetail_meterId_fkey"
FOREIGN KEY ("meterId") REFERENCES "public"."Meter"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
