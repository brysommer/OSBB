import { PrismaClient, ResourceType, ReadingSource } from '@prisma/client';
import { getCurrentPeriod } from './reading.service';

const prisma = new PrismaClient();

export interface QueueItem {
    meterId: string;

    premisesId: string;

    buildingNumber: string;

    sectionNumber: string;

    floor: number | null;

    apartmentNumber: string;

    meterName: string;

    resourceType: ResourceType;

    previous: number;

    selfSubmitted?: number;
}

export async function getBuildings(residentialComplexId: string): Promise<string[]> {
    const rows = await prisma.premises.findMany({
        where: {
            residentialComplexId,
        },
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

export async function getBuildingResourceTypes(
    residentialComplexId: string,
    buildingNumber: string,
): Promise<ResourceType[]> {
    const rows = await prisma.meter.findMany({
        where: {
            premises: {
                residentialComplexId,
                buildingNumber,
            },
        },
        distinct: ['resourceType'],
        select: {
            resourceType: true,
        },
    });

    const validResourceTypes = new Set<string>(Object.values(ResourceType));

    return rows
        .map((row) => row.resourceType)
        .filter((resourceType): resourceType is ResourceType =>
            validResourceTypes.has(resourceType),
        );
}

export async function getSections(
    residentialComplexId: string,
    buildingNumber: string,
): Promise<string[]> {
    const rows = await prisma.premises.findMany({
        where: {
            residentialComplexId,
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
    residentialComplexId: string,
    buildingNumber: string,
    sectionNumber: string,
    resourceTypes: ResourceType[],
): Promise<QueueItem[]> {
    const period = getCurrentPeriod();

    const where: any = {
        premises: {
            residentialComplexId,
            buildingNumber,
            sectionNumber,
            apartmentType: 'Квартира',
        },
        resourceType: {
            in: resourceTypes,
        },
    };

    const meters = await prisma.meter.findMany({
        where,

        include: {
            premises: true,

            readings: {
                where: {
                    period: {
                        lte: period,
                    },
                },
                orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
            },
        },
    });

    const queue: QueueItem[] = meters.flatMap((meter) => {
        const self = meter.readings.find(
            (r) => r.period === period && r.source === ReadingSource.YOURSELF,
        );
        const collected = meter.readings.find(
            (r) => r.period === period && r.source === ReadingSource.COLLECTED,
        );
        const hasPendingSelf = !!self && (!collected || self.createdAt > collected.createdAt);

        if (collected && !hasPendingSelf) {
            return [];
        }

        const prior =
            meter.readings.find(
                (r) => r.period !== period && r.source !== ReadingSource.YOURSELF,
            ) ?? meter.readings.find((r) => r.period !== period);

        return [
            {
                meterId: meter.id,
                premisesId: meter.premises.id,
                buildingNumber: meter.premises.buildingNumber ?? '',
                sectionNumber: meter.premises.sectionNumber ?? '',
                floor: meter.premises.floor,
                apartmentNumber: meter.premises.apartmentNumber ?? '',
                meterName: meter.name,
                resourceType: meter.resourceType as ResourceType,
                previous: hasPendingSelf ? self.previous : (prior?.current ?? 0),
                selfSubmitted: hasPendingSelf ? self.current : undefined,
            },
        ];
    });

    const resourceOrder: Record<ResourceType, number> = {
        [ResourceType.HOT_WATER]: 0,
        [ResourceType.HEATING]: 1,
        [ResourceType.ELECTRICITY]: 2,
    };

    queue.sort((a, b) => {
        const floorDiff = (b.floor ?? -1) - (a.floor ?? -1);
        if (floorDiff !== 0) return floorDiff;

        const resourceDiff = resourceOrder[a.resourceType] - resourceOrder[b.resourceType];
        if (resourceDiff !== 0) return resourceDiff;

        const apartmentDiff = b.apartmentNumber.localeCompare(a.apartmentNumber, 'uk', {
            numeric: true,
        });
        if (apartmentDiff !== 0) return apartmentDiff;

        return a.meterName.localeCompare(b.meterName, 'uk', { numeric: true });
    });

    return queue;
}
