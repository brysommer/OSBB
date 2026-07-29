import TelegramBot from 'node-telegram-bot-api';

import { sessions, getSession, clearSession } from './session';
import { BotState } from './states';

import { mainKeyboard, resourceKeyboard } from './keyboards';

import {
    sendCurrentMeter,
    handleReadingInput,
    handleConfirm,
    handleSelfAccept,
    handleSelfCorrect,
} from './messages';

import {
    getBuildings,
    getBuildingResourceTypes,
    getSections,
    buildQueue,
} from '../services/queue.service';

import { ResourceType } from '@prisma/client';
import dotenv from 'dotenv';
import { registerPutReadingsHandler } from './handlers/putReadings.handler';
import { getAvailableResidentialComplexes } from '../services/userAccess.service';
import { registerTelegramUser } from '../services/user.service';

dotenv.config();

const botToken = process.env.ADMIN_BOT_BOT!;

const bot = new TelegramBot(botToken, {
    polling: true,
});

bot.setMyCommands([
    {
        command: 'start',
        description: 'Головне меню',
    },
    {
        command: 'putreadings',
        description: 'Передати показники',
    },
    {
        command: 'cancel',
        description: '❌ Скасувати поточну операцію',
    },
]).catch(console.error);

bot.onText(/\/cancel/, async (msg) => {
    const chatId = msg.chat.id;

    clearSession(chatId);

    const session = getSession(chatId);
    session.state = BotState.IDLE;

    await bot.sendMessage(chatId, '❌ Поточну операцію скасовано.', {
        reply_markup: mainKeyboard(),
    });
});

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    await registerTelegramUser(chatId);

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
        session.state = BotState.SELECT_COMPLEX;

        const complexes = await getAvailableResidentialComplexes(chatId);

        await bot.sendMessage(chatId, '🏢 Оберіть житловий комплекс:', {
            reply_markup: {
                inline_keyboard: complexes.map((c) => [
                    {
                        text: c.name,
                        callback_data: `complex:${c.id}`,
                    },
                ]),
            },
        });

        return;
    }

    if (data.startsWith('complex:')) {
        session.residentialComplexId = data.split(':')[1];

        session.state = BotState.SELECT_BUILDING;

        const buildings = await getBuildings(session.residentialComplexId!);

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
        session.state = BotState.SELECT_RESOURCE;

        const resourceTypes = await getBuildingResourceTypes(
            session.residentialComplexId!,
            building,
        );

        if (!resourceTypes.length) {
            await bot.sendMessage(chatId, '❌ У цьому будинку немає лічильників');
            return;
        }

        await bot.sendMessage(chatId, '🚰 Оберіть режим обходу:', {
            reply_markup: resourceKeyboard(resourceTypes),
        });

        return;
    }
    if (data.startsWith('resource_scope:')) {
        if (!session.residentialComplexId || !session.buildingNumber) return;

        const scope = data.replace('resource_scope:', '');
        const availableResourceTypes = await getBuildingResourceTypes(
            session.residentialComplexId,
            session.buildingNumber,
        );

        if (scope === 'COLD_WATER') {
            session.resourceTypes = availableResourceTypes.filter(
                (resourceType) => resourceType === ResourceType.COLD_WATER,
            );
        } else if (scope === 'HOT_WATER') {
            session.resourceTypes = availableResourceTypes.filter(
                (resourceType) => resourceType === ResourceType.HOT_WATER,
            );
        } else if (scope === 'HOT_WATER_HEATING') {
            session.resourceTypes = availableResourceTypes.filter(
                (resourceType) =>
                    resourceType === ResourceType.HOT_WATER ||
                    resourceType === ResourceType.HEATING,
            );
        } else if (scope === 'ALL') {
            session.resourceTypes = availableResourceTypes;
        } else {
            return;
        }

        if (!session.resourceTypes.length) return;

        session.state = BotState.SELECT_SECTION;

        const sections = await getSections(
            session.residentialComplexId,
            session.buildingNumber,
        );

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

        if (!session.resourceTypes?.length || !session.buildingNumber) return;

        session.queue = await buildQueue(
            session.residentialComplexId!,
            session.buildingNumber,
            section,
            session.resourceTypes,
        );

        session.currentIndex = 0;
        session.state = BotState.INPUT_READING;

        await sendCurrentMeter(bot, chatId);

        return;
    }
    if (data === 'self_accept') {
        await handleSelfAccept(bot, chatId);
        return;
    }

    if (data === 'self_correct') {
        await handleSelfCorrect(bot, chatId);
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
