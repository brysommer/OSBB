# Як зібрати APK (Спринт 4)

На цій машині розробки Android SDK може бути відсутній — збірка через **Android Studio** на ПК, де він є.

## 1. Один раз налаштувати

1. Встанови [Android Studio](https://developer.android.com/studio).
2. **File → Open** → папка `android/` репозиторію OSBB.
3. Дочекайся Gradle Sync (внизу має стати OK).
4. Скопіюй `local.properties.example` → `local.properties`.
5. У `local.properties` постав адресу сервера:

```properties
API_BASE_URL=http://IP_ТВОГО_СЕРВЕРА:8787
```

Приклади:
- телефон у тій же Wi‑Fi, що й ноут з API: `http://192.168.x.x:8787`
- прод VPS: `http://49.13.142.186:8787` (або твій домен)

## 2. Зібрати APK для телефонів

У Android Studio:

1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Обери **release** (або debug для тестів).
3. Готовий файл:

```text
android/app/build/outputs/apk/release/app-release-unsigned.apk
```

або debug:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Для внутрішнього користування достатньо **debug APK** (простіше: без підпису).  
Меню: **Build → Build APK(s)** при вибраному debug-варіанті.

Передай файл на телефон (Telegram / USB) і встанови (дозволити «встановлення з невідомих джерел»).

## 3. Сервер API

На сервері в `.env`:

```env
MOBILE_API_PORT=8787
```

Запуск:

```bash
npm run api
```

або разом з ботом:

```bash
npm run dev
```

Відкрий порт `8787` у firewall (або проксі через nginx на 443).

Перевірка:

```bash
curl http://127.0.0.1:8787/health
```

Має відповісти `{"ok":true,...}`.

## 4. Користувачі

Додаток **не створює** акаунти. Спочатку додай людину в боті (Telegram ID + UserAccess на ЖК), потім вона входить у додаток тим самим ID.
