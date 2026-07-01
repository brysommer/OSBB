import { delay } from '@/scripts/dalay';
import {
    getReadingsForExport,
    markReadingError,
    markReadingSent,
} from '../repositories/reading.repository';
/*
import {
    getReadingsForExport,
    markReadingError,
    markReadingSent,
} from '@/repositories/reading.repository';*/
import { getErrorText, putReading } from './dah.service';

interface ExportOptions {
    buildingNumber: string;
    period: string;

    onStart?: (total: number) => Promise<void>;

    onProgress?: (data: {
        current: number;
        total: number;
        success: number;
        failed: number;
    }) => Promise<void>;

    onError?: (text: string) => Promise<void>;

    onFinish?: (data: { success: number; failed: number; total: number }) => Promise<void>;
}

export async function exportReadings({
    buildingNumber,
    period,

    onStart,
    onProgress,
    onError,
    onFinish,
}: ExportOptions) {
    const readings = await getReadingsForExport(buildingNumber, period);

    if (!readings.length) {
        return;
    }

    let success = 0;
    let failed = 0;

    await onStart?.(readings.length);

    for (let i = 0; i < readings.length; i++) {
        const reading = readings[i];

        const result = await putReading(reading.meter.dahId, reading.current);

        if (result.success) {
            success++;

            await markReadingSent(reading.id);
        } else {
            failed++;

            await markReadingError(reading.id, result.message ?? 'unknown_error');

            await onError?.(
                [
                    `❌ Будинок ${reading.meter.premises.buildingNumber}`,
                    `Під'їзд ${reading.meter.premises.sectionNumber}`,
                    `Квартира ${reading.meter.premises.apartmentNumber}`,
                    `${reading.meter.resourceType}`,
                    `Показник ${reading.current}`,
                    '',
                    getErrorText(result.message),
                ].join('\n'),
            );
        }

        await onProgress?.({
            current: i + 1,
            total: readings.length,
            success,
            failed,
        });

        await delay(2000);
    }

    await onFinish?.({
        success,
        failed,
        total: readings.length,
    });
}
