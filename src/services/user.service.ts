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
