import TelegramBot from 'node-telegram-bot-api';
import { getSession } from './session';
import { BotState } from './states';
import { saveReading, validateReading } from '../services/reading.service';
import { ReadingSource } from '@prisma/client';

export async function sendCurrentMeter(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);

    const item = session.queue[session.currentIndex];

    if (!item) {
        await bot.sendMessage(chatId, '✅ Обхід завершено');
        session.state = BotState.IDLE;
        return;
    }

    session.state = BotState.INPUT_READING;

    await bot.sendMessage(
        chatId,
        `🏠 Будинок: ${item.buildingNumber}
🚪 Під'їзд: ${item.sectionNumber}
🏢 Квартира: ${item.apartmentNumber}

🔥 ${item.resourceType}

📊 Попередній показник: ${item.previous}

✏️ Введіть новий показник:`,
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

    // 🔥 WARNING
    if (validation.status === 'WARNING') {
        session.state = BotState.CONFIRM_READING;

        await bot.sendMessage(
            chatId,
            `⚠️ Підозрілий показник

🏠 ${item.apartmentNumber}
Було: ${item.previous}
Ви ввели: ${current}
Різниця: ${validation.diff}

Все правильно?`,
            {
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

    // ✅ OK одразу зберігаємо
    await saveReading({
        meterId: item.meterId,
        period: getCurrentPeriod(),
        previous: item.previous,
        current,
        source: ReadingSource.COLLECTED,
    });

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
function getCurrentPeriod(): string {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 2).padStart(2, '0');

    return `${year}-${month}-01`;
}
