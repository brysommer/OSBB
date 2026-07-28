import { prisma } from '../lib/prisma';

export async function getAvailableResidentialComplexes(telegramId: number | bigint) {
    const user = await prisma.telegramUser.findUnique({
        where: {
            telegramId: BigInt(telegramId),
        },
        include: {
            accesses: {
                include: {
                    residentialComplex: true,
                },
            },
        },
    });

    if (!user) {
        return [];
    }

    return user.accesses.map((a) => a.residentialComplex);
}
