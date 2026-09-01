import 'dotenv/config';

import {
    formatPrivat24Amount,
    getPrivat24Config,
    getPrivat24InterimBalance,
    getPrivat24InterimTransactions,
    maskPrivat24Account,
} from '../services/privat24.service';

async function main() {
    const config = getPrivat24Config();

    if (!config) {
        throw new Error('Configure idP24, tokenP24 and accountP24 in .env');
    }

    const balance = await getPrivat24InterimBalance(config);
    const transactions = await getPrivat24InterimTransactions(config);
    const debits = transactions.filter((item) => item.type.toUpperCase() === 'D');

    console.log(
        JSON.stringify(
            {
                account: maskPrivat24Account(config.account),
                balance: formatPrivat24Amount(balance.balanceOut, balance.currency),
                transactions: transactions.length,
                debits: debits.length,
                latestDebit: debits.length ? debits[debits.length - 1] : null,
            },
            null,
            2,
        ),
    );
}

main().catch((error) => {
    console.error('PRIVAT24_TEST_FAILED:', error.response?.data ?? error.message);
    process.exit(1);
});
