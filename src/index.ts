import 'dotenv/config';
import { startApiServer } from './api/server';

// Telegram-бот стартує через side-effect import
import './bot/bot';

startApiServer();
