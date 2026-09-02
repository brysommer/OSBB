import fs from 'fs/promises';
import path from 'path';

import TelegramBot from 'node-telegram-bot-api';

import {
    escapePrivat24Html,
    formatBalanceChangeHtml,
    formatFlowChangeHtml,
    formatPrivat24Amount,
    formatSignedPrivat24Amount,
    getPrivat24Config,
    getPrivat24InterimBalance,
    getPrivat24InterimTransactions,
    maskPrivat24Account,
    Privat24Balance,
    Privat24Transaction,
} from './privat24.service';

const KYIV_TIME_ZONE = 'Europe/Kyiv';
const SCHEDULE_CHECK_INTERVAL_MS = 30_000;
const DEBIT_POLL_INTERVAL_MS = 2 * 60 * 60_000;
const DATA_DIR = path.join(process.cwd(), 'data', 'privat24');
const SEEN_FILE = path.join(DATA_DIR, 'notified-debits.json');
const BALANCE_STATE_FILE = path.join(DATA_DIR, 'last-balance.json');

type StoredBalanceState = {
    date: string;
    balanceOut: number;
    currency: string;
};

function getKyivTime() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: KYIV_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return {
        date: `${values.year}-${values.month}-${values.day}`,
        hour: Number(values.hour),
        minute: Number(values.minute),
    };
}

export function getPrivat24ReportChatIds(): number[] {
    const explicit = process.env.PRIVAT24_REPORT_CHAT_IDS;

    if (explicit?.trim()) {
        const ids = explicit
            .split(',')
            .map((value) => Number(value.trim()))
            .filter((chatId) => Number.isSafeInteger(chatId));

        if (ids.length) {
            return ids;
        }
    }

    const fallback = process.env.ASKOE_REPORT_CHAT_ID;
    const chatId = Number(fallback);

    if (!fallback || !Number.isSafeInteger(chatId)) {
        throw new Error('PRIVAT24_REPORT_CHAT_IDS or ASKOE_REPORT_CHAT_ID is not configured');
    }

    return [chatId];
}

async function broadcastMessage(
    bot: TelegramBot,
    text: string,
    options?: TelegramBot.SendMessageOptions,
) {
    const chatIds = getPrivat24ReportChatIds();

    for (const chatId of chatIds) {
        await bot.sendMessage(chatId, text, options);
    }
}

async function loadSeenDebitIds(): Promise<Set<string>> {
    try {
        const raw = await fs.readFile(SEEN_FILE, 'utf8');
        const parsed = JSON.parse(raw) as string[];

        return new Set(parsed);
    } catch {
        return new Set();
    }
}

async function saveSeenDebitIds(ids: Set<string>) {
    await fs.mkdir(path.dirname(SEEN_FILE), { recursive: true });
    await fs.writeFile(SEEN_FILE, JSON.stringify([...ids], null, 2), 'utf8');
}

async function loadPreviousBalanceState(): Promise<StoredBalanceState | null> {
    try {
        const raw = await fs.readFile(BALANCE_STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as StoredBalanceState;

        if (
            typeof parsed.date !== 'string' ||
            typeof parsed.balanceOut !== 'number' ||
            typeof parsed.currency !== 'string'
        ) {
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
}

async function saveBalanceState(state: StoredBalanceState) {
    await fs.mkdir(path.dirname(BALANCE_STATE_FILE), { recursive: true });
    await fs.writeFile(BALANCE_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function isDebit(transaction: Privat24Transaction): boolean {
    return transaction.type.toUpperCase() === 'D';
}

function formatDebitMessage(transaction: Privat24Transaction, account: string): string {
    const lines = [
        '💸 <b>Списання з рахунку Приват24</b>',
        `Рахунок: ${escapePrivat24Html(maskPrivat24Account(account))}`,
        `Сума: <b>🔴 ${escapePrivat24Html(formatSignedPrivat24Amount(-Math.abs(transaction.amount), transaction.currency))}</b>`,
    ];

    if (transaction.counterpartyName) {
        lines.push(`Контрагент: ${escapePrivat24Html(transaction.counterpartyName)}`);
    }

    if (transaction.purpose) {
        lines.push(`Призначення: ${escapePrivat24Html(transaction.purpose)}`);
    }

    if (transaction.dateTime) {
        lines.push(`Дата: ${escapePrivat24Html(transaction.dateTime)}`);
    }

    return lines.join('\n');
}

export function formatDailyBalanceMessage(
    balance: Privat24Balance,
    previous: StoredBalanceState | null,
    dateLabel: string,
): string {
    const balanceDelta =
        previous && previous.currency === balance.currency
            ? balance.balanceOut - previous.balanceOut
            : null;
    const netDaily = balance.turnoverCred - balance.turnoverDebt;

    const lines = [
        `💰 <b>Баланс Приват24</b>`,
        `📅 ${escapePrivat24Html(dateLabel)}`,
        '',
        `Рахунок: ${escapePrivat24Html(maskPrivat24Account(balance.account))}`,
        balance.accountName
            ? `Назва: ${escapePrivat24Html(balance.accountName)}`
            : null,
        '',
        `<b>Залишок: ${escapePrivat24Html(formatPrivat24Amount(balance.balanceOut, balance.currency))}</b>`,
        balanceDelta == null
            ? '<i>порівняння з учора ще недоступне</i>'
            : formatBalanceChangeHtml(balanceDelta, balance.currency),
        '',
        `📉 Списання за день: <b>${escapePrivat24Html(formatPrivat24Amount(balance.turnoverDebt, balance.currency))}</b>`,
        `📈 Надходження за день: <b>${escapePrivat24Html(formatPrivat24Amount(balance.turnoverCred, balance.currency))}</b>`,
        `↔️ Чистий рух за день: ${formatFlowChangeHtml(netDaily, balance.currency)}`,
    ];

    return lines.filter((line) => line != null).join('\n');
}

async function sendDailyBalance(bot: TelegramBot) {
    const config = getPrivat24Config();
    if (!config) {
        return;
    }

    const now = getKyivTime();

    try {
        const balance = await getPrivat24InterimBalance(config);
        const previous = await loadPreviousBalanceState();
        const date = new Intl.DateTimeFormat('uk-UA', {
            timeZone: KYIV_TIME_ZONE,
            dateStyle: 'short',
        }).format(new Date());

        await broadcastMessage(
            bot,
            formatDailyBalanceMessage(balance, previous, `${date} о 10:00`),
            { parse_mode: 'HTML' },
        );

        await saveBalanceState({
            date: now.date,
            balanceOut: balance.balanceOut,
            currency: balance.currency,
        });
    } catch (error) {
        console.error('[PRIVAT24] Daily balance failed:', error);
        await broadcastMessage(bot, '❌ Приват24: не вдалося отримати баланс рахунку.');
    }
}

async function pollDebitTransactions(bot: TelegramBot, seenIds: Set<string>, bootstrapped: boolean) {
    const config = getPrivat24Config();
    if (!config) {
        return;
    }

    const transactions = await getPrivat24InterimTransactions(config);
    const debits = transactions.filter(isDebit);
    let changed = false;

    for (const transaction of debits) {
        if (seenIds.has(transaction.id)) {
            continue;
        }

        seenIds.add(transaction.id);
        changed = true;

        if (!bootstrapped) {
            continue;
        }

        await broadcastMessage(bot, formatDebitMessage(transaction, config.account), {
            parse_mode: 'HTML',
        });
    }

    if (changed) {
        await saveSeenDebitIds(seenIds);
    }
}

export function startPrivat24Scheduler(bot: TelegramBot) {
    const config = getPrivat24Config();

    if (!config) {
        console.warn('[PRIVAT24] Scheduler disabled: idP24/tokenP24/accountP24 are not configured');
        return;
    }

    let lastBalanceRunDate: string | undefined;
    let seenDebitIds = new Set<string>();
    let bootstrapped = false;

    const init = async () => {
        seenDebitIds = await loadSeenDebitIds();
        bootstrapped = seenDebitIds.size > 0;

        try {
            await pollDebitTransactions(bot, seenDebitIds, bootstrapped);
            bootstrapped = true;
            console.log(
                `[PRIVAT24] Debit watcher ready, known debits: ${seenDebitIds.size}, recipients: ${getPrivat24ReportChatIds().join(', ')}`,
            );
        } catch (error) {
            console.error('[PRIVAT24] Initial debit poll failed:', error);
        }
    };

    void init();

    setInterval(() => {
        const now = getKyivTime();

        if (now.hour === 10 && now.minute <= 4 && lastBalanceRunDate !== now.date) {
            lastBalanceRunDate = now.date;
            void sendDailyBalance(bot).catch((error) => {
                console.error('[PRIVAT24] Scheduled balance error:', error);
            });
        }
    }, SCHEDULE_CHECK_INTERVAL_MS);

    setInterval(() => {
        void pollDebitTransactions(bot, seenDebitIds, bootstrapped).catch((error) => {
            console.error('[PRIVAT24] Debit poll error:', error);
        });
    }, DEBIT_POLL_INTERVAL_MS);
}
