import axios from 'axios';
import 'dotenv/config';
// Дані беруться з твоего eBay Developer Portal (Application Keys)
const CLIENT_ID = process.env.EBAY_CLIENT_ID!;
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET!;

export const getEbayAppToken = async (): Promise<string> => {
    // 1. Кодуємо App ID (Client ID) та Cert ID (Client Secret) у формат Base64
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    try {
        const response = await axios.post(
            'https://api.ebay.com/identity/v1/oauth2/token',
            // eBay вимагає передавати параметри у форматі x-www-form-urlencoded
            new URLSearchParams({
                grant_type: 'client_credentials',
                // Скоуп для читання публічних оголошень та пошуку
                scope: 'https://api.ebay.com/oauth/api_scope',
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${credentials}`,
                },
            },
        );

        // Повертає чистий токен, який починається з "v^1.1#i^1#..." але є значно коротшим
        return response.data.access_token;
    } catch (error: any) {
        console.error('Помилка отримання eBay токена:', error.response?.data || error.message);
        throw new Error('Failed to generate eBay access token');
    }
};
