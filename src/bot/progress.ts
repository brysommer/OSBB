import TelegramBot from 'node-telegram-bot-api';

export class ProgressMessage {
    private messageId!: number;

    private startTime = Date.now();

    private lastUpdate = 0;

    constructor(
        private readonly bot: TelegramBot,
        private readonly chatId: number,
        private readonly title: string,
    ) {}

    async create(total: number) {
        const msg = await this.bot.sendMessage(this.chatId, this.render(0, total, 0, 0));

        this.messageId = msg.message_id;
    }

    async update(current: number, total: number, success: number, failed: number) {
        const now = Date.now();

        if (current !== total && now - this.lastUpdate < 1000) {
            return;
        }

        this.lastUpdate = now;

        try {
            await this.bot.editMessageText(this.render(current, total, success, failed), {
                chat_id: this.chatId,
                message_id: this.messageId,
            });
        } catch {
            // Telegram іноді повертає
            // "message is not modified"
        }
    }

    async finish(total: number, success: number, failed: number) {
        await this.bot.editMessageText(this.render(total, total, success, failed), {
            chat_id: this.chatId,
            message_id: this.messageId,
        });
    }

    private render(current: number, total: number, success: number, failed: number) {
        const percent = total === 0 ? 0 : Math.round((current / total) * 100);

        const filled = Math.round(percent / 10);

        const bar = '🟩'.repeat(filled) + '⬜'.repeat(10 - filled);

        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);

        return [
            `📤 ${this.title}`,
            '',
            bar,
            `${percent}%`,
            '',
            `${current} / ${total}`,
            '',
            `✅ ${success}`,
            `❌ ${failed}`,
            '',
            `⏱ ${elapsed} сек.`,
        ].join('\n');
    }
}
