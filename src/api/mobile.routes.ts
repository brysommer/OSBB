import { Router, Request, Response } from 'express';
import { AuthedRequest, requireMobileAuth } from './auth';
import {
    listBuildingsAndSections,
    listComplexesForTelegram,
    pullSectionSnapshot,
    pushReadings,
} from '../services/mobileSync.service';
import { getCurrentPeriod } from '../services/reading.service';

export const mobileRouter = Router();

mobileRouter.use(requireMobileAuth);

function auth(req: Request): AuthedRequest {
    return req as unknown as AuthedRequest;
}

mobileRouter.get('/me', async (req: Request, res: Response) => {
    const a = auth(req);
    res.json({
        telegramId: a.telegramId.toString(),
        userId: a.userId,
        period: getCurrentPeriod(),
    });
});

mobileRouter.get('/complexes', async (req: Request, res: Response) => {
    try {
        const a = auth(req);
        const complexes = await listComplexesForTelegram(a.telegramId);
        res.json({ complexes, period: getCurrentPeriod() });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'error' });
    }
});

mobileRouter.get('/complexes/:complexId/structure', async (req: Request, res: Response) => {
    try {
        const a = auth(req);
        const buildings = await listBuildingsAndSections(a.telegramId, String(req.params.complexId));
        res.json({ buildings, period: getCurrentPeriod() });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'error';
        res.status(message === 'FORBIDDEN_COMPLEX' ? 403 : 500).json({ error: message });
    }
});

mobileRouter.get('/pull', async (req: Request, res: Response) => {
    try {
        const a = auth(req);
        const residentialComplexId = String(req.query.complexId || '');
        const buildingNumber = String(req.query.building || '');
        const sectionNumber = String(req.query.section || '');

        if (!residentialComplexId || !buildingNumber || !sectionNumber) {
            res.status(400).json({
                error: 'Потрібні query: complexId, building, section',
            });
            return;
        }

        const snapshot = await pullSectionSnapshot({
            telegramId: a.telegramId,
            residentialComplexId,
            buildingNumber,
            sectionNumber,
        });

        res.json(snapshot);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'error';
        res.status(message === 'FORBIDDEN_COMPLEX' ? 403 : 500).json({ error: message });
    }
});

mobileRouter.post('/push', async (req: Request, res: Response) => {
    try {
        const a = auth(req);
        const readings = Array.isArray(req.body?.readings) ? req.body.readings : [];
        if (!readings.length) {
            res.status(400).json({ error: 'readings порожній' });
            return;
        }

        const result = await pushReadings({
            telegramId: a.telegramId,
            period: req.body?.period,
            readings,
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'error' });
    }
});
