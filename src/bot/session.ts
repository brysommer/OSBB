import { ResourceType } from '@prisma/client';
import { BotState } from './states';

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

export interface SerialMappingQueueItem {
    meterId: string;
    meterName: string;
    serialNumber: string | null;
    resourceType: ResourceType;
    buildingNumber: string;
    sectionNumber: string;
    currentApartmentNumber: string;
}

export interface UserSession {
    state: BotState;
    mode?: 'COLLECTION' | 'SERIAL_MAPPING';

    residentialComplexId?: string;

    resourceTypes?: ResourceType[];

    buildingNumber?: string;

    sectionNumber?: string;

    queue: QueueItem[];

    currentIndex: number;

    pendingValue?: number;

    serialResourceType?: ResourceType;
    serialQueue: SerialMappingQueueItem[];
    serialCurrentIndex: number;
}

export const sessions = new Map<number, UserSession>();

export function getSession(chatId: number): UserSession {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, {
            state: BotState.IDLE,
            queue: [],
            currentIndex: 0,
            serialQueue: [],
            serialCurrentIndex: 0,
        });
    }

    return sessions.get(chatId)!;
}

export function clearSession(chatId: number) {
    sessions.delete(chatId);
}
