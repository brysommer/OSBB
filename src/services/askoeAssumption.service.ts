import { MeterAskoeValidationStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { dahPeriodFromSnapshotDate, relinkAskoeDetailsForMeter } from './askoeValidation.service';

const WH_PER_GCAL = 1_163_000;

export type AskoeAssumptionResult = {
    meterId: string;
    apartmentNumber: string;
    serialNumber: string;
    dahGcal: number;
    askoeGcal: number;
    status: 'assigned' | 'skipped';
    reason?: string;
};

function askoeEnergyWhToGcal(energyWh: number): number {
    return energyWh / WH_PER_GCAL;
}

function readingsMatch(dbGcal: number, askoeWh: number): boolean {
    const askoeGcal = askoeEnergyWhToGcal(askoeWh);
    const tolerance = Math.max(0.5, Math.max(dbGcal, askoeGcal) * 0.03);

    return Math.abs(dbGcal - askoeGcal) <= tolerance;
}

export async function assignAskoeSerialsByReadingMatch(input: {
    snapshotDate: Date;
    residentialComplexName: string;
    buildingNumber: string;
    dryRun?: boolean;
}): Promise<AskoeAssumptionResult[]> {
    const dahPeriod = dahPeriodFromSnapshotDate(input.snapshotDate);
    const snapshotLabel = input.snapshotDate.toISOString().slice(0, 10);

    const [meters, askoeRows, takenSerials] = await Promise.all([
        prisma.meter.findMany({
            where: {
                resourceType: 'HEATING',
                hiddenFromCollection: false,
                serialNumber: null,
                premises: {
                    buildingNumber: input.buildingNumber,
                    residentialComplex: { name: input.residentialComplexName },
                },
            },
            select: {
                id: true,
                premises: { select: { apartmentNumber: true } },
                readings: {
                    where: { period: dahPeriod },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { current: true },
                },
            },
        }),
        prisma.meterDetail.findMany({
            where: {
                snapshotDate: input.snapshotDate,
                energy: { not: null },
            },
            select: {
                serialNumber: true,
                energy: true,
            },
        }),
        prisma.meter.findMany({
            where: {
                serialNumber: { not: null },
                premises: {
                    buildingNumber: input.buildingNumber,
                    residentialComplex: { name: input.residentialComplexName },
                },
            },
            select: { serialNumber: true },
        }),
    ]);

    const usedSerials = new Set(
        takenSerials
            .map((meter) => meter.serialNumber)
            .filter((serial): serial is string => !!serial),
    );

    const availableAskoe = askoeRows.filter((row) => !usedSerials.has(row.serialNumber));

    const results: AskoeAssumptionResult[] = [];

    for (const meter of meters) {
        const apartmentNumber = meter.premises.apartmentNumber ?? '';
        const dahGcal = meter.readings[0]?.current ?? null;

        if (dahGcal == null) {
            results.push({
                meterId: meter.id,
                apartmentNumber,
                serialNumber: '',
                dahGcal: 0,
                askoeGcal: 0,
                status: 'skipped',
                reason: 'Немає показника ДАХ',
            });
            continue;
        }

        const matches = availableAskoe.filter(
            (row) => row.energy != null && readingsMatch(dahGcal, row.energy),
        );

        if (matches.length !== 1) {
            results.push({
                meterId: meter.id,
                apartmentNumber,
                serialNumber: '',
                dahGcal,
                askoeGcal: 0,
                status: 'skipped',
                reason:
                    matches.length === 0
                        ? 'Немає збігу в АСКОЕ'
                        : `Неоднозначно: ${matches.map((row) => row.serialNumber).join(', ')}`,
            });
            continue;
        }

        const match = matches[0];
        const askoeGcal = askoeEnergyWhToGcal(match.energy!);
        const serialNumber = match.serialNumber;
        const note = `Припущення (${snapshotLabel}): ДАХ ${dahGcal.toFixed(3)} ≈ АСКОЕ ${askoeGcal.toFixed(3)} Гкал`;

        if (!input.dryRun) {
            await prisma.meter.update({
                where: { id: meter.id },
                data: {
                    serialNumber,
                    askoeValidationStatus: MeterAskoeValidationStatus.ASSUMED,
                    askoeValidatedAt: new Date(),
                    askoeValidationNote: note,
                },
            });
            await relinkAskoeDetailsForMeter(meter.id, serialNumber);
            usedSerials.add(serialNumber);
            const index = availableAskoe.findIndex((row) => row.serialNumber === serialNumber);
            if (index >= 0) {
                availableAskoe.splice(index, 1);
            }
        }

        results.push({
            meterId: meter.id,
            apartmentNumber,
            serialNumber,
            dahGcal,
            askoeGcal,
            status: 'assigned',
        });
    }

    return results;
}
