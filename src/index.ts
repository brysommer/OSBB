import 'dotenv/config';
import { prisma } from './lib/prisma';
import axios from 'axios';
import { CHAT_ID, bot, sendTelegramAlert } from './sendTGalert';
import { getValidToken } from './tokenrefresh';
import { getItemDescription } from './itemDetails';
import { analyzeDescriptionWithAI } from './deepseak';

interface UserData {
    step: number;
    phone?: string;
    carNumber?: string;
    tankVolume?: number;
}

const checkLotsForConfig = async (config: any, marketplaceId: string, token: string) => {
    console.log('marketplaceID' + marketplaceId);
    try {
        const response = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
            headers: {
                Authorization: `Bearer ${token}`,
                'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
                'Cache-Control': 'no-cache',
            },
            params: {
                q: config.query,
                limit: 10, // Нам потрібні тільки найсвіжіші топ-10
                sort: 'newlyListed',
                // Динамічний фільтр з нашої бази даних
                filter: `price:[${config.minPrice}..${config.maxPrice}],priceCurrency:${config.currency},buyingOptions:{FIXED_PRICE}`,
            },
        });

        const rawItems = response.data.itemSummaries || [];

        const skipMarkets = await prisma.appConfig.findFirst({
            where: { key: 'SkipMarkets' },
        });

        const skipMarketsArray = skipMarkets?.value ? JSON.parse(skipMarkets?.value) : [];

        const items = rawItems.filter((item: any) => {
            // А. Відсікаємо американський ринок
            if (skipMarketsArray.includes(item.listingMarketplaceId)) {
                console.log('skip markets' + skipMarketsArray);
                return false;
            }

            // Б. Залишаємо ТІЛЬКИ категоріЯ 9355 (Мобільні телефони)
            // Оскільки це масив, перевіряємо через .includes()
            if (!item.leafCategoryIds || !item.leafCategoryIds.includes('9355')) return false;

            // В. Цікавить ЛИШЕ б/у (3000) та під відновлення/запчастини (7000)
            // Усі інші стани (1000 - Новий, 1500, 2000, 2500 - Refurbished) ігноруємо
            if (item.conditionId !== '3000' && item.conditionId !== '7000') return false;

            // Г. Мінусуємо оголошення-варіації (китайські списки-розкладки)
            if (item.itemGroupType === 'SELLER_DEFINED_VARIATIONS') return false;

            // Якщо лот пройшов усі перевірки — залишаємо його
            return true;
        });

        for (const item of items) {
            // Валідація на ключові слова-паразити (можна теж винести в БД як глобальний чорний список)
            const titleLower = item.title.toLowerCase();
            if (titleLower.includes('box only')) {
                continue;
            }

            // Перевірка дедуплікації
            const alreadyTracked = await prisma.trackedItem.findUnique({
                where: { id: item.itemId },
            });
            if (alreadyTracked) continue;

            // Логуємо в базу, що ми його знайшли
            await prisma.trackedItem.create({
                data: {
                    id: item.itemId,
                    title: item.title,
                    price: parseFloat(item.price.value),
                    currency: item.price.currency,
                    url: item.itemWebUrl,
                    marketplace: marketplaceId,
                },
            });

            const fullItemDetails = await getItemDescription(item.itemId, token);

            const summary = await analyzeDescriptionWithAI(
                fullItemDetails.description,
                fullItemDetails.title,
            );

            if (summary.isTrash) {
                console.log(
                    `[AI Filter] Пропущено сміттєвий лот (iCloud/Блок): ${fullItemDetails.title}`,
                );
                continue; // Зупиняє поточну ітерацію і переходить до НАСТУПНОГО лоту в циклі
            }

            await bot.sendMessage(CHAT_ID, summary.text);

            // Надсилаємо сповіщення
            await sendTelegramAlert(item, marketplaceId, config);
        }
    } catch (error: any) {
        console.error(
            `Помилка парсингу для запиту "${config.query}" на ${marketplaceId}:`,
            error.message,
        );
    }
};

// Головний цикл
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const startHunting = async () => {
    // 1. Беремо з бази тільки активні фільтри
    const activeConfigs = await prisma.searchConfig.findMany({
        where: { isActive: true },
    });

    if (activeConfigs.length === 0) return;

    const DEFAULT_DELAY = 12000;

    const token = await getValidToken();

    const Markets = await prisma.appConfig.findFirst({
        where: { key: 'Markets' },
    });

    const MARKETPLACES = Markets?.value
        ? JSON.parse(Markets?.value)
        : ['EBAY_DE', 'EBAY_FR', 'EBAY_IT', 'EBAY_ES', 'EBAY_PL'];

    // 2. Проходимо по кожному фільтру послідовно
    for (const config of activeConfigs) {
        // Змінюємо Promise.all на послідовний цикл по маркетплейсах
        for (const marketplaceId of MARKETPLACES) {
            try {
                // Виконуємо запит для конкретного маркетплейса
                await checkLotsForConfig(config, marketplaceId, token);

                // Беремо індивідуальну затримку з бази (якщо додаси таке поле) або дефолтну
                //const delay = config.delayMs ?? DEFAULT_DELAY;

                const dalay = await prisma.appConfig.findFirst({
                    where: { key: 'delayMs' },
                });

                console.log(
                    `Чекаємо ${Number(dalay?.value) || DEFAULT_DELAY}мс перед наступним запитом...`,
                );

                await sleep(Number(dalay?.value) || DEFAULT_DELAY);
            } catch (error) {
                console.error(
                    `Помилка під час перевірки ${marketplaceId} для конфігу ${config.id}:`,
                    error,
                );
                // Навіть якщо сталася помилка, варто почекати перед наступним маркетплейсом
                await sleep(DEFAULT_DELAY);
            }
        }
    }
};
