import { MeterAskoeValidationStatus, ResourceType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { validateMeterAgainstAskoe } from './askoeValidation.service';

export type SerialMappingItem = {
    meterId: string;
    premisesId: string;
    buildingNumber: string;
    sectionNumber: string;
    floor: number | null;
    apartmentNumber: string;
    resourceType: ResourceType;
    serialNumber: string | null;
    dbReading: number | null;
    askoeValidationStatus: MeterAskoeValidationStatus;
    askoeValidationNote: string | null;
};

export type SerialMappingResult =
    | { ok: true; meterId: string; linkedDetails: number }
    | { ok: false; reason: 'METER_NOT_FOUND' | 'SERIAL_TAKEN' | 'NO_SERIAL' };

export function normalizeSerialNumber(value: string): string {
    return value.trim().replace(/[\s-]+/g, '');
}

export function isValidSerialNumber(value: string): boolean {
    return /^\d+$/.test(value);
}

export function formatAskoeValidationStatus(status: MeterAskoeValidationStatus): string {
    switch (status) {
        case MeterAskoeValidationStatus.VALIDATED:
            return '✅ Підтверджено';
        case MeterAskoeValidationStatus.ASSUMED:
            return '⚠️ Припущення';
        case MeterAskoeValidationStatus.VALIDATED_NO_ANSWER:
            return '⚠️ Без відповіді АСКОЕ';
        case MeterAskoeValidationStatus.VALIDATION_FAILED:
            return '❌ Не валідовано';
        default:
            return '⏳ Очікує';
    }
}

function readingUnit(resourceType: ResourceType): string {
    switch (resourceType) {
        case ResourceType.HEATING:
            return 'Гкал';
        case ResourceType.ELECTRICITY:
            return 'кВт·год';
        default:
            return 'м³';
    }
}

export function formatSerialMappingReading(
    value: number | null,
    resourceType: ResourceType,
): string {
    if (value == null) return 'не вказано';
    return `${value.toFixed(3)} ${readingUnit(resourceType)}`;
}

export async function getSerialMappingQueue(
    residentialComplexId: string,
    buildingNumber: string,
    sectionNumber: string,
    resourceType: ResourceType,
): Promise<SerialMappingItem[]> {
    const meters = await prisma.meter.findMany({
        where: {
            resourceType,
            hiddenFromCollection: false,
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
            resourceType: true,
            serialNumber: true,
            askoeValidationStatus: true,
            askoeValidationNote: true,
            premises: {
                select: {
                    buildingNumber: true,
                    sectionNumber: true,
                    floor: true,
                    apartmentNumber: true,
                },
            },
            readings: {
                orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
                take: 1,
                select: { current: true },
            },
        },
    });

    return meters
        .map((meter) => ({
            meterId: meter.id,
            premisesId: meter.premisesId,
            buildingNumber: meter.premises.buildingNumber ?? '',
            sectionNumber: meter.premises.sectionNumber ?? '',
            floor: meter.premises.floor,
            apartmentNumber: meter.premises.apartmentNumber ?? '',
            resourceType: meter.resourceType as ResourceType,
            serialNumber: meter.serialNumber,
            dbReading: meter.readings[0]?.current ?? null,
            askoeValidationStatus: meter.askoeValidationStatus,
            askoeValidationNote: meter.askoeValidationNote,
        }))
        .sort((a, b) => {
            const floorDiff = (b.floor ?? -1) - (a.floor ?? -1);
            if (floorDiff !== 0) return floorDiff;

            return a.apartmentNumber.localeCompare(b.apartmentNumber, 'uk', {
                numeric: true,
            });
        });
}

export async function assignSerialToMeterById(input: {
    meterId: string;
    serialNumber: string;
}): Promise<SerialMappingResult> {
    const meter = await prisma.meter.findUnique({
        where: { id: input.meterId },
        select: {
            id: true,
            resourceType: true,
        },
    });

    if (!meter) {
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

    let linkedDetails = 0;

    if (meter.resourceType === ResourceType.HEATING) {
        const linked = await prisma.meterDetail.updateMany({
            where: {
                serialNumber: input.serialNumber,
                meterId: null,
            },
            data: {
                meterId: input.meterId,
            },
        });
        linkedDetails = linked.count;

        await validateMeterAgainstAskoe(input.meterId);
    }

    return {
        ok: true,
        meterId: meter.id,
        linkedDetails,
    };
}

export async function confirmSerialOnSite(meterId: string): Promise<SerialMappingResult> {
    const meter = await prisma.meter.findUnique({
        where: { id: meterId },
        select: { id: true, serialNumber: true, resourceType: true },
    });

    if (!meter) {
        return { ok: false, reason: 'METER_NOT_FOUND' };
    }

    if (!meter.serialNumber?.trim()) {
        return { ok: false, reason: 'NO_SERIAL' };
    }

    const today = new Intl.DateTimeFormat('uk-UA', {
        timeZone: 'Europe/Kyiv',
        dateStyle: 'short',
    }).format(new Date());

    const note = `Підтверджено обходом ${today}: S/N ${meter.serialNumber}`;

    if (meter.resourceType === ResourceType.HEATING) {
        await prisma.meter.update({
            where: { id: meter.id },
            data: {
                askoeValidationStatus: MeterAskoeValidationStatus.VALIDATED,
                askoeValidatedAt: new Date(),
                askoeValidationNote: note,
            },
        });
    } else {
        await prisma.meter.update({
            where: { id: meter.id },
            data: {
                askoeValidationNote: note,
            },
        });
    }

    return { ok: true, meterId: meter.id, linkedDetails: 0 };
}

export async function markMeterAbsent(meterId: string): Promise<SerialMappingResult> {
    const meter = await prisma.meter.findUnique({
        where: { id: meterId },
        select: { id: true },
    });

    if (!meter) {
        return { ok: false, reason: 'METER_NOT_FOUND' };
    }

    const today = new Intl.DateTimeFormat('uk-UA', {
        timeZone: 'Europe/Kyiv',
        dateStyle: 'short',
    }).format(new Date());

    await prisma.meter.update({
        where: { id: meter.id },
        data: {
            askoeValidationNote: `Прилад відсутній (обхід ${today})`,
        },
    });

    return { ok: true, meterId: meter.id, linkedDetails: 0 };
}
