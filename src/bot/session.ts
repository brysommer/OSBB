import { ResourceType } from '@prisma/client';
import { BotState } from './states';

export interface QueueItem {
    meterId: string;

    premisesId: string;

    buildingNumber: string;

    sectionNumber: string;

    apartmentNumber: string;

    meterName: string;

    resourceType: ResourceType;

    previous: number;
}

export interface UserSession {
    state: BotState;

    resourceType?: ResourceType | 'BOTH';

    buildingNumber?: string;

    sectionNumber?: string;

    queue: QueueItem[];

    currentIndex: number;

    pendingValue?: number;
}

export const sessions = new Map<number, UserSession>();

export function getSession(chatId: number): UserSession {
    if (!sessions.has(chatId)) {
        sessions.set(chatId, {
            state: BotState.IDLE,
            queue: [],
            currentIndex: 0,
        });
    }

    return sessions.get(chatId)!;
}

export function clearSession(chatId: number) {
    sessions.delete(chatId);
}

export interface UserSession {
    state: BotState;

    resourceType?: ResourceType | 'BOTH';

    buildingNumber?: string;
    sectionNumber?: string;

    queue: QueueItem[];

    currentIndex: number;

    pendingValue?: number;
}
