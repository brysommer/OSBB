import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { getAvailableResidentialComplexes } from '../services/userAccess.service';

export type AuthedRequest = Request & {
    telegramId: bigint;
    userId: string;
};

type Session = {
    telegramId: bigint;
    userId: string;
    expiresAt: number;
};

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 днів

function randomToken(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random()
        .toString(36)
        .slice(2)}`;
}

export async function loginMobile(req: Request, res: Response) {
    const telegramIdRaw = req.body?.telegramId;
    const telegramIdNum = Number(telegramIdRaw);
    if (!Number.isFinite(telegramIdNum) || telegramIdNum <= 0) {
        res.status(400).json({ error: 'Введіть Telegram ID числом' });
        return;
    }

    const user = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(telegramIdNum) },
        select: {
            id: true,
            name: true,
            telegramId: true,
            accesses: { select: { id: true } },
        },
    });

    if (!user) {
        res.status(403).json({
            error: 'Користувача з таким Telegram ID немає. Спочатку додайте його в боті.',
        });
        return;
    }

    if (!user.accesses.length) {
        res.status(403).json({
            error: 'Немає доступу до жодного ЖК. Зверніться до адміністратора.',
        });
        return;
    }

    const complexes = await getAvailableResidentialComplexes(telegramIdNum);

    const token = randomToken();
    sessions.set(token, {
        telegramId: BigInt(telegramIdNum),
        userId: user.id,
        expiresAt: Date.now() + SESSION_TTL_MS,
    });

    res.json({
        token,
        user: {
            id: user.id,
            telegramId: telegramIdNum,
            name: user.name,
        },
        complexes: complexes.map((c) => ({
            id: c.id,
            name: c.name,
            shortName: c.shortName,
        })),
    });
}

export function requireMobileAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!token) {
        res.status(401).json({ error: 'Немає токена' });
        return;
    }

    const session = sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
        if (session) sessions.delete(token);
        res.status(401).json({ error: 'Сесію закінчено, увійдіть знову' });
        return;
    }

    (req as AuthedRequest).telegramId = session.telegramId;
    (req as AuthedRequest).userId = session.userId;
    next();
}
