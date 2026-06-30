import TelegramBot from 'node-telegram-bot-api';

import { sessions, getSession, clearSession } from './session';
import { BotState } from './states';

import { mainKeyboard, resourceKeyboard } from './keyboards';

import { sendCurrentMeter, handleReadingInput, handleConfirm } from './messages';

import { getBuildings, getSections, buildQueue } from '../services/queue.service';

import { ResourceType } from '@prisma/client';
import dotenv from 'dotenv';
import { registerPutReadingsHandler } from './handlers/putReadings.handler';

dotenv.config();

const botToken = process.env.ADMIN_BOT_BOT!;

const bot = new TelegramBot(botToken, {
    polling: true,
});

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    const session = getSession(chatId);
    session.state = BotState.IDLE;

    await bot.sendMessage(chatId, '👋 Система обходу лічильників', {
        reply_markup: mainKeyboard(),
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message!.chat.id;
    const data = query.data!;
    const session = getSession(chatId);

    // 🔥 START FLOW
    if (data === 'start_collection') {
        session.state = BotState.SELECT_RESOURCE;

        await bot.sendMessage(chatId, 'Оберіть тип лічильника:', {
            reply_markup: resourceKeyboard(),
        });

        return;
    }
    if (data === ResourceType.HOT_WATER || data === ResourceType.HEATING || data === 'BOTH') {
        session.resourceType = data as any;
        session.state = BotState.SELECT_BUILDING;

        const buildings = await getBuildings();

        await bot.sendMessage(chatId, '🏢 Оберіть будинок:', {
            reply_markup: {
                inline_keyboard: buildings.map((b) => [
                    {
                        text: b,
                        callback_data: `building:${b}`,
                    },
                ]),
            },
        });

        return;
    }
    if (data.startsWith('building:')) {
        const building = data.split(':')[1];

        session.buildingNumber = building;
        session.state = BotState.SELECT_SECTION;

        const sections = await getSections(building);

        await bot.sendMessage(chatId, '🚪 Оберіть під’їзд:', {
            reply_markup: {
                inline_keyboard: sections.map((s) => [
                    {
                        text: s,
                        callback_data: `section:${s}`,
                    },
                ]),
            },
        });

        return;
    }
    if (data.startsWith('section:')) {
        const section = data.split(':')[1];

        session.sectionNumber = section;

        if (!session.resourceType || !session.buildingNumber) return;

        session.queue = await buildQueue(session.buildingNumber, section, session.resourceType);

        session.currentIndex = 0;
        session.state = BotState.INPUT_READING;

        await sendCurrentMeter(bot, chatId);

        return;
    }
    if (data === 'confirm_yes') {
        await handleConfirm(bot, chatId, true);
        return;
    }

    if (data === 'confirm_no') {
        await handleConfirm(bot, chatId, false);
        return;
    }
});
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (!msg.text) return;

    const session = getSession(chatId);

    if (session.state === BotState.INPUT_READING) {
        await handleReadingInput(bot, chatId, msg.text);
    }
});
bot.on('callback_query', async (query) => {
    const chatId = query.message!.chat.id;
    const data = query.data!;

    if (data === 'finish') {
        clearSession(chatId);

        await bot.sendMessage(chatId, '🏁 Обхід завершено. Сесію очищено.');
    }
});

registerPutReadingsHandler(bot);
