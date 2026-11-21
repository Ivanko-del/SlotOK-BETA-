# SlotOK — деплой на Vercel: чекліст

Сайт — статика + Vercel Functions з `api/`, без кроку збірки. Деплой
відбувається автоматично з гілки `main`.

## 0. Перед кожним мерджем

- [ ] CI зелений (`.github/workflows/ci.yml`: синтаксис, self-check'и, тест правил на емуляторі).
- [ ] Локально: `npm run lint && npm test`.
- [ ] Якщо міняли правила — правили `scripts/build-rules.js`, а не JSON, і запустили `npm run build:rules`.
- [ ] Новий верхній вузол бази → додати в `scripts/build-rules.js`, інакше правила його закриють.
- [ ] Помітна гравцям зміна → запис у `BUILTIN_CHANGELOG` і `CURRENT_VERSION` (див. `CLAUDE.md`).

## 1. Змінні оточення (Vercel → Project → Settings → Environment Variables, Production)

| Змінна | Звідки | Обов'язкова | Що без неї |
|---|---|---|---|
| `BOT_TOKEN` | @BotFather | так (бот) | бот мовчить |
| `WEBHOOK_SECRET` | будь-який довгий випадковий рядок; той самий передати в `setWebhook` як `secret_token` | так (бот) | вебхук відповідає 401 |
| `ADMIN_SETUP_CODE` | будь-який довгий випадковий рядок | так (бот) | `/setadmin` не спрацює |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase Console → Project Settings → Service Accounts → **Generate new private key** → весь JSON одним значенням | **так (безпека)** | серверний вхід вимкнений, правила бази не можна закрити, push не працюють |

> ⚠️ `FIREBASE_SERVICE_ACCOUNT_KEY` — справжній секрет. Ніколи не вставляйте
> його в чат, у код чи в issue. Лише в Vercel env.

Публічні значення в коді (не секрети, але потребують заповнення):
- `FCM_VAPID_KEY` в `app.js` — Firebase Console → Cloud Messaging → Web Push certificates.

Заглушок для відсутніх змінних додавати не треба: кожен серверний модуль
перевіряє свою змінну й тихо вимикає функцію (`api/auth.js` відповідає 503,
`lib/fcm.js` нічого не надсилає, `lib/firebase.js` ходить без токена).

## 2. Увімкнути захист (одноразово, у такому порядку)

### Крок A — ключ сервісного акаунта
1. Додати `FIREBASE_SERVICE_ACCOUNT_KEY` (таблиця вище) і зробити Redeploy.
2. Перевірити: `curl https://slot-ok-beta.vercel.app/api/auth` → `{"serverAuth":true}`.

Що зміниться для гравців: вхід і реєстрація йдуть через сервер; усі збережені
сесії один раз попросять увійти знову (це і є закриття дірки C1). Хеші паролів
поступово переїжджають з `users/<нік>` у закритий `user_secrets/<нік>`.

> Після кроку A ключ **не можна просто прибрати**: у гравців, що вже увійшли
> через сервер, хеш пароля лежить лише в `user_secrets`, а старий вхід у
> браузері його не бачить. Якщо ключ треба замінити — додайте новий ключ, а
> потім видаліть старий у Firebase Console.

### Крок B — правила бази (`database.rules.json`) і міграція секретів
Тільки **після** кроку A (інакше бот і `api/*` втратять доступ до закритих
вузлів, а гравці не зможуть увійти). Правила одні — `database.rules.json`
(генерує `scripts/build-rules.js`); другої версії більше немає.

1. **Правила.** `npx firebase-tools login`, потім
   `npx firebase-tools deploy --only database --project nye-slotok`
   (або Firebase Console → Realtime Database → Rules → вставити вміст файлу → Publish).
2. **Міграція секретів** (ключ сервісного акаунта — файлом, не в чат і не в репозиторій):
   - `node scripts/migrate-secrets.js --key ./service-account.json` — dry-run, лише звіт;
   - `node scripts/migrate-secrets.js --key ./service-account.json --apply` — запис.
   Скрипт ідемпотентний; повторний запуск має показати «з полями для переносу: 0»
   (або лише акаунти зі списку needsReset — їм пароль скидає адмін).
3. Одразу перевірити на живому сайті (гравцем і адміном): екран входу (стрічка
   виграшів, лічильник гравців), вхід, реєстрація, «Забули пароль», ставка в 2–3
   іграх, лобі-чат з фото, ПМ, переказ гравцю, клан, PvP, лотерея, онлайн-кімната,
   заявка на донат і її підтвердження в боті, `/link` у боті, адмінка (заявки,
   звернення, бан, скидання пароля). У консолі браузера не має бути `permission_denied`.
4. Відкат, якщо щось зламалось: Firebase Console → Rules → історія → попередня
   версія. ⚠️ Попередня версія знову відкриває базу — краще виправити правило в
   `scripts/build-rules.js`, `npm run build:rules`, тест і задеплоїти ще раз.

## 3. Налаштування Vercel (одноразово)

- [ ] **Deployment Protection** (Settings → Deployment Protection) для Preview — превʼю-деплої ходять у ту саму продову базу.
- [ ] Production Branch = `main`.
- [ ] Node.js version ≥ 20 (є в `package.json` → `engines`).
- [ ] Перевірити, що `vercel.json` застосувався: `curl -sI https://slot-ok-beta.vercel.app/ | grep -i -E "strict-transport|content-security|x-content-type"`.
- [ ] Через тиждень подивитись у консолі браузера порушення `Content-Security-Policy-Report-Only`; коли їх немає — перенести потрібні директиви в enforced-заголовок.

## 4. Після деплою

- [ ] Сторінка `https://slot-ok-beta.vercel.app/no-such-page` показує власну 404.
- [ ] `https://slot-ok-beta.vercel.app/scripts/build-rules.js` → 404 (`.vercelignore` працює).
- [ ] Вхід, ставка, чат, Telegram-бот — працюють.
- [ ] Vercel → Logs: немає помилок `auth error` / `dbGet(...) failed`.

## 5. Готовність до публічного трафіку — що ще важливо

- Тарифи: Firebase RTDB Spark має ліміт 100 одночасних з'єднань і 10 ГБ/міс
  трафіку; для публічного запуску потрібен Blaze. Vercel Hobby — лише для
  некомерційного використання.
- Поки баланс рахується в браузері (SECURITY.md, C5), будь-які виводи балансу
  за межі SlotOK (прибрані; зовнішніх виводів немає) мають звірятися вручну.
- TODO (власник): переглянути юридичні тексти (умови, вікові обмеження,
  відповідальна гра, донати) — у цьому аудиті вони не змінювались.
