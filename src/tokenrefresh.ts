import { getEbayAppToken } from './getEbayToken';

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

export const getValidToken = async () => {
    const now = Date.now();
    if (!cachedToken || now >= tokenExpiresAt - 5 * 60 * 1000) {
        cachedToken = await getEbayAppToken();
        tokenExpiresAt = now + 2 * 60 * 60 * 1000; // припускаємо 2 години
    }
    return cachedToken;
};
