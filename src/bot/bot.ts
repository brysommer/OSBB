import TelegramBot from 'node-telegram-bot-api';
import { ResourceType } from '@prisma/client';

import { sessions, getSession, clearSession } from './session';
import { BotState } from './states';

import {
    mainKeyboard,
    resourceKeyboard,
    resolveCollectionMode,
    singleResourceKeyboard,
} from './keyboards';

import {
    sendCurrentMeter,
    handleReadingInput,
    handleConfirm,
    handleSelfAccept,
    handleSelfCorrect,
} from './messages';
import {
    askSerialNumber,
    handleSerialApartmentInput,
    handleSerialNumberInput,
} from './serialMapping.messages';
import {
    handleHeatPhoto,
    handleHeatSerialConfirmation,
    handleHeatSerialText,
    sendCurrentHeatMeter,
} from './heatMapping.messages';

import { getBuildings, getSections, buildQueue } from '../services/queue.service';
import { getSectionAllowedResourceTypes } from '../services/buildingSection.service';
import {
    getHeatMappingQueue,
    isSynergiaGlass,
} from '../services/heatMeterMapping.service';

import dotenv from 'dotenv';
import { registerPutReadingsHandler } from './handlers/putReadings.handler';
import { getAvailableResidentialComplexes } from '../services/userAccess.service';
import { registerTelegramUser } from '../services/user.service';
import { startAskoeScheduler } from '../services/askoeScheduler.service';

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

    const user = await registerTelegramUser(chatId);
    const complexes = await getAvailableResidentialComplexes(chatId);

    const session = getSession(chatId);
    session.state = BotState.IDLE;

    const greeting = user.name
        ? `👋 Вітаю, ${user.name}!`
        : '👋 Система обходу лічильників';

    await bot.sendMessage(chatId, greeting, {
        reply_markup: mainKeyboard(complexes.some((complex) => isSynergiaGlass(complex.name))),
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message!.chat.id;
    const data = query.data!;
    const session = getSession(chatId);

    try {
        await bot.answerCallbackQuery(query.id);
    } catch {
        // ignore expired callback answers
    }

    if (data === 'start_collection') {
        session.mode = 'COLLECTION';
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

    if (data === 'start_serial_mapping') {
        session.mode = 'SERIAL_MAPPING';
        session.state = BotState.SELECT_COMPLEX;

        const complexes = await getAvailableResidentialComplexes(chatId);

        await bot.sendMessage(chatId, '🏢 Оберіть житловий комплекс для привʼязки серійних:', {
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

    if (data === 'start_heat_mapping') {
        session.mode = 'HEAT_MAPPING';
        session.state = BotState.SELECT_COMPLEX;
        session.heatQueue = [];
        session.heatCurrentIndex = 0;
        session.pendingHeatSerialNumber = undefined;

        const complexes = (await getAvailableResidentialComplexes(chatId)).filter((complex) =>
            isSynergiaGlass(complex.name),
        );

        if (!complexes.length) {
            session.state = BotState.IDLE;
            session.mode = undefined;
            await bot.sendMessage(chatId, '❌ Режим доступний лише для Синергія GLASS');
            return;
        }

        await bot.sendMessage(chatId, '🏢 Оберіть Синергія GLASS для привʼязки теплових:', {
            reply_markup: {
                inline_keyboard: complexes.map((complex) => [
                    {
                        text: complex.name,
                        callback_data: `complex:${complex.id}`,
                    },
                ]),
            },
        });

        return;
    }

    if (data.startsWith('complex:')) {
        const residentialComplexId = data.split(':')[1];

        if (session.mode === 'HEAT_MAPPING') {
            const complexes = await getAvailableResidentialComplexes(chatId);
            const allowed = complexes.some(
                (complex) =>
                    complex.id === residentialComplexId && isSynergiaGlass(complex.name),
            );

            if (!allowed) {
                await bot.sendMessage(chatId, '❌ Цей житловий комплекс недоступний для режиму');
                return;
            }
        }

        session.residentialComplexId = residentialComplexId;
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
        session.resourceTypes = undefined;
        session.serialResourceType = undefined;
        session.sectionNumber = undefined;
        session.heatQueue = [];
        session.heatCurrentIndex = 0;
        session.pendingHeatSerialNumber = undefined;
        session.state = BotState.SELECT_SECTION;

        const sections = await getSections(session.residentialComplexId!, building);

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

    if (data.startsWith('section:') || data === 'select_section') {
        if (data === 'select_section') {
            if (!session.residentialComplexId || !session.buildingNumber) return;

            session.state = BotState.SELECT_SECTION;
            session.resourceTypes = undefined;
            session.serialResourceType = undefined;
            session.pendingSerialNumber = undefined;
            session.sectionNumber = undefined;
            session.heatQueue = [];
            session.heatCurrentIndex = 0;
            session.pendingHeatSerialNumber = undefined;

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

        const section = data.split(':')[1];
        session.sectionNumber = section;
        session.state = BotState.SELECT_RESOURCE;

        if (!session.residentialComplexId || !session.buildingNumber) return;

        if (session.mode === 'HEAT_MAPPING') {
            session.heatQueue = await getHeatMappingQueue(
                session.residentialComplexId,
                session.buildingNumber,
                section,
            );
            session.heatCurrentIndex = 0;

            if (!session.heatQueue.length) {
                session.state = BotState.IDLE;
                await bot.sendMessage(
                    chatId,
                    '✅ У цьому підʼїзді всі теплові лічильники вже привʼязані',
                );
                return;
            }

            await sendCurrentHeatMeter(bot, chatId);
            return;
        }

        const resourceTypes = await getSectionAllowedResourceTypes(
            session.residentialComplexId,
            session.buildingNumber,
            section,
        );

        if (!resourceTypes.length) {
            await bot.sendMessage(
                chatId,
                '❌ У цьому під’їзді немає доступних ресурсів за поточними налаштуваннями',
            );
            return;
        }

        if (session.mode === 'SERIAL_MAPPING') {
            const singleResource = singleResourceKeyboard(resourceTypes, 'serial_resource');
            if (!singleResource.inline_keyboard.length) {
                await bot.sendMessage(chatId, '❌ Немає ресурсів у цьому підʼїзді');
                return;
            }
            await bot.sendMessage(chatId, '🔢 Оберіть ресурс для привʼязки серійних:', {
                reply_markup: singleResource,
            });
            return;
        }

        const keyboard = resourceKeyboard(resourceTypes);

        if (!keyboard.inline_keyboard.length) {
            await bot.sendMessage(
                chatId,
                '❌ Немає доступних режимів обходу для цього під’їзду. Перевір прапорці в BuildingSection.',
            );
            return;
        }

        await bot.sendMessage(chatId, '🚰 Оберіть режим обходу:', {
            reply_markup: keyboard,
        });

        return;
    }

    if (data.startsWith('resource_scope:')) {
        if (session.mode !== 'COLLECTION') {
            return;
        }
        if (!session.residentialComplexId || !session.buildingNumber || !session.sectionNumber) {
            return;
        }

        const modeId = data.replace('resource_scope:', '');
        const mode = resolveCollectionMode(modeId);

        if (!mode) return;

        const availableResourceTypes = await getSectionAllowedResourceTypes(
            session.residentialComplexId,
            session.buildingNumber,
            session.sectionNumber,
        );
        const available = new Set(availableResourceTypes);

        if (!mode.resources.every((resourceType) => available.has(resourceType))) {
            await bot.sendMessage(chatId, '❌ Цей режим недоступний для вибраного під’їзду');
            return;
        }

        session.resourceTypes = mode.resources;

        session.queue = await buildQueue(
            session.residentialComplexId,
            session.buildingNumber,
            session.sectionNumber,
            session.resourceTypes,
        );

        session.currentIndex = 0;
        session.state = BotState.INPUT_READING;

        if (!session.queue.length) {
            await bot.sendMessage(chatId, '✅ Немає лічильників для обходу в цьому режимі');
            session.state = BotState.IDLE;
            return;
        }

        await sendCurrentMeter(bot, chatId);
        return;
    }

    if (data.startsWith('serial_resource:')) {
        if (session.mode !== 'SERIAL_MAPPING') return;
        if (!session.residentialComplexId || !session.buildingNumber || !session.sectionNumber) return;

        const resourceType = data.replace('serial_resource:', '');
        const allowed = await getSectionAllowedResourceTypes(
            session.residentialComplexId,
            session.buildingNumber,
            session.sectionNumber,
        );
        const valid = new Set<string>(Object.values(ResourceType));
        if (!valid.has(resourceType) || !allowed.includes(resourceType as ResourceType)) {
            await bot.sendMessage(chatId, '❌ Цей ресурс недоступний для підʼїзду');
            return;
        }

        session.serialResourceType = resourceType as ResourceType;
        session.pendingSerialNumber = undefined;

        await askSerialNumber(bot, chatId);
        return;
    }

    if (data === 'heat_serial_confirm') {
        await handleHeatSerialConfirmation(bot, chatId, true);
        return;
    }

    if (data === 'heat_serial_manual') {
        await handleHeatSerialConfirmation(bot, chatId, false);
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

    const session = getSession(chatId);

    if (
        session.mode === 'HEAT_MAPPING' &&
        session.state === BotState.INPUT_HEAT_SERIAL &&
        msg.photo
    ) {
        await handleHeatPhoto(bot, chatId, msg.photo);
        return;
    }

    if (!msg.text) return;

    if (session.state === BotState.INPUT_READING) {
        await handleReadingInput(bot, chatId, msg.text);
        return;
    }

    if (session.state === BotState.INPUT_SERIAL_NUMBER) {
        await handleSerialNumberInput(bot, chatId, msg.text);
        return;
    }

    if (session.state === BotState.INPUT_SERIAL_APARTMENT) {
        await handleSerialApartmentInput(bot, chatId, msg.text);
        return;
    }

    if (
        session.mode === 'HEAT_MAPPING' &&
        session.state === BotState.INPUT_HEAT_SERIAL
    ) {
        await handleHeatSerialText(bot, chatId, msg.text);
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
startAskoeScheduler(bot);
