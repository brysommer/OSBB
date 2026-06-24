import axios from 'axios';

// Функція для отримання опису конкретного лота
export const getItemDescription = async (itemId: string, token: string): Promise<any | null> => {
    try {
        const response = await axios.get(`https://api.ebay.com/buy/browse/v1/item/${itemId}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        // Опис зазвичай повертається в полі description (часто у форматі HTML)
        return response.data;
    } catch (error) {
        console.error(`[Error] Не вдалося отримати опис для лота ${itemId}`);
        return null;
    }
};
