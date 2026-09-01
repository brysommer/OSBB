import axios from 'axios';
import 'dotenv/config';

const BASE_URL = 'https://acp.privatbank.ua/api';

export interface Privat24Config {
    id: string;
    token: string;
    account: string;
}

export interface Privat24Balance {
    account: string;
    accountName: string;
    balanceOut: number;
    currency: string;
    turnoverDebt: number;
    turnoverCred: number;
}

export interface Privat24Transaction {
    id: string;
    type: 'D' | 'C' | string;
    amount: number;
    currency: string;
    purpose: string;
    counterpartyName: string;
    counterpartyAccount: string;
    dateTime: string;
}

interface BalanceRow {
    acc?: string;
    nameACC?: string;
    balanceOut?: string;
    currency?: string;
    turnoverDebt?: string;
    turnoverCred?: string;
}

interface TransactionRow {
    ID?: string;
    TRANTYPE?: string;
    SUM?: string;
    CCY?: string;
    OSND?: string;
    AUT_CNTR_NAM?: string;
    AUT_CNTR_ACC?: string;
    DATE_TIME_DAT_OD_TIM_P?: string;
}

interface PaginatedResponse<T> {
    status?: string;
    exist_next_page?: boolean;
    next_page_id?: string;
    balances?: T[];
    transactions?: T[];
}

export function getPrivat24Config(): Privat24Config | null {
    const id = process.env.idP24 ?? process.env.PRIVAT24_ID;
    const token = process.env.tokenP24 ?? process.env.PRIVAT24_TOKEN;
    const account = process.env.accountP24 ?? process.env.PRIVAT24_ACCOUNT;

    if (!id || !token || !account) {
        return null;
    }

    return { id, token, account };
}

function parseAmount(value?: string): number {
    if (!value) {
        return 0;
    }

    const normalized = value.replace(/\s/g, '').replace(',', '.');
    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : 0;
}

function mapBalance(row: BalanceRow): Privat24Balance {
    return {
        account: row.acc ?? '',
        accountName: row.nameACC ?? '',
        balanceOut: parseAmount(row.balanceOut),
        currency: row.currency ?? 'UAH',
        turnoverDebt: parseAmount(row.turnoverDebt),
        turnoverCred: parseAmount(row.turnoverCred),
    };
}

function mapTransaction(row: TransactionRow): Privat24Transaction | null {
    if (!row.ID) {
        return null;
    }

    return {
        id: row.ID,
        type: row.TRANTYPE ?? '',
        amount: parseAmount(row.SUM),
        currency: row.CCY ?? 'UAH',
        purpose: row.OSND ?? '',
        counterpartyName: row.AUT_CNTR_NAM ?? '',
        counterpartyAccount: row.AUT_CNTR_ACC ?? '',
        dateTime: row.DATE_TIME_DAT_OD_TIM_P ?? '',
    };
}

async function privat24Get<T extends BalanceRow | TransactionRow>(
    path: string,
    config: Privat24Config,
    params: Record<string, string | number | undefined>,
): Promise<PaginatedResponse<T>> {
    const response = await axios.get<PaginatedResponse<T>>(path, {
        baseURL: BASE_URL,
        params,
        headers: {
            id: config.id,
            Token: config.token,
            token: config.token,
            Accept: 'application/json',
        },
        timeout: 30_000,
    });

    if (response.data.status && response.data.status !== 'SUCCESS') {
        throw new Error(`Privat24 API status: ${response.data.status}`);
    }

    return response.data;
}

async function fetchAllPages<T extends BalanceRow | TransactionRow>(
    path: string,
    config: Privat24Config,
    params: Record<string, string | number | undefined>,
    pickRows: (response: PaginatedResponse<T>) => T[],
): Promise<T[]> {
    const rows: T[] = [];
    let followId: string | undefined;

    do {
        const response = await privat24Get<T>(path, config, {
            ...params,
            ...(followId ? { followId } : {}),
        });

        rows.push(...pickRows(response));
        followId = response.exist_next_page ? response.next_page_id : undefined;
    } while (followId);

    return rows;
}

export async function getPrivat24InterimBalance(
    config: Privat24Config,
): Promise<Privat24Balance> {
    const rows = await fetchAllPages<BalanceRow>(
        '/statements/balance/interim',
        config,
        {
            acc: config.account,
            limit: 100,
        },
        (response) => response.balances ?? [],
    );

    if (!rows.length) {
        throw new Error('Privat24: баланс не знайдено');
    }

    return mapBalance(rows[rows.length - 1]);
}

export async function getPrivat24InterimTransactions(
    config: Privat24Config,
): Promise<Privat24Transaction[]> {
    const rows = await fetchAllPages<TransactionRow>(
        '/statements/transactions/interim',
        config,
        {
            acc: config.account,
            limit: 100,
        },
        (response) => response.transactions ?? [],
    );

    return rows
        .map(mapTransaction)
        .filter((transaction): transaction is Privat24Transaction => transaction !== null);
}

export function formatPrivat24Amount(amount: number, currency = 'UAH'): string {
    return `${amount.toLocaleString('uk-UA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} ${currency}`;
}

export function maskPrivat24Account(account: string): string {
    if (account.length <= 8) {
        return account;
    }

    return `${account.slice(0, 6)}...${account.slice(-4)}`;
}
