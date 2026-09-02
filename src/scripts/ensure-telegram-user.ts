import 'dotenv/config';

import { ensureTelegramUser } from '../services/user.service';

async function main() {
    const [chatIdRaw, ...nameParts] = process.argv.slice(2);
    const chatId = Number(chatIdRaw);
    const name = nameParts.join(' ').trim();

    if (!Number.isSafeInteger(chatId) || !name) {
        throw new Error('Usage: npm run ensure:user -- <telegramId> <name>');
    }

    const user = await ensureTelegramUser(chatId, name);
    console.log(`OK: ${user.name} (${user.telegramId.toString()})`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
