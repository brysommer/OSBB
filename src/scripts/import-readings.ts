import axios from 'axios';
import { PrismaClient, ResourceType, ReadingSource, ReadingStatus } from '@prisma/client';
import 'dotenv/config';
import { DAH_API_KEY } from './import-premises';

const prisma = new PrismaClient();

const periods = ['2026-06-01', '2026-07-01'];

async function importReadings() {
    /*
    const meters = await prisma.meter.findMany({
        where: {
            premises: {
                residentialComplex: {
                    name: 'ЗігЗаг',
                },
            },
        },
    });
*/
    const skippedMEters = [
        'e76fd508-c735-44a2-b211-986bf9bbf88e',
        '19aad553-a911-458e-97ed-799458a489ca',
        'f927c3ce-cd86-4223-9f99-fdff524f7bd6',
        '841560d7-e623-49b4-b659-fee6100cd80e',
        '3308187d-1cc4-45fe-96c2-d9d6ec242a82',
        'd8ee53a5-78a9-4839-bdcc-05b5c92e6c58',
        '1a2b384f-df3c-4fa4-8735-e2915c1c9a24',
        'f809b8df-758a-4ac7-a723-fafee232d64c',
        '4c79edd5-b689-4750-a4c6-089dca794029',
        'e1f70603-2514-4f66-b451-db51b13afb5e',
        '853fb3ba-d165-4d9d-b433-8a685f8816bd',
        '0aa4fbc7-878f-4d8d-bde7-5646ae3d0901',
        '29db8dbc-7285-4504-abed-a9ddeeadc5da',
        '90d22e82-7e67-4eea-8b82-091c9693e508',
        'fef869f4-839f-4fc0-afd1-fe24612cda40',
        'ad6da7ca-1928-4783-85a9-83c187483012',
        '6ee9bff7-c4fb-43a6-9281-83f149ee0f82',
        '9db89da7-632d-4f82-bcbf-135a9c2ad42f',
        'cbbb0139-c5f7-41c1-bb22-898d1471ef6e',
        'a059b321-c0be-4896-8515-d8e82be7001a',
        'b327e444-54e7-485d-8a78-9f7a2f6a83f2',
        'cfb13432-ca3e-4683-8a81-2266de259dee',
        '7b3d67b2-1119-4910-8afd-efe558b7021c',
        '573ca189-71e2-4a2e-93ee-cbd4c51b680d',
        '678813e3-6ac3-4fac-97a3-03c4fb6673c6',
        'cf2642d2-3152-4876-9eaa-2f0fdd601c56',
        '3828626f-dd32-4179-9b4e-eeebf85dd043',
        '71757627-98f1-421f-b72f-d5ff0ce8dd95',
        '8ca7b366-d6c3-4ac3-94b6-b9070dac70d7',
        '8281c6bc-1b94-4364-b56c-fb92796d8286',
        '016c54ea-16c8-4551-b4d6-ee34001385f5',
        '14210cbc-eb4c-4841-a25e-2e292c31d884',
        '2f66fa47-215b-465e-bd0e-21e98badd81a',
        '14a21bd1-4553-473e-b4f6-4c95eacba60c',
        '046eeb1e-56d8-43b5-a9fb-028563fd72d6',
        '5f873b89-aa20-4287-bb3e-70396a7172b8',
        'e200c085-327a-48f6-9fb7-0479aac14ab5',
        '563f1f03-3e1f-4a96-91f7-eefe7de2069f',
        'a10bdf9f-01d2-43df-8224-d23b09d5aa1d',
        '23622b66-f03f-43a3-b3e5-e5aadb3839b7',
        '79600247-ab4f-4f43-a90a-836e191cfe5f',
        '6bd54da0-f9fe-4d8a-a2c2-78f63a1ceab4',
        'b8bcf9f3-4a57-4b2f-b157-d55dc74c3234',
        'd1c8f789-addc-4581-b4fb-0691c457a90f',
        'ea2d9736-9f0c-4be3-aba0-e46725bd2747',
        '4e18ef9e-8394-42d4-84c9-0b7091b30104',
        '8dfdb201-189b-4a74-aa26-2095c6e39d78',
        'c428d549-910f-4d2e-83a3-0807dbf20902',
        '7fbf0f14-6e71-4c51-8d35-8e7ef1dd03b5',
        '22976ce8-1d4d-4f60-a132-736dcf5c00e3',
        '03ace11c-2b38-4574-b360-4e595759dde8',
        'd5a94451-36b4-4580-ac44-6492163661ea',
        '986202fd-81fe-4cd3-bcab-f5a253c78aeb',
        'b8d536c3-be31-4e12-91db-d27b52346c48',
        '8db816e0-2e49-41f4-9d93-c8ce051e532a',
        '7572e0c7-d664-4386-a4c1-9b6eb6f5caef',
        '4a5fa1fa-0584-45ab-a662-2ac51a2bd63f',
        'd2ef5539-8f4e-4f44-8a93-bd2c77d85fe4',
        'bc9c57ea-7eaf-4672-afda-61faefd06a01',
        'f3ca6628-898e-4612-af28-09ce0a3a0b70',
        'd9aca009-67de-41c3-a626-c4d52ef23184',
        '8d996450-5081-4a5b-98a6-0e444b891b8c',
        '956337b1-48d0-462f-95dd-10a6cb0e0e28',
        'bf072bca-78c9-4415-b8df-c6fcd497ca6d',
        '4c436f3d-f305-4b26-b819-f94f200068df',
        '00235f75-a1aa-4ade-842f-7dc29da595bc',
        '7adb56fb-d046-4405-9264-8ca2d0eb5b80',
        'fbd1f6e6-6f66-44da-be81-b4d6698f409c',
        'a4394abd-72bd-4226-9d33-8a43980dc3fc',
        '79dad403-71b7-4023-a359-75cfc2099ba4',
        '1d2049a9-9411-4ac7-bcd9-215ec88d72be',
        '006d8567-d14b-4db0-990a-4daebc5e738b',
        'd703e324-3703-4297-9637-3fc59813cd38',
        '3e5f5a05-07e0-4f02-9f4c-12747a98b541',
        '8fb059e7-354a-4629-b3dd-d2f6b02e29ee',
        '1a161191-1942-4e67-9e12-aa69fda8d39c',
        '6181ef0b-e57c-4a9e-bef7-07e167e3ffc8',
        'a72a8638-f0d0-4c34-ada8-7a99c0cd0966',
        '25e8c853-7d11-46c9-a422-d746347854ef',
        '24e2e16d-c6ae-4ce8-a6c2-9206ff12f664',
        'cf074c71-0e12-4293-9fcd-6ca5d2d4367c',
        'cc867b78-9d0f-4e15-b512-ef78d8af468c',
        'c8a7b4aa-81cf-497d-b021-596b88efadf7',
        'bc22f4df-d684-45d1-84d8-54796eebf6c6',
        '4cb1118a-f216-4d0a-b623-515c505c2798',
        'dd8ae8a0-e5a3-4634-9577-5efc78d03fe8',
        'b9f98ebc-0b96-4e89-b2e3-d8cf7c996414',
        '69aaa5fd-98bb-49e1-9a25-73639a2cf70c',
        '7370ae3b-951c-4997-aa5c-3eea228070fb',
        '7afe69c7-d76d-4fd3-b599-2543c1ce0bc0',
        '291d7871-2d08-4639-ba42-fc628021b6c8',
        '7061e558-bdcf-4ae7-afee-0cb4a17911f9',
        'fce86ae5-a594-41a7-a6e4-3be6101095c0',
        '2490f28b-0c7e-431e-8d7f-a00b230a43b9',
        'd10a3eb5-507f-489e-9430-017687ebda93',
        '600401ed-9b7d-45cb-a17a-e1e3b576f82b',
        '1d66d6a8-129f-42b6-88bb-fa15f69f68f1',
        '6692aacb-bd4b-44bc-84d9-f702b6e141ce',
        '6b17d0b2-7ff2-4ac4-bc87-25a0896b1b99',
        '34a0094d-8353-42ea-8348-41530eb77069',
        '07bee9c5-0fdf-4ab2-b059-ded29d394cd5',
        'a764a7d0-aee1-4e5d-8eed-a4d63fb451d7',
        '10bded63-1227-4bb1-8a32-da252c053221',
        'a5f9b42b-7d53-4223-b905-e9c6de647c1d',
        'af0988ac-9bab-4eda-a8e6-718cb9e9a56e',
        '96091cbb-33f8-4bcb-9f6a-4a76918856ef',
        'c45e398a-f1f5-4170-a2da-52b4db315edf',
        '0f2a1f3e-e6b1-47d9-a8f4-68fc7ceaa989',
        '6c7b61bf-3a08-4bf2-a1fb-0ed5871633d0',
        '927bb385-5063-4bf8-959f-9b78e7780af8',
        'b501ddff-c112-447e-9339-e86fe5e6d811',
        '4465f4f2-9bf4-46a4-b92c-fd678621f5bc',
        'e0aef0e2-88a6-4c44-a00d-92c65ce095f0',
        'ccecb9b9-da68-4b77-8ef8-54645acd519f',
        '4d8eb958-7bba-47df-9fe5-6c7ac71d8c8f',
        '899f9c9e-76f2-48d9-b153-32723c1136d6',
        'c0e94be-edbe-4698-9800-5fcd6dbe69f8',
        'e7e8f001-5ed7-4a93-abaa-b0560945c433',
        '0574c183-5d83-479b-823a-3bbc1fd57e65',
        '0a4b55ac-ade1-4b7f-8de2-dd3bb80d5104',
        '36d05ffd-6274-4dd9-b464-eaace68b3c58',
        '02d9ded8-4938-4f1d-a631-8783c8aacf40',
        '3f8457ae-87cc-4301-ae5f-1a2f5d1864e2',
        '98294ca8-929e-4be0-b245-122c70319d7e',
        '8c361af4-e9ab-45f5-b685-dbf96e5e08be',
        '3b08c7ad-66bd-4073-9639-90af3869c095',
        'e1eadb6d-6f55-43f5-9b4b-0a67243eb52f',
        'cd13d982-c264-46cb-96e1-9d1f7697bbfa',
        '2cf17a95-af5c-4382-8660-538d63163bfb',
        '534d5840-da83-46bc-894e-32cfbc9e70d5',
        'ec7e7a3e-0d93-44d8-9659-6a42307cb1b4',
        'ae6bfb2e-cd60-4ef0-ba81-708ba2e99a7f',
        '451544ef-d7d7-4318-ae28-f4688b5b5ed6',
        'b76857d9-79c4-4305-b776-6b7391fc08e5',
        'cc4e2822-3b02-4643-a158-27b2d5590cbb',
        '6c46a7cb-8715-4c44-b34a-49b0542e706b',
        '7442d3f5-385a-4e6c-bf0a-8c74c89b9b73',
        'fbadfd81-47e0-4327-b7d3-223c02bdf7b2',
        '5223cb24-0043-40aa-86dd-742e1fbaab95',
        '10f8ac4c-212d-44fd-ae5f-ef7ff49982c5',
        '65ccda12-8941-4676-97d4-725a853bcb66',
        '533c6a99-0f5e-4bb9-b650-551416ae254b',
        'fe14a742-efaf-4ec3-a7f3-abe7cc85d731',
        '9a8298f3-2651-44ea-904b-9c5effeed07a',
        '2df39a3c-e34d-45ef-b482-cfd5d467c4c9',
        '7e734b0b-23e4-4859-96c5-4b1bd6a34433',
        '7134edfe-271b-4cb2-bfc4-f58e6a803645',
        '38209d08-ef84-4079-af5b-f464a884a6ff',
        '394b65ca-28d8-4e7a-b1da-2ba724f63d33',
        'e0e24a85-b62c-494c-9c46-f3678a390bfe',
        '330b8520-98a2-40c0-9219-a7bc0b0701c2',
        '447fe06a-1dd7-44af-bcd5-782b90bc0b6a',
        '2ed429c6-e90a-4801-96bc-a86e5dd9e786',
        'af8a5454-965a-42c9-b616-dd8c76aec2c5',
        '25f5bbdf-dba1-4c3d-a5e7-d42312e72186',
        '23997cfd-1620-4b8b-b6c4-340244121199',
        '6d8077da-d618-4b02-8b3c-1e10a64c0150',
        '69d1e0ac-f9ca-4a5f-8a4e-fcdf744c8a3b',
        'b829e814-53bb-400f-b995-f22bfbae965f',
        'a727c9df-a553-4f03-88c7-457c4a6e180a',
        'a860c894-2640-4874-a28c-fedf5ce27096',
        '8f32f664-4ce6-4626-9d47-2ca618b17711',
        'c4145a38-5762-4589-ace6-75bc30c63fd1',
        'c2fc0e8d-b94d-4275-a7fd-9746d1198bc0',
        '89cab534-064f-4462-8b01-8944aa63b488',
        '4e08c08b-64c8-424b-93f5-0c9a969d32f9',
        '2b07d5c4-8297-4b76-941f-d2d4333a266d',
        'e3aa5248-343a-4ce2-a38c-f0c52f8ba974',
        '7ece13f1-d3c8-42f6-b2ea-60a9963de256',
        '2e0a21c6-62c2-41b5-8d77-4053f1992087',
        '81fce185-67ba-48f8-8fbc-048430e78102',
        '93943a60-7235-4df8-8817-12afa2c88bf0',
        'b28e3df2-3050-474d-94b7-f113167f430f',
        '3d089936-2635-4afb-889a-dd631b58ca4e',
        '76fc916b-d3df-4446-ac20-10ccb3fcb798',
        'f947bf54-9d60-4bba-86cd-fa6996ec0f70',
        '773bfe1f-7715-407c-b08e-8c797352b6a7',
        '46fffac4-8645-43a4-97bd-90a860a4b7c6',
        'b86c68cd-7ce9-4828-85fd-44413ad0f9ec',
        '67bb98e7-ec99-4e94-a4f4-00f90d783a24',
        'e577de3d-e343-4efa-b5ff-e28d264fa14f',
        'a1b6d897-8b97-47a5-8678-33f71e792047',
        '9fc1a3e2-76c9-47f4-9ac2-2b476f59b9d6',
        'a77beb2d-9d1e-4a56-b817-81cd651bb996',
        '1a5c63c2-ba0e-41e3-befb-39d2242b8355',
        '60a3d1f3-4928-434b-a487-ef15a8fc1718',
        '3931d0e0-c4a1-4574-97f1-5bbafea92a59',
        '63c60895-8b31-48c1-b7bd-d0dc4552b5f1',
        'cfd63e58-3b1b-46ec-b89e-b5ffcf08d92e',
        '443205bd-7642-48be-a51e-9a959733f3cf',
        '9c24eea4-93bf-475c-927b-695e3495ce1f',
        '55b48e13-8535-4047-b63e-0a2d5ee4ec30',
        '4d9a5340-0d9b-40eb-8a98-26ca253d603b',
        '034b9345-8638-42f0-9d60-a8c620c611b8',
        '1746e7f3-0f55-4530-85b1-e183548d63cc',
    ];

    const meters = await prisma.meter.findMany({
        where: {
            dahId: {
                in: skippedMEters,
            },
        },
    });

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

                const existingReading = await prisma.reading.findFirst({
                    where: {
                        meterId: meter.id,
                        period,
                        source: ReadingSource.DAH,
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                });

                const readingData = {
                    previous: ind.startIndication,
                    current: ind.endIndication,
                    diff: ind.consumed,
                    status: ReadingStatus.OK,
                    source: ReadingSource.DAH,
                };

                if (existingReading) {
                    await prisma.reading.update({
                        where: {
                            id: existingReading.id,
                        },
                        data: readingData,
                    });
                } else {
                    await prisma.reading.create({
                        data: {
                            ...readingData,
                            meterId: meter.id,
                            period,
                        },
                    });
                }

                await new Promise((resolve) => setTimeout(resolve, 2000));
            } catch (error) {
                console.error(`Помилка для лічильника ${meter.dahId}, період ${error}`);
                await new Promise((resolve) => setTimeout(resolve, 2000));
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
