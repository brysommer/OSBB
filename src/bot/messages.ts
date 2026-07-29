import TelegramBot from 'node-telegram-bot-api';
import { getSession } from './session';
import { BotState } from './states';
import { getCurrentPeriod, saveReading, validateReading } from '../services/reading.service';
import { ReadingSource, ResourceType } from '@prisma/client';

function formatResource(resourceType: string): string {
    switch (resourceType) {
        case ResourceType.COLD_WATER:
            return '💧 Холодна вода';
        case ResourceType.HOT_WATER:
            return '🚿 Гаряча вода';
        case ResourceType.ELECTRICITY:
            return '⚡ Електрика';
        case ResourceType.HEATING:
            return '🔥 Підігрів';
        default:
            return `📟 ${resourceType}`;
    }
}

function bold(value: string | number | null | undefined): string {
    if (value == null || value === '') {
        return '*не вказано*';
    }

    return `*${String(value).replace(/\*/g, '')}*`;
}

function meterHeader(item: {
    buildingNumber: string;
    sectionNumber: string;
    floor: number | null;
    apartmentNumber: string;
    resourceType: string;
}) {
    return `🏠 Будинок: ${item.buildingNumber}
🚪 Під'їзд: ${item.sectionNumber}
🔢 Поверх: ${bold(item.floor)}
🏢 Квартира: ${bold(item.apartmentNumber)}

${formatResource(item.resourceType)}`;
}

const markdownOptions = {
    parse_mode: 'Markdown' as const,
};

export async function sendCurrentMeter(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);

    const item = session.queue[session.currentIndex];

    if (!item) {
        await bot.sendMessage(chatId, '✅ Обхід завершено');
        session.state = BotState.IDLE;
        return;
    }

    if (item.selfSubmitted != null) {
        session.state = BotState.REVIEW_SELF_READING;

        await bot.sendMessage(
            chatId,
            `${meterHeader(item)}

📊 Попередній показник: ${bold(item.previous)}
👤 Користувач подав самостійно: ${bold(item.selfSubmitted)}

Прийняти чи скоригувати?`,
            {
                ...markdownOptions,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Прийняти', callback_data: 'self_accept' }],
                        [{ text: '✏️ Коригувати', callback_data: 'self_correct' }],
                    ],
                },
            },
        );

        return;
    }

    session.state = BotState.INPUT_READING;

    await bot.sendMessage(
        chatId,
        `${meterHeader(item)}

📊 Попередній показник: ${bold(item.previous)}

✏️ Введіть новий показник:`,
        markdownOptions,
    );
}

export async function handleSelfAccept(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    const item = session.queue[session.currentIndex];

    if (!item || item.selfSubmitted == null) return;

    await saveReading({
        meterId: item.meterId,
        period: getCurrentPeriod(),
        previous: item.previous,
        current: item.selfSubmitted,
        source: ReadingSource.COLLECTED,
    });

    item.selfSubmitted = undefined;

    await moveNext(bot, chatId);
}

export async function handleSelfCorrect(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    const item = session.queue[session.currentIndex];

    if (!item) return;

    const selfSubmitted = item.selfSubmitted;
    item.selfSubmitted = undefined;
    session.state = BotState.INPUT_READING;

    await bot.sendMessage(
        chatId,
        `${meterHeader(item)}

📊 Попередній показник: ${bold(item.previous)}
👤 Було подано самостійно: ${bold(selfSubmitted)}

✏️ Введіть уточнений показник:`,
        markdownOptions,
    );
}

export async function handleReadingInput(bot: TelegramBot, chatId: number, text: string) {
    const session = getSession(chatId);

    const item = session.queue[session.currentIndex];

    const current = Number(text);

    if (Number.isNaN(current)) {
        await bot.sendMessage(chatId, '❌ Введіть число');
        return;
    }

    const validation = validateReading(item.previous, current);

    session.pendingValue = current;

    if (validation.status === 'WARNING') {
        session.state = BotState.CONFIRM_READING;

        await bot.sendMessage(
            chatId,
            `⚠️ Підозрілий показник

🏠 Квартира: ${bold(item.apartmentNumber)}
Було: ${bold(item.previous)}
Ви ввели: ${bold(current)}
Різниця: ${bold(validation.diff)}

Все правильно?`,
            {
                ...markdownOptions,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '✅ Так',
                                callback_data: 'confirm_yes',
                            },
                        ],
                        [
                            {
                                text: '✏️ Ввести ще раз',
                                callback_data: 'confirm_no',
                            },
                        ],
                    ],
                },
            },
        );

        return;
    }

    await saveReading({
        meterId: item.meterId,
        period: getCurrentPeriod(),
        previous: item.previous,
        current,
        source: ReadingSource.COLLECTED,
    });

    item.selfSubmitted = undefined;

    await moveNext(bot, chatId);
}

export async function handleConfirm(bot: TelegramBot, chatId: number, confirm: boolean) {
    const session = getSession(chatId);

    const item = session.queue[session.currentIndex];

    if (!session.pendingValue) return;

    if (confirm) {
        await saveReading({
            meterId: item.meterId,
            period: getCurrentPeriod(),
            previous: item.previous,
            current: session.pendingValue,
            source: ReadingSource.COLLECTED,
        });

        session.pendingValue = undefined;
        item.selfSubmitted = undefined;

        await moveNext(bot, chatId);
    } else {
        session.pendingValue = undefined;

        await sendCurrentMeter(bot, chatId);
    }
}

export async function moveNext(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);

    session.currentIndex++;

    if (session.currentIndex >= session.queue.length) {
        session.state = BotState.IDLE;

        await bot.sendMessage(chatId, '✅ Підїзд завершено', {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🏢 Обрати інший підїзд',
                            callback_data: 'select_section',
                        },
                    ],
                    [
                        {
                            text: '🏠 Завершити',
                            callback_data: 'finish',
                        },
                    ],
                ],
            },
        });

        return;
    }

    await sendCurrentMeter(bot, chatId);
}
