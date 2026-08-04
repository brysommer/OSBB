import { ResourceType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export async function assignSerialToApartmentMeter(input: {
    residentialComplexId: string;
    buildingNumber: string;
    sectionNumber: string;
    resourceType: ResourceType;
    apartmentNumber: string;
    serialNumber: string;
}): Promise<
    | { ok: true; meterId: string }
    | { ok: false; reason: 'NO_PREMISES' | 'NO_METER' | 'SERIAL_TAKEN' }
> {
    const targetPremises = await prisma.premises.findFirst({
        where: {
            residentialComplexId: input.residentialComplexId,
            buildingNumber: input.buildingNumber,
            sectionNumber: input.sectionNumber,
            apartmentType: 'Квартира',
            apartmentNumber: input.apartmentNumber,
        },
        select: { id: true },
    });

    if (!targetPremises) {
        return { ok: false, reason: 'NO_PREMISES' };
    }

    const meter = await prisma.meter.findFirst({
        where: {
            premisesId: targetPremises.id,
            resourceType: input.resourceType,
        },
        select: { id: true },
    });

    if (!meter) {
        return { ok: false, reason: 'NO_METER' };
    }

    const taken = await prisma.meter.findFirst({
        where: {
            serialNumber: input.serialNumber,
            id: { not: meter.id },
        },
        select: { id: true },
    });

    if (taken) {
        return { ok: false, reason: 'SERIAL_TAKEN' };
    }

    await prisma.meter.update({
        where: { id: meter.id },
        data: { serialNumber: input.serialNumber },
    });

    return { ok: true, meterId: meter.id };
}
