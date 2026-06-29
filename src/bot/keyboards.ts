import { InlineKeyboardMarkup } from 'node-telegram-bot-api';

export function mainKeyboard(): InlineKeyboardMarkup {
    return {
        inline_keyboard: [
            [
                {
                    text: '▶️ Розпочати обхід',
                    callback_data: 'start_collection',
                },
            ],
        ],
    };
}
import { ResourceType } from '@prisma/client';

export function resourceKeyboard(): InlineKeyboardMarkup {
    return {
        inline_keyboard: [
            [
                {
                    text: '🚿 Гаряча вода',
                    callback_data: ResourceType.HOT_WATER,
                },
            ],
            [
                {
                    text: '🔥 Теплопостачання',
                    callback_data: ResourceType.HEATING,
                },
            ],
            [
                {
                    text: '🚿🔥 ГВ + Тепло',
                    callback_data: 'BOTH',
                },
            ],
        ],
    };
}
