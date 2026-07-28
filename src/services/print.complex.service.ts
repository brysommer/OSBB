import { PrismaClient, ResourceType } from '@prisma/client';
import { printMeterQr } from './label.service';

const prisma = new PrismaClient();

export async function printComplexLabels(
    residentialComplexId: string,
    resourceType: ResourceType | 'BOTH',
) {
    const where: any = {
        premises: {
            residentialComplexId,
        },
    };

    if (resourceType !== 'BOTH') {
        where.resourceType = resourceType;
    }

    const meters = await prisma.meter.findMany({
        where,
        select: {
            dahId: true,
            premises: {
                select: {
                    buildingNumber: true,
                    sectionNumber: true,
                    apartmentNumber: true,
                },
            },
        },
        orderBy: [
            {
                premises: {
                    buildingNumber: 'asc',
                },
            },
            {
                premises: {
                    sectionNumber: 'asc',
                },
            },
            {
                premises: {
                    apartmentNumber: 'asc',
                },
            },
        ],
    });

    console.log(`Знайдено ${meters.length} лічильників.`);

    for (const meter of meters) {
        console.log(`Друк ${meter.dahId}`);

        await printMeterQr(meter.dahId);

        // щоб принтер не захлинувся
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log('Друк завершено.');
}

printComplexLabels('cmramjp5u0000esewewi5iwj4', 'HOT_WATER');
