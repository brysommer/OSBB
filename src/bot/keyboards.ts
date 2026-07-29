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

export type CollectionMode = {
    id: string;
    label: string;
    resources: ResourceType[];
};

const RESOURCE_ORDER: ResourceType[] = [
    ResourceType.COLD_WATER,
    ResourceType.HOT_WATER,
    ResourceType.ELECTRICITY,
    ResourceType.HEATING,
];

function resourceShortLabel(resourceType: ResourceType): string {
    switch (resourceType) {
        case ResourceType.COLD_WATER:
            return 'ХВ';
        case ResourceType.HOT_WATER:
            return 'ГВ';
        case ResourceType.ELECTRICITY:
            return 'ЕЕ';
        case ResourceType.HEATING:
            return 'опалення';
        default:
            return resourceType;
    }
}

function sortResources(resources: ResourceType[]): ResourceType[] {
    return [...resources].sort(
        (a, b) => RESOURCE_ORDER.indexOf(a) - RESOURCE_ORDER.indexOf(b),
    );
}

function subsets<T>(items: T[]): T[][] {
    const result: T[][] = [[]];

    for (const item of items) {
        const current = result.map((subset) => [...subset, item]);
        result.push(...current);
    }

    return result;
}

function toMode(resources: ResourceType[]): CollectionMode {
    const sorted = sortResources(resources);

    return {
        id: sorted.join('+'),
        label: sorted.map(resourceShortLabel).join(' + '),
        resources: sorted,
    };
}

export function buildCollectionModes(availableResourceTypes: ResourceType[]): CollectionMode[] {
    const available = new Set(availableResourceTypes);
    const hasHotWater = available.has(ResourceType.HOT_WATER);
    const hasHeating = available.has(ResourceType.HEATING);

    const extras: ResourceType[] = [];
    if (available.has(ResourceType.COLD_WATER)) extras.push(ResourceType.COLD_WATER);
    if (available.has(ResourceType.ELECTRICITY)) extras.push(ResourceType.ELECTRICITY);

    const modes: CollectionMode[] = [];
    const seen = new Set<string>();

    const pushMode = (resources: ResourceType[]) => {
        if (!resources.length) return;
        const mode = toMode(resources);
        if (seen.has(mode.id)) return;
        seen.add(mode.id);
        modes.push(mode);
    };

    if (hasHotWater) {
        for (const extraSubset of subsets(extras)) {
            pushMode([ResourceType.HOT_WATER, ...extraSubset]);

            if (hasHeating) {
                pushMode([ResourceType.HOT_WATER, ...extraSubset, ResourceType.HEATING]);
            }
        }
    } else {
        for (const extraSubset of subsets(extras)) {
            pushMode(extraSubset);
        }
    }

    return modes;
}

export function resolveCollectionMode(modeId: string): CollectionMode | undefined {
    if (!modeId) return undefined;

    const parts = modeId.split('+');
    const valid = new Set<string>(Object.values(ResourceType));

    if (!parts.every((part) => valid.has(part))) {
        return undefined;
    }

    return toMode(parts as ResourceType[]);
}

export function resourceKeyboard(availableResourceTypes: ResourceType[]): InlineKeyboardMarkup {
    return {
        inline_keyboard: buildCollectionModes(availableResourceTypes).map((mode) => [
            {
                text: mode.label,
                callback_data: `resource_scope:${mode.id}`,
            },
        ]),
    };
}
