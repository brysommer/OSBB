import 'dotenv/config';

import { importAskoeSnapshotForDate } from '../services/askoeImport.service';
import {
    dahPeriodFromSnapshotDate,
    validateMetersAgainstAskoe,
} from '../services/askoeValidation.service';

function snapshotDateFromDayMonthYear(dayMonthYear: string): Date {
    const match = dayMonthYear.match(/(\d{2})\.(\d{2})\.(\d{4})/);

    if (!match) {
        throw new Error(`Невірний формат дати: ${dayMonthYear}. Очікується ДД.ММ.РРРР`);
    }

    return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
}

async function main() {
    const dayMonthYear = process.argv[2];
    const complex = process.argv[3] ?? 'Синергія GLASS';
    const building = process.argv[4] ?? '9';

    let snapshotDate: Date | undefined;

    if (dayMonthYear) {
        console.log(`Імпорт АСКОЕ за ${dayMonthYear}...`);
        const imported = await importAskoeSnapshotForDate(dayMonthYear, { validate: false });
        snapshotDate = imported.snapshotDate;
        console.log(JSON.stringify(imported, null, 2));
    }

    const results = await validateMetersAgainstAskoe({
        residentialComplexName: complex,
        buildingNumber: building,
        resourceType: 'HEATING',
        snapshotDate,
        dahPeriod: snapshotDate ? dahPeriodFromSnapshotDate(snapshotDate) : undefined,
    });

    const summary = {
        total: results.length,
        validated: results.filter((item) => item.status === 'VALIDATED').length,
        failed: results.filter((item) => item.status === 'VALIDATION_FAILED').length,
    };

    console.log(
        JSON.stringify(
            {
                summary,
                failed: results.filter((item) => item.status === 'VALIDATION_FAILED'),
            },
            null,
            2,
        ),
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
