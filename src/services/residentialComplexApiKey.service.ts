import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';

const ENCRYPTION_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
    const value = process.env.API_KEYS_ENCRYPTION_KEY;

    if (!value) {
        throw new Error('Не задано API_KEYS_ENCRYPTION_KEY');
    }

    if (!/^[0-9a-f]{64}$/i.test(value)) {
        throw new Error('API_KEYS_ENCRYPTION_KEY має містити 64 hex-символи');
    }

    return Buffer.from(value, 'hex');
}

export function encryptApiKey(apiKey: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
        ENCRYPTION_VERSION,
        iv.toString('hex'),
        authTag.toString('hex'),
        encrypted.toString('hex'),
    ].join(':');
}

export function decryptApiKey(payload: string): string {
    const [version, ivHex, authTagHex, encryptedHex] = payload.split(':');

    if (
        version !== ENCRYPTION_VERSION ||
        !ivHex ||
        !authTagHex ||
        encryptedHex === undefined
    ) {
        throw new Error('Невідомий формат зашифрованого API-ключа');
    }

    const decipher = createDecipheriv(
        ALGORITHM,
        getEncryptionKey(),
        Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedHex, 'hex')),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

export async function getResidentialComplexDahApiKey(
    residentialComplexId: string,
): Promise<string> {
    const residentialComplex = await prisma.residentialComplex.findUnique({
        where: {
            id: residentialComplexId,
        },
        select: {
            dahApiKeyEncrypted: true,
        },
    });

    if (!residentialComplex) {
        throw new Error('Житловий комплекс не знайдено');
    }

    if (!residentialComplex.dahApiKeyEncrypted) {
        throw new Error('Для вибраного ЖК не налаштовано ключ ДАХ');
    }

    return decryptApiKey(residentialComplex.dahApiKeyEncrypted);
}

export async function setResidentialComplexDahApiKey(
    residentialComplexId: string,
    apiKey: string,
) {
    if (!apiKey.trim()) {
        throw new Error('API-ключ не може бути порожнім');
    }

    return prisma.residentialComplex.update({
        where: {
            id: residentialComplexId,
        },
        data: {
            dahApiKeyEncrypted: encryptApiKey(apiKey.trim()),
        },
        select: {
            id: true,
            name: true,
        },
    });
}
