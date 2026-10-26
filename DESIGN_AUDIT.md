# DESIGN_AUDIT — SlotOK, стан до редизайну

Знімок станом на v108 (жовтень 2026), гілка синхронна з `main`.
Цифри порахував скриптами по репозиторію (`grep`/`node`), не на око.
Колонка «Що стало» заповнюється по ходу редизайну.

## 1. Звідки береться вигляд

| Джерело | Де | Обсяг |
|---|---|---|
| Глобальний CSS | `style.css` | 3 870 рядків, ~930 hex-кольорів, 69 `@keyframes`, 34 `!important`, лише 10 `@media` |
| Інлайнові стилі в розмітці | `index.html` | **2 026** атрибутів `style="…"` |
| Інлайнові стилі в JS-шаблонах | `src/app/*.js` (→ `app.js`) | ~1 360 `style=` у рядках `innerHTML`, ~490 записів `el.style.*`, ~60 `cssText` |
| Ін'єкція теми | `applyThemeVars()` у `src/app/24-settings-notifications-mp.js:108` | створює `<style id="theme-override-style">` з `!important` поверх усього |
| Акцент / фон гравця | `setAccentColor()`, `applyBackground()` у `src/app/36-…`; живі шпалери `loadLiveWallpaper()` + `<canvas id="liveBgCanvas">` у `src/app/07-…` | |
| Іконки | `emoji-icons.js` замінює системні емодзі на Twemoji SVG з `/emoji/` (1 423 файли) | єдиний «стиль іконок» зараз — емодзі |
| Шрифти | Google Fonts: Orbitron + Rajdhani; Каса — `--ks-sans` (системний) | Orbitron/Rajdhani, наскільки я знаю, **без кирилиці** → українські літери падають у fallback-шрифт (перевірю на етапі 1) |
| Окрема сторінка | `404.html` — свій `<style>` | |
| PWA | `manifest.json` (`theme_color #050505`, `orientation: portrait`), `icons/`, `sw.js` | |

### Три візуальні мови одночасно (з `ROADMAP.md` §4, підтверджено в коді)
1. **`ks-*`** — Каса, Профіль, Сповіщення, Налаштування, «Ще», модалки Каси. Токени в `:root` (`style.css` ~2200).
2. **`lux-*`** — Головна (63 правила).
3. **Стара казинова** — лоббі, усі ігрові екрани, адмінка: золото `#d4af37` + чорний, Orbitron, glow, хардкод-кольори.
Місток старої мови в `ks-*` — блок «МІСТ ЗІ СТАРОЇ КАЗИНОВОЇ МОВИ…» (`style.css:3710`, клас `.ledger`).

### Теми
`THEMES` (`src/app/24-…:97`): dark, light, blue, green, red, neon, matrix, sakura. Перемикання — `.theme-dot` у Налаштуваннях і `renderThemeGrid()` (`tab-themes`). Світла тема є, але реально перефарбовує лише ~20 селекторів через `!important`; інлайнові кольори лишаються темними. `prefers-color-scheme` **не враховується**. Окремо: 26+ скінів банківської картки (`style.css` 2673–3200) — це контент, не тема інтерфейсу.

## 2. Інвентар екранів

Кожен екран — `<div id="tab-…" class="screen">` у `index.html`, перемикає `switchTab()`.
«Інлайн» = кількість `style="` у розмітці екрану (без JS-шаблонів).

### Навігація й оболонка
| Елемент | Де | Примітки |
|---|---|---|
| Сплеш `#loading-overlay` | `index.html:45` | повністю інлайновий, показує «v70» |
| Шапка `.header` | `index.html:60` | лого, пошук, баланс, Слотіки, валюта — все інлайн |
| Тікер курсів `#rateTicker` | `index.html:79` | |
| Нижня панель `.bottom-nav` | `index.html:4065` | 6 пунктів, `<div onclick>` — **не фокусуються з клавіатури**, без `aria` |
| Тости `#toast-container` | `notify()` у `src/app/02-…:197` | |
| Глобальний пошук | `openGlobalSearch()` | |

### Основні розділи
| Екран | Рядки | Інлайн | Мова |
|---|---|---|---|
| `tab-home` Головна | 83–535 | 130 | lux |
| `tab-lobby` Казино (лоббі; картки генерує JS) | 536 | 0 (+JS) | стара |
| `casinoGameModal` (картка гри перед стартом) | 539–844 | 78 | стара |
| `tab-cashier` Каса (гаманець, поповнення, вивід, картка) | 1244–1523 | 31 | ks |
| `tab-profile` Профіль | 1762–1873 | 29 | ks (ledger) |
| `tab-more` Ще | 1881–1944 | 18 | ks (ledger) |
| `tab-notifications` Сповіщення | 2183–2203 | 2 | ks (ledger) |
| `tab-settings` Налаштування (тут же **Відповідальна гра** `.rg-section`, PWA, Telegram, 2FA, ракебек) | 2204–2558 | 130 | змішана |
| `tab-contacts` Знайомі | 1874 | 5 | стара |
| `tab-chat` Чат | 4134–4189 | 28 | стара |
| `tab-pm` Приватні повідомлення | 4508–4556 | 19 | стара |
| `tab-themes` Теми | 4909 | 4 | стара |

### Прогрес, бонуси, соціальне
`tab-vip` (10), `tab-quests` (4), `tab-lootboxes` (12), `tab-hourly` (9), `tab-battlepass` (25), `tab-achievements` (5), `tab-stats` (6), `tab-slotiky` (42), `tab-tournaments` (11), `tab-leaderboard` (1), `tab-clans` (13), `tab-affiliate` (12), `tab-lottery` (20), `tab-investpool` (23), `tab-sports` (41). Модалки: `daily-bonus-modal`, `dailySpinModal`, `eventCalendarModal`, `promo-modal`, `shareWinModal`.

### Ігри (усі — стара казинова мова)
Слоти: `tab-slots` (51), `tab-diamond` (39), `tab-scratch`, `tab-chests`.
Столи/карти: `tab-roulette` (63), `tab-blackjack` (38), `tab-baccarat` (23), `tab-poker` (14), `tab-videpoker` (10), `tab-hilo` (27), `tab-cardwar` (15).
Миттєві: `tab-crash` (10), `tab-mines` (24), `tab-plinko` (9), `tab-tower` (22), `tab-dice` (23), `tab-double` (11), `tab-limbo` (36), `tab-keno`, `tab-fortune`, `tab-balloon` (21), `tab-dragon` (26), `tab-sicbo` (24), `tab-colorbet` (16), `tab-horseracing` (29), `tab-russianroulette` (16).
Скіл/міні: `tab-penalty`, `tab-bowling`, `tab-archery`, `tab-duckshoot`, `tab-quiz` (22).

### Мультиплеєр / PvP
`tab-monopoly` (16), `tab-monopoly-mp` (29), `tab-cardgame` Дурень (32), `tab-chess` (28), `tab-coinflip` (24), `tab-rps` (29), `tab-predict` (18); кімнати генерує JS (`.mp-room-card`, `.cg-room-card`).

### Вхід і акаунт
`auth-screen` (183 рядки, 39 інлайн; canvas-анімація, тікер виграшів), відновлення пароля (`src/app/11-…`, генерує JS), 2FA (`src/app/19-…`).

### Модалки
HTML (`full-modal`): `admin-support-modal`, `admin-user-manage`, `axiomLinkModal`, `axiomTransferModal`, `cardTopupModal`, `daily-bonus-modal`, `dailySpinModal`, `eventCalendarModal`, `history-modal`, `promo-modal`, `pub-profile-modal`, `shareWinModal`, `support-modal`, `transfer-modal`, `view-user-modal`; інші: `casinoGameModal` (`game-open-modal`), `cardOnboardModal`.
JS: `openModal()` (`src/app/21-…:5`, 17 викликів; класи `slotok-modal-overlay`, `slotok-fullscreen-modal`), `ks-modal` (7, Каса), `onboard-overlay` (онбординг), святкування виграшу, «Ми скучили», mystery box (`src/app/40-…`).

### Адмінка
`tab-admin` — 2761–3266, **253 інлайнові стилі** (найбільше), плюс `src/app/12-…`, `20-…`, `21-…` генерують таблиці/форми інлайном. Адаптивності майже немає.

### Окремо
`404.html` (власний стиль, золото), email-шаблонів у репозиторії не знайшов (пошта, якщо є, шлеться не звідси).

## 3. Проблеми, які редизайн має закрити

- **Доступність:** `maximum-scale=1.0` у viewport блокує зум; ~285 клікабельних не-кнопок (`<div onclick>`), у всьому `index.html` лише 2 `aria-*`; розмір шрифту змінюється через `body.style.zoom` (ламає layout і fixed-елементи).
- **Адаптивність:** 10 `@media` на весь CSS, десктоп = розтягнута мобілка (крім кількох правил ≥641/900px), `100vh` у кількох місцях, `orientation: portrait` у маніфесті.
- **Теми:** світла тема фактично не працює через інлайнові кольори; немає `prefers-color-scheme`.
- **Шрифти:** латинські display-шрифти на кириличному інтерфейсі.
- **Мертвий/дубльований CSS:** три паралельні системи кнопок/карток (`btn-gold`, `ks-btn`, `lux-*`), багато правил під класи, яких немає в розмітці — потребує окремого прогону (скрипт-звірка селекторів із `index.html` + `src/app/*.js`).

## 4. Що НЕ можна зламати (з коду, `ROADMAP.md`, `CLAUDE.md`)
- id/класи, які читає JS (усі `tab-*`, `.screen`, `.hidden`, `.nav-item`, `.bal`, id полів ставок/результатів, `.theme-dot`, `.font-size-btn`, `.settings-*` тощо) — перед зміною `grep` по `src/app/*.js`.
- `applyThemeVars`, `setAccentColor`, `applyBackground`, `loadLiveWallpaper` — мають працювати з новими токенами.
- Серверні виклики ігор (`serverPlay`/`serverRound`/`serverReward`), рендер даних із бази лише через `escapeHtml()` / `safeUrl()` / `jsArg()`.
- `app.js` збирається з `src/app/` (`npm run build:app`), `npm test` перевіряє актуальність.

## 5. Що стало
_(заповнюється по етапах)_
