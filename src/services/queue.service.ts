import { PrismaClient, ResourceType, ReadingSource } from '@prisma/client';

const prisma = new PrismaClient();

export interface QueueItem {
    meterId: string;

    premisesId: string;

    buildingNumber: string;

    sectionNumber: string;

    apartmentNumber: string;

    meterName: string;

    resourceType: ResourceType;

    previous: number;
}

export async function getBuildings(): Promise<string[]> {
    const rows = await prisma.premises.findMany({
        distinct: ['buildingNumber'],
        select: {
            buildingNumber: true,
        },
        orderBy: {
            buildingNumber: 'asc',
        },
    });

    return rows.map((x) => x.buildingNumber).filter((x): x is string => !!x);
}

export async function getSections(buildingNumber: string): Promise<string[]> {
    const rows = await prisma.premises.findMany({
        where: {
            buildingNumber,
        },
        distinct: ['sectionNumber'],
        select: {
            sectionNumber: true,
        },
        orderBy: {
            sectionNumber: 'asc',
        },
    });

    return rows.map((x) => x.sectionNumber).filter((x): x is string => !!x);
}
export async function buildQueue(
    buildingNumber: string,
    sectionNumber: string,
    resourceType: ResourceType | 'BOTH',
): Promise<QueueItem[]> {
    const where: any = {
        premises: {
            buildingNumber,
            sectionNumber,
            apartmentType: 'Квартира',
        },
    };

    if (resourceType !== 'BOTH') {
        where.resourceType = resourceType;
    }
    const meters = await prisma.meter.findMany({
        where,

        include: {
            premises: true,

            readings: {
                where: {
                    //   source: ReadingSource.DAH,
                },

                orderBy: {
                    period: 'desc',
                },

                take: 1,
            },
        },
    });
    const queue: QueueItem[] = meters.map((meter) => ({
        meterId: meter.id,

        premisesId: meter.premises.id,

        buildingNumber: meter.premises.buildingNumber ?? '',

        sectionNumber: meter.premises.sectionNumber ?? '',

        apartmentNumber: meter.premises.apartmentNumber ?? '',

        meterName: meter.name,

        resourceType: meter.resourceType as ResourceType,

        previous: meter.readings[0]?.current ?? 0,
    }));
    queue.sort((a, b) => {
        return Number(b.apartmentNumber) - Number(a.apartmentNumber);
    });
    return queue;
}
