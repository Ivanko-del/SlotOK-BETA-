# SlotOK v2 — Етап 1: план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Новий застосунок React + Vite на `/v2` (стиль C «Світлий / Ігровий») з входом, реєстрацією, відновленням пароля, скороченою головною та профілем; старий сайт на `/` працює без змін.

**Architecture:** Vite-проєкт у `web/` збирається в `v2/` (base `/v2/`). Увесь доступ до Firebase іде через інтерфейс `Db` (`lib/db.ts`), тож сервіси тестуються на in-memory підміні. Доменні константи (VIP, щоденний бонус, Battle Pass, форма нового користувача, умови) переписані в `web/src/domain/`, а vitest-тест «parity» читає `app.js` і падає, якщо вони розійшлися. Сесія спільна зі старим сайтом (`localStorage['slotok_user']`).

**Tech Stack:** React 18, react-router-dom 6, TypeScript 5, Vite 5, vitest 2 + Testing Library + jsdom, firebase 10 (модульний SDK, `firebase/database`).

**Spec:** `docs/superpowers/specs/2026-10-24-slotok-v2-stage1-design.md`

## Global Constraints

- Нікнейм: 3–20 символів, без пробілів, лише літери (включно з `іІїЇєЄґҐ`), цифри, `_`, `-` (регулярка `^[a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9_\-]+$`); пароль від 6 символів.
- Стартові бонуси: 1000 монет і 10 фріспінів; `SLOTOK` дає +500 і +5 спінів; `VIP` дає +2000.
- Хеш пароля і відповіді: лише `SlotOKPassword` з кореневого `password.js` (формат `pbkdf2$…`), відповідь хешується в нижньому регістрі.
- Ключі `localStorage`: `slotok_user` (сесія), `ref_by` (запрошувач). Firebase-проєкт `nye-slotok`, без міграцій даних.
- `/v2` лише за прямим посиланням; кнопка на старому сайті з'являється в Task 14 після підтвердження власника.
- Кожен коміт закінчується рядком `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Робота йде у гілці `claude/v2-stage1` (за `CLAUDE.md`: перед стартом `git fetch origin main`, гілка від `origin/main`). Ніколи не комітити в `main` напряму.
- Тексти для гравців українською, мовою оригіналу (повідомлення помилок копіюються зі старого `app.js` дослівно).
- Не повертаємо Twemoji-іконки з `emoji/` у v2 етапу 1: використовуємо звичайні емодзі (відкладено в ROADMAP).
- Заборонено: окремий другий changelog; нові залежності понад перелічені.

## Відхилення від спеку, знайдені під час читання коду

Спек писався до детального читання `app.js`. Ці пункти уточнюють його; власник має про них знати:

1. **Parity-перевірка живе у vitest**, а не в `scripts/selfcheck-register-parity.js`. Причина: `app.js` не є модулем, а константи v2 написані на TypeScript. Корневий `npm test` викликає `npm --prefix web test`.
2. **Сесійний захист у v2 суворіший за спек.** Старий `startDataSync` при кожному завантаженні виходить з акаунту, якщо `banned`, активне `selfExcluded`, або `site_config/maintenance` для не-адміна; v2 робить те саме (`evaluateAccess`).
3. **Умови користування (terms gate) переносимо.** Без цього свіжозареєстрований гравець одразу потрапляє на старий сайт. Поля `termsAcceptedAt` і `termsVersion` (`'1'`); «Читати повні правила» відкриває `/?open=rules` на старому сайті.
4. **Щоденний бонус — грошова логіка.** Баланс у SlotOK є проєкцією активної картки; бонус пише ще й у `cardTx` з id активної картки, додає запис в `history`, збільшує `totalGames` і `totalWins` (старий `addToHistory` робить це для будь-якого рядка з «+») і на 7-й день серії додає ще +500. Це переносимо дослівно, щоб статистика двох версій не розходилася. Гілка «30 днів → скін Titanium» у старому коді недосяжна (серія скидається на 7), її не переносимо.
5. **Баланс змінюємо через `increment`**, а не `balance = userData.balance + x`, як у старому коді: так два відкриті вікна не затирають одне одного.
6. **Джекпот на головній** беремо з реального `jackpot/amount`. Старий сайт показує випадкове число (`updateHomeStats`).
7. **Глибокі посилання на старий сайт потребують малої зміни `app.js`**: функція `handleV2Link` читає `?tab=<id>` і `?open=rules` після першого завантаження користувача (Task 9). Старий код маршрутизації за URL не має.
8. **`lastSeen` і «Ми скучили».** Вхід у v2 пише `lastSeen = now` як старий. Наслідок: гравець, що повернувся після тривалої перерви й відкрив спершу `/v2`, не побачить вітання «Ми скучили» на старому сайті. Це приймаємо; «Ми скучили» записуємо в ROADMAP як відкладене. `initTelegramLinkStatus()` старий сайт викликає сам при завантаженні (рядок 17719), v2 його не потребує.
9. **Аватар** зберігається як data-URL у `users/{нік}/avatar` (як у старому). У v2 зображення стискається до 256 px JPEG перед записом, щоб не роздувати вузол користувача.
10. **Біо профілю** — це поле `tag` (старий `updateBio` пише в `tag`), статус — поле `status`.

## Структура файлів

```
.gitignore                         + v2/, .superpowers/
package.json                       "test" викликає і web-тести
vercel.json                        + installCommand, buildCommand, outputDirectory, rewrites, кеш assets
app.js                             + handleV2Link (Task 9), + changelog (Task 14)
index.html                         + кнопка «Спробувати новий дизайн» (Task 14)
ROADMAP.md                         + розділ про v2 (Task 14)
web/
  package.json  tsconfig.json  vite.config.ts  index.html
  tests/        setup.ts  fakeDb.ts  password.test.ts  parity.test.ts
                domain.test.ts  access.test.ts  auth.test.ts  register.test.ts
                recovery.test.ts  wallet.test.ts  LoginForm.test.tsx  DailyBonusCard.test.tsx
  src/
    main.tsx  vite-env.d.ts
    lib/        db.ts  firebaseDb.ts  password.ts  format.ts  notifyBot.ts
    domain/     vip.ts  dailyBonus.ts  battlePass.ts  newUser.ts  terms.ts
                securityQuestions.ts  cards.ts
    services/   errors.ts  session.ts  access.ts  auth.ts  recovery.ts  wallet.ts  profile.ts
    design/     app.css  Button.tsx  Field.tsx  Card.tsx  ProgressBar.tsx
    app/        App.tsx  SessionProvider.tsx  Shell.tsx  BottomNav.tsx  legacy.ts
    features/
      auth/     AuthScreen.tsx  LoginForm.tsx  RegisterForm.tsx  RecoveryDialog.tsx
      terms/    TermsGate.tsx
      home/     HomeScreen.tsx  DailyBonusCard.tsx  StatsGrid.tsx  ProgressCard.tsx
                WinTicker.tsx  GameTiles.tsx
      profile/  ProfileScreen.tsx
```

---

### Task 1: Гілка і каркас web/

**Files:**
- Modify: `.gitignore`, `package.json`
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/vite-env.d.ts`, `web/tests/setup.ts`, `web/tests/smoke.test.ts`

**Interfaces:**
- Produces: команди `npm --prefix web run build|test|dev`; збірка у `v2/` з base `/v2/`.

- [ ] **Step 1: Створити гілку від актуального `main`**

```bash
cd "C:/Users/ivank/OneDrive/Робочий стіл/SlotOK-BETA-"
git fetch origin main
git checkout -b claude/v2-stage1 origin/main
```
Очікується: `Switched to a new branch 'claude/v2-stage1'`.

- [ ] **Step 2: Додати в `.gitignore`** (дописати в кінець файлу)

```
v2/
.superpowers/
web/node_modules/
```
(`node_modules/` уже є в корені, третій рядок для наочності не обов'язковий, але шкоди не робить.)

- [ ] **Step 3: Створити `web/package.json`**

```json
{
  "name": "slotok-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "preview": "vite preview"
  },
  "dependencies": {
    "firebase": "^10.14.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^20.17.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 4: Створити `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals", "@testing-library/jest-dom", "node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 5: Створити `web/vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/v2/',
  plugins: [react()],
  build: { outDir: '../v2', emptyOutDir: true },
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 6: Створити `web/index.html`**

```html
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#f6f3ff" />
    <title>SlotOK</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Створити `web/src/vite-env.d.ts`, `web/src/main.tsx`, `web/tests/setup.ts`, `web/tests/smoke.test.ts`**

`web/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`web/src/main.tsx` (тимчасова заглушка, у Task 9 замінюється):
```tsx
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(<p>SlotOK v2</p>);
```

`web/tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

// jsdom не завжди віддає crypto.subtle, а password.js без нього не працює.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
```

`web/tests/smoke.test.ts`:
```ts
describe('каркас', () => {
  it('тести запускаються', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Встановити залежності й прогнати тест і збірку**

```bash
npm --prefix web install
npm --prefix web test
npm --prefix web run build
ls v2/index.html
```
Очікується: тест `1 passed`; збірка без помилок; файл `v2/index.html` існує, а в ньому шляхи починаються з `/v2/assets/`.

- [ ] **Step 9: Підключити web-тести до кореневого `npm test`**

У кореневому `package.json` у рядку `"test"` дописати в кінець ` && npm --prefix web test`.

- [ ] **Step 10: Commit**

```bash
git add .gitignore package.json web/package.json web/tsconfig.json web/vite.config.ts web/index.html web/src web/tests docs/superpowers
git commit -m "feat(v2): каркас Vite + React + vitest у web/, спек і план етапу 1" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(`web/package-lock.json` не комітиться: у корені `.gitignore` є `package-lock.json`, патерн діє на всі рівні. Тому Vercel використовує `npm install`, не `npm ci`.)

---

### Task 2: Vercel — збірка `/v2` поруч зі статичним коренем (гейт ризику)

**Files:**
- Modify: `vercel.json`

**Interfaces:**
- Produces: на preview-деплої `/` віддає старий сайт, `/v2/` і `/v2/profile` віддають `v2/index.html`, `/v2/assets/*` віддаються як файли.

- [ ] **Step 1: Змінити `vercel.json`**

Додати зверху (після `$schema`) і в кінець `headers` так, щоб залишилися наявні правила для `/sw.js`, `/emoji/`, `/icons/`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm install && npm --prefix web install",
  "buildCommand": "npm --prefix web run build && rm -rf web/node_modules",
  "outputDirectory": ".",
  "rewrites": [
    { "source": "/v2", "destination": "/v2/index.html" },
    { "source": "/v2/(.*)", "destination": "/v2/index.html" }
  ],
  "headers": [
    {
      "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }]
    },
    {
      "source": "/emoji/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/icons/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/v2/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```
Пояснення: для пресету «Other» Vercel без `outputDirectory` шукає `public/` і падає; `.` каже віддавати корінь як є. `rm -rf web/node_modules` потрібен, щоб важкий `node_modules` не потрапив у статичний вивід. Rewrites діють лише на шляхи, яких немає як файлів, тому `/v2/assets/*` віддаються напряму.

- [ ] **Step 2: Локальна перевірка JSON і збірки**

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json ok')"
npm --prefix web run build
```
Очікується: `vercel.json ok`, збірка успішна.

- [ ] **Step 3: Commit і push гілки (потрібен дозвіл власника на push)**

```bash
git add vercel.json
git commit -m "feat(v2): збірка web/ у /v2 і rewrite для SPA" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin claude/v2-stage1
```
Запитати власника перед `git push`. Без пушу preview-деплою не буде.

- [ ] **Step 4: Перевірити preview-деплой**

Знайти preview-URL гілки (через Vercel MCP `list_deployments`/`get_deployment` або у GitHub PR). Якщо preview закритий Deployment Protection, читати через `web_fetch_vercel_url`. Перевірити:

```bash
curl -s -o /dev/null -w "%{http_code} / \n"           "$PREVIEW/"
curl -s -o /dev/null -w "%{http_code} /v2 \n"         "$PREVIEW/v2"
curl -s -o /dev/null -w "%{http_code} /v2/ \n"        "$PREVIEW/v2/"
curl -s -o /dev/null -w "%{http_code} /v2/profile \n" "$PREVIEW/v2/profile"
curl -s "$PREVIEW/" | grep -c "app.js"
curl -s "$PREVIEW/v2/profile" | grep -c "/v2/assets/"
```
Очікується: чотири рядки `200`; `grep` по `/` дає `1` або більше (старий `index.html` з `app.js`); `grep` по `/v2/profile` дає `1` або більше. Також відкрити `$PREVIEW/api/notify` через GET: має відповісти (будь-яка відповідь функції, не 404 від SPA-rewrite).

- [ ] **Step 5: Якщо деплой падає або `/` зламано**

Прочитати build-лог (`get_deployment`/`list_deployment_events`). Типові причини: перевищено ліміт файлів (тоді замінити `outputDirectory` на `public` і додати `scripts/assemble-site.js`, що копіює статику й `v2/` у `public/`, та сказати власнику) або `tsc` помилка. Не рухатись далі, поки Step 4 не зелений.

---

### Task 3: Db-інтерфейс, FakeDb, обгортка паролів

**Files:**
- Create: `web/src/lib/db.ts`, `web/src/lib/firebaseDb.ts`, `web/src/lib/password.ts`, `web/src/lib/format.ts`, `web/src/lib/notifyBot.ts`, `web/src/services/errors.ts`, `web/tests/fakeDb.ts`, `web/tests/password.test.ts`

**Interfaces:**
- Produces:
  - `interface Db { get<T=any>(path:string):Promise<T|null>; set(path:string,value:unknown):Promise<void>; update(updates:Record<string,unknown>):Promise<void>; push(path:string,value:unknown):Promise<string>; createIfAbsent(path:string,value:unknown):Promise<boolean>; increment(path:string,by:number):Promise<void>; subscribe<T=any>(path:string,cb:(v:T|null)=>void):()=>void; subscribeLast<T=any>(path:string,orderBy:string,n:number,cb:(items:T[])=>void):()=>void; adminNicks(limit:number):Promise<string[]> }`
  - `setDb(db: Db): void`, `getDb(): Db`
  - `SlotOKPassword: { hash(p:string):Promise<string>; verify(p:string,stored:unknown):Promise<{ok:boolean;needsUpgrade:boolean}>; isModern(s:unknown):boolean; ITERATIONS:number }`
  - `class UserFacingError extends Error`
  - `notifyBot(type:string,id:string|null,extra?:Record<string,unknown>):void`
  - `formatNumber(n:number):string`
  - `class FakeDb implements Db` (у тестах) з полем `data` і `reads/writes` для перевірок.

- [ ] **Step 1: Написати падаючий тест `web/tests/password.test.ts`**

```ts
import { SlotOKPassword as P } from '../src/lib/password';

describe('SlotOKPassword (обгортка над кореневим password.js)', () => {
  it('хешує у форматі pbkdf2$ і перевіряє пароль', async () => {
    const stored = await P.hash('секрет-123');
    expect(stored.startsWith('pbkdf2$')).toBe(true);
    expect((await P.verify('секрет-123', stored)).ok).toBe(true);
    expect((await P.verify('інший', stored)).ok).toBe(false);
  });

  it('приймає спадковий SHA-256 і просить оновлення', async () => {
    const legacy = await (async () => {
      const data = new TextEncoder().encode('старий');
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    })();
    const r = await P.verify('старий', legacy);
    expect(r).toEqual({ ok: true, needsUpgrade: true });
  });
});
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm --prefix web test -- password`
Expected: FAIL (модуль `../src/lib/password` не знайдено).

- [ ] **Step 3: Створити `web/src/lib/password.ts`**

```ts
// Той самий password.js, що й на старому сайті (кореневий файл), без копії.
// ?raw читає вихідний текст; UMD-обгортка бачить наш об'єкт `module` і віддає API через module.exports.
import source from '../../../password.js?raw';

export interface PasswordApi {
  hash(password: string): Promise<string>;
  verify(password: string, stored: unknown): Promise<{ ok: boolean; needsUpgrade: boolean }>;
  isModern(stored: unknown): boolean;
  ITERATIONS: number;
}

const mod: { exports: unknown } = { exports: {} };
new Function('module', 'exports', source)(mod, mod.exports);

export const SlotOKPassword = mod.exports as PasswordApi;
```

- [ ] **Step 4: Створити `web/src/lib/db.ts`**

```ts
export interface Db {
  get<T = any>(path: string): Promise<T | null>;
  set(path: string, value: unknown): Promise<void>;
  /** Багатошляховий запис від кореня; значення null видаляє вузол. */
  update(updates: Record<string, unknown>): Promise<void>;
  push(path: string, value: unknown): Promise<string>;
  /** Створює вузол лише якщо його ще немає (транзакція). true — створено. */
  createIfAbsent(path: string, value: unknown): Promise<boolean>;
  increment(path: string, by: number): Promise<void>;
  subscribe<T = any>(path: string, cb: (v: T | null) => void): () => void;
  /** Останні n дочірніх елементів, відсортованих за полем orderBy (за зростанням). */
  subscribeLast<T = any>(path: string, orderBy: string, n: number, cb: (items: T[]) => void): () => void;
  /** Ніки перших limit акаунтів з isAdmin === true. */
  adminNicks(limit: number): Promise<string[]>;
}

let current: Db | null = null;

export function setDb(db: Db): void {
  current = db;
}

export function getDb(): Db {
  if (!current) throw new Error('Db не ініціалізовано');
  return current;
}
```

- [ ] **Step 5: Створити `web/src/lib/firebaseDb.ts`**

```ts
import { getApps, initializeApp } from 'firebase/app';
import {
  equalTo, get, getDatabase, increment, limitToFirst, limitToLast, onValue,
  orderByChild, push, query, ref, runTransaction, set, update,
} from 'firebase/database';
import type { Db } from './db';

// Публічний клієнтський конфіг того самого проєкту, що й у app.js.
const firebaseConfig = {
  apiKey: 'AIzaSyBQelUmnWpgdjV_Y22GBjjZZPxUb85PUuI',
  authDomain: 'nye-slotok.firebaseapp.com',
  databaseURL: 'https://nye-slotok-default-rtdb.firebaseio.com',
  projectId: 'nye-slotok',
  storageBucket: 'nye-slotok.firebasestorage.app',
  messagingSenderId: '436174740835',
  appId: '1:436174740835:web:b70e8467396e9f983ac756',
};

export function createFirebaseDb(): Db {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const d = getDatabase(app);

  return {
    async get(path) {
      const snap = await get(ref(d, path));
      return snap.exists() ? snap.val() : null;
    },
    async set(path, value) {
      await set(ref(d, path), value);
    },
    async update(updates) {
      await update(ref(d), updates);
    },
    async push(path, value) {
      const r = push(ref(d, path));
      await set(r, value);
      return r.key as string;
    },
    async createIfAbsent(path, value) {
      const res = await runTransaction(ref(d, path), (cur) => (cur === null ? (value as any) : undefined));
      return res.committed;
    },
    async increment(path, by) {
      await set(ref(d, path), increment(by));
    },
    subscribe(path, cb) {
      return onValue(ref(d, path), (snap) => cb(snap.exists() ? snap.val() : null));
    },
    subscribeLast(path, orderBy, n, cb) {
      const q = query(ref(d, path), orderByChild(orderBy), limitToLast(n));
      return onValue(q, (snap) => {
        const items: any[] = [];
        snap.forEach((child) => {
          items.push(child.val());
        });
        cb(items);
      });
    },
    async adminNicks(limit) {
      const q = query(ref(d, 'users'), orderByChild('isAdmin'), equalTo(true), limitToFirst(limit));
      const snap = await get(q);
      return Object.keys(snap.val() ?? {});
    },
  };
}
```
Примітка: `set(ref, increment(by))` дає серверне збільшення, як `ServerValue.increment` у старому коді.

- [ ] **Step 6: Створити `web/src/services/errors.ts`, `web/src/lib/format.ts`, `web/src/lib/notifyBot.ts`**

`errors.ts`:
```ts
/** Помилка з текстом, який можна показати гравцеві як є. */
export class UserFacingError extends Error {}
```

`format.ts`:
```ts
const nf = new Intl.NumberFormat('uk-UA');

export function formatNumber(n: number): string {
  return nf.format(Math.round(n));
}
```

`notifyBot.ts`:
```ts
/** Сповіщення Telegram-боту через серверну функцію; помилки мовчки ігноруємо, як у старому notifyBot. */
export function notifyBot(type: string, id: string | null, extra?: Record<string, unknown>): void {
  try {
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id, ...extra }),
    }).catch(() => {});
  } catch {
    /* нічого */
  }
}
```

- [ ] **Step 7: Створити `web/tests/fakeDb.ts`**

```ts
import type { Db } from '../src/lib/db';

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const split = (p: string) => p.split('/').filter(Boolean);

/** In-memory підміна Firebase з тією самою семантикою, що й Db. */
export class FakeDb implements Db {
  data: Record<string, any> = {};
  /** Усі шляхи, записані через set/update/push/increment/createIfAbsent (для перевірок у тестах). */
  writes: string[] = [];
  private seq = 0;
  private listeners: Array<() => void> = [];

  read(path: string): any {
    let node: any = this.data;
    for (const k of split(path)) {
      if (node === null || typeof node !== 'object' || !(k in node)) return null;
      node = node[k];
    }
    return node === undefined ? null : clone(node);
  }

  private write(path: string, value: unknown): void {
    const keys = split(path);
    let node: any = this.data;
    for (const k of keys.slice(0, -1)) {
      if (node[k] === null || typeof node[k] !== 'object') node[k] = {};
      node = node[k];
    }
    const last = keys[keys.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = clone(value);
    this.writes.push(path);
  }

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }

  async get<T = any>(path: string): Promise<T | null> {
    return this.read(path);
  }
  async set(path: string, value: unknown): Promise<void> {
    this.write(path, value);
    this.emit();
  }
  async update(updates: Record<string, unknown>): Promise<void> {
    for (const [p, v] of Object.entries(updates)) this.write(p, v);
    this.emit();
  }
  async push(path: string, value: unknown): Promise<string> {
    const key = '-k' + String(++this.seq).padStart(6, '0');
    this.write(`${path}/${key}`, value);
    this.emit();
    return key;
  }
  async createIfAbsent(path: string, value: unknown): Promise<boolean> {
    if (this.read(path) !== null) return false;
    this.write(path, value);
    this.emit();
    return true;
  }
  async increment(path: string, by: number): Promise<void> {
    this.write(path, (this.read(path) ?? 0) + by);
    this.emit();
  }
  subscribe<T = any>(path: string, cb: (v: T | null) => void): () => void {
    const run = () => cb(this.read(path));
    this.listeners.push(run);
    run();
    return () => {
      this.listeners = this.listeners.filter((l) => l !== run);
    };
  }
  subscribeLast<T = any>(path: string, orderBy: string, n: number, cb: (items: T[]) => void): () => void {
    const run = () => {
      const node = this.read(path) ?? {};
      const items = Object.values(node) as any[];
      items.sort((a, b) => (a?.[orderBy] ?? 0) - (b?.[orderBy] ?? 0));
      cb(items.slice(-n) as T[]);
    };
    this.listeners.push(run);
    run();
    return () => {
      this.listeners = this.listeners.filter((l) => l !== run);
    };
  }
  async adminNicks(limit: number): Promise<string[]> {
    const users = this.read('users') ?? {};
    return Object.keys(users).filter((k) => users[k]?.isAdmin === true).slice(0, limit);
  }
}
```

- [ ] **Step 8: Запустити тести**

Run: `npm --prefix web test -- password`
Expected: PASS, 2 тести. Якщо падає з `crypto.subtle` — перевірити `tests/setup.ts`; якщо з імпортом `?raw` — перевірити, що `src/vite-env.d.ts` існує.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib web/src/services/errors.ts web/tests/fakeDb.ts web/tests/password.test.ts
git commit -m "feat(v2): інтерфейс Db, FakeDb і обгортка password.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Доменні константи та parity-тест

**Files:**
- Create: `web/src/domain/vip.ts`, `dailyBonus.ts`, `battlePass.ts`, `newUser.ts`, `terms.ts`, `securityQuestions.ts`, `cards.ts`, `web/tests/domain.test.ts`, `web/tests/parity.test.ts`

**Interfaces:**
- Produces:
  - `VIP_LEVELS: {name:string; icon:string; min:number; dailyMult:number}[]` (14 рівнів), `getVipLevel(wagered:number): {name:string; icon:string; min:number; dailyMult:number; index:number}`, `vipProgress(wagered:number): {level: ReturnType<typeof getVipLevel>; pct:number}`
  - `DAILY_BONUSES: readonly number[]`, `DAY_MS: number`, `canClaimDaily(last: number|undefined, now:number): boolean`, `dailyBonusPreview(user:{dailyStreak?:number; totalWagered?:number}): {day:number; base:number; amount:number; mult:number; newStreak:number; streakBonus:number}`, `msUntilNextDaily(last:number|undefined, now:number): number`
  - `BP_XP_PER_LEVEL`, `BP_SEASON_EPOCH`, `BP_SEASON_DAYS`, `getBpSeasonNum(now:number):number`, `getBpProgress(user:{bpSeason?:number; bpXP?:number; bpLevel?:number}, now:number): {level:number; pct:number}`
  - `NEW_USER_KEYS: string[]`, `buildNewUser(i): {user:Record<string,unknown>; bonus:number; spins:number; bonusMsg:string}`
  - `TERMS_VERSION: string`, `TERMS_CHECKS: {k:string; text:string}[]`
  - `SECURITY_QUESTIONS: Record<string,string>`
  - `activeCardId(user): string|null`

- [ ] **Step 1: Створити `web/src/domain/vip.ts`**

```ts
// Дзеркало VIP_LEVELS з app.js. Розбіжність виловлює tests/parity.test.ts.
export interface VipLevel {
  name: string;
  icon: string;
  min: number;
  dailyMult: number;
}

export const VIP_LEVELS: VipLevel[] = [
  { name: 'Iron', icon: '⚙️', min: 0, dailyMult: 1.0 },
  { name: 'Bronze', icon: '🥉', min: 1000, dailyMult: 1.0 },
  { name: 'Silver', icon: '🥈', min: 5000, dailyMult: 1.1 },
  { name: 'Gold', icon: '🥇', min: 20000, dailyMult: 1.25 },
  { name: 'Emerald', icon: '💚', min: 60000, dailyMult: 1.4 },
  { name: 'Sapphire', icon: '💙', min: 150000, dailyMult: 1.6 },
  { name: 'Ruby', icon: '❤️', min: 350000, dailyMult: 1.75 },
  { name: 'Platinum', icon: '💎', min: 700000, dailyMult: 1.9 },
  { name: 'Master', icon: '🔮', min: 1500000, dailyMult: 2.0 },
  { name: 'Elite', icon: '⭐', min: 3000000, dailyMult: 2.2 },
  { name: 'Diamond', icon: '💠', min: 7000000, dailyMult: 2.5 },
  { name: 'Legend', icon: '🌟', min: 15000000, dailyMult: 3.0 },
  { name: 'Mythic', icon: '🔱', min: 35000000, dailyMult: 3.5 },
  { name: 'Supreme', icon: '👑', min: 100000000, dailyMult: 5.0 },
];

export function getVipLevel(wagered: number): VipLevel & { index: number } {
  for (let i = VIP_LEVELS.length - 1; i >= 0; i--) {
    if (wagered >= VIP_LEVELS[i].min) return { ...VIP_LEVELS[i], index: i };
  }
  return { ...VIP_LEVELS[0], index: 0 };
}

/** Відсоток шляху до наступного рівня (як renderHomeProgressBars у app.js). */
export function vipProgress(wagered: number): { level: ReturnType<typeof getVipLevel>; pct: number } {
  const level = getVipLevel(wagered);
  const hasNext = level.index < VIP_LEVELS.length - 1;
  const next = VIP_LEVELS[Math.min(level.index + 1, VIP_LEVELS.length - 1)];
  const pct = hasNext
    ? Math.min(100, Math.round(((wagered - level.min) / (next.min - level.min || 1)) * 100))
    : 100;
  return { level, pct };
}
```

- [ ] **Step 2: Створити `web/src/domain/dailyBonus.ts`**

```ts
import { getVipLevel } from './vip';

export const DAILY_BONUSES = [100, 150, 200, 300, 500, 750, 1000] as const;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function canClaimDaily(last: number | undefined, now: number): boolean {
  return now - (last || 0) >= DAY_MS;
}

export function msUntilNextDaily(last: number | undefined, now: number): number {
  return Math.max(0, DAY_MS - (now - (last || 0)));
}

export interface DailyPreview {
  day: number;
  base: number;
  mult: number;
  amount: number;
  newStreak: number;
  streakBonus: number;
}

/** Рівно та сама арифметика, що в openDailyBonus/claimDailyBonus/checkStreakBonus у app.js. */
export function dailyBonusPreview(user: { dailyStreak?: number; totalWagered?: number }): DailyPreview {
  const streak = user.dailyStreak || 0;
  const day = streak + 1;
  const base = DAILY_BONUSES[Math.min(streak, 6)];
  const mult = getVipLevel(user.totalWagered || 0).dailyMult;
  return {
    day,
    base,
    mult,
    amount: Math.floor(base * mult),
    newStreak: day >= 7 ? 0 : day,
    streakBonus: day === 7 ? 500 : 0,
  };
}
```

- [ ] **Step 3: Створити `web/src/domain/battlePass.ts`**

```ts
export const BP_XP_PER_LEVEL = 1000;
export const BP_SEASON_EPOCH = Date.UTC(2026, 0, 1);
export const BP_SEASON_DAYS = 30;

export function getBpSeasonNum(now: number): number {
  return Math.floor((now - BP_SEASON_EPOCH) / (BP_SEASON_DAYS * 86400000)) + 1;
}

/** Як getBpData + renderHomeProgressBars: дані минулого сезону вважаються нульовими. */
export function getBpProgress(
  user: { bpSeason?: number; bpXP?: number; bpLevel?: number },
  now: number,
): { level: number; pct: number } {
  const stale = user.bpSeason != null && user.bpSeason !== getBpSeasonNum(now);
  const xp = stale ? 0 : user.bpXP || 0;
  const level = stale ? 0 : user.bpLevel || 0;
  return { level, pct: Math.min(100, Math.round(((xp % BP_XP_PER_LEVEL) / BP_XP_PER_LEVEL) * 100)) };
}
```

- [ ] **Step 4: Створити `web/src/domain/terms.ts`, `securityQuestions.ts`, `cards.ts`**

`terms.ts`:
```ts
export const TERMS_VERSION = '1';

export const TERMS_CHECKS = [
  { k: 'age', text: 'Мені виповнилось 14 років' },
  { k: 'noHack', text: 'Я не лізтиму в консоль, не змінюватиму код сайту й не намагатимусь його зламати' },
  { k: 'read', text: 'Я прочитав правила й погоджуюсь із ними' },
];

export function hasAcceptedTerms(user: { termsAcceptedAt?: number; termsVersion?: unknown } | null): boolean {
  return !!(user && user.termsAcceptedAt && String(user.termsVersion) === TERMS_VERSION);
}
```

`securityQuestions.ts`:
```ts
export const SECURITY_QUESTIONS: Record<string, string> = {
  pet: 'Кличка вашого першого улюбленця?',
  city: 'Місто, де ви народились?',
  school: 'Назва вашої школи?',
  friend: "Ім'я найкращого друга дитинства?",
  book: 'Улюблена книга/фільм?',
};
```

`cards.ts`:
```ts
/** Дзеркало _activeCardIdOf з app.js: id картки, що зараз «тримає» баланс. */
export function activeCardId(user: any): string | null {
  const ids: string[] = [];
  if (user?.virtualCard?.axiomLinked) ids.push('axiom');
  if (user?.linkedCards) ids.push(...Object.keys(user.linkedCards));
  if (!ids.length) return null;
  const a = user?.activeCardId;
  return a && ids.includes(a) ? a : ids[0];
}
```

- [ ] **Step 5: Створити `web/src/domain/newUser.ts`**

```ts
export const START_COINS = 1000;
export const START_SPINS = 10;

export const PROMOS: Record<string, { coins: number; spins: number; msg: string }> = {
  SLOTOK: { coins: 500, spins: 5, msg: ' +500₴ промокод!' },
  VIP: { coins: 2000, spins: 0, msg: ' +2000₴ VIP!' },
};

/** Поля, які старий authRegister кладе в users/{нік}; usedPromo і referredBy додаються за потреби. */
export const NEW_USER_KEYS = [
  'pass', 'email', 'securityQuestion', 'securityAnswerHash', 'balance', 'freeSlots', 'id', 'tag', 'avatar',
  'dailyStreak', 'luckyGamesLeft', 'luckyGamesUsed', 'registeredAt', 'lastSeen',
  'totalGames', 'totalWins', 'totalWagered', 'slotsPlayed',
];

export interface NewUserInput {
  passHash: string;
  secAnswerHash: string;
  email: string;
  secQuestion: string;
  promo: string;
  refBy: string | null;
  nick: string;
  now: number;
  rand: () => number;
}

export function buildNewUser(i: NewUserInput) {
  let bonus = START_COINS;
  let spins = START_SPINS;
  let bonusMsg = '';
  const promo = PROMOS[i.promo];
  if (promo) {
    bonus += promo.coins;
    spins += promo.spins;
    bonusMsg = promo.msg;
  }
  const user: Record<string, unknown> = {
    pass: i.passHash,
    email: i.email || '',
    securityQuestion: i.secQuestion,
    securityAnswerHash: i.secAnswerHash,
    balance: bonus,
    freeSlots: spins,
    id: Math.floor(i.rand() * 900000) + 100000,
    tag: 'Новачок 🌱',
    avatar: '👤',
    dailyStreak: 0,
    luckyGamesLeft: 3,
    luckyGamesUsed: 0,
    registeredAt: i.now,
    lastSeen: i.now,
    totalGames: 0,
    totalWins: 0,
    totalWagered: 0,
    slotsPlayed: 0,
  };
  if (i.promo) user.usedPromo = i.promo;
  if (i.refBy && i.refBy !== i.nick) user.referredBy = i.refBy;
  return { user, bonus, spins, bonusMsg };
}
```

- [ ] **Step 6: Написати `web/tests/domain.test.ts`**

```ts
import { DAILY_BONUSES, canClaimDaily, dailyBonusPreview, DAY_MS } from '../src/domain/dailyBonus';
import { getBpProgress, getBpSeasonNum } from '../src/domain/battlePass';
import { buildNewUser, NEW_USER_KEYS } from '../src/domain/newUser';
import { activeCardId } from '../src/domain/cards';
import { getVipLevel, vipProgress } from '../src/domain/vip';

describe('щоденний бонус', () => {
  it('день 1 без VIP: 100', () => {
    expect(dailyBonusPreview({})).toMatchObject({ day: 1, base: 100, amount: 100, newStreak: 1, streakBonus: 0 });
  });
  it('множник Silver 1.1 округлюється вниз', () => {
    expect(dailyBonusPreview({ totalWagered: 5000 }).amount).toBe(110);
  });
  it('день 7: 1000 + 500 бонус серії, серія скидається', () => {
    expect(dailyBonusPreview({ dailyStreak: 6 })).toMatchObject({ day: 7, base: 1000, newStreak: 0, streakBonus: 500 });
  });
  it('серія понад 6 не виходить за таблицю', () => {
    expect(dailyBonusPreview({ dailyStreak: 40 }).base).toBe(DAILY_BONUSES[6]);
  });
  it('доступність: рівно через добу', () => {
    expect(canClaimDaily(1000, 1000 + DAY_MS - 1)).toBe(false);
    expect(canClaimDaily(1000, 1000 + DAY_MS)).toBe(true);
    expect(canClaimDaily(undefined, DAY_MS)).toBe(true);
  });
});

describe('VIP', () => {
  it('рівень за оборотом', () => {
    expect(getVipLevel(0).name).toBe('Iron');
    expect(getVipLevel(5000).name).toBe('Silver');
    expect(getVipLevel(10 ** 9).name).toBe('Supreme');
  });
  it('відсоток до наступного рівня', () => {
    expect(vipProgress(3000).pct).toBe(50); // Bronze 1000 → Silver 5000
    expect(vipProgress(10 ** 9).pct).toBe(100);
  });
});

describe('Battle Pass', () => {
  const now = Date.UTC(2026, 0, 1);
  it('сезон 1 на початку епохи', () => expect(getBpSeasonNum(now)).toBe(1));
  it('прогрес поточного сезону', () => {
    expect(getBpProgress({ bpSeason: 1, bpXP: 2500, bpLevel: 2 }, now)).toEqual({ level: 2, pct: 50 });
  });
  it('минулий сезон обнуляється', () => {
    expect(getBpProgress({ bpSeason: 0, bpXP: 2500, bpLevel: 2 }, now)).toEqual({ level: 0, pct: 0 });
  });
});

describe('новий користувач', () => {
  const base = { passHash: 'p', secAnswerHash: 's', email: '', secQuestion: 'pet', nick: 'Ivan', now: 5, rand: () => 0 };
  it('має рівно очікувані ключі', () => {
    const { user } = buildNewUser({ ...base, promo: '', refBy: null });
    expect(Object.keys(user).sort()).toEqual([...NEW_USER_KEYS].sort());
  });
  it('промокоди', () => {
    expect(buildNewUser({ ...base, promo: 'SLOTOK', refBy: null })).toMatchObject({ bonus: 1500, spins: 15 });
    expect(buildNewUser({ ...base, promo: 'VIP', refBy: null })).toMatchObject({ bonus: 3000, spins: 10 });
  });
  it('невідомий промокод лишається в usedPromo, але бонусу не дає', () => {
    const r = buildNewUser({ ...base, promo: 'ХХХ', refBy: null });
    expect(r.bonus).toBe(1000);
    expect(r.user.usedPromo).toBe('ХХХ');
  });
  it('запрошувач не може бути самим собою', () => {
    expect(buildNewUser({ ...base, promo: '', refBy: 'Ivan' }).user.referredBy).toBeUndefined();
    expect(buildNewUser({ ...base, promo: '', refBy: 'Petro' }).user.referredBy).toBe('Petro');
  });
});

describe('активна картка', () => {
  it('нема карток → null', () => expect(activeCardId({})).toBeNull());
  it('перша зі списку, якщо activeCardId недійсний', () => {
    expect(activeCardId({ linkedCards: { a: {}, b: {} }, activeCardId: 'zzz' })).toBe('a');
  });
  it('Аксіома має пріоритет у списку', () => {
    expect(activeCardId({ virtualCard: { axiomLinked: true }, linkedCards: { a: {} } })).toBe('axiom');
  });
  it('поважає activeCardId', () => {
    expect(activeCardId({ linkedCards: { a: {}, b: {} }, activeCardId: 'b' })).toBe('b');
  });
});
```

- [ ] **Step 7: Написати `web/tests/parity.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BP_SEASON_DAYS, BP_SEASON_EPOCH, BP_XP_PER_LEVEL } from '../src/domain/battlePass';
import { DAILY_BONUSES } from '../src/domain/dailyBonus';
import { NEW_USER_KEYS } from '../src/domain/newUser';
import { SECURITY_QUESTIONS } from '../src/domain/securityQuestions';
import { TERMS_CHECKS, TERMS_VERSION } from '../src/domain/terms';
import { VIP_LEVELS } from '../src/domain/vip';

// app.js — не модуль, тож читаємо його як текст і порівнюємо константи.
// Якщо тут падає — хтось змінив правила в app.js (або тут) і друга версія розійшлася.
const app = readFileSync(resolve(__dirname, '../../app.js'), 'utf8');

function literal(re: RegExp): any {
  const m = app.match(re);
  if (!m) throw new Error('Не знайдено в app.js: ' + re);
  return new Function('return ' + m[1])();
}

describe('parity з app.js', () => {
  it('VIP_LEVELS: назва, поріг, множник бонусу', () => {
    const legacy = literal(/const VIP_LEVELS = (\[[\s\S]*?\n\]);/);
    const pick = (l: any) => ({ name: l.name, min: l.min, dailyMult: l.dailyMult });
    expect(VIP_LEVELS.map(pick)).toEqual(legacy.map(pick));
  });

  it('DAILY_BONUSES', () => {
    expect([...DAILY_BONUSES]).toEqual(literal(/const DAILY_BONUSES = (\[[^\]]*\]);/));
  });

  it('арифметика щоденного бонусу', () => {
    expect(app).toMatch(/DAILY_BONUSES\[Math\.min\(streak, 6\)\]/);
    expect(app).toMatch(/const newStreak = streak >= 7 \? 0 : streak;/);
    expect(app).toMatch(/Math\.floor\(amount \* vip\.dailyMult\)/);
    expect(app).toMatch(/streak === 7\) \{[\s\S]*?increment\(500\)/);
  });

  it('Battle Pass', () => {
    expect(BP_XP_PER_LEVEL).toBe(Number(app.match(/const BP_XP_PER_LEVEL = (\d+)/)![1]));
    expect(BP_SEASON_EPOCH).toBe(literal(/const BP_SEASON_EPOCH = (Date\.UTC\([^)]*\));/));
    expect(BP_SEASON_DAYS).toBe(Number(app.match(/const BP_SEASON_DAYS\s*=\s*(\d+)/)![1]));
  });

  it('контрольні питання', () => {
    expect(SECURITY_QUESTIONS).toEqual(literal(/const SECURITY_QUESTIONS = (\{[\s\S]*?\n\});/));
  });

  it('умови користування', () => {
    expect(TERMS_VERSION).toBe(app.match(/var TERMS_VERSION = '(\d+)'/)![1]);
    expect(TERMS_CHECKS).toEqual(literal(/var TERMS_CHECKS = (\[[\s\S]*?\n\]);/));
  });

  it('форма нового користувача', () => {
    const body = app.match(/const newUser = \{([\s\S]*?)\n    \};/)![1];
    const keys = [...body.matchAll(/\b([A-Za-z]\w*):/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual([...NEW_USER_KEYS].sort());
  });

  it('стартові бонуси і промокоди', () => {
    expect(app).toMatch(/let bonus = 1000, spins = 10/);
    expect(app).toMatch(/promo === 'SLOTOK'\) \{ bonus \+= 500; spins \+= 5;/);
    expect(app).toMatch(/promo === 'VIP'\) \{ bonus \+= 2000;/);
  });
});
```

- [ ] **Step 8: Запустити**

Run: `npm --prefix web test -- domain parity`
Expected: PASS. Якщо падає `parity` на регулярці — відкрити відповідне місце в `app.js` і підправити регулярку так, щоб вона відповідала фактичному тексту; якщо падає на значеннях — виправити значення у `web/src/domain/*` за `app.js`, а не навпаки.

- [ ] **Step 9: Commit**

```bash
git add web/src/domain web/tests/domain.test.ts web/tests/parity.test.ts
git commit -m "feat(v2): доменні константи й parity-тест з app.js" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Сесія, правила доступу, вхід

**Files:**
- Create: `web/src/services/session.ts`, `web/src/services/access.ts`, `web/src/services/auth.ts` (частина: `login`, `acceptTerms`), `web/tests/access.test.ts`, `web/tests/auth.test.ts`

**Interfaces:**
- Consumes: `Db`/`getDb`, `SlotOKPassword`, `UserFacingError`, `hasAcceptedTerms`, `TERMS_VERSION`.
- Produces:
  - `SESSION_KEY='slotok_user'`, `REF_KEY='ref_by'`; `getSession():string|null`, `setSession(nick:string):void`, `clearSession():void`, `captureRef(search:string, hasSession:boolean):void`, `takeRef():string|null`, `clearRef():void`
  - `type UserRecord = Record<string, any>`; `type Verdict = {ok:true; clearSelfExclusion:boolean} | {ok:false; kind:'missing'|'banned'|'selfExcluded'|'maintenance'; message:string}`; `isAdminAccount(nick:string,user:UserRecord|null):boolean`; `evaluateAccess(nick:string,user:UserRecord|null,maintenance:boolean,now:number):Verdict`
  - `login(nickRaw:string, pass:string, now?:number):Promise<string>` (повертає нік); `acceptTerms(nick:string, now?:number):Promise<void>`; `NICK_PATH_RE`

- [ ] **Step 1: Створити `web/src/services/session.ts`**

```ts
export const SESSION_KEY = 'slotok_user';
const LEGACY_SESSION_KEY = 'royal_online_user';
export const REF_KEY = 'ref_by';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function getSession(): string | null {
  return safe(() => {
    let nick = localStorage.getItem(SESSION_KEY);
    if (!nick) {
      const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
      if (legacy) {
        nick = legacy;
        localStorage.setItem(SESSION_KEY, legacy);
      }
    }
    localStorage.removeItem(LEGACY_SESSION_KEY);
    return nick;
  }, null);
}

export function setSession(nick: string): void {
  safe(() => localStorage.setItem(SESSION_KEY, nick), undefined);
}

export function clearSession(): void {
  safe(() => localStorage.removeItem(SESSION_KEY), undefined);
}

/** Як checkRefParam у app.js: запам'ятовуємо запрошувача лише для гостя й лише безпечне ім'я. */
export function captureRef(search: string, hasSession: boolean): void {
  const ref = new URLSearchParams(search).get('ref');
  if (ref && !hasSession && /^[^.#$\[\]\/]{1,40}$/.test(ref)) {
    safe(() => localStorage.setItem(REF_KEY, ref), undefined);
  }
}

export function takeRef(): string | null {
  return safe(() => localStorage.getItem(REF_KEY), null);
}

export function clearRef(): void {
  safe(() => localStorage.removeItem(REF_KEY), undefined);
}
```

- [ ] **Step 2: Написати падаючий тест `web/tests/access.test.ts`**

```ts
import { evaluateAccess, isAdminAccount } from '../src/services/access';

const now = 1_000_000;

describe('evaluateAccess', () => {
  it('немає запису → missing', () => {
    expect(evaluateAccess('a', null, false, now)).toMatchObject({ ok: false, kind: 'missing' });
  });
  it('бан з причиною', () => {
    const v = evaluateAccess('a', { banned: true, banReason: 'чіти' }, false, now);
    expect(v).toMatchObject({ ok: false, kind: 'banned' });
    expect((v as any).message).toContain('чіти');
  });
  it('активне самовиключення: показує скільки годин лишилось', () => {
    const v = evaluateAccess('a', { selfExcluded: true, selfExcludeUntil: now + 3 * 3600000 }, false, now);
    expect(v).toMatchObject({ ok: false, kind: 'selfExcluded' });
    expect((v as any).message).toContain('3 год');
  });
  it('закінчене самовиключення пропускає і просить зняти прапорець', () => {
    expect(evaluateAccess('a', { selfExcluded: true, selfExcludeUntil: now - 1 }, false, now)).toEqual({
      ok: true,
      clearSelfExclusion: true,
    });
  });
  it('самовиключення без дати знімається, як у старому (блок лише за майбутньою датою)', () => {
    expect(evaluateAccess('a', { selfExcluded: true }, false, now)).toEqual({ ok: true, clearSelfExclusion: true });
  });
  it('техобслуговування блокує звичайного гравця, але не адміна', () => {
    expect(evaluateAccess('a', {}, true, now)).toMatchObject({ ok: false, kind: 'maintenance' });
    expect(evaluateAccess('a', { isAdmin: true }, true, now)).toMatchObject({ ok: true });
    expect(evaluateAccess('TheIvankoo', {}, true, now)).toMatchObject({ ok: true });
  });
  it('isAdminAccount', () => {
    expect(isAdminAccount('theivankoo', {})).toBe(true);
    expect(isAdminAccount('x', { isAdmin: true })).toBe(true);
    expect(isAdminAccount('x', {})).toBe(false);
  });
});
```
- [ ] **Step 3: Запустити — має впасти**

Run: `npm --prefix web test -- access`
Expected: FAIL (модуль не знайдено).

- [ ] **Step 4: Створити `web/src/services/access.ts`**

```ts
export type UserRecord = Record<string, any>;

export type Verdict =
  | { ok: true; clearSelfExclusion: boolean }
  | { ok: false; kind: 'missing' | 'banned' | 'selfExcluded' | 'maintenance'; message: string };

export function isAdminAccount(nick: string, user: UserRecord | null): boolean {
  return nick.toLowerCase() === 'theivankoo' || user?.isAdmin === true;
}

/** Ті самі перевірки, що робить startDataSync у app.js при кожному завантаженні сесії. */
export function evaluateAccess(nick: string, user: UserRecord | null, maintenance: boolean, now: number): Verdict {
  if (!user) return { ok: false, kind: 'missing', message: 'Акаунт не знайдено' };
  if (user.banned) {
    return {
      ok: false,
      kind: 'banned',
      message: 'ВАШ АКАУНТ ЗАБЛОКОВАНО!' + (user.banReason ? '\nПричина: ' + user.banReason : ''),
    };
  }
  let clearSelfExclusion = false;
  if (user.selfExcluded) {
    if (user.selfExcludeUntil && user.selfExcludeUntil > now) {
      const hrsLeft = Math.ceil((user.selfExcludeUntil - now) / 3600000);
      return {
        ok: false,
        kind: 'selfExcluded',
        message: '🚫 Ви увімкнули само-виключення. Залишилось: ' + hrsLeft + ' год.',
      };
    }
    clearSelfExclusion = true;
  }
  if (maintenance && !isAdminAccount(nick, user)) {
    return {
      ok: false,
      kind: 'maintenance',
      message: '🚧 Сайт зараз на технічному обслуговуванні. Зайдіть пізніше.',
    };
  }
  return { ok: true, clearSelfExclusion };
}
```

- [ ] **Step 5: Запустити**

Run: `npm --prefix web test -- access`
Expected: PASS, 7 тестів.

- [ ] **Step 6: Написати падаючий тест `web/tests/auth.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { setDb } from '../src/lib/db';
import { SlotOKPassword } from '../src/lib/password';
import { acceptTerms, login } from '../src/services/auth';
import { SESSION_KEY } from '../src/services/session';
import { FakeDb } from './fakeDb';

let db: FakeDb;

beforeEach(() => {
  db = new FakeDb();
  setDb(db);
  localStorage.clear();
});

async function seed(nick: string, pass: string, extra: Record<string, unknown> = {}) {
  db.data.users = { ...(db.data.users ?? {}), [nick]: { pass: await SlotOKPassword.hash(pass), balance: 5, ...extra } };
}

describe('login', () => {
  it('порожні поля', async () => {
    await expect(login('', 'x')).rejects.toThrow('Введіть нікнейм');
    await expect(login('Ivan', '')).rejects.toThrow('Введіть пароль');
  });

  it('невідомий гравець', async () => {
    await expect(login('Nobody', 'x')).rejects.toThrow('❌ Гравця "Nobody" не знайдено');
  });

  it('нік зі шляховими символами не читає вкладені вузли', async () => {
    await seed('Ivan', 'secret1');
    await expect(login('Ivan/pass', 'x')).rejects.toThrow('не знайдено');
  });

  it('бан із причиною', async () => {
    await seed('Ivan', 'secret1', { banned: true, banReason: 'чіти' });
    await expect(login('Ivan', 'secret1')).rejects.toThrow('🚫 Акаунт заблоковано: чіти');
  });

  it('невірний пароль', async () => {
    await seed('Ivan', 'secret1');
    await expect(login('Ivan', 'wrong')).rejects.toThrow('❌ Невірний пароль');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('успіх: сесія і lastSeen', async () => {
    await seed('Ivan', 'secret1');
    const nick = await login('Ivan', 'secret1', 777);
    expect(nick).toBe('Ivan');
    expect(localStorage.getItem(SESSION_KEY)).toBe('Ivan');
    expect(db.read('users/Ivan/lastSeen')).toBe(777);
  });

  it('спадковий SHA-256 пароль входить і мовчки оновлюється до pbkdf2', async () => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('old-pass'));
    const sha = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    db.data.users = { Ivan: { pass: sha } };
    await login('Ivan', 'old-pass');
    expect(db.read('users/Ivan/pass').startsWith('pbkdf2$')).toBe(true);
  });

  it('техобслуговування: блокує гравця, пропускає адміна', async () => {
    await seed('Ivan', 'secret1');
    await seed('Boss', 'secret1', { isAdmin: true });
    db.data.site_config = { maintenance: true };
    await expect(login('Ivan', 'secret1')).rejects.toThrow('технічному обслуговуванні');
    await expect(login('Boss', 'secret1')).resolves.toBe('Boss');
  });
});

describe('acceptTerms', () => {
  it('пише termsAcceptedAt і termsVersion', async () => {
    db.data.users = { Ivan: {} };
    await acceptTerms('Ivan', 42);
    expect(db.read('users/Ivan/termsAcceptedAt')).toBe(42);
    expect(db.read('users/Ivan/termsVersion')).toBe('1');
  });
});
```

- [ ] **Step 7: Запустити — має впасти**

Run: `npm --prefix web test -- auth.test`
Expected: FAIL (модуль `services/auth` не знайдено).

- [ ] **Step 8: Створити `web/src/services/auth.ts`** (поки лише `login` і `acceptTerms`; `register` додається в Task 6)

```ts
import { getDb } from '../lib/db';
import { SlotOKPassword } from '../lib/password';
import { TERMS_VERSION } from '../domain/terms';
import { isAdminAccount } from './access';
import { UserFacingError } from './errors';
import { setSession } from './session';

/** Firebase-ключі не можуть містити . # $ [ ] / — інакше нік перетворився б на шлях. */
export const NICK_PATH_RE = /^[^.#$\[\]\/]+$/;

export async function login(nickRaw: string, pass: string, now: number = Date.now()): Promise<string> {
  const n = nickRaw.trim();
  if (!n) throw new UserFacingError('Введіть нікнейм');
  if (!pass) throw new UserFacingError('Введіть пароль');

  const notFound = new UserFacingError('❌ Гравця "' + n + '" не знайдено');
  if (!NICK_PATH_RE.test(n)) throw notFound;

  const db = getDb();
  const data = await db.get<Record<string, any>>('users/' + n);
  if (!data) throw notFound;
  if (data.banned) {
    throw new UserFacingError('🚫 Акаунт заблоковано' + (data.banReason ? ': ' + data.banReason : ''));
  }

  const check = await SlotOKPassword.verify(pass, data.pass);
  if (!check.ok) throw new UserFacingError('❌ Невірний пароль');
  if (check.needsUpgrade) {
    try {
      await db.set('users/' + n + '/pass', await SlotOKPassword.hash(pass));
    } catch (e) {
      console.warn(e);
    }
  }

  const maintenance = await db.get('site_config/maintenance');
  if (maintenance && !isAdminAccount(n, data)) {
    throw new UserFacingError('🚧 Сайт тимчасово на технічному обслуговуванні. Спробуй пізніше.');
  }

  setSession(n);
  await db.update({ ['users/' + n + '/lastSeen']: now });
  return n;
}

export async function acceptTerms(nick: string, now: number = Date.now()): Promise<void> {
  await getDb().update({
    ['users/' + nick + '/termsAcceptedAt']: now,
    ['users/' + nick + '/termsVersion']: TERMS_VERSION,
  });
}
```

- [ ] **Step 9: Запустити**

Run: `npm --prefix web test -- auth.test access`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add web/src/services web/tests/access.test.ts web/tests/auth.test.ts
git commit -m "feat(v2): сесія, правила доступу і вхід" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Реєстрація

**Files:**
- Modify: `web/src/services/auth.ts`
- Create: `web/tests/register.test.ts`

**Interfaces:**
- Consumes: `buildNewUser`, `SECURITY_QUESTIONS`, `takeRef`, `clearRef`, `setSession`, `NICK_PATH_RE`.
- Produces: `interface RegisterInput {nick:string; pass:string; email:string; promo:string; secQuestion:string; secAnswer:string}`; `interface RegisterResult {nick:string; bonus:number; spins:number; bonusMsg:string}`; `register(input:RegisterInput, now?:number, rand?:()=>number): Promise<RegisterResult>`.

- [ ] **Step 1: Написати падаючий тест `web/tests/register.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { setDb } from '../src/lib/db';
import { SlotOKPassword } from '../src/lib/password';
import { register, type RegisterInput } from '../src/services/auth';
import { REF_KEY, SESSION_KEY } from '../src/services/session';
import { FakeDb } from './fakeDb';

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  setDb(db);
  localStorage.clear();
});

const ok: RegisterInput = {
  nick: 'Ivan', pass: 'secret1', email: '', promo: '', secQuestion: 'pet', secAnswer: 'Барсик',
};

describe('валідація (тексти зі старого authRegister)', () => {
  const cases: Array<[Partial<RegisterInput>, string]> = [
    [{ nick: '' }, 'Введіть нікнейм'],
    [{ nick: 'ab' }, 'Нікнейм мінімум 3 символи'],
    [{ nick: 'a'.repeat(21) }, 'Нікнейм максимум 20 символів'],
    [{ nick: 'a b c' }, 'Нікнейм не може містити пробіли'],
    [{ nick: 'a.b.c' }, 'Нікнейм може містити лише літери, цифри, "_" та "-"'],
    [{ pass: '' }, 'Введіть пароль'],
    [{ pass: '12345' }, 'Пароль мінімум 6 символів'],
    [{ secAnswer: '  ' }, 'Введіть відповідь на контрольне питання (потрібна для відновлення пароля)'],
    [{ secQuestion: '' }, 'Оберіть контрольне питання'],
  ];
  it.each(cases)('%j → %s', async (patch, msg) => {
    await expect(register({ ...ok, ...patch })).rejects.toThrow(msg);
    expect(db.data.users).toBeUndefined();
  });

  it('дозволяє українські літери', async () => {
    await expect(register({ ...ok, nick: 'Їжак_Єгор-1' })).resolves.toMatchObject({ nick: 'Їжак_Єгор-1' });
  });
});

describe('успішна реєстрація', () => {
  it('пише користувача з хешами, бонусами і сесією', async () => {
    const r = await register(ok, 1234, () => 0);
    expect(r).toEqual({ nick: 'Ivan', bonus: 1000, spins: 10, bonusMsg: '' });
    const u = db.read('users/Ivan');
    expect(u).toMatchObject({ balance: 1000, freeSlots: 10, id: 100000, registeredAt: 1234, tag: 'Новачок 🌱' });
    expect((await SlotOKPassword.verify('secret1', u.pass)).ok).toBe(true);
    expect((await SlotOKPassword.verify('барсик', u.securityAnswerHash)).ok).toBe(true); // нижній регістр
    expect(localStorage.getItem(SESSION_KEY)).toBe('Ivan');
  });

  it('промокод SLOTOK', async () => {
    const r = await register({ ...ok, promo: 'slotok' });
    expect(r).toMatchObject({ bonus: 1500, spins: 15 });
    expect(db.read('users/Ivan/usedPromo')).toBe('SLOTOK');
  });

  it('запис в history про реєстрацію', async () => {
    await register(ok);
    const hist = Object.values(db.read('users/Ivan/history') as Record<string, any>);
    expect(hist[0].text).toBe('🎉 Реєстрація! Бонус: +1000₴');
  });

  it('зайнятий нік не перезаписує акаунт', async () => {
    db.data.users = { Ivan: { balance: 999 } };
    await expect(register(ok)).rejects.toThrow('❌ Нікнейм "Ivan" вже зайнятий');
    expect(db.read('users/Ivan/balance')).toBe(999);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('два одночасні запити з одним ніком: створюється лише один', async () => {
    const results = await Promise.allSettled([register(ok), register({ ...ok, pass: 'another1' })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('реферали', () => {
  it('referredBy, лічильник запрошувача, очищення ref_by', async () => {
    db.data.users = { Petro: { referrals: 2 } };
    localStorage.setItem(REF_KEY, 'Petro');
    await register(ok);
    expect(db.read('users/Ivan/referredBy')).toBe('Petro');
    expect(db.read('users/Petro/referrals')).toBe(3);
    expect(localStorage.getItem(REF_KEY)).toBeNull();
  });

  it('без ref_by реферала немає', async () => {
    await register(ok);
    expect(db.read('users/Ivan/referredBy')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm --prefix web test -- register`
Expected: FAIL (`register` не експортується).

- [ ] **Step 3: Додати в `web/src/services/auth.ts`** (імпорти нагорі файлу + функція внизу)

Додати до імпортів:
```ts
import { buildNewUser } from '../domain/newUser';
import { SECURITY_QUESTIONS } from '../domain/securityQuestions';
import { clearRef, takeRef } from './session';
```
(рядок `import { setSession } from './session';` замінити на `import { clearRef, setSession, takeRef } from './session';`, окремий третій імпорт не додавати.)

Додати в кінець файлу:
```ts
export interface RegisterInput {
  nick: string;
  pass: string;
  email: string;
  promo: string;
  secQuestion: string;
  secAnswer: string;
}

export interface RegisterResult {
  nick: string;
  bonus: number;
  spins: number;
  bonusMsg: string;
}

export async function register(
  input: RegisterInput,
  now: number = Date.now(),
  rand: () => number = Math.random,
): Promise<RegisterResult> {
  const n = input.nick.trim();
  const email = input.email.trim();
  const promo = input.promo.trim().toUpperCase();
  const secA = input.secAnswer.trim();

  if (!n) throw new UserFacingError('Введіть нікнейм');
  if (n.length < 3) throw new UserFacingError('Нікнейм мінімум 3 символи');
  if (n.length > 20) throw new UserFacingError('Нікнейм максимум 20 символів');
  if (n.includes(' ')) throw new UserFacingError('Нікнейм не може містити пробіли');
  if (!/^[a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9_\-]+$/.test(n)) {
    throw new UserFacingError('Нікнейм може містити лише літери, цифри, "_" та "-"');
  }
  if (!input.pass) throw new UserFacingError('Введіть пароль');
  if (input.pass.length < 6) throw new UserFacingError('Пароль мінімум 6 символів');
  if (!(input.secQuestion in SECURITY_QUESTIONS)) throw new UserFacingError('Оберіть контрольне питання');
  if (!secA) {
    throw new UserFacingError('Введіть відповідь на контрольне питання (потрібна для відновлення пароля)');
  }

  const secAnswerHash = await SlotOKPassword.hash(secA.toLowerCase());
  const passHash = await SlotOKPassword.hash(input.pass);

  const { user, bonus, spins, bonusMsg } = buildNewUser({
    passHash, secAnswerHash, email, secQuestion: input.secQuestion, promo,
    refBy: takeRef(), nick: n, now, rand,
  });

  const db = getDb();
  // Транзакція замість «перевірити, потім записати»: два одночасні запити з одним ніком не затруть один одного.
  const created = await db.createIfAbsent('users/' + n, user);
  if (!created) throw new UserFacingError('❌ Нікнейм "' + n + '" вже зайнятий');

  setSession(n);
  clearRef();
  try {
    await db.push('users/' + n + '/history', { text: '🎉 Реєстрація! Бонус: +' + bonus + '₴', date: now });
    if (user.referredBy) await db.increment('users/' + user.referredBy + '/referrals', 1);
  } catch (e) {
    console.warn(e);
  }
  return { nick: n, bonus, spins, bonusMsg };
}
```

- [ ] **Step 4: Запустити**

Run: `npm --prefix web test -- register`
Expected: PASS (усі кейси). Якщо «два одночасні запити» дає два успіхи — перевірити, що `createIfAbsent` у `FakeDb` перевіряє й записує синхронно в одному тіку (так і написано).

- [ ] **Step 5: Commit**

```bash
git add web/src/services/auth.ts web/tests/register.test.ts
git commit -m "feat(v2): реєстрація 1:1 зі старою + транзакційне створення акаунта" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Відновлення пароля

**Files:**
- Create: `web/src/services/recovery.ts`, `web/tests/recovery.test.ts`

**Interfaces:**
- Consumes: `getDb`, `SlotOKPassword`, `NICK_PATH_RE`, `notifyBot`, `UserFacingError`.
- Produces: `TG_BOT_USERNAME='SlotOK_DepositBot'`; `type LookupResult = {kind:'question'; question:string} | {kind:'telegram'}`; `lookup(nick:string):Promise<LookupResult>`; `resetWithAnswer(nick:string, answer:string, p1:string, p2:string):Promise<void>`; `requestViaTelegram(nick:string, now?:number, notify?:typeof notifyBot):Promise<string>` (повертає URL бота).

- [ ] **Step 1: Написати падаючий тест `web/tests/recovery.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '../src/lib/db';
import { SlotOKPassword } from '../src/lib/password';
import { lookup, requestViaTelegram, resetWithAnswer } from '../src/services/recovery';
import { FakeDb } from './fakeDb';

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  setDb(db);
});

describe('lookup', () => {
  it('невідомий гравець', async () => {
    await expect(lookup('Nobody')).rejects.toThrow('Гравця не знайдено');
  });
  it('є питання → question', async () => {
    db.data.users = { Ivan: { securityQuestion: 'pet', securityAnswerHash: 'x' } };
    expect(await lookup('Ivan')).toEqual({ kind: 'question', question: 'pet' });
  });
  it('немає питання → telegram', async () => {
    db.data.users = { Ivan: {} };
    expect(await lookup('Ivan')).toEqual({ kind: 'telegram' });
  });
});

describe('resetWithAnswer', () => {
  async function seed() {
    db.data.users = {
      Ivan: { pass: 'old', securityQuestion: 'pet', securityAnswerHash: await SlotOKPassword.hash('барсик') },
    };
  }
  it('перевіряє поля', async () => {
    await seed();
    await expect(resetWithAnswer('Ivan', '', 'newpass1', 'newpass1')).rejects.toThrow('Введіть відповідь');
    await expect(resetWithAnswer('Ivan', 'барсик', '123', '123')).rejects.toThrow('Пароль мінімум 6 символів');
    await expect(resetWithAnswer('Ivan', 'барсик', 'newpass1', 'other')).rejects.toThrow('Паролі не збігаються');
  });
  it('невірна відповідь не змінює пароль', async () => {
    await seed();
    await expect(resetWithAnswer('Ivan', 'Рекс', 'newpass1', 'newpass1')).rejects.toThrow('Невірна відповідь');
    expect(db.read('users/Ivan/pass')).toBe('old');
  });
  it('вірна відповідь (регістр неважливий) міняє пароль', async () => {
    await seed();
    await resetWithAnswer('Ivan', '  БАРСИК ', 'newpass1', 'newpass1');
    expect((await SlotOKPassword.verify('newpass1', db.read('users/Ivan/pass'))).ok).toBe(true);
  });
});

describe('requestViaTelegram', () => {
  it('створює заявку, сповіщує бота й адмінів, повертає посилання', async () => {
    db.data.users = {
      theivankoo: { pmUnread: 0 },
      Admin2: { isAdmin: true, pmUnread: 4 },
      Ivan: {},
    };
    const notify = vi.fn();
    const url = await requestViaTelegram('Ivan', 99, notify);

    const reqs = db.read('password_reset_requests') as Record<string, any>;
    const [reqId, req] = Object.entries(reqs)[0];
    expect(reqId).toBe('Ivan_99');
    expect(req).toEqual({ user: 'Ivan', status: 'pending', time: 99 });
    expect(notify).toHaveBeenCalledWith('reset', 'Ivan_99');

    expect(Object.values(db.read('pm/theivankoo') as any)[0]).toMatchObject({ from: '📥 Система', to: 'theivankoo' });
    expect(Object.values(db.read('pm/Admin2') as any)[0]).toMatchObject({ to: 'Admin2' });
    expect(db.read('users/theivankoo/pmUnread')).toBe(1);
    expect(db.read('users/Admin2/pmUnread')).toBe(5);
    expect(url).toBe('https://t.me/SlotOK_DepositBot?start=reset_Ivan');
  });
});
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm --prefix web test -- recovery`
Expected: FAIL (модуль не знайдено).

- [ ] **Step 3: Створити `web/src/services/recovery.ts`**

```ts
import { getDb } from '../lib/db';
import { notifyBot } from '../lib/notifyBot';
import { SlotOKPassword } from '../lib/password';
import { NICK_PATH_RE } from './auth';
import { UserFacingError } from './errors';

export const TG_BOT_USERNAME = 'SlotOK_DepositBot';

export type LookupResult = { kind: 'question'; question: string } | { kind: 'telegram' };

function assertNick(nick: string): void {
  if (!nick) throw new UserFacingError('Введіть нікнейм');
  if (!NICK_PATH_RE.test(nick)) throw new UserFacingError('Гравця не знайдено');
}

export async function lookup(nickRaw: string): Promise<LookupResult> {
  const nick = nickRaw.trim();
  assertNick(nick);
  const data = await getDb().get<Record<string, any>>('users/' + nick);
  if (!data) throw new UserFacingError('Гравця не знайдено');
  if (data.securityQuestion && data.securityAnswerHash) return { kind: 'question', question: data.securityQuestion };
  return { kind: 'telegram' };
}

export async function resetWithAnswer(nick: string, answer: string, p1: string, p2: string): Promise<void> {
  assertNick(nick);
  const a = answer.trim();
  if (!a) throw new UserFacingError('Введіть відповідь');
  if (p1.length < 6) throw new UserFacingError('Пароль мінімум 6 символів');
  if (p1 !== p2) throw new UserFacingError('Паролі не збігаються');

  const db = getDb();
  const stored = await db.get('users/' + nick + '/securityAnswerHash');
  const check = await SlotOKPassword.verify(a.toLowerCase(), stored);
  if (!check.ok) throw new UserFacingError('Невірна відповідь');

  const updates: Record<string, unknown> = { ['users/' + nick + '/pass']: await SlotOKPassword.hash(p1) };
  // Відповідь у старому форматі (голий SHA-256) переїжджає на PBKDF2 разом зі зміною пароля.
  if (check.needsUpgrade) updates['users/' + nick + '/securityAnswerHash'] = await SlotOKPassword.hash(a.toLowerCase());
  await db.update(updates);
}

export async function requestViaTelegram(
  nick: string,
  now: number = Date.now(),
  notify: typeof notifyBot = notifyBot,
): Promise<string> {
  assertNick(nick);
  const db = getDb();
  const reqId = nick + '_' + now;
  await db.set('password_reset_requests/' + reqId, { user: nick, status: 'pending', time: now });
  notify('reset', reqId);

  const sys = (to: string, text: string) => db.push('pm/' + to, { from: '📥 Система', to, text, ts: now });
  await sys(
    'theivankoo',
    `🔑 Заявка на відновлення пароля від @${nick}. Перевірте особу через Telegram і скиньте пароль в адмін-панелі.`,
  );
  await db.increment('users/theivankoo/pmUnread', 1);

  for (const adm of await db.adminNicks(5)) {
    if (adm === 'theivankoo') continue;
    await sys(adm, `🔑 Заявка на відновлення пароля від @${nick}`);
    await db.increment('users/' + adm + '/pmUnread', 1);
  }
  return `https://t.me/${TG_BOT_USERNAME}?start=reset_${nick}`;
}
```
Циклічного імпорту немає: `auth.ts` не імпортує `recovery.ts`.

- [ ] **Step 4: Запустити**

Run: `npm --prefix web test -- recovery`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/services/recovery.ts web/tests/recovery.test.ts
git commit -m "feat(v2): відновлення пароля (питання і заявка через Telegram)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Гаманець, щоденний бонус, профіль

**Files:**
- Create: `web/src/services/wallet.ts`, `web/src/services/profile.ts`, `web/tests/wallet.test.ts`

**Interfaces:**
- Consumes: `getDb`, `dailyBonusPreview`, `canClaimDaily`, `activeCardId`, `UserFacingError`.
- Produces:
  - `subscribeUser(nick:string, cb:(u:UserRecord|null)=>void):()=>void`
  - `claimDaily(nick:string, now?:number): Promise<{amount:number; day:number; streakBonus:number; mult:number}>`
  - `interface WinFeedItem {user:string; amount:number; game?:string; time:number}`; `subscribeWinFeed(cb:(items:WinFeedItem[])=>void):()=>void` (найновіші першими, до 8); `subscribeJackpot(cb:(n:number)=>void):()=>void`
  - `STATUSES: {value:string; label:string}[]`; `setStatus(nick,value)`, `setTag(nick,text)`, `setAvatar(nick,dataUrl)`; `downscaleImage(file:File, max?:number):Promise<string>` (лише браузер)

- [ ] **Step 1: Написати падаючий тест `web/tests/wallet.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { DAY_MS } from '../src/domain/dailyBonus';
import { setDb } from '../src/lib/db';
import { claimDaily, subscribeWinFeed } from '../src/services/wallet';
import { FakeDb } from './fakeDb';

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  setDb(db);
});

describe('claimDaily', () => {
  it('день 1: +100, серія 1, lastDailyBonus, історія, статистика', async () => {
    db.data.users = { Ivan: { balance: 50, totalGames: 3, totalWins: 1 } };
    const r = await claimDaily('Ivan', 5000);
    expect(r).toMatchObject({ amount: 100, day: 1, streakBonus: 0 });
    expect(db.read('users/Ivan')).toMatchObject({
      balance: 150, dailyStreak: 1, lastDailyBonus: 5000, totalGames: 4, totalWins: 2,
    });
    const hist = Object.values(db.read('users/Ivan/history') as any)[0] as any;
    expect(hist).toEqual({ text: 'Daily Bonus: +100', date: 5000 });
  });

  it('пише cardTx без cardId, якщо карток немає', async () => {
    db.data.users = { Ivan: { balance: 0 } };
    await claimDaily('Ivan', 5000);
    const tx = Object.values(db.read('users/Ivan/cardTx') as any)[0] as any;
    expect(tx).toEqual({ dir: 'in', amount: 100, title: 'Щоденний бонус', subtitle: 'День 1 серії', icon: '🎁', ts: 5000 });
  });

  it('пише cardTx з id активної картки', async () => {
    db.data.users = { Ivan: { balance: 0, linkedCards: { c1: {}, c2: {} }, activeCardId: 'c2' } };
    await claimDaily('Ivan', 5000);
    const tx = Object.values(db.read('users/Ivan/cardTx') as any)[0] as any;
    expect(tx.cardId).toBe('c2');
  });

  it('множник VIP', async () => {
    db.data.users = { Ivan: { balance: 0, totalWagered: 5000 } };
    expect((await claimDaily('Ivan', 5000)).amount).toBe(110);
    expect(db.read('users/Ivan/balance')).toBe(110);
  });

  it('день 7: 1000 + 500, серія скидається в 0; у cardTx лише 1000', async () => {
    db.data.users = { Ivan: { balance: 0, dailyStreak: 6 } };
    const r = await claimDaily('Ivan', 5000);
    expect(r).toMatchObject({ amount: 1000, day: 7, streakBonus: 500 });
    expect(db.read('users/Ivan/balance')).toBe(1500);
    expect(db.read('users/Ivan/dailyStreak')).toBe(0);
    const tx = Object.values(db.read('users/Ivan/cardTx') as any)[0] as any;
    expect(tx.amount).toBe(1000);
  });

  it('повторний клік у межах доби відхиляється і нічого не міняє', async () => {
    db.data.users = { Ivan: { balance: 0 } };
    await claimDaily('Ivan', 5000);
    await expect(claimDaily('Ivan', 5000 + DAY_MS - 1)).rejects.toThrow('Бонус вже забрано');
    expect(db.read('users/Ivan/balance')).toBe(100);
  });

  it('через добу можна знову', async () => {
    db.data.users = { Ivan: { balance: 0 } };
    await claimDaily('Ivan', 5000);
    await expect(claimDaily('Ivan', 5000 + DAY_MS)).resolves.toMatchObject({ amount: 150, day: 2 });
  });

  it('невідомий акаунт', async () => {
    await expect(claimDaily('Nobody', 1)).rejects.toThrow('Акаунт не знайдено');
  });
});

describe('subscribeWinFeed', () => {
  it('віддає найновіші першими', () => {
    db.data.win_feed = {
      a: { user: 'A', amount: 10, time: 1 },
      b: { user: 'B', amount: 20, time: 3 },
      c: { user: 'C', amount: 30, time: 2 },
    };
    let got: any[] = [];
    subscribeWinFeed((items) => (got = items));
    expect(got.map((i) => i.user)).toEqual(['B', 'C', 'A']);
  });
});
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm --prefix web test -- wallet`
Expected: FAIL (модуль не знайдено).

- [ ] **Step 3: Створити `web/src/services/wallet.ts`**

```ts
import { activeCardId } from '../domain/cards';
import { canClaimDaily, dailyBonusPreview } from '../domain/dailyBonus';
import { getDb } from '../lib/db';
import type { UserRecord } from './access';
import { UserFacingError } from './errors';

export function subscribeUser(nick: string, cb: (u: UserRecord | null) => void): () => void {
  return getDb().subscribe<UserRecord>('users/' + nick, cb);
}

export interface ClaimResult {
  amount: number;
  day: number;
  streakBonus: number;
  mult: number;
}

/**
 * Дзеркало claimDailyBonus + checkStreakBonus + addToHistory зі старого app.js.
 * Увага: старий addToHistory для будь-якого тексту з «+» збільшує totalGames і totalWins —
 * повторюємо, щоб статистика двох версій не розходилася.
 */
export async function claimDaily(nick: string, now: number = Date.now()): Promise<ClaimResult> {
  const db = getDb();
  const base = 'users/' + nick;
  const user = await db.get<UserRecord>(base);
  if (!user) throw new UserFacingError('Акаунт не знайдено');
  if (!canClaimDaily(user.lastDailyBonus, now)) throw new UserFacingError('Бонус вже забрано, зачекай до завтра');

  const p = dailyBonusPreview(user);
  await db.update({ [base + '/lastDailyBonus']: now, [base + '/dailyStreak']: p.newStreak });
  await db.increment(base + '/balance', p.amount + p.streakBonus);

  const tx: Record<string, unknown> = {
    dir: 'in', amount: p.amount, title: 'Щоденний бонус', subtitle: 'День ' + p.day + ' серії', icon: '🎁', ts: now,
  };
  const cardId = activeCardId(user);
  if (cardId) tx.cardId = cardId;
  await db.push(base + '/cardTx', tx);
  await db.push(base + '/history', { text: 'Daily Bonus: +' + p.amount, date: now });
  await db.increment(base + '/totalGames', 1);
  await db.increment(base + '/totalWins', 1);

  return { amount: p.amount, day: p.day, streakBonus: p.streakBonus, mult: p.mult };
}

export interface WinFeedItem {
  user: string;
  amount: number;
  game?: string;
  time: number;
}

export function subscribeWinFeed(cb: (items: WinFeedItem[]) => void): () => void {
  return getDb().subscribeLast<WinFeedItem>('win_feed', 'time', 8, (items) =>
    cb([...items].sort((a, b) => b.time - a.time)),
  );
}

export function subscribeJackpot(cb: (n: number) => void): () => void {
  return getDb().subscribe<number>('jackpot/amount', (v) => cb(typeof v === 'number' ? v : 0));
}
```

- [ ] **Step 4: Створити `web/src/services/profile.ts`**

```ts
import { getDb } from '../lib/db';

export const STATUSES = [
  { value: 'online', label: '🟢 В грі' },
  { value: 'afk', label: '💤 АФК' },
  { value: 'looking', label: '🎯 Шукаю суперника' },
  { value: 'streamer', label: '📺 Стрімлю' },
];

export function setStatus(nick: string, value: string): Promise<void> {
  return getDb().set('users/' + nick + '/status', value);
}

/** «Біо» у профілі — це поле tag (так робить старий updateBio). */
export function setTag(nick: string, text: string): Promise<void> {
  return getDb().set('users/' + nick + '/tag', text.trim().slice(0, 60));
}

export function setAvatar(nick: string, dataUrl: string): Promise<void> {
  return getDb().set('users/' + nick + '/avatar', dataUrl);
}

/** Стискає зображення до max×max JPEG, щоб не роздувати вузол користувача (лише в браузері). */
export function downscaleImage(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не вдалося прочитати зображення'));
    };
    img.src = url;
  });
}
```

- [ ] **Step 5: Запустити**

Run: `npm --prefix web test -- wallet`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/services/wallet.ts web/src/services/profile.ts web/tests/wallet.test.ts
git commit -m "feat(v2): щоденний бонус з урахуванням активної картки, профільні сервіси" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Дизайн-система стилю C і міст зі старим сайтом

**Files:**
- Create: `web/src/design/app.css`, `Button.tsx`, `Field.tsx`, `Card.tsx`, `ProgressBar.tsx`, `web/src/app/legacy.ts`
- Modify: `app.js` (функція `handleV2Link` і виклик)

**Interfaces:**
- Produces:
  - `Button({variant?: 'primary'|'accent'|'quiet', block?: boolean, ...button props})`
  - `Field({label: string, error?: string, ...input props})`, `SelectField({label, children, ...select props})`
  - `Card({tone?: 'plain'|'accent', children, className?})`
  - `ProgressBar({pct: number, label?: string})`
  - `legacyUrl(tab: string): string` → `'/?tab=' + tab`; `LEGACY_GAMES: {id:string; title:string; emoji:string}[]`

- [ ] **Step 1: Створити `web/src/design/app.css`**

```css
:root {
  --bg: #f6f3ff;
  --fg: #241a4d;
  --fg-soft: #6b6393;
  --surface: #ffffff;
  --primary: #6d28d9;
  --primary-ink: #ffffff;
  --accent: #fbbf24;
  --accent-ink: #241a4d;
  --good: #16a34a;
  --bad: #dc2626;
  --line: #e6e0f7;
  --r-sm: 12px;
  --r: 16px;
  --r-lg: 20px;
  --shadow: 0 3px 8px rgba(109, 40, 217, 0.13);
  --nav-h: 76px;
  --gutter: 16px;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--fg);
  background: var(--bg);
}

* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; background: var(--bg); }
body { color: var(--fg); -webkit-tap-highlight-color: transparent; }
a { color: inherit; text-decoration: none; }
h1, h2, h3 { margin: 0; }

.page { max-width: 560px; margin: 0 auto; padding: var(--gutter) var(--gutter) calc(var(--nav-h) + 24px); }
.stack { display: grid; gap: 12px; }
.row { display: flex; align-items: center; gap: 8px; }
.row.between { justify-content: space-between; }
.muted { color: var(--fg-soft); font-size: 13px; }
.center { text-align: center; }

.topbar { display: flex; align-items: center; justify-content: space-between; padding: 4px 0 12px; }
.logo { font-weight: 900; font-size: 20px; color: var(--primary); }
.coin { background: var(--surface); border-radius: 999px; padding: 6px 12px; font-weight: 800; box-shadow: var(--shadow); }

.card { background: var(--surface); border-radius: var(--r-lg); padding: 16px; box-shadow: var(--shadow); }
.card.accent { background: var(--accent); color: var(--accent-ink); }
.card h2 { font-size: 15px; }
.big { font-size: 26px; font-weight: 900; }

.btn { border: 0; border-radius: var(--r-sm); padding: 12px 18px; font: inherit; font-weight: 800; cursor: pointer;
  background: var(--primary); color: var(--primary-ink); min-height: 44px; }
.btn.accent { background: var(--fg); color: #fff; }
.btn.quiet { background: transparent; color: var(--primary); box-shadow: inset 0 0 0 2px var(--line); }
.btn.block { width: 100%; }
.btn:disabled { opacity: 0.5; cursor: default; }

.field { display: grid; gap: 4px; font-size: 13px; font-weight: 700; }
.field input, .field select { font: inherit; font-weight: 500; padding: 12px; border-radius: var(--r-sm);
  border: 2px solid var(--line); background: var(--surface); color: var(--fg); min-height: 44px; }
.field input:focus, .field select:focus { outline: none; border-color: var(--primary); }
.error { color: var(--bad); font-size: 13px; font-weight: 700; white-space: pre-line; }
.ok { color: var(--good); font-size: 13px; font-weight: 700; }

.tabs { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface); border-radius: var(--r); padding: 4px; }
.tabs button { border: 0; background: transparent; padding: 10px; border-radius: var(--r-sm); font: inherit; font-weight: 800; color: var(--fg-soft); }
.tabs button.on { background: var(--primary); color: #fff; }

.progress { height: 10px; border-radius: 999px; background: var(--line); overflow: hidden; }
.progress > i { display: block; height: 100%; background: var(--primary); border-radius: 999px; }

.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.stat { background: var(--surface); border-radius: var(--r); padding: 12px; box-shadow: var(--shadow); text-align: center; }
.stat b { display: block; font-size: 18px; }
.tile { background: var(--surface); border-radius: var(--r); box-shadow: var(--shadow); display: grid; place-items: center;
  gap: 4px; padding: 14px 6px; font-weight: 800; font-size: 13px; }
.tile .emoji { font-size: 26px; }

.feed { display: grid; gap: 6px; font-size: 13px; }

.nav { position: fixed; left: 50%; transform: translateX(-50%); bottom: max(12px, env(safe-area-inset-bottom));
  width: min(560px, calc(100% - 24px)); height: 60px; background: var(--surface); border-radius: 24px;
  box-shadow: 0 6px 20px rgba(109, 40, 217, 0.25); display: grid; grid-template-columns: repeat(5, 1fr); z-index: 10; }
.nav a { display: grid; place-items: center; align-content: center; font-size: 11px; font-weight: 800; color: var(--fg-soft); gap: 2px; }
.nav a .i { font-size: 20px; }
.nav a.active { color: var(--primary); }
.nav a .old { font-size: 9px; opacity: 0.7; }

.overlay { position: fixed; inset: 0; background: rgba(36, 26, 77, 0.55); display: grid; place-items: center; padding: var(--gutter); z-index: 20; }
.dialog { background: var(--surface); border-radius: var(--r-lg); padding: 20px; width: min(420px, 100%); display: grid; gap: 12px; max-height: 90vh; overflow: auto; }
.check { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; }
.check input { margin-top: 3px; width: 20px; height: 20px; }

.avatar { width: 88px; height: 88px; border-radius: 50%; background: var(--line); display: grid; place-items: center; font-size: 44px; overflow: hidden; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
```

- [ ] **Step 2: Створити базові компоненти**

`web/src/design/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'quiet';
  block?: boolean;
}

export function Button({ variant = 'primary', block, className = '', ...rest }: Props) {
  const cls = ['btn', variant === 'primary' ? '' : variant, block ? 'block' : '', className].filter(Boolean).join(' ');
  return <button className={cls} {...rest} />;
}
```

`web/src/design/Field.tsx`:
```tsx
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Field({ label, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      {label}
      <input {...rest} />
    </label>
  );
}

export function SelectField({
  label, children, ...rest
}: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="field">
      {label}
      <select {...rest}>{children}</select>
    </label>
  );
}
```

`web/src/design/Card.tsx`:
```tsx
import type { ReactNode } from 'react';

export function Card({ tone = 'plain', className = '', children }: { tone?: 'plain' | 'accent'; className?: string; children: ReactNode }) {
  return <section className={['card', tone === 'accent' ? 'accent' : '', className].filter(Boolean).join(' ')}>{children}</section>;
}
```

`web/src/design/ProgressBar.tsx`:
```tsx
export function ProgressBar({ pct }: { pct: number }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: v + '%' }} />
    </div>
  );
}
```

- [ ] **Step 3: Створити `web/src/app/legacy.ts`**

```ts
/** Посилання на екран старого сайту; його app.js розбирає ?tab= у handleV2Link (див. Step 4). */
export function legacyUrl(tab: string): string {
  return '/?tab=' + encodeURIComponent(tab);
}

export const LEGACY_GAMES = [
  { id: 'slots', title: 'Слоти', emoji: '🎰' },
  { id: 'crash', title: 'Краш', emoji: '🚀' },
  { id: 'mines', title: 'Майнер', emoji: '💣' },
  { id: 'plinko', title: 'Плінко', emoji: '🔵' },
  { id: 'tower', title: 'Вежа', emoji: '🗼' },
  { id: 'hilo', title: 'Hi-Lo', emoji: '🃏' },
  { id: 'dice', title: 'Кості', emoji: '🎲' },
  { id: 'roulette', title: 'Рулетка', emoji: '🎡' },
];
```

- [ ] **Step 4: Додати `handleV2Link` у `app.js`**

Відкрити `app.js` і одним `Edit` знайти унікальний рядок `function openGame(g) { trackRecentGame(g); switchTab(g); }` та замінити на:

```js
function openGame(g) { trackRecentGame(g); switchTab(g); }

// Міст із новим сайтом (/v2): ?tab=<id> відкриває екран, ?open=rules — правила.
// Викликається один раз після першого завантаження користувача.
function handleV2Link() {
  var p = new URLSearchParams(location.search);
  var tab = p.get('tab'), open = p.get('open');
  if(tab && /^[a-z]+$/.test(tab) && document.getElementById('tab-' + tab)) switchTab(tab);
  if(open === 'rules') openRulesModal();
  if(tab || open) history.replaceState(null, '', location.pathname);
}
```

Потім другим `Edit` знайти унікальний рядок
`if(!window._winBackChecked) { window._winBackChecked = true; checkWelcomeBack(); checkOnboarding(); }`
і додати під ним новий рядок з тим самим відступом:

```js
            if(!window._v2LinkHandled) { window._v2LinkHandled = true; setTimeout(handleV2Link, 600); }
```

- [ ] **Step 5: Перевірити синтаксис і тести**

```bash
node --check app.js && echo "app.js syntax ok"
npm test
```
Очікується: `app.js syntax ok`; усі існуючі selfcheck-скрипти й web-тести проходять.

- [ ] **Step 6: Commit**

```bash
git add web/src/design web/src/app/legacy.ts app.js
git commit -m "feat(v2): дизайн-система стилю C і міст ?tab= для старого сайту" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Сесійний провайдер, оболонка, навігація, умови

**Files:**
- Create: `web/src/app/SessionProvider.tsx`, `Shell.tsx`, `BottomNav.tsx`, `App.tsx`, `web/src/features/terms/TermsGate.tsx`
- Modify: `web/src/main.tsx`

**Interfaces:**
- Consumes: `evaluateAccess`, `getSession`, `clearSession`, `subscribeUser`, `getDb`, `acceptTerms`, `hasAcceptedTerms`, `TERMS_CHECKS`, `legacyUrl`.
- Produces:
  - `useSession(): { nick: string | null; user: UserRecord | null | undefined; blocked: string | null; signIn(nick: string): void; signOut(): void; dismissBlocked(): void }` (`user === undefined` — ще вантажиться)
  - `<App/>` (маршрути `/` → HomeScreen, `/profile` → ProfileScreen)
  - `<Shell>` (шапка з балансом + `<Outlet/>` + `<BottomNav/>`)

- [ ] **Step 1: Створити `web/src/app/SessionProvider.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDb } from '../lib/db';
import { evaluateAccess, type UserRecord } from '../services/access';
import { clearSession, getSession } from '../services/session';
import { subscribeUser } from '../services/wallet';

interface SessionValue {
  nick: string | null;
  /** undefined — ще вантажиться, null — запису немає */
  user: UserRecord | null | undefined;
  blocked: string | null;
  signIn(nick: string): void;
  signOut(): void;
  dismissBlocked(): void;
}

const Ctx = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession поза SessionProvider');
  return v;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [nick, setNick] = useState<string | null>(() => getSession());
  const [user, setUser] = useState<UserRecord | null | undefined>(undefined);
  const [maintenance, setMaintenance] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    setUser(undefined);
    setMaintenance(null);
    if (!nick) return;
    const off = subscribeUser(nick, setUser);
    getDb()
      .get('site_config/maintenance')
      .then((v) => setMaintenance(!!v))
      .catch(() => setMaintenance(false));
    return off;
  }, [nick]);

  // Те саме, що робить startDataSync у старому app.js при кожному оновленні користувача.
  useEffect(() => {
    if (!nick || user === undefined || maintenance === null) return;
    const verdict = evaluateAccess(nick, user, maintenance, Date.now());
    if (!verdict.ok) {
      clearSession();
      setBlocked(verdict.message);
      setNick(null);
    } else if (verdict.clearSelfExclusion) {
      void getDb().set('users/' + nick + '/selfExcluded', false);
    }
  }, [nick, user, maintenance]);

  const signIn = useCallback((n: string) => {
    setBlocked(null);
    setNick(n);
  }, []);
  const signOut = useCallback(() => {
    clearSession();
    setNick(null);
  }, []);
  const dismissBlocked = useCallback(() => setBlocked(null), []);

  const value = useMemo(
    () => ({ nick, user, blocked, signIn, signOut, dismissBlocked }),
    [nick, user, blocked, signIn, signOut, dismissBlocked],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 2: Створити `web/src/app/BottomNav.tsx`**

```tsx
import { NavLink } from 'react-router-dom';
import { legacyUrl } from './legacy';

export function BottomNav() {
  return (
    <nav className="nav" aria-label="Основна навігація">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="i">🏠</span>Головна
      </NavLink>
      <a href={legacyUrl('lobby')} title="Відкриється на старому сайті">
        <span className="i">🎰</span>Казино<span className="old">старий сайт</span>
      </a>
      <a href={legacyUrl('cashier')} title="Відкриється на старому сайті">
        <span className="i">💳</span>Каса<span className="old">старий сайт</span>
      </a>
      <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="i">👤</span>Профіль
      </NavLink>
      <a href={legacyUrl('more')} title="Відкриється на старому сайті">
        <span className="i">☰</span>Ще<span className="old">старий сайт</span>
      </a>
    </nav>
  );
}
```

- [ ] **Step 3: Створити `web/src/app/Shell.tsx`**

```tsx
import { Outlet } from 'react-router-dom';
import { formatNumber } from '../lib/format';
import { BottomNav } from './BottomNav';
import { useSession } from './SessionProvider';

export function Shell() {
  const { nick, user } = useSession();
  return (
    <div className="page">
      <header className="topbar">
        <span className="logo">SlotOK</span>
        <span className="row">
          <span className="muted">{nick}</span>
          <span className="coin" aria-label="Баланс">🪙 {formatNumber(user?.balance ?? 0)}</span>
        </span>
      </header>
      <Outlet />
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Створити `web/src/features/terms/TermsGate.tsx`**

```tsx
import { useState } from 'react';
import { useSession } from '../../app/SessionProvider';
import { Button } from '../../design/Button';
import { TERMS_CHECKS } from '../../domain/terms';
import { acceptTerms } from '../../services/auth';

export function TermsGate() {
  const { nick, signOut } = useSession();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const all = TERMS_CHECKS.every((c) => checked[c.k]);

  async function accept() {
    if (!nick || !all) return;
    setBusy(true);
    try {
      await acceptTerms(nick);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className="dialog">
        <h2 id="terms-title">Перш ніж грати</h2>
        <p className="muted">Коротко про головне. Повний текст — за посиланням нижче.</p>
        {TERMS_CHECKS.map((c) => (
          <label key={c.k} className="check">
            <input
              type="checkbox"
              checked={!!checked[c.k]}
              onChange={(e) => setChecked((s) => ({ ...s, [c.k]: e.target.checked }))}
            />
            {c.text}
          </label>
        ))}
        <a className="muted" href="/?open=rules" target="_blank" rel="noopener">Читати повні правила ↗</a>
        <Button block disabled={!all || busy} onClick={accept}>Підтверджую</Button>
        <Button block variant="quiet" onClick={signOut}>Вийти</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Створити `web/src/app/App.tsx`**

`App.tsx` імпортує екрани, які з'являться в Task 11–13, тому `tsc` (а отже `npm --prefix web run build`) стане зеленим лише після Task 13. До того перевіряти тільки `npm --prefix web test`; заглушок не створювати.

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthScreen } from '../features/auth/AuthScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { TermsGate } from '../features/terms/TermsGate';
import { hasAcceptedTerms } from '../domain/terms';
import { Shell } from './Shell';
import { SessionProvider, useSession } from './SessionProvider';

function Gate() {
  const { nick, user } = useSession();
  if (!nick) return <AuthScreen />;
  if (user === undefined) return <p className="page center muted">Завантаження…</p>;
  return (
    <>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomeScreen />} />
          <Route path="profile" element={<ProfileScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {!hasAcceptedTerms(user) && <TermsGate />}
    </>
  );
}

export function App() {
  return (
    <BrowserRouter basename="/v2">
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Замінити `web/src/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './design/app.css';
import { setDb } from './lib/db';
import { createFirebaseDb } from './lib/firebaseDb';
import { captureRef, getSession } from './services/session';

setDb(createFirebaseDb());
captureRef(location.search, !!getSession());

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 7: Commit (збірка ще не перевіряється: екрани додаються далі)**

```bash
git add web/src/app web/src/features/terms web/src/main.tsx
git commit -m "feat(v2): сесійний провайдер, оболонка, навігація і умови користування" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Екрани входу, реєстрації та відновлення

**Files:**
- Create: `web/src/features/auth/AuthScreen.tsx`, `LoginForm.tsx`, `RegisterForm.tsx`, `RecoveryDialog.tsx`, `web/tests/LoginForm.test.tsx`

**Interfaces:**
- Consumes: `login`, `register`, `lookup`, `resetWithAnswer`, `requestViaTelegram`, `useSession`, `SECURITY_QUESTIONS`, `UserFacingError`.
- Produces: `<LoginForm onSuccess={(nick:string)=>void} onForgot={()=>void}/>`, `<RegisterForm onSuccess={(nick:string)=>void}/>`, `<RecoveryDialog onClose={()=>void}/>`, `<AuthScreen/>`.

- [ ] **Step 1: Написати падаючий тест `web/tests/LoginForm.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../src/features/auth/LoginForm';
import { setDb } from '../src/lib/db';
import { SlotOKPassword } from '../src/lib/password';
import { FakeDb } from './fakeDb';

let db: FakeDb;
beforeEach(async () => {
  db = new FakeDb();
  db.data.users = { Ivan: { pass: await SlotOKPassword.hash('secret1') } };
  setDb(db);
  localStorage.clear();
});

describe('LoginForm', () => {
  it('показує помилку для невірного пароля й не викликає onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} onForgot={() => {}} />);
    await userEvent.type(screen.getByLabelText('Нікнейм'), 'Ivan');
    await userEvent.type(screen.getByLabelText('Пароль'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('❌ Невірний пароль')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('при вірному паролі викликає onSuccess з ніком', async () => {
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} onForgot={() => {}} />);
    await userEvent.type(screen.getByLabelText('Нікнейм'), 'Ivan');
    await userEvent.type(screen.getByLabelText('Пароль'), 'secret1');
    await userEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith('Ivan'));
  });

  it('кнопка «Забули пароль?» викликає onForgot', async () => {
    const onForgot = vi.fn();
    render(<LoginForm onSuccess={() => {}} onForgot={onForgot} />);
    await userEvent.click(screen.getByRole('button', { name: 'Забули пароль?' }));
    expect(onForgot).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm --prefix web test -- LoginForm`
Expected: FAIL (компонент не знайдено).

- [ ] **Step 3: Створити `web/src/features/auth/LoginForm.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Button } from '../../design/Button';
import { Field } from '../../design/Field';
import { login } from '../../services/auth';

export function LoginForm({ onSuccess, onForgot }: { onSuccess(nick: string): void; onForgot(): void }) {
  const [nick, setNick] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      onSuccess(await login(nick, pass));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка входу');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Нікнейм" value={nick} onChange={(e) => setNick(e.target.value)} autoComplete="username" />
      <Field label="Пароль" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
      {error && <div className="error" role="alert">{error}</div>}
      <Button block type="submit" disabled={busy}>{busy ? '⏳ Перевірка…' : 'Увійти'}</Button>
      <Button block type="button" variant="quiet" onClick={onForgot}>Забули пароль?</Button>
    </form>
  );
}
```

- [ ] **Step 4: Створити `web/src/features/auth/RegisterForm.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Button } from '../../design/Button';
import { Field, SelectField } from '../../design/Field';
import { SECURITY_QUESTIONS } from '../../domain/securityQuestions';
import { register } from '../../services/auth';

export function RegisterForm({ onSuccess }: { onSuccess(nick: string): void }) {
  const [f, setF] = useState({ nick: '', email: '', pass: '', promo: '', secQuestion: 'pet', secAnswer: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await register(f);
      onSuccess(r.nick);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка реєстрації');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Нікнейм" value={f.nick} onChange={set('nick')} autoComplete="username" />
      <Field label="Пошта (необов'язково)" type="email" value={f.email} onChange={set('email')} autoComplete="email" />
      <Field label="Пароль" type="password" value={f.pass} onChange={set('pass')} autoComplete="new-password" />
      <SelectField label="Контрольне питання" value={f.secQuestion} onChange={set('secQuestion')}>
        {Object.entries(SECURITY_QUESTIONS).map(([k, text]) => (
          <option key={k} value={k}>{text}</option>
        ))}
      </SelectField>
      <Field label="Відповідь (для відновлення пароля)" value={f.secAnswer} onChange={set('secAnswer')} />
      <Field label="Промокод (необов'язково)" value={f.promo} onChange={set('promo')} />
      {error && <div className="error" role="alert">{error}</div>}
      <Button block type="submit" disabled={busy}>{busy ? '⏳ Реєстрація…' : 'Створити акаунт'}</Button>
    </form>
  );
}
```

- [ ] **Step 5: Створити `web/src/features/auth/RecoveryDialog.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '../../design/Button';
import { Field } from '../../design/Field';
import { SECURITY_QUESTIONS } from '../../domain/securityQuestions';
import { lookup, requestViaTelegram, resetWithAnswer, type LookupResult } from '../../services/recovery';

type Step =
  | { kind: 'nick' }
  | { kind: 'question'; question: string }
  | { kind: 'telegram' }
  | { kind: 'done'; text: string };

export function RecoveryDialog({ onClose }: { onClose(): void }) {
  const [step, setStep] = useState<Step>({ kind: 'nick' });
  const [nick, setNick] = useState('');
  const [answer, setAnswer] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  const next = () =>
    run(async () => {
      const r: LookupResult = await lookup(nick);
      setStep(r.kind === 'question' ? { kind: 'question', question: r.question } : { kind: 'telegram' });
    });

  const reset = () =>
    run(async () => {
      await resetWithAnswer(nick.trim(), answer, p1, p2);
      setStep({ kind: 'done', text: '✅ Пароль змінено! Тепер увійдіть з новим паролем.' });
    });

  const telegram = () =>
    run(async () => {
      const url = await requestViaTelegram(nick.trim());
      window.open(url, '_blank', 'noopener');
      setStep({
        kind: 'done',
        text: '✅ Заявку надіслано. Напишіть боту в Telegram для підтвердження — адмін скине пароль і надішле його вам у приватні повідомлення.',
      });
    });

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="rec-title">
      <div className="dialog">
        <div className="row between">
          <h2 id="rec-title">🔑 Відновлення пароля</h2>
          <Button variant="quiet" onClick={onClose} aria-label="Закрити">✕</Button>
        </div>

        {step.kind === 'nick' && (
          <>
            <p className="muted">Введіть свій нікнейм, щоб почати відновлення.</p>
            <Field label="Нікнейм" value={nick} onChange={(e) => setNick(e.target.value)} />
            <Button block disabled={busy} onClick={next}>Далі →</Button>
          </>
        )}

        {step.kind === 'question' && (
          <>
            <p className="muted">{SECURITY_QUESTIONS[step.question] || 'Контрольне питання'}</p>
            <Field label="Відповідь" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <Field label="Новий пароль (мін 6 символів)" type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" />
            <Field label="Повторіть новий пароль" type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
            <Button block disabled={busy} onClick={reset}>Змінити пароль</Button>
            <Button block variant="quiet" onClick={() => setStep({ kind: 'telegram' })}>Не пам'ятаю відповідь</Button>
          </>
        )}

        {step.kind === 'telegram' && (
          <>
            <p className="muted">
              Автоматичне відновлення недоступне для цього акаунту. Подайте заявку — адміністратор перевірить вас у Telegram і скине пароль вручну.
            </p>
            <Button block disabled={busy} onClick={telegram}>✈️ Подати заявку через Telegram</Button>
          </>
        )}

        {step.kind === 'done' && (
          <>
            <p className="ok">{step.text}</p>
            <Button block onClick={onClose}>Закрити</Button>
          </>
        )}

        {error && <div className="error" role="alert">{error}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Створити `web/src/features/auth/AuthScreen.tsx`**

```tsx
import { useState } from 'react';
import { useSession } from '../../app/SessionProvider';
import { LoginForm } from './LoginForm';
import { RecoveryDialog } from './RecoveryDialog';
import { RegisterForm } from './RegisterForm';

export function AuthScreen() {
  const { signIn, blocked, dismissBlocked } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [recovery, setRecovery] = useState(false);

  return (
    <main className="page stack">
      <h1 className="logo center" style={{ fontSize: 32, paddingTop: 24 }}>SlotOK</h1>
      {blocked && (
        <div className="card error" role="alert" onClick={dismissBlocked}>{blocked}</div>
      )}
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Вхід</button>
        <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Реєстрація</button>
      </div>
      <div className="card">
        {mode === 'login' ? (
          <LoginForm onSuccess={signIn} onForgot={() => setRecovery(true)} />
        ) : (
          <RegisterForm onSuccess={signIn} />
        )}
      </div>
      {recovery && <RecoveryDialog onClose={() => setRecovery(false)} />}
    </main>
  );
}
```

- [ ] **Step 7: Запустити**

Run: `npm --prefix web test -- LoginForm`
Expected: PASS, 3 тести.

- [ ] **Step 8: Commit**

```bash
git add web/src/features/auth web/tests/LoginForm.test.tsx
git commit -m "feat(v2): екрани входу, реєстрації та відновлення пароля" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Головна

**Files:**
- Create: `web/src/features/home/HomeScreen.tsx`, `DailyBonusCard.tsx`, `StatsGrid.tsx`, `ProgressCard.tsx`, `WinTicker.tsx`, `GameTiles.tsx`, `web/tests/DailyBonusCard.test.tsx`

**Interfaces:**
- Consumes: `useSession`, `claimDaily`, `subscribeWinFeed`, `subscribeJackpot`, `dailyBonusPreview`, `canClaimDaily`, `msUntilNextDaily`, `vipProgress`, `getBpProgress`, `LEGACY_GAMES`, `legacyUrl`, `formatNumber`.
- Produces: `<DailyBonusCard user={UserRecord} now={number} busy={boolean} message={string} onClaim={()=>void}/>`.

- [ ] **Step 1: Написати падаючий тест `web/tests/DailyBonusCard.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DailyBonusCard } from '../src/features/home/DailyBonusCard';
import { DAY_MS } from '../src/domain/dailyBonus';

describe('DailyBonusCard', () => {
  it('доступний: показує суму і викликає onClaim', async () => {
    const onClaim = vi.fn();
    render(<DailyBonusCard user={{ dailyStreak: 2 }} now={DAY_MS * 5} busy={false} message="" onClaim={onClaim} />);
    expect(screen.getByText('+200 монет')).toBeInTheDocument();
    expect(screen.getByText('День 3 серії')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Забрати' }));
    expect(onClaim).toHaveBeenCalled();
  });

  it('вже забрано: кнопки немає, показує, скільки чекати', () => {
    const now = DAY_MS * 5;
    render(<DailyBonusCard user={{ lastDailyBonus: now - 3600000 }} now={now} busy={false} message="" onClaim={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Забрати' })).not.toBeInTheDocument();
    expect(screen.getByText(/Наступний бонус через 23 год 0 хв/)).toBeInTheDocument();
  });

  it('busy блокує кнопку', () => {
    render(<DailyBonusCard user={{}} now={DAY_MS * 5} busy message="" onClaim={() => {}} />);
    expect(screen.getByRole('button', { name: 'Забрати' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm --prefix web test -- DailyBonusCard`
Expected: FAIL (компонент не знайдено).

- [ ] **Step 3: Створити `web/src/features/home/DailyBonusCard.tsx`**

```tsx
import { Button } from '../../design/Button';
import { Card } from '../../design/Card';
import { canClaimDaily, dailyBonusPreview, msUntilNextDaily } from '../../domain/dailyBonus';
import type { UserRecord } from '../../services/access';

interface Props {
  user: UserRecord;
  now: number;
  busy: boolean;
  message: string;
  onClaim(): void;
}

export function DailyBonusCard({ user, now, busy, message, onClaim }: Props) {
  const can = canClaimDaily(user.lastDailyBonus, now);
  const p = dailyBonusPreview(user);

  if (!can) {
    const ms = msUntilNextDaily(user.lastDailyBonus, now);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return (
      <Card>
        <h2>🎁 Щоденний бонус</h2>
        <p className="muted">Наступний бонус через {h} год {m} хв · серія {user.dailyStreak || 0} 🔥</p>
        {message && <p className="ok">{message}</p>}
      </Card>
    );
  }

  return (
    <Card tone="accent">
      <div className="muted" style={{ color: 'inherit', fontWeight: 800 }}>ЩОДЕННИЙ БОНУС</div>
      <div className="big">+{p.amount} монет</div>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>День {p.day} серії</div>
      <Button variant="accent" disabled={busy} onClick={onClaim}>Забрати</Button>
    </Card>
  );
}
```
Примітка до тесту: `getByText('День 3 серії')` має збігатися з вмістом `div` повністю; JSX `День {p.day} серії` рендериться трьома текстовими вузлами в одному елементі, і `getByText` склеює їх, тож збігається.

- [ ] **Step 4: Створити `StatsGrid.tsx`, `ProgressCard.tsx`, `WinTicker.tsx`, `GameTiles.tsx`**

`web/src/features/home/StatsGrid.tsx`:
```tsx
import { getVipLevel } from '../../domain/vip';
import { formatNumber } from '../../lib/format';
import type { UserRecord } from '../../services/access';

export function StatsGrid({ user }: { user: UserRecord }) {
  const vip = getVipLevel(user.totalWagered || 0);
  const items: Array<[string, string]> = [
    ['Баланс', '₴' + formatNumber(user.balance || 0)],
    ['VIP', vip.icon + ' ' + vip.name],
    ['Серія', (user.dailyStreak || 0) + '🔥'],
    ['Ставки', formatNumber(user.totalBets || 0)],
    ['Перемоги', formatNumber(user.totalWins || 0)],
  ];
  return (
    <div className="grid3">
      {items.map(([label, value]) => (
        <div className="stat" key={label}>
          <b>{value}</b>
          <span className="muted">{label}</span>
        </div>
      ))}
    </div>
  );
}
```

`web/src/features/home/ProgressCard.tsx`:
```tsx
import { Card } from '../../design/Card';
import { ProgressBar } from '../../design/ProgressBar';
import { getBpProgress } from '../../domain/battlePass';
import { vipProgress } from '../../domain/vip';
import type { UserRecord } from '../../services/access';

export function ProgressCard({ user, now }: { user: UserRecord; now: number }) {
  const vip = vipProgress(user.totalWagered || 0);
  const bp = getBpProgress(user, now);
  return (
    <Card className="stack">
      <div>
        <div className="row between"><b>VIP: {vip.level.name}</b><span className="muted">{vip.pct}%</span></div>
        <ProgressBar pct={vip.pct} />
      </div>
      <div>
        <div className="row between"><b>Battle Pass</b><span className="muted">Lv{bp.level + 1}</span></div>
        <ProgressBar pct={bp.pct} />
      </div>
    </Card>
  );
}
```

`web/src/features/home/WinTicker.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Card } from '../../design/Card';
import { formatNumber } from '../../lib/format';
import { subscribeJackpot, subscribeWinFeed, type WinFeedItem } from '../../services/wallet';

export function WinTicker() {
  const [items, setItems] = useState<WinFeedItem[]>([]);
  const [jackpot, setJackpot] = useState(0);

  useEffect(() => {
    const offFeed = subscribeWinFeed(setItems);
    const offJackpot = subscribeJackpot(setJackpot);
    return () => {
      offFeed();
      offJackpot();
    };
  }, []);

  return (
    <Card className="stack">
      <div className="row between"><h2>💰 Джекпот</h2><span className="big">₴{formatNumber(jackpot)}</span></div>
      <h2>Останні виграші</h2>
      <div className="feed">
        {items.length === 0 && <span className="muted">Поки немає великих виграшів</span>}
        {items.map((i, idx) => (
          <div key={idx}>
            <b>{i.user}</b> виграв <b className="ok">+₴{formatNumber(i.amount)}</b>
            {i.game ? ` у ${i.game}` : ''}
          </div>
        ))}
      </div>
    </Card>
  );
}
```

`web/src/features/home/GameTiles.tsx`:
```tsx
import { LEGACY_GAMES, legacyUrl } from '../../app/legacy';

export function GameTiles() {
  return (
    <section>
      <h2 style={{ margin: '4px 0 8px', fontSize: 15 }}>Популярне <span className="muted">(відкриється на старому сайті)</span></h2>
      <div className="grid3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {LEGACY_GAMES.map((g) => (
          <a className="tile" key={g.id} href={legacyUrl(g.id)}>
            <span className="emoji">{g.emoji}</span>
            {g.title}
          </a>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Створити `web/src/features/home/HomeScreen.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useSession } from '../../app/SessionProvider';
import { claimDaily } from '../../services/wallet';
import { DailyBonusCard } from './DailyBonusCard';
import { GameTiles } from './GameTiles';
import { ProgressCard } from './ProgressCard';
import { StatsGrid } from './StatsGrid';
import { WinTicker } from './WinTicker';

export function HomeScreen() {
  const { nick, user } = useSession();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!nick || !user) return null;

  async function claim() {
    setBusy(true);
    setMessage('');
    try {
      const r = await claimDaily(nick!);
      setNow(Date.now());
      setMessage(`🎁 +${r.amount} ₴${r.streakBonus ? ` і бонус серії +${r.streakBonus} ₴` : ''}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Не вдалося забрати бонус');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <DailyBonusCard user={user} now={now} busy={busy} message={message} onClaim={claim} />
      <StatsGrid user={user} />
      <ProgressCard user={user} now={now} />
      <WinTicker />
      <GameTiles />
    </div>
  );
}
```
Якщо після `claimDaily` картка бонусу показує «вже забрано», а `message` порожнє, бо підписка оновила `user` швидше: це нормально, повідомлення про суму показується в обох станах картки (`message` виводиться у гілці «забрано»).

- [ ] **Step 6: Запустити тест**

Run: `npm --prefix web test -- DailyBonusCard`
Expected: PASS, 3 тести.

- [ ] **Step 7: Commit**

```bash
git add web/src/features/home web/tests/DailyBonusCard.test.tsx
git commit -m "feat(v2): скорочена головна (бонус, статистика, прогрес, джекпот, швидкі ігри)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Профіль і перша повна збірка

**Files:**
- Create: `web/src/features/profile/ProfileScreen.tsx`

**Interfaces:**
- Consumes: `useSession`, `STATUSES`, `setStatus`, `setTag`, `setAvatar`, `downscaleImage`, `getVipLevel`, `formatNumber`.

- [ ] **Step 1: Створити `web/src/features/profile/ProfileScreen.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../app/SessionProvider';
import { Button } from '../../design/Button';
import { Card } from '../../design/Card';
import { Field } from '../../design/Field';
import { ProgressBar } from '../../design/ProgressBar';
import { getVipLevel } from '../../domain/vip';
import { formatNumber } from '../../lib/format';
import { downscaleImage, setAvatar, setStatus, setTag, STATUSES } from '../../services/profile';

function Avatar({ user }: { user: Record<string, any> }) {
  const src: string | null = user.avatarUrl || (typeof user.avatar === 'string' && user.avatar.length > 2 ? user.avatar : null);
  return <div className="avatar">{src ? <img src={src} alt="" /> : user.avatar || '👤'}</div>;
}

export function ProfileScreen() {
  const { nick, user, signOut } = useSession();
  const [tag, setTagValue] = useState('');
  const [info, setInfo] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) setTagValue(user.tag || '');
  }, [user?.tag]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!nick || !user) return null;

  const vip = getVipLevel(user.totalWagered || 0);
  const played = user.stats?.gamesPlayed || user.totalGames || 0;
  const won = user.stats?.gamesWon || user.totalWins || 0;
  const winRate = played > 0 ? Math.min(100, Math.round((won / played) * 100)) : 0;
  const rows: Array<[string, string]> = [
    ['Баланс', '₴' + formatNumber(user.balance || 0)],
    ['Найбільший виграш', '₴' + formatNumber(user.stats?.biggestWin || user.maxWin || 0)],
    ['Ігор зіграно', formatNumber(played)],
    ['Оборот', '₴' + formatNumber(user.totalWagered || user.totalWager || 0)],
    ['Серія', (user.dailyStreak || 0) + '🔥'],
    ['Зіграно слотів', formatNumber(user.slotsPlayed || 0)],
    ['Поповнень', '₴' + formatNumber(user.totalDeposits || 0)],
  ];

  async function onAvatar(file: File | undefined) {
    if (!file) return;
    setInfo('Завантаження…');
    try {
      await setAvatar(nick!, await downscaleImage(file));
      setInfo('Аватар оновлено');
    } catch (e) {
      setInfo(e instanceof Error ? e.message : 'Не вдалося завантажити');
    }
  }

  return (
    <div className="stack">
      <Card className="stack center">
        <div className="row" style={{ justifyContent: 'center' }}><Avatar user={user} /></div>
        <h1 style={{ fontSize: 22 }}>{nick}</h1>
        <div className="muted">ID {user.id || '---'} · {vip.icon} {vip.name}{user.isAdmin ? ' · 🛡 Адмін' : ''}</div>
        <Field
          label="Статус профілю"
          value={tag}
          maxLength={60}
          onChange={(e) => setTagValue(e.target.value)}
          onBlur={() => tag !== (user.tag || '') && void setTag(nick, tag)}
        />
        <label className="field">
          Стан
          <select value={user.status || 'online'} onChange={(e) => void setStatus(nick, e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onAvatar(e.target.files?.[0])} />
        <Button variant="quiet" onClick={() => fileRef.current?.click()}>📷 Змінити аватар</Button>
        {info && <div className="muted">{info}</div>}
      </Card>

      <Card className="stack">
        <h2>Статистика</h2>
        {rows.map(([k, v]) => (
          <div className="row between" key={k}><span className="muted">{k}</span><b>{v}</b></div>
        ))}
        <div>
          <div className="row between"><span className="muted">Відсоток перемог</span><b>{winRate}%</b></div>
          <ProgressBar pct={winRate} />
        </div>
      </Card>

      {user.isAdmin && (
        <Card><a className="btn block" href="/?tab=more">🛡 Адмін-панель (старий сайт)</a></Card>
      )}
      <Button block variant="quiet" onClick={signOut}>Вийти</Button>
      <a className="muted center" href="/">Відкрити старий сайт</a>
    </div>
  );
}
```
Примітка: кнопка адмін-панелі веде на старий сайт екран `more` (адмін-панель живе там); точне місце перевірити вручну в Task 14 і, якщо адмінка відкривається з іншого екрана, змінити `tab` у посиланні.

- [ ] **Step 2: Повна перевірка типів, тестів і збірки**

```bash
npm --prefix web run build
npm --prefix web test
```
Очікується: `tsc` без помилок, збірка у `v2/`, усі тести проходять. Якщо `tsc` скаржиться на `noUnusedLocals` — прибрати невикористаний імпорт у вказаному файлі.

- [ ] **Step 3: Локальний запуск і огляд**

```bash
npm --prefix web run dev
```
Відкрити `http://localhost:5173/v2/`. Перевірити: показується екран входу у світлому стилі; вхід тестовим акаунтом відкриває головну; нижня навігація перемикає Головна/Профіль; посилання «Казино», «Каса», «Ще» ведуть на `/?tab=…` (локально це вже не сервер Vite: 404 нормальний, перевіряється на preview). Зробити скриншоти мобільної ширини (390 px) екранів входу, головної, профілю й показати власнику.

- [ ] **Step 4: Commit**

```bash
git add web/src/features/profile
git commit -m "feat(v2): профіль; перша повна збірка" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Прогін на preview, відкладене в ROADMAP, випуск

**Files:**
- Modify: `ROADMAP.md`, `index.html`, `app.js` (`CURRENT_VERSION`, `BUILTIN_CHANGELOG`)

**Interfaces:**
- Consumes: усе вище. Ця задача має **два гейти власника**: (а) ручний прогін (Step 2), (б) дозвіл на кнопку для гравців (Step 4). Без гейту (б) кроки 5–7 не виконувати.

- [ ] **Step 1: Запушити гілку й дочекатись preview**

```bash
git push
```
Запитати власника перед `push`, якщо дозвіл не діє. Отримати preview-URL як у Task 2 Step 4.

- [ ] **Step 2: Ручний прогін на preview (разом із власником)**

Тестові акаунти називати з префіксом `v2test_` і потім видалити з бази власником. Пройти:
1. `/v2/` без сесії → екран входу.
2. Реєстрація `v2test_a` з промокодом `SLOTOK` → потрапляє на головну, баланс 1500, з'являється вікно умов; без трьох галочок «Підтверджую» неактивна; після підтвердження вікно зникає.
3. «Вийти» → вхід тим самим акаунтом; невірний пароль → «❌ Невірний пароль».
4. «Забули пароль?» → нік `v2test_a` → відповідь на питання → новий пароль → вхід новим.
5. Головна: «Забрати» додає суму; повторно кнопки нема, показано таймер. Відкрити `/` (старий сайт) під цією сесією: баланс і «серія» збігаються.
6. Реферал: у приватному вікні відкрити `/v2/?ref=<існуючий нік>`, зареєструвати `v2test_b` → у запрошувача `referrals` +1; те саме через `/?ref=…` на старому сайті.
7. «Казино», «Каса», «Ще», плитки ігор → відкривають відповідний екран старого сайту (адреса очищується від `?tab=`). «Читати повні правила ↗» у вікні умов відкриває правила на старому сайті.
8. Гравець із `selfExcluded: true` та `selfExcludeUntil` у майбутньому не входить далі екрана входу (повідомлення про самовиключення); гравець із `banned` теж.
9. Профіль: зміна статусу, «Статус профілю», аватар (файл > 1 МБ стискається); дані видно на старому сайті.
10. Мобільна ширина 390 px: немає горизонтального скролу, навігація не перекриває контент.

Зафіксувати результати. Знайдені розбіжності виправити окремими комітами з тестом, що їх відтворює.

- [ ] **Step 3: Записати відкладене в `ROADMAP.md`**

Додати в кінець розділ (формат існуючих записів у файлі зберегти; прочитати файл перед правкою):

```markdown
## Новий дизайн (v2, React + Vite)

Етап 1 (готово на `/v2`): вхід, реєстрація, відновлення пароля, умови, скорочена головна, профіль. Код: `web/`, збірка `v2/`.
Наступні етапи (кожен окремим спеком): ігри по одній, каса, чат і новини, турніри, Telegram, адмінка. Старий `app.js` лишається, доки екран не перенесено.
Відкладено з етапу 1:
- Віджети головної: чат, новини й оновлення, mystery box, стрічка друзів, віджет Аксіоми, календар подій, графік балансу, турнірний банер.
- «Ми скучили» (`checkWelcomeBack`): вхід через `/v2` перезаписує `lastSeen` до того, як старий сайт його прочитає.
- Twemoji-іконки з `emoji/` замість звичайних емодзі у v2.
- Темна тема для v2.
- Коли все перенесено: `/v2` стає `/`, старий `index.html`/`app.js`/`style.css` видаляються, `handleV2Link` теж.
```

- [ ] **Step 4: ГЕЙТ власника**

Показати власнику результати Step 2 і запитати: «Додавати кнопку „Спробувати новий дизайн“ на старий сайт і запис у списку оновлень?» Без «так» зупинитись: гілку можна зливати й без кнопки (v2 доступний за прямим посиланням).

- [ ] **Step 5: Кнопка на старому сайті** (лише після «так»)

У `index.html` одним `Edit` знайти унікальний рядок `<div id="tab-more" class="screen ledger hidden">` і замінити на цей рядок плюс одразу під ним:

```html
      <a class="ks-btn is-primary is-block" href="/v2/" style="margin:12px 15px;">✨ Спробувати новий дизайн</a>
```

- [ ] **Step 6: Changelog і версія** (лише після «так»)

У `app.js`: змінити `const CURRENT_VERSION = '99';` на `'100'` і додати першим елементом `BUILTIN_CHANGELOG` (замінити `Date.UTC(2026, 9, 24)` на дату фактичного випуску, місяць 0-базований):

```js
  {
    version: '100',
    title: '✨ Оновлення v100 — новий дизайн (бета)',
    date: Date.UTC(2026, 9, 24),
    dev: 'SlotOK Dev',
    sections: [
      {
        type: 'new',
        title: '🎨 Новий дизайн',
        items: [
          'У розділі «Ще» з\'явилась кнопка «Спробувати новий дизайн» — світлий ігровий вигляд головної, профілю, входу й реєстрації',
          'Баланс, серія й акаунт спільні зі старим сайтом: можна переходити туди й назад',
          'Ігри, каса, чат і турніри поки відкриваються на старому сайті — вони переїдуть пізніше',
        ],
      },
    ],
  },
```

- [ ] **Step 7: Фінальна перевірка і Commit** (лише після «так»)

```bash
node --check app.js && echo "app.js ok"
npm test
git add ROADMAP.md index.html app.js
git commit -m "feat(v2): кнопка «Спробувати новий дизайн», changelog v100, ROADMAP" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push
```
Очікується: `app.js ok`; `npm test` повністю зелений. Створення PR і злиття в `main` — лише за окремою командою власника (PR-и в цьому репозиторії зливаються squash).

---

## Самоперевірка плану щодо спеку

| Вимога спеку | Де покрито |
|---|---|
| Розміщення A (`web/`, `/v2`, один деплой), rewrite | Task 1, Task 2 |
| Перевірка збірки Vercel першою (відкрите питання 1) | Task 2 (гейт перед усім іншим кодом) |
| Спільна сесія `slotok_user`, Firebase без міграцій | Task 3 (`firebaseDb`), Task 5 (`session.ts`) |
| Оболонка з п'ятьма пунктами, живі Головна/Профіль, решта на старий сайт | Task 10 (`BottomNav`), Task 9 (`legacy.ts`, `handleV2Link`) |
| Глибокі посилання (відкрите питання 2) | Task 9 Step 4 (малий додаток у `app.js`, бо маршрутизації за URL у старому коді не було) |
| Вхід 1:1 (бан, пароль, апгрейд хешу, техобслуговування, `lastSeen`, тексти) | Task 5 |
| Реєстрація 1:1 + транзакція створення акаунта | Task 4 (`newUser`), Task 6 |
| Реферали (`?ref=`, `ref_by`, `referredBy`, `referrals +1`) | Task 5 (`captureRef`), Task 6, Task 10 (`main.tsx`) |
| Відновлення пароля повністю (питання, Telegram-заявка, `/api/notify`, `pm/`) | Task 7, Task 11 |
| Головна: бонус, статистика, VIP/BP, джекпот, виграші, швидкі ігри | Task 8, Task 12 |
| Профіль: аватар, біо, статус, статистика, адмін-кнопка | Task 8, Task 13 |
| Parity-тест замість selfcheck-скрипта | Task 4 (відхилення 1 описано вгорі) |
| Тести сервісів на підміні Firebase | Tasks 3–8 |
| Ручний прогін на preview | Task 14 Step 2 |
| `lastSeen`/«Ми скучили», `initTelegramLinkStatus` (відкриті питання 3–4) | Відхилення 8; ROADMAP у Task 14 |
| Токени стилю C (відкрите питання 5) | Task 9 (`app.css`) |
| Випуск: кнопка, `BUILTIN_CHANGELOG`, `CURRENT_VERSION`, `.gitignore` | Task 1 (`.gitignore`), Task 14 |
| Не переносимо: ігри, каса, чат, новини, турніри, адмінка, Аксіома, сповіщення | Ніде не реалізується; зафіксовано в ROADMAP (Task 14) |
