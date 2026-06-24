import OpenAI from 'openai';
import 'dotenv/config';

const deepSeakKey = process.env.DEEP_SEEK_KEY;

const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: deepSeakKey,
});

// Функція для очищення опису від HTML-тегів (щоб економити токени DeepSeek)
function stripHtml(html: string): string {
    return html
        .replace(/<\/?[^>]+(>|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export const analyzeDescriptionWithAI = async (title: string, rawDescription: string) => {
    // 1. Готуємо текст: очищаємо HTML і обрізаємо занадто довгі мемуари продавців (беремо перші 1500 символів)
    const cleanDescription = stripHtml(rawDescription).substring(0, 1500);

    try {
        const completion = await openai.chat.completions.create({
            model: 'deepseek-chat',
            temperature: 0.1, // Низька температура для точних фактів без "фантазій"
            max_tokens: 450, // Лаконічна відповідь займає мало місця
            messages: [
                {
                    role: 'system',
                    content: `Ти — експерт-оцінювач техніки Apple. Проаналізуй Назву та Опис лоту з eBay.
Сформуй сухий звіт УКРАЇНСЬКОЮ мовою строго за шаблоном:

🤖 Аналіз ШІ:
• 📱 Екран: [стан]
• 🔋 АКБ: [стан]
• 🔒 Блокування: [стан]
• 🛠 Дефекти/Ремонт: [перелік]
• 📦 Комплект: [склад]
• 🆔 IMEI: [номер або Не вказано]

В САМОМУ КІНЦІ додай технічний рядок із вердиктом для системи:
VERDICT: [БЛОК або ПРОПУСК]
Правило для БЛОК: якщо в тексті є згадки про iCloud Lock, телефон повністю не вмикається, або екран повністю має пошкодження матриці(смуги, плями) чи неоригінальний
Правило для ПРОПУСК: телефон б/у, робочий, є дрібні дефекти (тріснуте скло, міняна батарея, подряпини, немає Face ID), але ним можна користуватися або відновити.`,
                },
                {
                    role: 'user',
                    content: `Проаналізуй цей лот:
Назва: ${title}
Опис: ${cleanDescription}`,
                },
            ],
        });

        const aiText = completion.choices[0].message?.content || '';

        // Витягуємо технічний VERDICT з тексту за допомогою регулярки
        const verdictMatch = aiText.match(/VERDICT:\s*(БЛОК|ПРОПУСК)/i);

        console.log(verdictMatch);
        const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : 'ПРОПУСК';

        // Повертаємо об'єкт із текстом та рішенням
        return {
            text: aiText,
            isTrash: verdict === 'БЛОК',
        };
    } catch (error: any) {
        console.error('[AI Error] Помилка:', error.message);
        return { text: '⚠️ Помилка аналізу ШІ.', isTrash: false };
    }
};
