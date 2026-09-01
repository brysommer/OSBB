import { MeterAskoeValidationStatus, ReadingSource } from '@prisma/client';

import { prisma } from '../lib/prisma';

/** 1 Гкал ≈ 1.163 МВт·год */
const WH_PER_GCAL = 1_163_000;

export type AskoeValidationResult = {
    meterId: string;
    serialNumber: string;
    status: MeterAskoeValidationStatus;
    note: string;
    dbReadingGcal: number | null;
    askoeReadingGcal: number | null;
};

function askoeEnergyWhToGcal(energyWh: number): number {
    return energyWh / WH_PER_GCAL;
}

/** ДАХ знімають вручну — допускаємо невелике заокруглення. */
function readingsMatch(dbGcal: number, askoeWh: number): boolean {
    const askoeGcal = askoeEnergyWhToGcal(askoeWh);
    const tolerance = Math.max(0.5, Math.max(dbGcal, askoeGcal) * 0.03);

    return Math.abs(dbGcal - askoeGcal) <= tolerance;
}

export async function relinkAskoeDetailsForMeter(meterId: string, serialNumber: string): Promise<number> {
    const linked = await prisma.meterDetail.updateMany({
        where: {
            serialNumber,
            OR: [{ meterId: null }, { meterId }],
        },
        data: { meterId },
    });

    return linked.count;
}

export function dahPeriodFromSnapshotDate(snapshotDate: Date): string {
    const year = snapshotDate.getUTCFullYear();
    const month = String(snapshotDate.getUTCMonth() + 1).padStart(2, '0');

    return `${year}-${month}-01`;
}

async function getDahReadingGcal(meterId: string, period?: string): Promise<number | null> {
    if (period) {
        const periodReading = await prisma.reading.findFirst({
            where: { meterId, period },
            orderBy: { createdAt: 'desc' },
            select: { current: true },
        });

        if (periodReading?.current != null) {
            return periodReading.current;
        }
    }

    const dahReading = await prisma.reading.findFirst({
        where: { meterId, source: ReadingSource.DAH },
        orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
        select: { current: true },
    });

    if (dahReading?.current != null) {
        return dahReading.current;
    }

    const latestReading = await prisma.reading.findFirst({
        where: { meterId },
        orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
        select: { current: true },
    });

    return latestReading?.current ?? null;
}

export async function validateMeterAgainstAskoe(
    meterId: string,
    options?: {
        snapshotDate?: Date;
        dahPeriod?: string;
    },
): Promise<AskoeValidationResult> {
    const meter = await prisma.meter.findUnique({
        where: { id: meterId },
        select: {
            id: true,
            serialNumber: true,
        },
    });

    if (!meter?.serialNumber) {
        const note = 'Немає серійного номера';
        await prisma.meter.update({
            where: { id: meterId },
            data: {
                askoeValidationStatus: MeterAskoeValidationStatus.VALIDATION_FAILED,
                askoeValidatedAt: new Date(),
                askoeValidationNote: note,
            },
        });

        return {
            meterId,
            serialNumber: '',
            status: MeterAskoeValidationStatus.VALIDATION_FAILED,
            note,
            dbReadingGcal: null,
            askoeReadingGcal: null,
        };
    }

    await relinkAskoeDetailsForMeter(meter.id, meter.serialNumber);

    const snapshotDate = options?.snapshotDate;
    const dahPeriod =
        options?.dahPeriod ?? (snapshotDate ? dahPeriodFromSnapshotDate(snapshotDate) : undefined);

    const askoeDetail = await prisma.meterDetail.findFirst({
        where: {
            serialNumber: meter.serialNumber,
            energy: { not: null },
            ...(snapshotDate ? { snapshotDate } : {}),
        },
        orderBy: { snapshotDate: 'desc' },
        select: {
            energy: true,
            deviceStatus: true,
            snapshotDate: true,
        },
    });

    const dbReading = await getDahReadingGcal(meter.id, dahPeriod);

    let status: MeterAskoeValidationStatus;
    let note: string;
    let askoeReadingGcal: number | null = null;

    if (!askoeDetail?.energy) {
        status = MeterAskoeValidationStatus.VALIDATION_FAILED;
        note = 'Немає показника в АСКОЕ';
    } else if (dbReading == null) {
        status = MeterAskoeValidationStatus.VALIDATION_FAILED;
        note = 'Немає показника ДАХ в БД';
    } else {
        askoeReadingGcal = askoeEnergyWhToGcal(askoeDetail.energy);

        if (readingsMatch(dbReading, askoeDetail.energy)) {
            status = MeterAskoeValidationStatus.VALIDATED;
            const snapshotLabel = askoeDetail.snapshotDate.toISOString().slice(0, 10);
            note = `Прив'язка вірна (${snapshotLabel}): ДАХ ${dbReading.toFixed(3)} ≈ АСКОЕ ${askoeReadingGcal.toFixed(3)} Гкал`;
        } else {
            status = MeterAskoeValidationStatus.VALIDATION_FAILED;
            note = `Показник не співпадає: ДАХ ${dbReading.toFixed(3)} Гкал, АСКОЕ ${askoeReadingGcal.toFixed(3)} Гкал`;
        }
    }

    await prisma.meter.update({
        where: { id: meter.id },
        data: {
            askoeValidationStatus: status,
            askoeValidatedAt: new Date(),
            askoeValidationNote: note,
        },
    });

    return {
        meterId: meter.id,
        serialNumber: meter.serialNumber,
        status,
        note,
        dbReadingGcal: dbReading,
        askoeReadingGcal,
    };
}

export async function validateMetersAgainstAskoe(input?: {
    meterIds?: string[];
    residentialComplexName?: string;
    buildingNumber?: string;
    resourceType?: string;
    snapshotDate?: Date;
    dahPeriod?: string;
}): Promise<AskoeValidationResult[]> {
    const meters = await prisma.meter.findMany({
        where: {
            ...(input?.meterIds?.length ? { id: { in: input.meterIds } } : {}),
            serialNumber: { not: null },
            hiddenFromCollection: false,
            ...(input?.resourceType ? { resourceType: input.resourceType } : {}),
            ...(input?.residentialComplexName || input?.buildingNumber
                ? {
                      premises: {
                          ...(input.buildingNumber
                              ? { buildingNumber: input.buildingNumber }
                              : {}),
                          ...(input.residentialComplexName
                              ? {
                                    residentialComplex: {
                                        name: input.residentialComplexName,
                                    },
                                }
                              : {}),
                      },
                  }
                : {}),
        },
        select: { id: true },
    });

    const results: AskoeValidationResult[] = [];

    for (const meter of meters) {
        results.push(
            await validateMeterAgainstAskoe(meter.id, {
                snapshotDate: input?.snapshotDate,
                dahPeriod: input?.dahPeriod,
            }),
        );
    }

    return results;
}
