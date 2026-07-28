import { ExportStatus, PrismaClient, ReadingSource } from '@prisma/client';

const prisma = new PrismaClient();

export async function getReadingsForExport(
    buildingNumber: string,
    period: string,
    residentialComplexId: string,
) {
    const readings = await prisma.reading.findMany({
        where: {
            period,
            source: ReadingSource.COLLECTED,

            meter: {
                premises: {
                    buildingNumber,
                    residentialComplexId,
                },
            },
        },

        include: {
            meter: {
                include: {
                    premises: true,
                },
            },
        },

        orderBy: {
            createdAt: 'desc',
        },
    });

    const latestByMeter = new Map<string, (typeof readings)[number]>();

    for (const reading of readings) {
        if (!latestByMeter.has(reading.meterId)) {
            latestByMeter.set(reading.meterId, reading);
        }
    }

    return [...latestByMeter.values()].sort((a, b) => {
        const sectionCompare = (a.meter.premises.sectionNumber ?? '').localeCompare(
            b.meter.premises.sectionNumber ?? '',
            undefined,
            { numeric: true },
        );

        if (sectionCompare !== 0) return sectionCompare;

        return (a.meter.premises.apartmentNumber ?? '').localeCompare(
            b.meter.premises.apartmentNumber ?? '',
            undefined,
            { numeric: true },
        );
    });
}

export async function markReadingSent(readingId: string) {
    return prisma.reading.update({
        where: {
            id: readingId,
        },
        data: {
            exportStatus: ExportStatus.SENT,
            exportedAt: new Date(),
            exportError: null,
        },
    });
}

export async function markReadingError(readingId: string, error: string) {
    return prisma.reading.update({
        where: {
            id: readingId,
        },
        data: {
            exportStatus: ExportStatus.ERROR,
            exportError: error,
        },
    });
}

export async function markPending(readingId: string) {
    return prisma.reading.update({
        where: {
            id: readingId,
        },
        data: {
            exportStatus: ExportStatus.PENDING,
            exportError: null,
        },
    });
}
