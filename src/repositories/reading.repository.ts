import { ExportStatus, PrismaClient, ReadingSource } from '@prisma/client';

const prisma = new PrismaClient();

export async function getReadingsForExport(buildingNumber: string, period: string) {
    return prisma.reading.findMany({
        where: {
            period,
            source: ReadingSource.COLLECTED,

            meter: {
                premises: {
                    buildingNumber,
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

        orderBy: [
            {
                meter: {
                    premises: {
                        sectionNumber: 'asc',
                    },
                },
            },
            {
                meter: {
                    premises: {
                        apartmentNumber: 'asc',
                    },
                },
            },
        ],
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
