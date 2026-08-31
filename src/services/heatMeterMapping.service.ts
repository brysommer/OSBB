import { ResourceType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type HeatMappingItem = {
    meterId: string;
    premisesId: string;
    buildingNumber: string;
    sectionNumber: string;
    floor: number | null;
    apartmentNumber: string;
};

export type HeatMappingResult =
    | { ok: true; meterId: string; linkedDetails: number }
    | { ok: false; reason: 'METER_NOT_FOUND' | 'SERIAL_TAKEN' };

export function isSynergiaGlass(name: string): boolean {
    const normalized = name.toLocaleLowerCase().replace(/\s+/g, ' ');

    return (
        normalized.includes('синергія') &&
        (normalized.includes('glass') ||
            normalized.includes('глас') ||
            normalized.includes('глес'))
    );
}

export function normalizeHeatSerialNumber(value: string): string {
    return value.trim().replace(/[\s-]+/g, '');
}

export function isValidHeatSerialNumber(value: string): boolean {
    return /^\d+$/.test(value);
}

export async function getHeatMappingQueue(
    residentialComplexId: string,
    buildingNumber: string,
    sectionNumber: string,
): Promise<HeatMappingItem[]> {
    const meters = await prisma.meter.findMany({
        where: {
            resourceType: ResourceType.HEATING,
            premises: {
                residentialComplexId,
                buildingNumber,
                sectionNumber,
                apartmentType: 'Квартира',
            },
        },
        select: {
            id: true,
            premisesId: true,
            serialNumber: true,
            premises: {
                select: {
                    buildingNumber: true,
                    sectionNumber: true,
                    floor: true,
                    apartmentNumber: true,
                },
            },
        },
    });

    return meters
        .filter((meter) => !meter.serialNumber?.trim())
        .map((meter) => ({
            meterId: meter.id,
            premisesId: meter.premisesId,
            buildingNumber: meter.premises.buildingNumber ?? '',
            sectionNumber: meter.premises.sectionNumber ?? '',
            floor: meter.premises.floor,
            apartmentNumber: meter.premises.apartmentNumber ?? '',
        }))
        .sort((a, b) => {
            const floorDiff = (b.floor ?? -1) - (a.floor ?? -1);
            if (floorDiff !== 0) return floorDiff;

            return a.apartmentNumber.localeCompare(b.apartmentNumber, 'uk', {
                numeric: true,
            });
        });
}

export async function assignHeatSerialToMeter(input: {
    meterId: string;
    serialNumber: string;
}): Promise<HeatMappingResult> {
    const meter = await prisma.meter.findUnique({
        where: { id: input.meterId },
        select: {
            id: true,
            resourceType: true,
        },
    });

    if (!meter || meter.resourceType !== ResourceType.HEATING) {
        return { ok: false, reason: 'METER_NOT_FOUND' };
    }

    const taken = await prisma.meter.findFirst({
        where: {
            serialNumber: input.serialNumber,
            id: { not: input.meterId },
        },
        select: { id: true },
    });

    if (taken) {
        return { ok: false, reason: 'SERIAL_TAKEN' };
    }

    await prisma.meter.update({
        where: { id: input.meterId },
        data: { serialNumber: input.serialNumber },
    });

    const linked = await prisma.meterDetail.updateMany({
        where: {
            serialNumber: input.serialNumber,
            meterId: null,
        },
        data: {
            meterId: input.meterId,
        },
    });

    return {
        ok: true,
        meterId: meter.id,
        linkedDetails: linked.count,
    };
}
