import { InlineKeyboardMarkup } from 'node-telegram-bot-api';
import { ResourceType } from '@prisma/client';

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

export function resourceKeyboard(availableResourceTypes: ResourceType[]): InlineKeyboardMarkup {
    const rows: InlineKeyboardMarkup['inline_keyboard'] = [];
    const hasColdWater = availableResourceTypes.includes(ResourceType.COLD_WATER);
    const hasHotWater = availableResourceTypes.includes(ResourceType.HOT_WATER);
    const hasHeating = availableResourceTypes.includes(ResourceType.HEATING);
    const hasElectricity = availableResourceTypes.includes(ResourceType.ELECTRICITY);

    if (hasColdWater) {
        rows.push([
            {
                text: '💧 Лише ХВ',
                callback_data: 'resource_scope:COLD_WATER',
            },
        ]);
    }

    if (hasHotWater) {
        rows.push([
            {
                text: '🚿 Лише ГВ',
                callback_data: 'resource_scope:HOT_WATER',
            },
        ]);
    }

    if (hasHotWater && hasHeating) {
        rows.push([
            {
                text: '🚿🔥 ГВ + підігрів',
                callback_data: 'resource_scope:HOT_WATER_HEATING',
            },
        ]);
    }

    const allAlreadyCovered =
        (availableResourceTypes.length === 1 && (hasColdWater || hasHotWater)) ||
        (availableResourceTypes.length === 2 && hasHotWater && hasHeating);

    if (!allAlreadyCovered || hasElectricity || (hasColdWater && availableResourceTypes.length > 1)) {
        rows.push([
            {
                text: '🔄 Усі наявні ресурси',
                callback_data: 'resource_scope:ALL',
            },
        ]);
    }

    return {
        inline_keyboard: rows,
    };
}
