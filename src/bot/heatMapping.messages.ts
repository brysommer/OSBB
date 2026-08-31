import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';

import { getSession } from './session';
import { BotState } from './states';
import {
    assignHeatSerialToMeter,
    HeatMappingItem,
    isValidHeatSerialNumber,
    normalizeHeatSerialNumber,
} from '../services/heatMeterMapping.service';
import { recognizeHeatSerialNumber } from '../services/heatSerialOcr.service';

function finishKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '🏢 Обрати інший підʼїзд', callback_data: 'select_section' }],
            [{ text: '🏠 Завершити', callback_data: 'finish' }],
        ],
    };
}

function heatMeterHeader(item: HeatMappingItem): string {
    return `🏠 Будинок: ${item.buildingNumber}
🚪 Під'їзд: ${item.sectionNumber}
🔢 Поверх: ${item.floor ?? 'не вказано'}
🏢 Квартира: ${item.apartmentNumber}

🔥 Тепловий лічильник`;
}

async function sendManualSerialPrompt(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    const item = session.heatQueue[session.heatCurrentIndex];

    if (!item) return;

    session.state = BotState.INPUT_HEAT_SERIAL;
    session.pendingHeatSerialNumber = undefined;

    await bot.sendMessage(
        chatId,
        `${heatMeterHeader(item)}

Надішліть S/N числом або фото таблички лічильника.`,
        { reply_markup: finishKeyboard() },
    );
}

export async function sendCurrentHeatMeter(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    const item = session.heatQueue[session.heatCurrentIndex];

    if (!item) {
        session.state = BotState.IDLE;
        session.mode = undefined;
        await bot.sendMessage(chatId, '✅ Відповідність теплових лічильників завершено');
        return;
    }

    await sendManualSerialPrompt(bot, chatId);
}

async function saveCurrentHeatSerial(
    bot: TelegramBot,
    chatId: number,
    serialNumber: string,
) {
    const session = getSession(chatId);
    const item = session.heatQueue[session.heatCurrentIndex];

    if (!item) return;

    const result = await assignHeatSerialToMeter({
        meterId: item.meterId,
        serialNumber,
    });

    if (!result.ok) {
        if (result.reason === 'SERIAL_TAKEN') {
            await bot.sendMessage(
                chatId,
                '❌ Цей S/N уже привʼязаний до іншого віртуального лічильника. Введіть інший.',
            );
        } else {
            await bot.sendMessage(chatId, '❌ Віртуальний тепловий лічильник не знайдено.');
        }

        return;
    }

    const linkedText =
        result.linkedDetails > 0
            ? ` Даних АСКОЕ привʼязано: ${result.linkedDetails}.`
            : '';

    await bot.sendMessage(
        chatId,
        `✅ Збережено: ${serialNumber} → квартира ${item.apartmentNumber}.${linkedText}`,
    );

    session.pendingHeatSerialNumber = undefined;
    session.heatCurrentIndex++;
    await sendCurrentHeatMeter(bot, chatId);
}

export async function handleHeatSerialText(
    bot: TelegramBot,
    chatId: number,
    text: string,
) {
    const serialNumber = normalizeHeatSerialNumber(text);

    if (!isValidHeatSerialNumber(serialNumber)) {
        await bot.sendMessage(chatId, '❌ Введіть S/N тільки цифрами або надішліть фото.');
        return;
    }

    await saveCurrentHeatSerial(bot, chatId, serialNumber);
}

export async function handleHeatPhoto(
    bot: TelegramBot,
    chatId: number,
    photo: TelegramBot.PhotoSize[],
) {
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
        const session = getSession(chatId);

        session.pendingHeatSerialNumber = result.serialNumber;
        session.state = BotState.CONFIRM_HEAT_SERIAL;

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
                        [{ text: '✅ Так, зберегти', callback_data: 'heat_serial_confirm' }],
                        [{ text: '✏️ Ні, ввести вручну', callback_data: 'heat_serial_manual' }],
                    ],
                },
            },
        );
    } catch (error) {
        console.error('[Heat OCR] Помилка:', error);
        await bot.sendMessage(
            chatId,
            '⚠️ Не вдалося розпізнати S/N. Введіть його вручну числом.',
        );
        getSession(chatId).state = BotState.INPUT_HEAT_SERIAL;
    }
}

export async function handleHeatSerialConfirmation(
    bot: TelegramBot,
    chatId: number,
    confirm: boolean,
) {
    const session = getSession(chatId);

    if (!confirm) {
        await sendManualSerialPrompt(bot, chatId);
        return;
    }

    const serialNumber = session.pendingHeatSerialNumber;

    if (!serialNumber) {
        await bot.sendMessage(chatId, '❌ Результат розпізнавання втрачено. Введіть S/N вручну.');
        await sendManualSerialPrompt(bot, chatId);
        return;
    }

    await saveCurrentHeatSerial(bot, chatId, serialNumber);
}
