import { PrismaClient, ReadingSource, ReadingStatus } from '@prisma/client';

const prisma = new PrismaClient();

export interface SaveReadingInput {
    meterId: string;
    period: string;

    previous: number;
    current: number;

    source: ReadingSource;
    clientSyncId?: string;
    status?: ReadingStatus;
}

export function validateReading(previous: number, current: number) {
    const diff = current - previous;

    // базова перевірка
    if (diff < 0) {
        return {
            status: ReadingStatus.WARNING,
            diff,
            reason: 'NEGATIVE_DIFF',
        };
    }

    // підозрілий стрибок
    if (diff > previous * 2 && previous > 0) {
        return {
            status: ReadingStatus.WARNING,
            diff,
            reason: 'SUSPICIOUS_JUMP',
        };
    }

    return {
        status: ReadingStatus.OK,
        diff,
        reason: null,
    };
}
export async function saveReading(input: SaveReadingInput) {
    const validation = validateReading(input.previous, input.current);

    const reading = await prisma.reading.create({
        data: {
            meterId: input.meterId,
            period: input.period,

            previous: input.previous,
            current: input.current,
            diff: validation.diff,

            status: input.status ?? validation.status,
            source: input.source,
            clientSyncId: input.clientSyncId,
        },
    });

    return {
        reading,
        validation,
    };
}

/** З якого числа місяця обхід/подача вважаються вже наступним періодом ДАХ. */
export const PERIOD_ROLLOVER_DAY = 27;

/**
 * Період для ДАХ завжди «1-ше число місяця нарахування».
 *
 * Збір може бути в кінці місяця (з PERIOD_ROLLOVER_DAY) або на початку наступного —
 * обидва попадають в один і той самий період, щоб не було колізій при експорті.
 *
 * Приклади (rollover = 27):
 * - 28.09 → 2026-10-01
 * - 01.10 → 2026-10-01
 * - 26.10 → 2026-10-01
 * - 27.10 → 2026-11-01
 */
export function getCurrentPeriod(now = new Date()): string {
    const year = now.getFullYear();
    const monthIndex = now.getMonth(); // 0–11
    const day = now.getDate();

    let periodYear = year;
    let periodMonthIndex = monthIndex;

    if (day >= PERIOD_ROLLOVER_DAY) {
        periodMonthIndex += 1;
        if (periodMonthIndex > 11) {
            periodMonthIndex = 0;
            periodYear += 1;
        }
    }

    const month = String(periodMonthIndex + 1).padStart(2, '0');
    return `${periodYear}-${month}-01`;
}

