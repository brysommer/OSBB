import express from 'express';
import cors from 'cors';
import { loginMobile } from './auth';
import { mobileRouter } from './mobile.routes';

export function createApiApp() {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '2mb' }));

    app.get('/health', (_req, res) => {
        res.json({ ok: true, service: 'osbb-mobile-api' });
    });

    app.post('/api/mobile/auth/login', loginMobile);
    app.use('/api/mobile', mobileRouter);

    return app;
}

export function startApiServer() {
    const port = Number(process.env.MOBILE_API_PORT || 8787);
    const app = createApiApp();

    app.listen(port, () => {
        console.log(`Mobile API listening on :${port}`);
    });

    return app;
}

if (require.main === module) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv').config();
    startApiServer();
}
