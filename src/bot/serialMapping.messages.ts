import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import { ResourceType } from '@prisma/client';

import { getSession } from './session';
import { BotState } from './states';
import {
    assignSerialToMeterById,
    confirmSerialOnSite,
    formatAskoeValidationStatus,
    formatSerialMappingReading,
    isValidSerialNumber,
    markMeterAbsent,
    normalizeSerialNumber,
    SerialMappingItem,
} from '../services/serialMapping.service';
import { recognizeHeatSerialNumber } from '../services/heatSerialOcr.service';

function formatResource(resourceType: ResourceType): string {
    switch (resourceType) {
        case ResourceType.COLD_WATER:
            return 'ХВ';
        case ResourceType.HOT_WATER:
            return 'ГВ';
        case ResourceType.ELECTRICITY:
            return 'ЕЕ';
        case ResourceType.HEATING:
            return 'ОП';
        default:
            return resourceType;
    }
}

function finishKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '🏢 Обрати інший підʼїзд', callback_data: 'select_section' }],
            [{ text: '🏠 Завершити', callback_data: 'finish' }],
        ],
    };
}

function meterHeader(item: SerialMappingItem): string {
    const note = item.askoeValidationNote
        ? `\n📝 ${item.askoeValidationNote}`
        : '';

    const statusLine =
        item.resourceType === ResourceType.HEATING
            ? `\n📌 Статус: ${formatAskoeValidationStatus(item.askoeValidationStatus)}${note}`
            : note
              ? `\n📝 ${item.askoeValidationNote}`
              : '';

    return `🏠 Будинок: ${item.buildingNumber}
🚪 Під'їзд: ${item.sectionNumber}
🔢 Поверх: ${item.floor ?? 'не вказано'}
🏢 Квартира: ${item.apartmentNumber}

🔢 Ресурс: ${formatResource(item.resourceType)}
📊 Показник у БД: ${formatSerialMappingReading(item.dbReading, item.resourceType)}
🔢 S/N у БД: ${item.serialNumber ?? 'не вказано'}${statusLine}`;
}

function reviewKeyboard(item: SerialMappingItem) {
    const rows: TelegramBot.InlineKeyboardButton[][] = [];

    if (item.serialNumber) {
        rows.push([{ text: '✅ S/N збігається', callback_data: 'serial_confirm_match' }]);
    }

    rows.push([{ text: '⏭ Прилад відсутній', callback_data: 'serial_skip_absent' }]);

    if (item.serialNumber) {
        rows.push([{ text: '✏️ Інший S/N', callback_data: 'serial_manual' }]);
    } else {
        rows.push([{ text: '✏️ Ввести S/N вручну', callback_data: 'serial_manual' }]);
    }

    return { inline_keyboard: rows };
}

async function sendManualSerialPrompt(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    const item = session.serialQueue[session.serialCurrentIndex];

    if (!item) return;

    session.state = BotState.INPUT_SERIAL_NUMBER;
    session.pendingSerialNumber = undefined;

    await bot.sendMessage(
        chatId,
        `${meterHeader(item)}

Надішліть S/N числом або фото таблички лічильника.`,
        { reply_markup: finishKeyboard() },
    );
}

export async function sendCurrentSerialMeter(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    const item = session.serialQueue[session.serialCurrentIndex];

    if (!item) {
        session.state = BotState.IDLE;
        await bot.sendMessage(chatId, '✅ Привʼязку серійних номерів завершено');
        return;
    }

    session.state = BotState.REVIEW_SERIAL_METER;
    session.pendingSerialNumber = undefined;

    const hint = item.serialNumber
        ? '\n\nПеревірте S/N на приладі або надішліть фото/текст, якщо він інший.'
        : '\n\nS/N у БД немає — надішліть фото або число.';

    await bot.sendMessage(chatId, `${meterHeader(item)}${hint}`, {
        reply_markup: reviewKeyboard(item),
    });
}

async function advanceSerialQueue(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    session.pendingSerialNumber = undefined;
    session.serialCurrentIndex++;
    await sendCurrentSerialMeter(bot, chatId);
}

async function saveCurrentSerial(
    bot: TelegramBot,
    chatId: number,
    serialNumber: string,
) {
    const session = getSession(chatId);
    const item = session.serialQueue[session.serialCurrentIndex];

    if (!item) return;

    const result = await assignSerialToMeterById({
        meterId: item.meterId,
        serialNumber,
    });

    if (!result.ok) {
        if (result.reason === 'SERIAL_TAKEN') {
            await bot.sendMessage(
                chatId,
                '❌ Цей S/N уже привʼязаний до іншого лічильника. Введіть інший.',
            );
        } else {
            await bot.sendMessage(chatId, '❌ Лічильник не знайдено.');
        }

        return;
    }

    const linkedText =
        result.linkedDetails > 0
            ? ` Даних АСКОЕ привʼязано: ${result.linkedDetails}.`
            : '';

    item.serialNumber = serialNumber;

    await bot.sendMessage(
        chatId,
        `✅ Збережено: ${serialNumber} → квартира ${item.apartmentNumber}.${linkedText}`,
    );

    await advanceSerialQueue(bot, chatId);
}

export async function handleSerialConfirmMatch(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    const item = session.serialQueue[session.serialCurrentIndex];

    if (!item) return;

    const result = await confirmSerialOnSite(item.meterId);

    if (!result.ok) {
        if (result.reason === 'NO_SERIAL') {
            await bot.sendMessage(chatId, '❌ S/N у БД немає. Введіть або надішліть фото.');
            await sendManualSerialPrompt(bot, chatId);
            return;
        }

        await bot.sendMessage(chatId, '❌ Лічильник не знайдено.');
        return;
    }

    if (item.resourceType === ResourceType.HEATING) {
        item.askoeValidationStatus = 'VALIDATED';
    }
    item.askoeValidationNote = `Підтверджено обходом: S/N ${item.serialNumber}`;

    await bot.sendMessage(
        chatId,
        `✅ Підтверджено: кв. ${item.apartmentNumber}, S/N ${item.serialNumber}`,
    );

    await advanceSerialQueue(bot, chatId);
}

export async function handleSerialSkipAbsent(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    const item = session.serialQueue[session.serialCurrentIndex];

    if (!item) return;

    await markMeterAbsent(item.meterId);

    await bot.sendMessage(chatId, `⏭ Пропущено: кв. ${item.apartmentNumber} (прилад відсутній)`);

    await advanceSerialQueue(bot, chatId);
}

export async function handleSerialTextInput(bot: TelegramBot, chatId: number, text: string) {
    const serialNumber = normalizeSerialNumber(text);

    if (!isValidSerialNumber(serialNumber)) {
        await bot.sendMessage(chatId, '❌ Введіть S/N тільки цифрами або надішліть фото.');
        return;
    }

    await saveCurrentSerial(bot, chatId, serialNumber);
}

export async function handleSerialPhoto(
    bot: TelegramBot,
    chatId: number,
    photo: TelegramBot.PhotoSize[],
) {
    const session = getSession(chatId);
    const largestPhoto = photo[photo.length - 1];

    if (!largestPhoto) {
        await bot.sendMessage(chatId, '❌ Не вдалося отримати фото. Спробуйте ще раз.');
        return;
    }

    await bot.sendMessage(chatId, '🔍 Розпізнаю S/N на фото...');

    try {
        const fileUrl = await bot.getFileLink(largestPhoto.file_id);
        const response = await axios.get<ArrayBuffer>(fileUrl, {
            responseType: 'arraybuffer',
            timeout: 30_000,
        });
        const result = await recognizeHeatSerialNumber(
            Buffer.from(response.data),
            typeof response.headers['content-type'] === 'string'
                ? response.headers['content-type']
                : 'image/jpeg',
        );

        session.pendingSerialNumber = result.serialNumber;
        session.state = BotState.CONFIRM_SERIAL_OCR;

        const confidence = result.confidence != null
            ? `\nВпевненість: ${Math.round(result.confidence * 100)}%`
            : '';

        await bot.sendMessage(
            chatId,
            `🔢 Розпізнаний S/N: ${result.serialNumber}${confidence}

Правильно розпізнано?`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Так, зберегти', callback_data: 'serial_ocr_confirm' }],
                        [{ text: '✏️ Ні, ввести вручну', callback_data: 'serial_manual' }],
                    ],
                },
            },
        );
    } catch (error) {
        console.error('[Serial OCR] Помилка:', error);
        await bot.sendMessage(
            chatId,
            '⚠️ Не вдалося розпізнати S/N. Введіть його вручну числом.',
        );
        session.state = BotState.INPUT_SERIAL_NUMBER;
    }
}

export async function handleSerialOcrConfirmation(
    bot: TelegramBot,
    chatId: number,
    confirm: boolean,
) {
    const session = getSession(chatId);

    if (!confirm) {
        await sendManualSerialPrompt(bot, chatId);
        return;
    }

    const serialNumber = session.pendingSerialNumber;

    if (!serialNumber) {
        await bot.sendMessage(chatId, '❌ Результат розпізнавання втрачено. Введіть S/N вручну.');
        await sendManualSerialPrompt(bot, chatId);
        return;
    }

    await saveCurrentSerial(bot, chatId, serialNumber);
}

export async function handleSerialManual(bot: TelegramBot, chatId: number) {
    await sendManualSerialPrompt(bot, chatId);
}
