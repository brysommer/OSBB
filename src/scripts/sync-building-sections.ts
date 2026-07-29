import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { syncBuildingSectionsFromPremises } from '../services/buildingSection.service';

async function main() {
    const result = await syncBuildingSectionsFromPremises();
    console.log(JSON.stringify(result, null, 2));
}

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
