import { ResourceType } from '@prisma/client';
import { BotState } from './states';
import { HeatMappingItem } from '../services/heatMeterMapping.service';

export interface QueueItem {
    meterId: string;

    premisesId: string;

    buildingNumber: string;

    sectionNumber: string;

    floor: number | null;

    apartmentNumber: string;

    meterName: string;

    resourceType: ResourceType;

    previous: number;

    selfSubmitted?: number;
}

export interface UserSession {
    state: BotState;
    mode?: 'COLLECTION' | 'SERIAL_MAPPING' | 'HEAT_MAPPING';

    residentialComplexId?: string;

    resourceTypes?: ResourceType[];

    buildingNumber?: string;

    sectionNumber?: string;

    queue: QueueItem[];

    currentIndex: number;

    pendingValue?: number;

    serialResourceType?: ResourceType;
    pendingSerialNumber?: string;
    heatQueue: HeatMappingItem[];
    heatCurrentIndex: number;
    pendingHeatSerialNumber?: string;
}

export const sessions = new Map<number, UserSession>();

export function getSession(chatId: number): UserSession {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, {
            state: BotState.IDLE,
            queue: [],
            currentIndex: 0,
            heatQueue: [],
            heatCurrentIndex: 0,
        });
    }

    return sessions.get(chatId)!;
}

export function clearSession(chatId: number) {
    sessions.delete(chatId);
}
