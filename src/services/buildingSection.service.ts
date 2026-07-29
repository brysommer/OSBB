import { PrismaClient, ResourceType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type BuildingSectionFlags = {
    hasBoilerRoom: boolean;
    individualElectricityContracts: boolean;
    individualColdWaterContracts: boolean;
};

export function buildSectionAddress(
    complexName: string,
    buildingNumber: string,
    sectionNumber: string,
): string {
    return `${complexName} · буд. ${buildingNumber} · під'їзд ${sectionNumber}`;
}

export function resourcesAllowedByFlags(flags: BuildingSectionFlags): ResourceType[] {
    const allowed: ResourceType[] = [];

    if (flags.hasBoilerRoom) {
        allowed.push(ResourceType.HOT_WATER, ResourceType.HEATING);
    }

    // Індивідуальний договір = мешканці самі → обходом НЕ знімаємо
    if (!flags.individualColdWaterContracts) {
        allowed.push(ResourceType.COLD_WATER);
    }

    if (!flags.individualElectricityContracts) {
        allowed.push(ResourceType.ELECTRICITY);
    }

    return allowed;
}

async function detectFlagsFromMeters(
    db: PrismaClient,
    residentialComplexId: string,
    buildingNumber: string,
    sectionNumber: string,
): Promise<BuildingSectionFlags> {
    const meters = await db.meter.findMany({
        where: {
            premises: {
                residentialComplexId,
                buildingNumber,
                sectionNumber,
            },
        },
        distinct: ['resourceType'],
        select: {
            resourceType: true,
        },
    });

    const types = new Set(meters.map((m) => m.resourceType));

    return {
        hasBoilerRoom:
            types.has(ResourceType.HOT_WATER) || types.has(ResourceType.HEATING),
        // Якщо лічильники є в обході — договір не індивідуальний для збору
        individualColdWaterContracts: !types.has(ResourceType.COLD_WATER),
        individualElectricityContracts: !types.has(ResourceType.ELECTRICITY),
    };
}

export async function ensureBuildingSection(
    residentialComplexId: string,
    buildingNumber: string,
    sectionNumber: string,
) {
    const existing = await prisma.buildingSection.findUnique({
        where: {
            residentialComplexId_buildingNumber_sectionNumber: {
                residentialComplexId,
                buildingNumber,
                sectionNumber,
            },
        },
    });

    if (existing) {
        return existing;
    }

    const complex = await prisma.residentialComplex.findUnique({
        where: { id: residentialComplexId },
        select: { name: true },
    });

    if (!complex) {
        throw new Error('Житловий комплекс не знайдено');
    }

    const flags = await detectFlagsFromMeters(
        prisma,
        residentialComplexId,
        buildingNumber,
        sectionNumber,
    );

    return prisma.buildingSection.create({
        data: {
            residentialComplexId,
            complexName: complex.name,
            buildingNumber,
            sectionNumber,
            address: buildSectionAddress(complex.name, buildingNumber, sectionNumber),
            ...flags,
        },
    });
}

export async function syncBuildingSectionsFromPremises() {
    const premises = await prisma.premises.findMany({
        where: {
            residentialComplexId: { not: null },
            buildingNumber: { not: null },
            sectionNumber: { not: null },
        },
        select: {
            residentialComplexId: true,
            buildingNumber: true,
            sectionNumber: true,
            residentialComplex: {
                select: { name: true },
            },
        },
    });

    const unique = new Map<
        string,
        {
            residentialComplexId: string;
            complexName: string;
            buildingNumber: string;
            sectionNumber: string;
        }
    >();

    for (const row of premises) {
        if (!row.residentialComplexId || !row.buildingNumber || !row.sectionNumber) continue;

        const key = `${row.residentialComplexId}|${row.buildingNumber}|${row.sectionNumber}`;
        unique.set(key, {
            residentialComplexId: row.residentialComplexId,
            complexName: row.residentialComplex?.name ?? 'ЖК',
            buildingNumber: row.buildingNumber,
            sectionNumber: row.sectionNumber,
        });
    }

    let created = 0;
    let updated = 0;

    for (const item of unique.values()) {
        const flags = await detectFlagsFromMeters(
            prisma,
            item.residentialComplexId,
            item.buildingNumber,
            item.sectionNumber,
        );

        const address = buildSectionAddress(
            item.complexName,
            item.buildingNumber,
            item.sectionNumber,
        );

        const existing = await prisma.buildingSection.findUnique({
            where: {
                residentialComplexId_buildingNumber_sectionNumber: {
                    residentialComplexId: item.residentialComplexId,
                    buildingNumber: item.buildingNumber,
                    sectionNumber: item.sectionNumber,
                },
            },
        });

        if (existing) {
            await prisma.buildingSection.update({
                where: { id: existing.id },
                data: {
                    address,
                    complexName: item.complexName,
                    ...flags,
                },
            });
            updated++;
        } else {
            await prisma.buildingSection.create({
                data: {
                    residentialComplexId: item.residentialComplexId,
                    complexName: item.complexName,
                    buildingNumber: item.buildingNumber,
                    sectionNumber: item.sectionNumber,
                    address,
                    ...flags,
                },
            });
            created++;
        }
    }

    return { total: unique.size, created, updated };
}

export async function getSectionAllowedResourceTypes(
    residentialComplexId: string,
    buildingNumber: string,
    sectionNumber: string,
): Promise<ResourceType[]> {
    const section = await ensureBuildingSection(
        residentialComplexId,
        buildingNumber,
        sectionNumber,
    );

    const allowedByFlags = new Set(resourcesAllowedByFlags(section));

    const meters = await prisma.meter.findMany({
        where: {
            premises: {
                residentialComplexId,
                buildingNumber,
                sectionNumber,
            },
        },
        distinct: ['resourceType'],
        select: {
            resourceType: true,
        },
    });

    const validResourceTypes = new Set<string>(Object.values(ResourceType));

    return meters
        .map((row) => row.resourceType)
        .filter(
            (resourceType): resourceType is ResourceType =>
                validResourceTypes.has(resourceType) && allowedByFlags.has(resourceType as ResourceType),
        );
}
