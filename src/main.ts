import { startHunting } from './index'; // або де там лежить твоя функція
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const WORK_START_HOUR = 7; // 07:00 ранку
const WORK_END_HOUR = 23; // 23:00 вечора
const CYCLE_PAUSE_MS = 3000; // Пауза 3 секунди МІЖ повноцінними колами пошуку

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Перевіряє, чи поточний час за Києвом входить в робочий діапазон
 */
function isWorkTime(): boolean {
    const now = new Date();

    // Якщо сервер стоїть не в Україні (наприклад, Хецнер у Німеччині),
    // примусово переводимо час на київський (Europe/Kyiv)
    const kyivTimeStr = now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' });
    const kyivDate = new Date(kyivTimeStr);

    const currentHour = kyivDate.getHours();

    return currentHour >= WORK_START_HOUR && currentHour < WORK_END_HOUR;
}

/**
 * Головний безкінечний двигун бота
 */
async function mainEngine() {
    while (true) {
        if (!isWorkTime()) {
            console.log(
                `💤 Нічний режим. Бот спить. Наступна перевірка часового поясу через 5 хвилин...`,
            );
            // Вночі не мучаємо процесор і базу, перевіряємо час раз на 5 хвилин
            await sleep(5 * 60 * 1000);
            continue;
        }

        const startTime = Date.now();

        try {
            // Запускаємо твою функцію (вона пройдеться по всіх фільтрах і маркетплейсах)
            await startHunting();
        } catch (error) {
            console.error('💥 Критична помилка всередині startHunting:', error);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`=== 🏁 Коло завершено. Скрипт працював: ${duration} сек. ===`);

        // Робимо невелику паузу перед наступним колом
        console.log(`Пауза між колами ${CYCLE_PAUSE_MS / 1000} сек...`);
        await sleep(CYCLE_PAUSE_MS);
    }
}

// Запуск бота
mainEngine();
