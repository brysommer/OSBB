import TelegramBot from 'node-telegram-bot-api';
import { getSession } from './session';
import { BotState } from './states';
import { assignSerialMeterToApartment } from '../services/serialMapping.service';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function sendHtmlMessage(
    bot: TelegramBot,
    chatId: number,
    text: string,
    extra: TelegramBot.SendMessageOptions = {},
) {
    try {
        await bot.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            ...extra,
        });
    } catch {
        await bot.sendMessage(chatId, text.replace(/<\/?b>/g, ''), extra);
    }
}

export async function sendCurrentSerialMappingMeter(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    const item = session.serialQueue[session.serialCurrentIndex];

    if (!item) {
        session.state = BotState.IDLE;
        await bot.sendMessage(chatId, '✅ Привʼязку серійних номерів завершено', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏢 Обрати інший підʼїзд', callback_data: 'select_section' }],
                    [{ text: '🏠 Завершити', callback_data: 'finish' }],
                ],
            },
        });
        return;
    }

    session.state = BotState.INPUT_SERIAL_APARTMENT;

    await sendHtmlMessage(
        bot,
        chatId,
        `🔢 Серійний номер: <b>${escapeHtml(item.serialNumber ?? item.meterName)}</b>
🏠 Будинок: ${escapeHtml(item.buildingNumber)}
🚪 Під'їзд: ${escapeHtml(item.sectionNumber)}
📍 Поточна квартира: <b>${escapeHtml(item.currentApartmentNumber || 'не вказано')}</b>

Відповідає квартирі:`,
        {
            reply_markup: {
                inline_keyboard: [[{ text: '⏭️ Пропустити', callback_data: 'serial_skip' }]],
            },
        },
    );
}

export async function handleSerialApartmentInput(bot: TelegramBot, chatId: number, text: string) {
    const session = getSession(chatId);
    const item = session.serialQueue[session.serialCurrentIndex];

    if (!item || !session.residentialComplexId || !session.buildingNumber || !session.sectionNumber) {
        return;
    }

    const apartmentNumber = text.trim();
    if (!/^\d+$/.test(apartmentNumber)) {
        await bot.sendMessage(chatId, '❌ Введіть номер квартири числом');
        return;
    }

    const result = await assignSerialMeterToApartment(
        item.meterId,
        session.residentialComplexId,
        session.buildingNumber,
        session.sectionNumber,
        apartmentNumber,
    );

    if (!result.ok) {
        if (result.reason === 'NO_PREMISES') {
            await bot.sendMessage(chatId, '❌ У цьому підʼїзді немає такої квартири. Введіть ще раз.');
            return;
        }
        if (result.reason === 'RESOURCE_ALREADY_EXISTS') {
            await bot.sendMessage(
                chatId,
                '❌ Для цієї квартири вже є лічильник цього ресурсу. Введіть іншу квартиру.',
            );
            return;
        }
        await bot.sendMessage(chatId, '❌ Не вдалося зберегти відповідність. Спробуйте ще раз.');
        return;
    }

    await bot.sendMessage(
        chatId,
        `✅ Збережено: серійний ${item.serialNumber ?? item.meterName} → квартира ${apartmentNumber}`,
    );

    session.serialCurrentIndex += 1;
    await sendCurrentSerialMappingMeter(bot, chatId);
}

export async function handleSerialSkip(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    session.serialCurrentIndex += 1;
    await sendCurrentSerialMappingMeter(bot, chatId);
}
