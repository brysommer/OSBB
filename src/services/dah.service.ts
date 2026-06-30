import axios from 'axios';
import 'dotenv/config';

const api = axios.create({
    baseURL: 'https://open.api.dah-online.com/v1',
    headers: {
        Authorization: `Bearer ${process.env.DAH_API_KEY}`,
        'Content-Type': 'application/json',
    },
    timeout: 30000,
});

export interface PutReadingResult {
    success: boolean;
    message?: string;
}

export async function putReading(counterId: string, value: number): Promise<PutReadingResult> {
    try {
        await api.put(`/counter/id/${counterId}`, {
            valueZone1: value,
        });

        return {
            success: true,
        };
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            return {
                success: false,
                message: error.response?.data?.message ?? error.message,
            };
        }

        return {
            success: false,
            message: 'unknown_error',
        };
    }
}

export function getErrorText(code?: string): string {
    switch (code) {
        case 'counter_charged':
            return 'По лічильнику вже проведено нарахування';

        case 'counter_zone_1_value_invalid':
            return 'Некоректний показник';

        case 'counter_number_not_found':
            return 'Лічильник не знайдено';

        case 'counter_number_duplicates_found':
            return 'Знайдено декілька лічильників';

        case 'counter_indication_value_required':
            return 'Не передано значення';

        case 'missing_access_token':
            return 'Відсутній токен';

        case 'invalid_access_token':
            return 'Невірний токен';

        case 'access_denied':
            return 'Доступ заборонено';

        case 'access_denied_api_disabled':
            return 'API вимкнено';

        case 'argument_type_mismatch':
            return 'Невірний тип аргументу';

        default:
            return code ?? 'Невідома помилка';
    }
}
