import TelegramBot from 'node-telegram-bot-api';
import { ResourceType } from '@prisma/client';
import { getSession } from './session';
import { BotState } from './states';
import { assignSerialToApartmentMeter } from '../services/serialMapping.service';

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

export async function askSerialNumber(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);

    if (
        !session.buildingNumber ||
        !session.sectionNumber ||
        !session.serialResourceType
    ) {
        return;
    }

    session.state = BotState.INPUT_SERIAL_NUMBER;
    session.pendingSerialNumber = undefined;

    await bot.sendMessage(
        chatId,
        `🏠 Будинок: ${session.buildingNumber}
🚪 Під'їзд: ${session.sectionNumber}
🔢 Ресурс: ${formatResource(session.serialResourceType)}

Серійний номер:`,
        {
            reply_markup: finishKeyboard(),
        },
    );
}

export async function handleSerialNumberInput(bot: TelegramBot, chatId: number, text: string) {
    const session = getSession(chatId);
    const serialNumber = text.trim();

    if (!serialNumber) {
        await bot.sendMessage(chatId, '❌ Введіть серійний номер');
        return;
    }

    session.pendingSerialNumber = serialNumber;
    session.state = BotState.INPUT_SERIAL_APARTMENT;

    await bot.sendMessage(
        chatId,
        `🔢 Серійний номер: ${serialNumber}

Відповідає квартирі:`,
    );
}

export async function handleSerialApartmentInput(bot: TelegramBot, chatId: number, text: string) {
    const session = getSession(chatId);

    if (
        !session.residentialComplexId ||
        !session.buildingNumber ||
        !session.sectionNumber ||
        !session.serialResourceType ||
        !session.pendingSerialNumber
    ) {
        await bot.sendMessage(chatId, '❌ Сесію втрачено. Почніть привʼязку знову.');
        session.state = BotState.IDLE;
        return;
    }

    const apartmentNumber = text.trim();
    if (!/^\d+$/.test(apartmentNumber)) {
        await bot.sendMessage(chatId, '❌ Введіть номер квартири числом');
        return;
    }

    const result = await assignSerialToApartmentMeter({
        residentialComplexId: session.residentialComplexId,
        buildingNumber: session.buildingNumber,
        sectionNumber: session.sectionNumber,
        resourceType: session.serialResourceType,
        apartmentNumber,
        serialNumber: session.pendingSerialNumber,
    });

    if (!result.ok) {
        if (result.reason === 'NO_PREMISES') {
            await bot.sendMessage(
                chatId,
                '❌ У цьому підʼїзді немає такої квартири. Введіть ще раз.',
            );
            return;
        }
        if (result.reason === 'NO_METER') {
            await bot.sendMessage(
                chatId,
                '❌ У цій квартирі немає лічильника обраного ресурсу. Введіть іншу квартиру.',
            );
            return;
        }
        if (result.reason === 'SERIAL_TAKEN') {
            await bot.sendMessage(
                chatId,
                '❌ Цей серійний номер уже привʼязаний до іншого лічильника. Введіть серійний ще раз.',
            );
            await askSerialNumber(bot, chatId);
            return;
        }
        await bot.sendMessage(chatId, '❌ Не вдалося зберегти. Спробуйте ще раз.');
        return;
    }

    await bot.sendMessage(
        chatId,
        `✅ Збережено: ${session.pendingSerialNumber} → квартира ${apartmentNumber}`,
    );

    await askSerialNumber(bot, chatId);
}
