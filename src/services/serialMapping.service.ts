import { PrismaClient, ResourceType } from '@prisma/client';
import type { SerialMappingQueueItem } from '../bot/session';

const prisma = new PrismaClient();

export async function buildSerialMappingQueue(
    residentialComplexId: string,
    buildingNumber: string,
    sectionNumber: string,
    resourceType: ResourceType,
): Promise<SerialMappingQueueItem[]> {
    const meters = await prisma.meter.findMany({
        where: {
            resourceType,
            premises: {
                residentialComplexId,
                buildingNumber,
                sectionNumber,
                apartmentType: 'Квартира',
            },
        },
        include: {
            premises: true,
        },
    });

    return meters
        .sort((a, b) => {
            const floorDiff = (b.premises.floor ?? -1) - (a.premises.floor ?? -1);
            if (floorDiff !== 0) return floorDiff;
            return (b.premises.apartmentNumber ?? '').localeCompare(
                a.premises.apartmentNumber ?? '',
                'uk',
                { numeric: true },
            );
        })
        .map((meter) => ({
            meterId: meter.id,
            meterName: meter.name,
            serialNumber: meter.serialNumber,
            resourceType,
            buildingNumber: meter.premises.buildingNumber ?? '',
            sectionNumber: meter.premises.sectionNumber ?? '',
            currentApartmentNumber: meter.premises.apartmentNumber ?? '',
        }));
}

export async function assignSerialMeterToApartment(
    meterId: string,
    residentialComplexId: string,
    buildingNumber: string,
    sectionNumber: string,
    apartmentNumber: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    const targetPremises = await prisma.premises.findFirst({
        where: {
            residentialComplexId,
            buildingNumber,
            sectionNumber,
            apartmentType: 'Квартира',
            apartmentNumber,
        },
        select: {
            id: true,
        },
    });

    if (!targetPremises) {
        return { ok: false, reason: 'NO_PREMISES' };
    }

    const meter = await prisma.meter.findUnique({
        where: { id: meterId },
        select: {
            id: true,
            resourceType: true,
            name: true,
            serialNumber: true,
        },
    });

    if (!meter) {
        return { ok: false, reason: 'NO_METER' };
    }

    const duplicateResourceMeter = await prisma.meter.findFirst({
        where: {
            premisesId: targetPremises.id,
            resourceType: meter.resourceType,
            id: { not: meter.id },
        },
        select: { id: true },
    });

    if (duplicateResourceMeter) {
        return { ok: false, reason: 'RESOURCE_ALREADY_EXISTS' };
    }

    await prisma.meter.update({
        where: { id: meter.id },
        data: {
            premisesId: targetPremises.id,
            serialNumber: meter.serialNumber ?? meter.name,
        },
    });

    return { ok: true };
}
