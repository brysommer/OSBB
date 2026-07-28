import TelegramBot from 'node-telegram-bot-api';
import { ReadingSource } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { exportReadings } from '../../services/export.service';
import { ProgressMessage } from '../progress';
import { getAvailableResidentialComplexes } from '../../services/userAccess.service';

interface Session {
    building?: string;
    period?: string;
    residentialComplexId?: string;
    residentialComplexName?: string;
}

const sessions = new Map<number, Session>();

export function registerPutReadingsHandler(bot: TelegramBot) {
    bot.onText(/\/putreadings/, async (msg) => {
        const chatId = msg.chat.id;
        sessions.set(chatId, {});

        const residentialComplexes = await getAvailableResidentialComplexes(chatId);

        if (!residentialComplexes.length) {
            await bot.sendMessage(chatId, '❌ Немає доступних житлових комплексів');
            return;
        }

        await bot.sendMessage(chatId, '🏢 Оберіть житловий комплекс', {
            reply_markup: {
                inline_keyboard: residentialComplexes.map((rc) => [
                    {
                        text: rc.name,
                        callback_data: `export_rc:${rc.id}`,
                    },
                ]),
            },
        });
    });

    bot.on('callback_query', async (query) => {
        if (!query.data || !query.message) return;

        const chatId = query.message.chat.id;
        const session = sessions.get(chatId);
        if (!session) return;

        if (query.data.startsWith('export_rc:')) {
            const residentialComplexId = query.data.replace('export_rc:', '');
            session.residentialComplexId = residentialComplexId;

            const rc = await prisma.residentialComplex.findUnique({
                where: { id: residentialComplexId },
            });
            session.residentialComplexName = rc?.name;

            const buildings = await prisma.premises.findMany({
                where: { residentialComplexId },
                distinct: ['buildingNumber'],
                select: { buildingNumber: true },
                orderBy: { buildingNumber: 'asc' },
            });

            await bot.editMessageText('🏠 Оберіть будинок', {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: buildings.map((b) => [
                        {
                            text: `Будинок ${b.buildingNumber}`,
                            callback_data: `export_building:${b.buildingNumber}`,
                        },
                    ]),
                },
            });

            sessions.set(chatId, session);
            return;
        }

        if (query.data.startsWith('export_building:')) {
            const building = query.data.replace('export_building:', '');
            session.building = building;

            const periods = await prisma.reading.findMany({
                where: {
                    meter: {
                        premises: {
                            buildingNumber: building,
                            residentialComplexId: session.residentialComplexId,
                        },
                    },
                },
                distinct: ['period'],
                select: { period: true },
                orderBy: { period: 'desc' },
            });

            await bot.editMessageText(
                `🏢 ${session.residentialComplexName}\n🏠 Будинок ${building}\n\n📅 Оберіть період`,
                {
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
                },
            );

            sessions.set(chatId, session);
            return;
        }

        if (query.data.startsWith('export_period:')) {
            const period = query.data.replace('export_period:', '');
            session.period = period;
            sessions.set(chatId, session);

            const readings = await prisma.reading.findMany({
                where: {
                    period,
                    source: ReadingSource.COLLECTED,
                    meter: {
                        premises: {
                            buildingNumber: session.building,
                            residentialComplexId: session.residentialComplexId,
                        },
                    },
                },
                distinct: ['meterId'],
                select: {
                    meterId: true,
                },
            });
            const count = readings.length;

            await bot.editMessageText(
                [
                    '📤 Підтвердіть експорт',
                    '',
                    `🏢 ЖК: ${session.residentialComplexName}`,
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
                            [{ text: '🚀 Відправити в ДАХ', callback_data: 'export_start' }],
                        ],
                    },
                },
            );
            return;
        }

        if (query.data === 'export_start') {
            if (!session.building || !session.period || !session.residentialComplexId) return;

            const progress = new ProgressMessage(
                bot,
                chatId,
                `Експорт ${session.residentialComplexName} / ${session.building} / ${session.period}`,
            );

            await progress.create(0);

            try {
                await exportReadings({
                    residentialComplexId: session.residentialComplexId,
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
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Невідома помилка';
                await bot.sendMessage(chatId, `❌ Експорт не запущено: ${message}`);
            }
        }
    });
}
