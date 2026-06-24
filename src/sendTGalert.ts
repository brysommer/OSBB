import TelegramBot from 'node-telegram-bot-api';
import { prisma } from './lib/prisma';

// Ініціалізація бота (токен беремо з екологічних змінних .env)
export const bot = new TelegramBot(process.env.ADMIN_BOT_BOT!, { polling: false });
export const CHAT_ID = process.env.LOGGER_CHAT!; // Твій особистий ID чату

interface EbayItem {
    itemId: string;
    title: string;
    price: { value: string; currency: string };
    itemWebUrl: string;
    image?: { imageUrl: string };
    // Нові поля для глибокого аналізу
    listingMarketplaceId: string;
    itemCreationDate: string; // Формат ISO рядка, наприклад '2026-06-17T...'
    itemLocation?: {
        country: string; // Код країни: DE, FR, PL, US тощо
        postalCode?: string;
    };
    seller?: {
        username: string;
        feedbackScore: number; // Кількість відгуків
        feedbackPercentage: string; // Відсоток позитивних відгуків
        sellerAccountType: 'INDIVIDUAL' | 'BUSINESS';
    };
}

export const sendTelegramAlert = async (item: EbayItem, marketplaceId: string, config: any) => {
    // Витягуємо чистий Legacy ID лоту для формування Deep Link
    const legacyItemId = item.itemId.includes('|') ? item.itemId.split('|')[1] : item.itemId;

    const webUrl = item.itemWebUrl;
    const appUrl = `https://www.ebay.de/itm/${legacyItemId}`; // Лінкує прямо в додаток eBay

    // Красивий прапорець для маркетплейсу
    const flag =
        marketplaceId === 'EBAY_DE'
            ? '🇩🇪 DE'
            : marketplaceId === 'EBAY_PL'
            ? '🇵🇱 PL'
            : marketplaceId === 'EBAY_FR'
            ? '🇫🇷 FR'
            : marketplaceId === 'EBAY_IT'
            ? '🇮🇹 IT'
            : marketplaceId;

    // 1. Розрахунок секунд з моменту створення лоту
    const creationMs = new Date(item.itemCreationDate).getTime();
    const secondsAgo = Math.floor((Date.now() - creationMs) / 1000);
    const timeInfo = secondsAgo >= 0 ? `${secondsAgo} сек тому` : 'щойно';

    // 2. Країна знаходження лоту
    // ... (твій попередній код у sendTelegramAlert)

    const locationCountry = item.itemLocation?.country || '??';

    console.log(`location country: ${item.itemLocation?.country}`);

    // Створюємо карту локальних доменів eBay на основі marketplaceId
    const ebayDomains: Record<string, string> = {
        DE: 'ebay.de',
        PL: 'ebay.pl',
        FR: 'ebay.fr',
        IT: 'ebay.it',
        ES: 'ebay.es',
        GB: 'ebay.co.uk',
        US: 'ebay.com',
        NL: 'ebay.nl',
        CH: 'ebay.ch',
    };

    // Визначаємо потрібний домен (якщо країни немає в списку, дефолтимо на німецький або американський)
    const currentDomain = ebayDomains[locationCountry] || 'ebay.de';

    // Формуємо localUrl прямо на домашній маркетплейс лота
    const localUrl = `https://www.${currentDomain}/itm/${legacyItemId}`;

    const currencyRate = await prisma.appConfig.findFirst({
        where: {
            key: 'EURUSD',
        },
    });
    // 3. Лаконічні характеристики продавця
    let sellerInfo = 'немає даних';
    if (item.seller) {
        const type = item.seller.sellerAccountType === 'BUSINESS' ? 'БІЗНЕС' : 'ПРИВАТ';
        sellerInfo = `${item.seller.username} (${item.seller.feedbackScore}⭐ | ${item.seller.feedbackPercentage}%) [${type}]`;
    }

    // Текст повідомлення у форматі HTML (строгий та лаконічний)
    const messageText = `
📱 <b>Знайдено новий лот!</b> [${flag}]

<b>Назва:</b> ${item.title}
<b>Цільовий пошук:</b> <code>${config.query}</code>

💰 <b>Ціна:</b> ${item.price.value} ${item.price.currency} (${
        (Number(item.price.value) * Number(currencyRate?.value)) | 1.15
    })
📦 <b>Тип:</b> Buy It Now
⏱ <b>Створено:</b> ${timeInfo}
📍 <b>Локація товару:</b> ${locationCountry}
👤 <b>Продавець:</b> <code>${sellerInfo}</code>

<i>Макс. ліміт у фільтрі ${config.query}: ${config.maxPrice} ${config.currency} (${
        (config.maxPrice * Number(currencyRate?.value)) | 1.15
    } USD )</i>
`;

    // Опції для клавіатури з кнопками швидкого переходу
    const options: TelegramBot.SendMessageOptions = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📱 Відкрити в Додатку', url: appUrl },
                    { text: '🌐 Локальний ібей', url: localUrl },
                ],
            ],
        },
    };

    try {
        if (item.image?.imageUrl) {
            await bot.sendPhoto(CHAT_ID, item.image.imageUrl, {
                ...options,
                caption: messageText,
            });
        } else {
            await bot.sendMessage(CHAT_ID, messageText, options);
        }
        console.log(`[Telegram] Успішно надіслано алерт для: ${item.title}`);
    } catch (error: any) {
        console.error('[Telegram Error] Не вдалося надіслати повідомлення:', error.message);
    }
};
