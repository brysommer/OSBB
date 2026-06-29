import axios from 'axios';
import { PrismaClient, ResourceType, ReadingSource, ReadingStatus } from '@prisma/client';
import 'dotenv/config';
import { DAH_API_KEY } from './import-premises';

const prisma = new PrismaClient();

const periods = ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01'];

async function importReadings() {
    const meters = await prisma.meter.findMany();

    const skippedMEters = [
        'fade8b37-954d-414c-b244-893677f5eeed',
        '452c3752-d172-412d-a971-78cc1acbb7d5',
        '904d6b5a-db8b-496a-9ff5-6d9d05cceeb9',
        'c7bb1dac-c7e8-4f95-9143-e5749de6f117',
        '3fb3a366-ec94-4409-b2c3-acbea6e55fee',
        '08af8837-e08d-44ab-9379-aaa61c759fd1',
        'dda627f9-a58f-45a4-a5b9-85049c4b8793',
        '404dede9-e755-42a2-b546-5f08a69bbc8d',
        'd95938c3-9ff7-440b-8449-72788053a9de',
    ];

    const meterId = 'fade8b37-954d-414c-b244-893677f5eeed';

    /*  const response = await axios.get(
        `https://open.api.dah-online.com/v1/counter/indications/id/${meterId}/2026-3`,
        {
            headers: {
                Authorization: `Bearer ${DAH_API_KEY}`,
            },
        },
    );
*/
    //  console.dir(response.data, { depth: null });

    for (const meter of meters) {
        for (const period of periods) {
            try {
                const { data } = await axios.get(
                    `https://open.api.dah-online.com/v1/counter/indications/id/${meter.dahId}/${period}`,
                    {
                        headers: {
                            Authorization: `Bearer ${DAH_API_KEY}`,
                        },
                    },
                );

                console.log(data);

                const ind = data?.[0];

                if (!ind) continue;

                await prisma.reading.upsert({
                    where: {
                        meterId_period: {
                            meterId: meter.id,
                            period,
                        },
                    },
                    create: {
                        meterId: meter.id,
                        period,
                        previous: ind.startIndication,
                        current: ind.endIndication,
                        diff: ind.consumed,
                        status: 'OK',
                    },
                    update: {
                        previous: ind.startIndication,
                        current: ind.endIndication,
                        diff: ind.consumed,
                    },
                });

                await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Помилка для лічильника ${meter.dahId}, період ${period}`);
            }
        }
    }
}

importReadings()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
