import 'dotenv/config';

import { assignAskoeSerialsByReadingMatch } from '../services/askoeAssumption.service';

function snapshotDateFromDayMonthYear(dayMonthYear: string): Date {
    const match = dayMonthYear.match(/(\d{2})\.(\d{2})\.(\d{4})/);

    if (!match) {
        throw new Error(`Невірний формат дати: ${dayMonthYear}. Очікується ДД.ММ.РРРР`);
    }

    return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
}

async function main() {
    const dayMonthYear = process.argv[2] ?? '29.04.2026';
    const complex = process.argv[3] ?? 'Синергія GLASS';
    const building = process.argv[4] ?? '9';
    const dryRun = process.argv.includes('--dry-run');

    const results = await assignAskoeSerialsByReadingMatch({
        snapshotDate: snapshotDateFromDayMonthYear(dayMonthYear),
        residentialComplexName: complex,
        buildingNumber: building,
        dryRun,
    });

    const summary = {
        dryRun,
        assigned: results.filter((item) => item.status === 'assigned').length,
        skipped: results.filter((item) => item.status === 'skipped').length,
    };

    console.log(JSON.stringify({ summary, results }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
