import OpenAI from 'openai';
import {
    isValidHeatSerialNumber,
    normalizeHeatSerialNumber,
} from './heatMeterMapping.service';

export type HeatSerialOcrResult = {
    serialNumber: string;
    confidence?: number;
};

function getOpenAIClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
    }

    return new OpenAI({ apiKey });
}

export function extractHeatSerialNumber(content: string): HeatSerialOcrResult {
    let parsed: { serialNumber?: unknown; confidence?: unknown } | undefined;

    try {
        parsed = JSON.parse(content) as typeof parsed;
    } catch {
        // Fall back to extracting digits from a non-JSON model response.
    }

    const rawSerial =
        typeof parsed?.serialNumber === 'string'
            ? parsed.serialNumber
            : content.match(/\b\d[\d\s-]{2,}\d\b/)?.[0];

    if (!rawSerial) {
        throw new Error('OCR did not find a serial number');
    }

    const serialNumber = normalizeHeatSerialNumber(rawSerial);

    if (!isValidHeatSerialNumber(serialNumber)) {
        throw new Error('OCR returned an invalid serial number');
    }

    const confidence =
        typeof parsed?.confidence === 'number' &&
        parsed.confidence >= 0 &&
        parsed.confidence <= 1
            ? parsed.confidence
            : undefined;

    return { serialNumber, confidence };
}

export async function recognizeHeatSerialNumber(
    image: Buffer,
    mimeType = 'image/jpeg',
): Promise<HeatSerialOcrResult> {
    const base64 = image.toString('base64');
    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
        model: process.env.OPENAI_OCR_MODEL || 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 100,
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content:
                    'Ти розпізнаєш серійний номер теплового лічильника на фото. ' +
                    'Поверни JSON без markdown у форматі ' +
                    '{"serialNumber":"тільки цифри","confidence":0}. ' +
                    'Не вигадуй цифри. Якщо номера не видно, поверни порожній serialNumber.',
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'Розпізнай один серійний номер лічильника. Ігноруй інші цифри на фото.',
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${mimeType};base64,${base64}`,
                        },
                    },
                ],
            },
        ],
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
        throw new Error('OCR returned an empty response');
    }

    return extractHeatSerialNumber(content);
}
