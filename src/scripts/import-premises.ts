import axios from 'axios';
import { PrismaClient, ResourceType } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

export const DAH_API_KEY = process.env.DAH_API_KEY!;

const DAH_URL = 'https://open.api.dah-online.com/v1/dictionary/apartments';

async function importApartments() {
    const { data: apartments } = await axios.get(
        'https://open.api.dah-online.com/v1/dictionary/apartments',
        {
            headers: {
                Authorization: `Bearer ${DAH_API_KEY}`,
            },
        },
    );

    console.log(`Loaded: ${apartments.length}`);

    for (const apartment of apartments) {
        // 1. UPSERT PREMISES
        const premises = await prisma.premises.upsert({
            where: {
                dahId: apartment.id,
            },
            create: {
                dahId: apartment.id,

                name: apartment.name,
                number: apartment.personalAccountNumber,

                apartmentType: apartment.apartmentData?.apartmentType ?? null,
                apartmentNumber: apartment.apartmentData?.apartmentNumber ?? null,

                sectionType: apartment.apartmentData?.sectionType ?? null,
                sectionNumber: apartment.apartmentData?.sectionNumber ?? null,

                buildingId: apartment.apartmentData?.buildingId ?? null,
                buildingNumber: apartment.apartmentData?.buildingNumber ?? null,

                floor: apartment.apartmentData?.floor ?? null,
            },
            update: {
                name: apartment.name,
                number: apartment.personalAccountNumber,

                apartmentType: apartment.apartmentData?.apartmentType ?? null,
                apartmentNumber: apartment.apartmentData?.apartmentNumber ?? null,

                sectionType: apartment.apartmentData?.sectionType ?? null,
                sectionNumber: apartment.apartmentData?.sectionNumber ?? null,

                buildingId: apartment.apartmentData?.buildingId ?? null,
                buildingNumber: apartment.apartmentData?.buildingNumber ?? null,

                floor: apartment.apartmentData?.floor ?? null,
            },
        });

        // 2. COUNTERS → METERS
        for (const counter of apartment.counters ?? []) {
            if (!Object.values(ResourceType).includes(counter.resourceType as ResourceType)) {
                console.warn(`Unknown resource type: ${counter.resourceType}`);
                continue;
            }

            await prisma.meter.upsert({
                where: {
                    dahId: counter.id,
                },
                create: {
                    dahId: counter.id,
                    premisesId: premises.id,
                    name: counter.name,
                    resourceType: counter.resourceType as ResourceType,
                },
                update: {
                    premisesId: premises.id,
                    name: counter.name,
                    resourceType: counter.resourceType as ResourceType,
                },
            });
        }
    }

    console.log('Import finished');
}

importApartments()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
