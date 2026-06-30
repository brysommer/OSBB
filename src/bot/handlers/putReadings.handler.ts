import TelegramBot from 'node-telegram-bot-api';
import { prisma } from '../../lib/prisma';

import { exportReadings } from '../../services/export.service';
import { ProgressMessage } from '../progress';

interface Session {
    building?: string;
    period?: string;
}

const sessions = new Map<number, Session>();

export function registerPutReadingsHandler(bot: TelegramBot) {
    //--------------------------------------------------------
    // START COMMAND
    //--------------------------------------------------------
    bot.onText(/\/putreadings/, async (msg) => {
        const chatId = msg.chat.id;

        sessions.set(chatId, {});

        const buildings = await prisma.premises.findMany({
            distinct: ['buildingNumber'],
            select: {
                buildingNumber: true,
            },
            orderBy: {
                buildingNumber: 'asc',
            },
        });

        bot.sendMessage(chatId, '🏠 Оберіть будинок', {
            reply_markup: {
                inline_keyboard: buildings.map((b) => [
                    {
                        text: `Будинок ${b.buildingNumber}`,
                        callback_data: `export_building:${b.buildingNumber}`,
                    },
                ]),
            },
        });
    });

    //--------------------------------------------------------
    // CALLBACKS
    //--------------------------------------------------------
    bot.on('callback_query', async (query) => {
        if (!query.data || !query.message) return;

        const chatId = query.message.chat.id;
        const session = sessions.get(chatId);

        if (!session) return;

        //--------------------------------------------------------
        // BUILDING SELECT
        //--------------------------------------------------------
        if (query.data.startsWith('export_building:')) {
            const building = query.data.replace('export_building:', '');

            session.building = building;

            const periods = await prisma.reading.findMany({
                distinct: ['period'],
                select: { period: true },
                orderBy: { period: 'desc' },
            });

            await bot.editMessageText(`🏠 Будинок ${building}\n\n📅 Оберіть період`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: periods.map((p) => [
                        {
                            text: p.period,
                            callback_data: `export_period:${p.period}`,
                        },
                    ]),
                },
            });

            sessions.set(chatId, session);
            return;
        }

        //--------------------------------------------------------
        // PERIOD SELECT
        //--------------------------------------------------------
        if (query.data.startsWith('export_period:')) {
            const period = query.data.replace('export_period:', '');

            session.period = period;
            sessions.set(chatId, session);

            const count = await prisma.reading.count({
                where: {
                    period,
                    meter: {
                        premises: {
                            buildingNumber: session.building,
                        },
                    },
                },
            });

            await bot.editMessageText(
                [
                    '📤 Підтвердіть експорт',
                    '',
                    `🏠 Будинок: ${session.building}`,
                    `📅 Період: ${period}`,
                    `📊 Показників: ${count}`,
                    '',
                    'Натисніть 🚀 для запуску',
                ].join('\n'),
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: '🚀 Відправити в ДАХ',
                                    callback_data: 'export_start',
                                },
                            ],
                        ],
                    },
                },
            );

            return;
        }

        //--------------------------------------------------------
        // START EXPORT
        //--------------------------------------------------------
        if (query.data === 'export_start') {
            if (!session.building || !session.period) return;

            const progress = new ProgressMessage(
                bot,
                chatId,
                `Експорт ${session.building} / ${session.period}`,
            );

            await progress.create(0);

            await exportReadings({
                buildingNumber: session.building,
                period: session.period,

                onStart: async (total) => {
                    await progress.update(0, total, 0, 0);
                },

                onProgress: async (data) => {
                    await progress.update(data.current, data.total, data.success, data.failed);
                },

                onError: async (text) => {
                    await bot.sendMessage(chatId, text);
                },

                onFinish: async (data) => {
                    await progress.finish(data.total, data.success, data.failed);

                    await bot.sendMessage(
                        chatId,
                        [
                            '✅ Експорт завершено',
                            '',
                            `Успішно: ${data.success}`,
                            `Помилок: ${data.failed}`,
                            `Всього: ${data.total}`,
                        ].join('\n'),
                    );

                    sessions.delete(chatId);
                },
            });
        }
    });
}
