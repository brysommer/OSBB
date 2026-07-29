-- CreateTable
CREATE TABLE "public"."BuildingSection" (
    "id" TEXT NOT NULL,
    "residentialComplexId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "complexName" TEXT NOT NULL,
    "buildingNumber" TEXT NOT NULL,
    "sectionNumber" TEXT NOT NULL,
    "hasBoilerRoom" BOOLEAN NOT NULL DEFAULT true,
    "individualElectricityContracts" BOOLEAN NOT NULL DEFAULT false,
    "individualColdWaterContracts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuildingSection_residentialComplexId_buildingNumber_idx"
ON "public"."BuildingSection"("residentialComplexId", "buildingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BuildingSection_residentialComplexId_buildingNumber_sectionNumber_key"
ON "public"."BuildingSection"("residentialComplexId", "buildingNumber", "sectionNumber");

-- AddForeignKey
ALTER TABLE "public"."BuildingSection"
ADD CONSTRAINT "BuildingSection_residentialComplexId_fkey"
FOREIGN KEY ("residentialComplexId") REFERENCES "public"."ResidentialComplex"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
