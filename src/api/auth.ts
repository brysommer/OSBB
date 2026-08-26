import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { registerTelegramUser } from '../services/user.service';

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
    const apiKey = process.env.MOBILE_API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'MOBILE_API_KEY не налаштовано на сервері' });
        return;
    }

    const providedKey = String(req.header('x-api-key') || req.body?.apiKey || '');
    if (providedKey !== apiKey) {
        res.status(401).json({ error: 'Невірний API-ключ' });
        return;
    }

    const telegramIdRaw = req.body?.telegramId;
    const telegramIdNum = Number(telegramIdRaw);
    if (!Number.isFinite(telegramIdNum) || telegramIdNum <= 0) {
        res.status(400).json({ error: 'Потрібен telegramId' });
        return;
    }

    const user = await registerTelegramUser(telegramIdNum);
    if (req.body?.name && typeof req.body.name === 'string') {
        await prisma.telegramUser.update({
            where: { id: user.id },
            data: { name: req.body.name },
        });
    }

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
            name: req.body?.name || user.name,
        },
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
