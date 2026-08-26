import { ReadingSource, ResourceType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getAvailableResidentialComplexes } from './userAccess.service';
import { getBuildings, getSections } from './queue.service';
import {
    getSectionAllowedResourceTypes,
    ensureBuildingSection,
} from './buildingSection.service';
import { getCurrentPeriod, saveReading, validateReading } from './reading.service';

export type MobileMeterPayload = {
    meterId: string;
    dahId: string;
    name: string;
    serialNumber: string | null;
    resourceType: ResourceType;
    premisesId: string;
    buildingNumber: string;
    sectionNumber: string;
    floor: number | null;
    apartmentNumber: string;
    previous: number;
    alreadyCollected: boolean;
    selfSubmitted: number | null;
};

export async function listComplexesForTelegram(telegramId: number | bigint) {
    const complexes = await getAvailableResidentialComplexes(telegramId);
    return complexes.map((c) => ({
        id: c.id,
        name: c.name,
        shortName: c.shortName,
    }));
}

export async function pullSectionSnapshot(input: {
    telegramId: number | bigint;
    residentialComplexId: string;
    buildingNumber: string;
    sectionNumber: string;
}) {
    const complexes = await getAvailableResidentialComplexes(input.telegramId);
    const allowed = complexes.some((c) => c.id === input.residentialComplexId);
    if (!allowed) {
        throw new Error('FORBIDDEN_COMPLEX');
    }

    const complex = complexes.find((c) => c.id === input.residentialComplexId)!;
    const period = getCurrentPeriod();
    const resourceTypes = await getSectionAllowedResourceTypes(
        input.residentialComplexId,
        input.buildingNumber,
        input.sectionNumber,
    );

    const section = await ensureBuildingSection(
        input.residentialComplexId,
        input.buildingNumber,
        input.sectionNumber,
    );

    const meters = await prisma.meter.findMany({
        where: {
            resourceType: { in: resourceTypes },
            premises: {
                residentialComplexId: input.residentialComplexId,
                buildingNumber: input.buildingNumber,
                sectionNumber: input.sectionNumber,
                apartmentType: 'Квартира',
            },
        },
        include: {
            premises: true,
            readings: {
                where: {
                    period: { lte: period },
                },
                orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
            },
        },
    });

    const payload: MobileMeterPayload[] = meters.map((meter) => {
        const self = meter.readings.find(
            (r) => r.period === period && r.source === ReadingSource.YOURSELF,
        );
        const collected = meter.readings.find(
            (r) => r.period === period && r.source === ReadingSource.COLLECTED,
        );
        const hasPendingSelf = !!self && (!collected || self.createdAt > collected.createdAt);
        const prior =
            meter.readings.find(
                (r) => r.period !== period && r.source !== ReadingSource.YOURSELF,
            ) ?? meter.readings.find((r) => r.period !== period);

        return {
            meterId: meter.id,
            dahId: meter.dahId,
            name: meter.name,
            serialNumber: meter.serialNumber,
            resourceType: meter.resourceType as ResourceType,
            premisesId: meter.premises.id,
            buildingNumber: meter.premises.buildingNumber ?? '',
            sectionNumber: meter.premises.sectionNumber ?? '',
            floor: meter.premises.floor,
            apartmentNumber: meter.premises.apartmentNumber ?? '',
            previous: hasPendingSelf ? self!.previous : (prior?.current ?? 0),
            alreadyCollected: !!collected && !hasPendingSelf,
            selfSubmitted: hasPendingSelf ? self!.current : null,
        };
    });

    const resourceOrder: Record<ResourceType, number> = {
        [ResourceType.COLD_WATER]: 0,
        [ResourceType.HOT_WATER]: 1,
        [ResourceType.ELECTRICITY]: 2,
        [ResourceType.HEATING]: 3,
    };

    payload.sort((a, b) => {
        const floorDiff = (b.floor ?? -1) - (a.floor ?? -1);
        if (floorDiff !== 0) return floorDiff;
        const resourceDiff = resourceOrder[a.resourceType] - resourceOrder[b.resourceType];
        if (resourceDiff !== 0) return resourceDiff;
        return b.apartmentNumber.localeCompare(a.apartmentNumber, 'uk', { numeric: true });
    });

    return {
        period,
        complex: {
            id: complex.id,
            name: complex.name,
            shortName: complex.shortName,
        },
        buildingNumber: input.buildingNumber,
        sectionNumber: input.sectionNumber,
        sectionFlags: {
            hasBoilerRoom: section.hasBoilerRoom,
            individualElectricityContracts: section.individualElectricityContracts,
            individualColdWaterContracts: section.individualColdWaterContracts,
        },
        resourceTypes,
        meters: payload,
    };
}

export async function listBuildingsAndSections(
    telegramId: number | bigint,
    residentialComplexId: string,
) {
    const complexes = await getAvailableResidentialComplexes(telegramId);
    if (!complexes.some((c) => c.id === residentialComplexId)) {
        throw new Error('FORBIDDEN_COMPLEX');
    }

    const buildings = await getBuildings(residentialComplexId);
    const result: Array<{
        buildingNumber: string;
        sections: string[];
    }> = [];

    for (const buildingNumber of buildings) {
        const sections = await getSections(residentialComplexId, buildingNumber);
        result.push({ buildingNumber, sections });
    }

    return result;
}

export type PushReadingItem = {
    clientSyncId: string;
    meterId: string;
    previous: number;
    current: number;
};

export async function pushReadings(input: {
    telegramId: number | bigint;
    period?: string;
    readings: PushReadingItem[];
}) {
    const period = input.period || getCurrentPeriod();
    const complexes = await getAvailableResidentialComplexes(input.telegramId);
    const allowedComplexIds = new Set(complexes.map((c) => c.id));

    const results: Array<{
        clientSyncId: string;
        status: 'created' | 'duplicate' | 'error';
        readingId?: string;
        reason?: string;
    }> = [];

    for (const item of input.readings) {
        try {
            if (!item.clientSyncId || !item.meterId) {
                results.push({
                    clientSyncId: item.clientSyncId || '',
                    status: 'error',
                    reason: 'INVALID_PAYLOAD',
                });
                continue;
            }

            const existing = await prisma.reading.findUnique({
                where: { clientSyncId: item.clientSyncId },
                select: { id: true },
            });
            if (existing) {
                results.push({
                    clientSyncId: item.clientSyncId,
                    status: 'duplicate',
                    readingId: existing.id,
                });
                continue;
            }

            const meter = await prisma.meter.findUnique({
                where: { id: item.meterId },
                include: {
                    premises: {
                        select: { residentialComplexId: true },
                    },
                },
            });

            if (!meter || !meter.premises.residentialComplexId) {
                results.push({
                    clientSyncId: item.clientSyncId,
                    status: 'error',
                    reason: 'METER_NOT_FOUND',
                });
                continue;
            }

            if (!allowedComplexIds.has(meter.premises.residentialComplexId)) {
                results.push({
                    clientSyncId: item.clientSyncId,
                    status: 'error',
                    reason: 'FORBIDDEN',
                });
                continue;
            }

            const validation = validateReading(item.previous, item.current);
            const { reading } = await saveReading({
                meterId: item.meterId,
                period,
                previous: item.previous,
                current: item.current,
                source: ReadingSource.COLLECTED,
                clientSyncId: item.clientSyncId,
                status: validation.status,
            });

            results.push({
                clientSyncId: item.clientSyncId,
                status: 'created',
                readingId: reading.id,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'UNKNOWN';
            results.push({
                clientSyncId: item.clientSyncId,
                status: 'error',
                reason: message,
            });
        }
    }

    return {
        period,
        results,
        created: results.filter((r) => r.status === 'created').length,
        duplicates: results.filter((r) => r.status === 'duplicate').length,
        errors: results.filter((r) => r.status === 'error').length,
    };
}
