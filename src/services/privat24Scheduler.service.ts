import fs from 'fs/promises';
import path from 'path';

import TelegramBot from 'node-telegram-bot-api';

import {
    formatPrivat24Amount,
    getPrivat24Config,
    getPrivat24InterimBalance,
    getPrivat24InterimTransactions,
    maskPrivat24Account,
    Privat24Transaction,
} from './privat24.service';

const KYIV_TIME_ZONE = 'Europe/Kyiv';
const SCHEDULE_CHECK_INTERVAL_MS = 30_000;
const DEBIT_POLL_INTERVAL_MS = 2 * 60 * 60_000;
const SEEN_FILE = path.join(process.cwd(), 'data', 'privat24', 'notified-debits.json');

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

function getReportChatId(): number {
    const value = process.env.ASKOE_REPORT_CHAT_ID;
    const chatId = Number(value);

    if (!value || !Number.isSafeInteger(chatId)) {
        throw new Error('ASKOE_REPORT_CHAT_ID is not configured');
    }

    return chatId;
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

function isDebit(transaction: Privat24Transaction): boolean {
    return transaction.type.toUpperCase() === 'D';
}

function formatDebitMessage(transaction: Privat24Transaction, account: string): string {
    const lines = [
        '💸 Списання з рахунку Приват24',
        `Рахунок: ${maskPrivat24Account(account)}`,
        `Сума: ${formatPrivat24Amount(transaction.amount, transaction.currency)}`,
    ];

    if (transaction.counterpartyName) {
        lines.push(`Контрагент: ${transaction.counterpartyName}`);
    }

    if (transaction.purpose) {
        lines.push(`Призначення: ${transaction.purpose}`);
    }

    if (transaction.dateTime) {
        lines.push(`Дата: ${transaction.dateTime}`);
    }

    return lines.join('\n');
}

async function sendDailyBalance(bot: TelegramBot) {
    const config = getPrivat24Config();
    if (!config) {
        return;
    }

    const chatId = getReportChatId();

    try {
        const balance = await getPrivat24InterimBalance(config);
        const date = new Intl.DateTimeFormat('uk-UA', {
            timeZone: KYIV_TIME_ZONE,
            dateStyle: 'short',
        }).format(new Date());

        await bot.sendMessage(
            chatId,
            [
                `💰 Баланс Приват24 на ${date} о 10:00`,
                `Рахунок: ${maskPrivat24Account(balance.account)}`,
                balance.accountName ? `Назва: ${balance.accountName}` : null,
                `Залишок: ${formatPrivat24Amount(balance.balanceOut, balance.currency)}`,
                `Списання за день: ${formatPrivat24Amount(balance.turnoverDebt, balance.currency)}`,
                `Надходження за день: ${formatPrivat24Amount(balance.turnoverCred, balance.currency)}`,
            ]
                .filter(Boolean)
                .join('\n'),
        );
    } catch (error) {
        console.error('[PRIVAT24] Daily balance failed:', error);
        await bot.sendMessage(chatId, '❌ Приват24: не вдалося отримати баланс рахунку.');
    }
}

async function pollDebitTransactions(bot: TelegramBot, seenIds: Set<string>, bootstrapped: boolean) {
    const config = getPrivat24Config();
    if (!config) {
        return;
    }

    const chatId = getReportChatId();
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

        await bot.sendMessage(chatId, formatDebitMessage(transaction, config.account));
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
            console.log(`[PRIVAT24] Debit watcher ready, known debits: ${seenDebitIds.size}`);
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
