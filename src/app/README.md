# src/app — вихідні шматки `app.js`

`app.js` у корені **згенерований**: `npm run build:app` (`scripts/build-app.js`)
склеює ці файли в порядку номерів. Браузер, як і раніше, вантажить один
`app.js`. Правиш код — правиш тут, потім `npm run build:app` і комітиш обидва.
`npm test` (і CI) падає, якщо `app.js` не збігається з `src/app/`.

Це **не модулі**: усі файли — один спільний глобальний скрипт (`'use strict'`
стоїть лише в `01-core.js` і діє на все). Функція з будь-якого файлу видна
скрізь, а пізніше оголошення з тим самим іменем перекриває раніше — так було
й в одному файлі. Порядок важить лише для коду, що виконується одразу при
завантаженні (не всередині функцій).

Розбиття механічне — за розділами, як вони йшли в старому `app.js`, тож
дещо лежить не «за темою». Знайти функцію: `grep -n "function ім'я" src/app/*.js`.

| Файл | Що всередині (головне) |
|---|---|
| 01-core | ініціалізація, Firebase, змінні, перевірка логіну, серверний вхід/ігри (`serverPlay`, `serverRound`, `serverReward`) |
| 02-ui-admin-rights | `updateUI`, права адмінів, `notify`, `formatNumber`, `playSound`, `validateBet`, історія |
| 03-bonus-deposit-withdraw | щоденний бонус, донат/поповнення, вивід |
| 04-slots | Classic 777, Diamond Rush |
| 05-global-roulette-crash | глобальна рулетка, Crash |
| 06-videopoker-mines-plinko-balloon | колода карт, покер, Mines, Plinko, Balloon |
| 07-rr-quiz-session-settings | російська рулетка, вікторина, сесія, RTP-налаштування, шпалери |
| 08-auth-screen-horse-colorwheel | екран входу (анімації), скачки, колір-бет |
| 09-chat-affiliate-lobby | чат, `escapeHtml`/`safeUrl`/`jsArg`, партнерка, лоббі (улюблені, пошук), відповідальна гра |
| 10-auth | вхід/реєстрація |
| 11-password-recovery | відновлення пароля |
| 12-admin-panel | адмін-панель |
| 13-misc | `openGame`, модалки вкладок, перекази, промокоди, контакти, профіль (біо, аватар) |
| 14-blackjack | Blackjack (сервер + легасі) |
| 15-keno-scratch-fortune | Keno, Scratch, Колесо фортуни, Lucky streak |
| 16-home-chat | вкладки Головної, тікер виграшів, чат лобі |
| 17-changelog | **`BUILTIN_CHANGELOG`, `CURRENT_VERSION`** — сюди пишемо «Оновлення» |
| 18-news-bots | новини, боти |
| 19-features-fair-push-2fa | provably fair, ліміти, FCM push, 2FA |
| 20-big-patch-anticheat-admins | «великий патч», анти-чіт, керування адмінами |
| 21-modals-profile-tournaments | `openModal`/`closeModal`, дрібні модалки профілю, боти, адмінка (вкладки, ручні операції), публічний профіль, турніри, реферали, `switchTab` |
| 22-clans-leaderboard-monopoly | клани, лідерборд, Монополія |
| 23-vip-hourly-lootbox-quests | VIP, `addWager`, кешбек, погодинний бонус, лут-бокси, квести |
| 24-settings-notifications-mp | налаштування, сповіщення, мультиплеєр Монополія |
| 25-durak-currency-cashier-tabs | Дурень, валюти, вкладки Каси |
| 26-tower-hilo-dice-double | Tower, Hi-Lo, Dice, Double |
| 27-sports | спорт (ESPN) |
| 28-pvp-leaderboard-limbo | Coinflip/RPS/Prediction PvP, лідерборд дня/тижня, Limbo |
| 29-support-chat | підтримка (AI + адмін) |
| 30-home-achievements-stream | статистика Головної, досягнення, стріми |
| 31-slotiky-tournament-live | Слотіки, турніри, live-матч |
| 32-music-battlepass-stats | музика, **Battle Pass** (екран; таблиці — `shared/rewards.js`), особиста статистика |
| 33-bank-card | віртуальна картка, `pushCardTx`, перекази Аксіомою |
| 34-axiom-pm | Аксіома, Baccarat, відеопокер, приватні повідомлення, теми |
| 35-minigames-dragon-sicbo-cardwar | Dragon Tower, Sic Bo, Card War |
| 36-lottery-dailyspin-themes | лотерея, інвест-пул, щоденне колесо, календар, фон/акцент |
| 37-cashier-v70 | Каса v70 (3D-картка, ліміти карток) |
| 38-banners-moderation | банери, модерація |
| 39-chess | шахи |
| 40-celebration-winback-onboarding | святкування виграшу, «Ми скучили», онбординг, mystery box, стрічка друзів |
| 41-ui-confirm | `confirmAction()` — діалог підтвердження критичних дій |
| 42-game-ui | спільне поле ставки (`.bet-field`) і головна кнопка (`.game-cta`) для всіх ігор |

Таблиці нагород (VIP, Battle Pass, бонуси) — не тут, а в `shared/rewards.js`:
їх читає і браузер, і сервер.
