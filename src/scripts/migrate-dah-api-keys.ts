import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { setResidentialComplexDahApiKey } from '../services/residentialComplexApiKey.service';

const mappings = [
    {
        residentialComplexName: 'Синергія GLASS',
        apiKey: process.env.DAH_API_KEY,
    },
    {
        residentialComplexName: 'ЗігЗаг',
        apiKey: process.env.DAH_API_KEY1,
    },
];

async function migrateDahApiKeys() {
    for (const mapping of mappings) {
        if (!mapping.apiKey) {
            throw new Error(`У .env відсутній старий ключ для ЖК "${mapping.residentialComplexName}"`);
        }

        const residentialComplex = await prisma.residentialComplex.findFirst({
            where: {
                name: mapping.residentialComplexName,
            },
            select: {
                id: true,
                name: true,
            },
        });

        if (!residentialComplex) {
            throw new Error(`ЖК "${mapping.residentialComplexName}" не знайдено`);
        }

        await setResidentialComplexDahApiKey(residentialComplex.id, mapping.apiKey);
        console.log(`Ключ ДАХ збережено для ЖК "${residentialComplex.name}"`);
    }
}

migrateDahApiKeys()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
