import TelegramBot from 'node-telegram-bot-api';

import { importLatestAskoeSnapshot } from './askoeImport.service';

const KYIV_TIME_ZONE = 'Europe/Kyiv';
const CHECK_INTERVAL_MS = 30_000;

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

async function sendDailyAskoeReport(bot: TelegramBot) {
    const chatId = getReportChatId();

    try {
        const result = await importLatestAskoeSnapshot();
        const date = new Intl.DateTimeFormat('uk-UA', {
            timeZone: KYIV_TIME_ZONE,
            dateStyle: 'short',
        }).format(new Date());

        await bot.sendMessage(
            chatId,
            `АСКОЕ на ${date} о 10:00:
Доступні лічильники: ${result.active} із ${result.total}
Без відповіді: ${result.noAnswer}
Привʼязані до ДАХ: ${result.matched}
Прив'язка підтверджена: ${result.validated ?? 0}
Не пройшли валідацію: ${result.validationFailed ?? 0}`,
        );
    } catch (error) {
        console.error('[ASKOE] Daily sync failed:', error);
        await bot.sendMessage(
            chatId,
            '❌ АСКОЕ: не вдалося завантажити або обробити свіжий файл.',
        );
    }
}

export function startAskoeScheduler(bot: TelegramBot) {
    let lastRunDate: string | undefined;

    const checkSchedule = async () => {
        const now = getKyivTime();

        if (now.hour !== 10 || now.minute > 4 || lastRunDate === now.date) {
            return;
        }

        lastRunDate = now.date;
        await sendDailyAskoeReport(bot);
    };

    void checkSchedule();
    setInterval(() => {
        void checkSchedule().catch((error) => {
            console.error('[ASKOE] Scheduler error:', error);
        });
    }, CHECK_INTERVAL_MS);
}
