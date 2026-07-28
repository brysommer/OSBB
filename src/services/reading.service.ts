import { PrismaClient, ReadingSource, ReadingStatus } from '@prisma/client';

const prisma = new PrismaClient();

export interface SaveReadingInput {
    meterId: string;
    period: string;

    previous: number;
    current: number;

    source: ReadingSource;
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

            status: validation.status,
            source: input.source,
        },
    });

    return {
        reading,
        validation,
    };
}

export function getCurrentPeriod(): string {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 2).padStart(2, '0');

    return `${year}-${month}-01`;
}
