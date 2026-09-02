import { prisma } from '../lib/prisma';

export async function registerTelegramUser(chatId: number) {
    return prisma.telegramUser.upsert({
        where: {
            telegramId: BigInt(chatId),
        },
        create: {
            telegramId: BigInt(chatId),
        },
        update: {},
    });
}

export async function ensureTelegramUser(chatId: number, name: string) {
    return prisma.telegramUser.upsert({
        where: {
            telegramId: BigInt(chatId),
        },
        create: {
            telegramId: BigInt(chatId),
            name,
        },
        update: {
            name,
        },
    });
}
