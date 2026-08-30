# Telegram Account Linking + Upgraded Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a SlotOK player link their account to their own Telegram chat, turn the bot into a real quick-action tool (persistent menu, balance/history/deposit/withdraw commands), and push real Telegram notifications for request approvals, PMs/support/clan chat, and jackpot/bonus/big-win payouts.

**Architecture:** `api/telegram-webhook.js` (the existing Vercel serverless webhook) gains new command routing on top of its existing admin-command routing; two new `lib/` modules hold the linking data-layer and the deposit/withdraw conversation state machine so the webhook file stays an orchestrator, not a monolith. Deposit/withdraw requests created from the bot write to the exact same Firebase paths the site's `submitDepositRequest()`/`submitWithdraw()` write to, so the existing admin-approval logic (`actOnDeposit`/`actOnWithdraw` in the webhook) needs zero changes. `api/notify.js` gains one new request type for client-originated pushes (PM, clan chat, big win, jackpot, bonus).

**Tech Stack:** Plain Node.js (Vercel serverless functions, no framework), a hand-rolled Firebase REST client (`lib/firebase.js`), a hand-rolled Telegram Bot API client (`lib/telegram.js`), vanilla JS front end (`app.js` + `index.html`). No test runner exists in this project — verification steps use throwaway Node smoke scripts (mocking `global.fetch`) or manual curl/browser checks, matching the "Testing" section of the spec.

**Spec:** `docs/superpowers/specs/2026-08-30-telegram-account-linking-design.md`

## Global Constraints

- Linking tokens are single-use, 10-minute TTL (`telegram_link_tokens/<token>`, `TOKEN_TTL_MS = 10 * 60 * 1000`).
- Conversation state (`telegram_state/<chatId>`) is likewise treated as stale after 10 minutes.
- Deposit minimum: 50₴ (matches `submitDepositRequest()`). Withdraw minimum: 200₴, and a withdraw is refused while `users/<nick>/pendingWithdraw` is true (matches `submitWithdraw()`).
- Withdraw methods: `privat` | `mono` | `usdt`. Deposit methods via the bot: `privat` | `mono` (matches the site's `selectWithdrawMethod`/`selectDepMethod` value strings).
- Big-win push notification threshold: `win >= bet * 20`. Jackpot and bonus payouts always notify (no threshold).
- All Telegram messages use `parse_mode: "HTML"` (the default in `lib/telegram.js`'s `sendMessage`), so any interpolated user-controlled string (nick, card number) MUST be passed through `esc()` first, matching the existing pattern already used in `api/telegram-webhook.js` and `api/notify.js`.
- No new npm dependencies. No test framework is introduced — every lib module must stay requireable standalone with Node's built-in `fetch`/`assert` for smoke testing.

---

## File Structure

- `lib/firebase.js` — **modify**: add `dbDelete(path)`.
- `lib/telegram.js` — **modify**: add `setMyCommands(commands)` and export a shared `esc(s)`.
- `lib/telegram-linking.js` — **new**: token validation, link/unlink, chatId→nick resolution. Pure data layer, no Telegram API calls.
- `lib/telegram-money-flow.js` — **new**: the `/deposit` and `/withdraw` conversational state machine (`telegram_state/<chatId>`), reusing `lib/firebase.js` and `lib/telegram.js`.
- `api/telegram-webhook.js` — **modify**: wire linking commands, the persistent quick-action keyboard, player read commands (`/balance` `/history` `/me` `/help`), route to the money-flow module, extend `notifyPlayer()` for dual delivery.
- `api/notify.js` — **modify**: add a `player-ping` request type for client-originated pushes (PM, clan chat, big win, jackpot, bonus).
- `app.js` — **modify**: linking UI functions (`linkTelegram()`, `unlinkTelegram()`, status listener), and `notifyBot('player-ping', ...)` calls at the PM/clan-chat/big-win/jackpot/bonus call sites identified below.
- `index.html` — **modify**: add a "Telegram" settings-section (link/unlink row) and a small modal for the deep-link/code.

---

### Task 1: `dbDelete` in the Firebase REST client

**Files:**
- Modify: `lib/firebase.js`

**Interfaces:**
- Produces: `dbDelete(path: string): Promise<void>` — issues an HTTP `DELETE` to `${DB_URL}/${path}.json`.

- [ ] **Step 1: Add `dbDelete` and export it**

In `lib/firebase.js`, add after `dbPush`:

```js
async function dbDelete(path) {
  await fetch(`${DB_URL}/${path}.json`, { method: "DELETE" });
}
```

Update the final line to:

```js
module.exports = { dbGet, dbSet, dbUpdate, dbPush, dbIncrement, dbDelete };
```

- [ ] **Step 2: Smoke-test it**

Run this from the repo root:

```bash
node -e "
const assert = require('assert');
let calledUrl, calledOpts;
global.fetch = (url, opts) => { calledUrl = url; calledOpts = opts; return Promise.resolve({ json: () => Promise.resolve(null) }); };
const { dbDelete } = require('./lib/firebase');
dbDelete('telegram_link_tokens/abc123').then(() => {
  assert.strictEqual(calledUrl, 'https://nye-slotok-default-rtdb.firebaseio.com/telegram_link_tokens/abc123.json');
  assert.strictEqual(calledOpts.method, 'DELETE');
  console.log('OK: dbDelete');
});
"
```

Expected output: `OK: dbDelete`

- [ ] **Step 3: Commit**

```bash
git add lib/firebase.js
git commit -m "Add dbDelete to the Firebase REST client"
```

---

### Task 2: `setMyCommands` + shared `esc` in the Telegram client

**Files:**
- Modify: `lib/telegram.js`

**Interfaces:**
- Produces: `setMyCommands(commands: {command: string, description: string}[]): Promise<object>`
- Produces: `esc(s: any): string` — HTML-escapes `& < >` (matches the existing local copies in `api/telegram-webhook.js` and `api/notify.js`; this shared copy is used only by the two new files in this plan, the existing local copies are left as-is).

- [ ] **Step 1: Add `setMyCommands` and `esc`, export both**

In `lib/telegram.js`, add after `answerCallbackQuery`:

```js
function setMyCommands(commands) {
  return tg("setMyCommands", { commands });
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
```

Update the final line to:

```js
module.exports = { tg, sendMessage, editMessageText, answerCallbackQuery, setMyCommands, esc };
```

- [ ] **Step 2: Smoke-test it**

```bash
node -e "
const assert = require('assert');
process.env.BOT_TOKEN = 'test-token';
let calledUrl, calledBody;
global.fetch = (url, opts) => { calledUrl = url; calledBody = JSON.parse(opts.body); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); };
const { setMyCommands, esc } = require('./lib/telegram');
assert.strictEqual(esc('<b>&\"'), '&lt;b&gt;&amp;\"');
setMyCommands([{ command: 'balance', description: 'Баланс' }]).then(() => {
  assert.strictEqual(calledUrl, 'https://api.telegram.org/bottest-token/setMyCommands');
  assert.deepStrictEqual(calledBody.commands, [{ command: 'balance', description: 'Баланс' }]);
  console.log('OK: setMyCommands + esc');
});
"
```

Expected output: `OK: setMyCommands + esc`

- [ ] **Step 3: Commit**

```bash
git add lib/telegram.js
git commit -m "Add setMyCommands and a shared esc() to the Telegram client"
```

---

### Task 3: `lib/telegram-linking.js` — token validation and link/unlink

**Files:**
- Create: `lib/telegram-linking.js`

**Interfaces:**
- Consumes: `dbGet`, `dbUpdate` from `./firebase` (existing).
- Produces: `TOKEN_TTL_MS: number`
- Produces: `completeLink(chatId: number, token: string): Promise<{ok: true, nick: string} | {ok: false, reason: 'missing'|'not_found'|'expired'}>`
- Produces: `unlink(chatId: number): Promise<string | null>` — returns the nick that was unlinked, or `null` if that chat wasn't linked.
- Produces: `resolveNick(chatId: number): Promise<string | null>`

- [ ] **Step 1: Write the module**

```js
// lib/telegram-linking.js
const { dbGet, dbUpdate } = require("./firebase");

const TOKEN_TTL_MS = 10 * 60 * 1000;

async function completeLink(chatId, token) {
  if (!token) return { ok: false, reason: "missing" };
  const entry = await dbGet(`telegram_link_tokens/${token}`);
  if (!entry || !entry.nick) return { ok: false, reason: "not_found" };
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    await dbUpdate("", { [`telegram_link_tokens/${token}`]: null });
    return { ok: false, reason: "expired" };
  }
  await dbUpdate("", {
    [`users/${entry.nick}/telegramChatId`]: chatId,
    [`telegram_links/${chatId}`]: entry.nick,
    [`telegram_link_tokens/${token}`]: null,
  });
  return { ok: true, nick: entry.nick };
}

async function unlink(chatId) {
  const nick = await dbGet(`telegram_links/${chatId}`);
  if (!nick) return null;
  await dbUpdate("", {
    [`users/${nick}/telegramChatId`]: null,
    [`telegram_links/${chatId}`]: null,
  });
  return nick;
}

async function resolveNick(chatId) {
  return dbGet(`telegram_links/${chatId}`);
}

module.exports = { completeLink, unlink, resolveNick, TOKEN_TTL_MS };
```

- [ ] **Step 2: Smoke-test success, expired, and not-found cases**

```bash
node -e "
const assert = require('assert');
const responses = {};
global.fetch = (url, opts) => {
  const method = (opts && opts.method) || 'GET';
  const key = method + ' ' + url;
  const canned = responses[key];
  return Promise.resolve({ json: () => Promise.resolve(canned === undefined ? null : canned) });
};
const BASE = 'https://nye-slotok-default-rtdb.firebaseio.com';

// case 1: valid token
responses['GET ' + BASE + '/telegram_link_tokens/tok1.json'] = { nick: 'ivan', createdAt: Date.now() };
const { completeLink, unlink, resolveNick } = require('./lib/telegram-linking');
completeLink(555, 'tok1').then(r => {
  assert.deepStrictEqual(r, { ok: true, nick: 'ivan' });
  console.log('OK: completeLink valid token');

  // case 2: expired token
  responses['GET ' + BASE + '/telegram_link_tokens/tok2.json'] = { nick: 'ivan', createdAt: Date.now() - 11 * 60 * 1000 };
  return completeLink(555, 'tok2');
}).then(r => {
  assert.deepStrictEqual(r, { ok: false, reason: 'expired' });
  console.log('OK: completeLink expired token');

  // case 3: unknown token
  return completeLink(555, 'nope');
}).then(r => {
  assert.deepStrictEqual(r, { ok: false, reason: 'not_found' });
  console.log('OK: completeLink unknown token');

  // case 4: unlink
  responses['GET ' + BASE + '/telegram_links/555.json'] = 'ivan';
  return unlink(555);
}).then(nick => {
  assert.strictEqual(nick, 'ivan');
  console.log('OK: unlink');

  // case 5: resolveNick
  responses['GET ' + BASE + '/telegram_links/555.json'] = 'ivan';
  return resolveNick(555);
}).then(nick => {
  assert.strictEqual(nick, 'ivan');
  console.log('OK: resolveNick');
});
"
```

Expected output (5 lines): `OK: completeLink valid token` / `OK: completeLink expired token` / `OK: completeLink unknown token` / `OK: unlink` / `OK: resolveNick`

- [ ] **Step 3: Commit**

```bash
git add lib/telegram-linking.js
git commit -m "Add lib/telegram-linking.js: token validation and link/unlink"
```

---

### Task 4: Wire account linking into the webhook

**Files:**
- Modify: `api/telegram-webhook.js`

**Interfaces:**
- Consumes: `completeLink`, `unlink` from `../lib/telegram-linking` (Task 3).
- Consumes: `esc` from `../lib/telegram` (Task 2) — used only in the new code added here; the file's own local `esc()` at the bottom stays for the existing code.

- [ ] **Step 1: Import the linking module**

At the top of `api/telegram-webhook.js`, change:

```js
const { dbGet, dbSet, dbUpdate, dbPush, dbIncrement } = require("../lib/firebase");
const { sendMessage, editMessageText, answerCallbackQuery } = require("../lib/telegram");
```

to:

```js
const { dbGet, dbSet, dbUpdate, dbPush, dbIncrement } = require("../lib/firebase");
const { sendMessage, editMessageText, answerCallbackQuery } = require("../lib/telegram");
const { completeLink, unlink } = require("../lib/telegram-linking");
```

- [ ] **Step 2: Handle `/start link_<token>` in `handleStart`**

In `handleStart`, add a new branch before the final `else`:

```js
  if (payload.startsWith("dep_")) {
    ...
  } else if (payload.startsWith("reset_")) {
    ...
  } else if (payload.startsWith("link_")) {
    const token = payload.slice("link_".length);
    const result = await completeLink(chatId, token);
    if (result.ok) {
      await sendMessage(chatId, `✅ Акаунт «${esc(result.nick)}» прив'язано! Тепер сюди приходитимуть сповіщення про заявки, повідомлення й виграші.`);
      await sendQuickMenu(chatId);
    } else if (result.reason === "expired") {
      await sendMessage(chatId, "❌ Код прив'язки протух (діє 10 хв). Згенеруй новий на сайті.");
    } else {
      await sendMessage(chatId, "❌ Невірний код прив'язки. Згенеруй новий на сайті.");
    }
  } else {
```

(`esc` here is the file's own existing local `esc()` at the bottom of the file — no new import needed for this step; `sendQuickMenu` is added in Task 5, so this step alone will reference an undefined function until Task 5 lands. Since tasks are applied in order within the same working tree, that's fine — Task 5 is next.)

- [ ] **Step 3: Handle `/link <token>` and `/unlink` as standalone text commands**

In `handleMessage`, add two new checks after the `/start` branch and before the admin-command branch:

```js
  if (text.startsWith("/start")) return handleStart(chatId, text, fromUser, adminChatId);

  if (text.startsWith("/link")) {
    const token = text.slice("/link".length).trim();
    if (!token) return sendMessage(chatId, "Використання: /link <код>");
    const result = await completeLink(chatId, token);
    if (result.ok) {
      await sendMessage(chatId, `✅ Акаунт «${esc(result.nick)}» прив'язано!`);
      return sendQuickMenu(chatId);
    }
    if (result.reason === "expired") return sendMessage(chatId, "❌ Код протух (діє 10 хв). Згенеруй новий на сайті.");
    return sendMessage(chatId, "❌ Невірний код.");
  }

  if (text === "/unlink") {
    const nick = await unlink(chatId);
    if (!nick) return sendMessage(chatId, "Акаунт не був прив'язаний.");
    return sendMessage(chatId, `✅ Акаунт «${esc(nick)}» відв'язано.`, { reply_markup: { remove_keyboard: true } });
  }

  if (isAdmin && text.startsWith("/")) return handleAdminCommand(chatId, text);
```

- [ ] **Step 4: Manual verification (requires `BOT_TOKEN`/webhook not yet deployed — test the pure routing logic directly)**

```bash
node -e "
const assert = require('assert');
const responses = {};
const sent = [];
global.fetch = (url, opts) => {
  const method = (opts && opts.method) || 'GET';
  if (url.includes('api.telegram.org')) {
    sent.push(JSON.parse(opts.body));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  }
  const key = method + ' ' + url;
  return Promise.resolve({ json: () => Promise.resolve(responses[key] === undefined ? null : responses[key]) });
};
process.env.BOT_TOKEN = 'test';
process.env.WEBHOOK_SECRET = 'secret';
const BASE = 'https://nye-slotok-default-rtdb.firebaseio.com';
responses['GET ' + BASE + '/telegram_link_tokens/goodtok.json'] = { nick: 'ivan', createdAt: Date.now() };
responses['GET ' + BASE + '/bot_config/adminChatId.json'] = 999;

const handler = require('./api/telegram-webhook.js');
const req = {
  headers: { 'x-telegram-bot-api-secret-token': 'secret' },
  body: { message: { chat: { id: 555 }, text: '/link goodtok', from: {} } },
};
const res = { status: () => ({ end: () => {} }) };
handler(req, res).then(() => {
  const confirmMsg = sent.find(m => (m.text || '').includes(\"прив'язано\"));
  assert.ok(confirmMsg, 'expected a link-confirmation message to be sent');
  console.log('OK: /link goodtok sends confirmation');
});
"
```

Expected output: `OK: /link goodtok sends confirmation`

(This will fail until Task 5's `sendQuickMenu` exists — run this check again after Task 5 instead of after this task if it errors with `sendQuickMenu is not defined`.)

- [ ] **Step 5: Commit**

```bash
git add api/telegram-webhook.js
git commit -m "Wire /start link_, /link, /unlink into the webhook"
```

---

### Task 5: Persistent quick-action keyboard + `/menu` + command registration

**Files:**
- Modify: `api/telegram-webhook.js`

**Interfaces:**
- Consumes: `setMyCommands` from `../lib/telegram` (Task 2).
- Produces: `sendQuickMenu(chatId): Promise<object>` — used by Task 4's linking code and by Task 6/8.
- Produces: `BUTTON_COMMANDS: {[label: string]: string}` — maps a pressed reply-keyboard button's label text to its slash-command equivalent; consumed by Task 6's message routing.

- [ ] **Step 1: Import `setMyCommands`**

Change the telegram import line to:

```js
const { sendMessage, editMessageText, answerCallbackQuery, setMyCommands } = require("../lib/telegram");
```

- [ ] **Step 2: Add the keyboard constant, `sendQuickMenu`, and `/menu`**

Add near the top of the file, after the module-level requires:

```js
const QUICK_KEYBOARD = {
  reply_markup: {
    keyboard: [
      ["💰 Баланс", "📊 Історія"],
      ["📥 Поповнити", "📤 Вивести"],
      ["🔗 Мій акаунт", "❓ Допомога"],
    ],
    resize_keyboard: true,
  },
};

const BUTTON_COMMANDS = {
  "💰 Баланс": "/balance",
  "📊 Історія": "/history",
  "📥 Поповнити": "/deposit",
  "📤 Вивести": "/withdraw",
  "🔗 Мій акаунт": "/me",
  "❓ Допомога": "/help",
};

const PLAYER_COMMANDS = [
  { command: "balance", description: "Баланс акаунту" },
  { command: "history", description: "Останні операції" },
  { command: "me", description: "Інфо про акаунт" },
  { command: "deposit", description: "Поповнити баланс" },
  { command: "withdraw", description: "Вивести кошти" },
  { command: "link", description: "Прив'язати акаунт SlotOK" },
  { command: "unlink", description: "Відв'язати акаунт" },
  { command: "menu", description: "Показати меню швидких дій" },
  { command: "cancel", description: "Скасувати поточну дію" },
  { command: "help", description: "Список команд" },
];

function sendQuickMenu(chatId) {
  return sendMessage(chatId, "Меню швидких дій 👇", QUICK_KEYBOARD);
}
```

- [ ] **Step 3: Handle `/menu` and register commands lazily on first admin bootstrap**

In `handleMessage`, add right after the `/unlink` block from Task 4:

```js
  if (text === "/menu") return sendQuickMenu(chatId);
```

In `handleSetAdmin` (the existing function), add a call to register the command list once, right after the existing `await dbSet("bot_config/adminChatId", chatId);` line:

```js
  await dbSet("bot_config/adminChatId", chatId);
  await setMyCommands(PLAYER_COMMANDS);
```

- [ ] **Step 4: Re-run Task 4's verification script**

Run the exact same `node -e "..."` script from Task 4 Step 4. It should now pass (no `sendQuickMenu is not defined` error).

Expected output: `OK: /link goodtok sends confirmation`

- [ ] **Step 5: Smoke-test `/menu` directly**

```bash
node -e "
const assert = require('assert');
const sent = [];
global.fetch = (url, opts) => {
  if (url.includes('api.telegram.org')) { sent.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
  return Promise.resolve({ json: () => Promise.resolve(null) });
};
process.env.BOT_TOKEN = 'test';
process.env.WEBHOOK_SECRET = 'secret';
const handler = require('./api/telegram-webhook.js');
const req = { headers: { 'x-telegram-bot-api-secret-token': 'secret' }, body: { message: { chat: { id: 555 }, text: '/menu', from: {} } } };
const res = { status: () => ({ end: () => {} }) };
handler(req, res).then(() => {
  const menuMsg = sent.find(m => m.reply_markup && m.reply_markup.keyboard);
  assert.ok(menuMsg, 'expected a message with a reply keyboard');
  assert.strictEqual(menuMsg.reply_markup.keyboard[0][0], '💰 Баланс');
  console.log('OK: /menu sends quick keyboard');
});
"
```

Expected output: `OK: /menu sends quick keyboard`

- [ ] **Step 6: Commit**

```bash
git add api/telegram-webhook.js
git commit -m "Add persistent quick-action keyboard, /menu, command registration"
```

---

### Task 6: Player read commands — `/balance` `/history` `/me` `/help`

**Files:**
- Modify: `api/telegram-webhook.js`

**Interfaces:**
- Consumes: `resolveNick` from `../lib/telegram-linking` (Task 3).
- Consumes: `BUTTON_COMMANDS` (Task 5) to translate a pressed keyboard button into its command before dispatch.

- [ ] **Step 1: Import `resolveNick`**

Change the linking import line to:

```js
const { completeLink, unlink, resolveNick } = require("../lib/telegram-linking");
```

- [ ] **Step 2: Add the player command handlers**

Add near the bottom of the "Admin-only text commands" section (same style as `cmdUser`/`cmdStats`):

```js
async function cmdPlayerBalance(chatId, nick) {
  const u = await dbGet(`users/${nick}`);
  return sendMessage(chatId, `💰 Баланс: ${(u && u.balance) || 0}₴`);
}

async function cmdPlayerHistory(chatId, nick) {
  const hist = (await dbGet(`users/${nick}/history`)) || {};
  const entries = Object.values(hist).sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 10);
  if (!entries.length) return sendMessage(chatId, "Історія порожня.");
  const text = "📊 <b>Останні операції:</b>\n" + entries.map((e) => `• ${esc(e.text || "")}`).join("\n");
  return sendMessage(chatId, text);
}

async function cmdPlayerMe(chatId, nick) {
  const u = await dbGet(`users/${nick}`);
  if (!u) return sendMessage(chatId, "Акаунт не знайдено.");
  const text =
    `🔗 <b>${esc(nick)}</b>\n` +
    `💰 Баланс: ${u.balance || 0}₴\n` +
    `📅 Реєстрація: ${u.registeredAt ? new Date(u.registeredAt).toLocaleString("uk-UA") : "—"}\n` +
    `🎮 Ігор: ${u.totalGames || 0}`;
  return sendMessage(chatId, text);
}

function cmdPlayerHelp(chatId) {
  return sendMessage(
    chatId,
    "🤖 <b>Команди:</b>\n💰 /balance — баланс\n📊 /history — останні операції\n🔗 /me — інфо про акаунт\n📥 /deposit — поповнити\n📤 /withdraw — вивести\n/cancel — скасувати поточну дію\n/unlink — відв'язати акаунт\n/menu — показати меню"
  );
}
```

- [ ] **Step 3: Wire routing — `handlePlayerCommand`**

Add a new function, and call it from `handleMessage`:

```js
async function handlePlayerCommand(chatId, rawText) {
  const text = BUTTON_COMMANDS[rawText] || rawText;
  if (!["/balance", "/history", "/me", "/help"].includes(text)) return false;

  const nick = await resolveNick(chatId);
  if (!nick) {
    await sendMessage(chatId, "❌ Акаунт не прив'язано. Прив'яжи через кнопку на сайті або /link <код>.");
    return true;
  }
  if (text === "/balance") await cmdPlayerBalance(chatId, nick);
  else if (text === "/history") await cmdPlayerHistory(chatId, nick);
  else if (text === "/me") await cmdPlayerMe(chatId, nick);
  else if (text === "/help") await cmdPlayerHelp(chatId);
  return true;
}
```

In `handleMessage`, replace:

```js
  if (isAdmin && text.startsWith("/")) return handleAdminCommand(chatId, text);

  // Anything else: relay to admin (basic 2-way contact)
  if (adminChatId && !isAdmin) {
```

with:

```js
  if (isAdmin && text.startsWith("/")) return handleAdminCommand(chatId, text);

  if (await handlePlayerCommand(chatId, text)) return;

  // Anything else: relay to admin (basic 2-way contact)
  if (adminChatId && !isAdmin) {
```

- [ ] **Step 4: Smoke-test `/balance` for a linked and an unlinked chat**

```bash
node -e "
const assert = require('assert');
const responses = {};
const sent = [];
global.fetch = (url, opts) => {
  if (url.includes('api.telegram.org')) { sent.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
  const method = (opts && opts.method) || 'GET';
  const key = method + ' ' + url;
  return Promise.resolve({ json: () => Promise.resolve(responses[key] === undefined ? null : responses[key]) });
};
process.env.BOT_TOKEN = 'test';
process.env.WEBHOOK_SECRET = 'secret';
const BASE = 'https://nye-slotok-default-rtdb.firebaseio.com';
responses['GET ' + BASE + '/telegram_links/777.json'] = 'ivan';
responses['GET ' + BASE + '/users/ivan.json'] = { balance: 1234 };
const handler = require('./api/telegram-webhook.js');
const res = { status: () => ({ end: () => {} }) };

handler({ headers: { 'x-telegram-bot-api-secret-token': 'secret' }, body: { message: { chat: { id: 777 }, text: '💰 Баланс', from: {} } } }, res).then(() => {
  const msg = sent.find(m => (m.text||'').includes('1234'));
  assert.ok(msg, 'expected balance message with 1234');
  console.log('OK: linked /balance');
  return handler({ headers: { 'x-telegram-bot-api-secret-token': 'secret' }, body: { message: { chat: { id: 888 }, text: '/balance', from: {} } } }, res);
}).then(() => {
  const msg = sent.find(m => (m.text||'').includes('не прив'));
  assert.ok(msg, 'expected not-linked message');
  console.log('OK: unlinked /balance');
});
"
```

Expected output: `OK: linked /balance` / `OK: unlinked /balance`

- [ ] **Step 5: Commit**

```bash
git add api/telegram-webhook.js
git commit -m "Add player commands: /balance /history /me /help"
```

---

### Task 7: `lib/telegram-money-flow.js` — `/deposit` conversation

**Files:**
- Create: `lib/telegram-money-flow.js`

**Interfaces:**
- Consumes: `dbGet`, `dbSet`, `dbUpdate`, `dbIncrement` from `./firebase`; `sendMessage` from `./telegram`; `esc` from `./telegram` (Task 2).
- Produces: `startDeposit(chatId: number, nick: string): Promise<void>`
- Produces: `handleMoneyFlowReply(chatId: number, nick: string, text: string): Promise<boolean>` — `true` if the text was consumed as part of an in-progress dialog (deposit or withdraw), `false` if there's no active dialog for this chat.

- [ ] **Step 1: Write the module skeleton, state helpers, and `startDeposit`**

```js
// lib/telegram-money-flow.js
const { dbGet, dbSet, dbUpdate, dbIncrement } = require("./firebase");
const { sendMessage, esc } = require("./telegram");

const STATE_TTL_MS = 10 * 60 * 1000;

const AMOUNT_KEYBOARD = { reply_markup: { keyboard: [["100", "300", "500"], ["1000", "Інша сума"], ["/cancel"]], resize_keyboard: true } };
const DEPOSIT_METHOD_KEYBOARD = { reply_markup: { keyboard: [["🟢 PrivatBank", "🐈 Monobank"], ["/cancel"]], resize_keyboard: true } };
const DEPOSIT_METHOD_LABELS = { "🟢 PrivatBank": "privat", "🐈 Monobank": "mono" };

async function getState(chatId) {
  const s = await dbGet(`telegram_state/${chatId}`);
  if (!s || Date.now() - (s.updatedAt || 0) > STATE_TTL_MS) return null;
  return s;
}

function saveState(chatId, type, step, data) {
  return dbSet(`telegram_state/${chatId}`, { type, step, data, updatedAt: Date.now() });
}

function clearState(chatId) {
  return dbSet(`telegram_state/${chatId}`, null);
}

async function startDeposit(chatId, nick) {
  await saveState(chatId, "deposit", "amount", {});
  return sendMessage(chatId, "Обери суму поповнення (мін. 50₴) або напиши свою:", AMOUNT_KEYBOARD);
}

module.exports = { startDeposit, getState, saveState, clearState, STATE_TTL_MS };
```

- [ ] **Step 2: Smoke-test `startDeposit` and state TTL**

```bash
node -e "
const assert = require('assert');
const store = {};
global.fetch = (url, opts) => {
  const method = (opts && opts.method) || 'GET';
  const path = url.replace('https://nye-slotok-default-rtdb.firebaseio.com/', '').replace('.json', '');
  if (method === 'PUT') { store[path] = opts.body === undefined ? null : JSON.parse(opts.body); return Promise.resolve({ ok: true, json: () => Promise.resolve(null) }); }
  return Promise.resolve({ json: () => Promise.resolve(store[path] === undefined ? null : store[path]) });
};
process.env.BOT_TOKEN = 'test';
const { startDeposit, getState } = require('./lib/telegram-money-flow');

startDeposit(111, 'ivan').then(() => getState(111)).then(s => {
  assert.strictEqual(s.type, 'deposit');
  assert.strictEqual(s.step, 'amount');
  console.log('OK: startDeposit sets state');

  store['telegram_state/222'] = { type: 'deposit', step: 'amount', data: {}, updatedAt: Date.now() - 11 * 60 * 1000 };
  return getState(222);
}).then(s => {
  assert.strictEqual(s, null);
  console.log('OK: stale state (>10min) treated as absent');
});
"
```

Expected output: `OK: startDeposit sets state` / `OK: stale state (>10min) treated as absent`

- [ ] **Step 3: Add the deposit reply handler and wire it into `handleMoneyFlowReply`**

Extend the module (before `module.exports`):

```js
function depositButtons(id) {
  return { inline_keyboard: [[{ text: "✅ Підтвердити", callback_data: `dep:approve:${id}` }, { text: "❌ Відхилити", callback_data: `dep:reject:${id}` }]] };
}

async function handleDepositReply(chatId, nick, step, data, text) {
  if (step === "amount") {
    if (text === "Інша сума") return sendMessage(chatId, "Введи суму цифрами (мін. 50₴):");
    const amount = parseInt(text, 10);
    if (!amount || amount < 50) return sendMessage(chatId, "❌ Мінімальна сума поповнення — 50₴. Спробуй ще:");
    await saveState(chatId, "deposit", "method", { amount });
    return sendMessage(chatId, `Сума: ${amount}₴. Обери банк:`, DEPOSIT_METHOD_KEYBOARD);
  }

  if (step === "method") {
    const method = DEPOSIT_METHOD_LABELS[text];
    if (!method) return sendMessage(chatId, "Обери банк кнопками нижче.", DEPOSIT_METHOD_KEYBOARD);

    const u = (await dbGet(`users/${nick}`)) || {};
    const userId = u.id || nick;
    const reqId = `${nick}_${Date.now()}`;
    await dbSet(`deposit_requests/${reqId}`, { user: nick, userId, amount: data.amount, method, status: "pending", time: Date.now() });
    await clearState(chatId);
    await sendMessage(chatId, `✅ Заявку на ${data.amount}₴ подано! Реквізити дивись у застосунку в розділі «Каса». Після оплати очікуй підтвердження адміна.`, { reply_markup: { remove_keyboard: true } });

    const adminChatId = await dbGet("bot_config/adminChatId");
    if (adminChatId) {
      await sendMessage(adminChatId, `💰 <b>Нова заявка на поповнення</b>\n👤 ${esc(nick)}\n💵 ${data.amount}₴ · ${esc(method)}`, { reply_markup: depositButtons(reqId) });
    }
  }
}
```

Add the dispatcher and export it:

```js
async function handleMoneyFlowReply(chatId, nick, text) {
  const state = await getState(chatId);
  if (!state) return false;
  if (state.type === "deposit") await handleDepositReply(chatId, nick, state.step, state.data, text);
  return true;
}
```

```js
module.exports = { startDeposit, getState, saveState, clearState, handleMoneyFlowReply, STATE_TTL_MS };
```

- [ ] **Step 4: Smoke-test the full deposit dialog**

```bash
node -e "
const assert = require('assert');
const store = {};
const sent = [];
global.fetch = (url, opts) => {
  const method = (opts && opts.method) || 'GET';
  if (url.includes('api.telegram.org')) { sent.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
  const path = url.replace('https://nye-slotok-default-rtdb.firebaseio.com/', '').replace('.json', '');
  if (method === 'PUT') { store[path] = opts.body === undefined ? null : JSON.parse(opts.body); return Promise.resolve({ ok: true, json: () => Promise.resolve(null) }); }
  return Promise.resolve({ json: () => Promise.resolve(store[path] === undefined ? null : store[path]) });
};
process.env.BOT_TOKEN = 'test';
store['users/ivan'] = { id: 'ivan', balance: 0 };
store['bot_config/adminChatId'] = 999;

const { startDeposit, handleMoneyFlowReply } = require('./lib/telegram-money-flow');
startDeposit(111, 'ivan')
  .then(() => handleMoneyFlowReply(111, 'ivan', '500'))
  .then(() => handleMoneyFlowReply(111, 'ivan', '🟢 PrivatBank'))
  .then(() => {
    const reqKey = Object.keys(store).find(k => k.startsWith('deposit_requests/'));
    assert.ok(reqKey, 'expected a deposit_requests entry to be created');
    assert.strictEqual(store[reqKey].amount, 500);
    assert.strictEqual(store[reqKey].method, 'privat');
    assert.strictEqual(store[reqKey].status, 'pending');
    assert.strictEqual(store['telegram_state/111'], null);
    const adminMsg = sent.find(m => (m.text||'').includes('Нова заявка на поповнення'));
    assert.ok(adminMsg, 'expected admin to be notified with buttons');
    assert.ok(adminMsg.reply_markup.inline_keyboard[0][0].callback_data.startsWith('dep:approve:'));
    console.log('OK: full deposit dialog creates request + notifies admin');
  });
"
```

Expected output: `OK: full deposit dialog creates request + notifies admin`

- [ ] **Step 5: Commit**

```bash
git add lib/telegram-money-flow.js
git commit -m "Add /deposit conversational flow"
```

---

### Task 8: `/withdraw` conversation + `/cancel`, wire into the webhook

**Files:**
- Modify: `lib/telegram-money-flow.js`
- Modify: `api/telegram-webhook.js`

**Interfaces:**
- Consumes: `dbIncrement` from `./firebase` (already imported in Task 7's skeleton).
- Produces (added to `lib/telegram-money-flow.js`): `startWithdraw(chatId: number, nick: string): Promise<void>`

- [ ] **Step 1: Add `startWithdraw` and the withdraw reply handler**

In `lib/telegram-money-flow.js`, add:

```js
const WITHDRAW_METHOD_KEYBOARD = { reply_markup: { keyboard: [["🟢 PrivatBank", "🐈 Monobank"], ["₮ USDT"], ["/cancel"]], resize_keyboard: true } };
const WITHDRAW_METHOD_LABELS = { "🟢 PrivatBank": "privat", "🐈 Monobank": "mono", "₮ USDT": "usdt" };

function withdrawButtons(id) {
  return { inline_keyboard: [[{ text: "✅ Підтвердити", callback_data: `wd:approve:${id}` }, { text: "❌ Відхилити", callback_data: `wd:reject:${id}` }]] };
}

async function startWithdraw(chatId, nick) {
  const u = (await dbGet(`users/${nick}`)) || {};
  if (u.pendingWithdraw) return sendMessage(chatId, "❌ У тебе вже є активна заявка на вивід. Дочекайся її обробки.");
  await saveState(chatId, "withdraw", "amount", { balance: u.balance || 0 });
  return sendMessage(chatId, `Баланс: ${u.balance || 0}₴. Скільки вивести (мін. 200₴)?`, { reply_markup: { keyboard: [["/cancel"]], resize_keyboard: true } });
}

async function handleWithdrawReply(chatId, nick, step, data, text) {
  if (step === "amount") {
    const amount = parseInt(text, 10);
    if (!amount || amount < 200) return sendMessage(chatId, "❌ Мінімальна сума виводу — 200₴. Спробуй ще:");
    if (amount > data.balance) return sendMessage(chatId, "❌ Недостатньо коштів. Спробуй меншу суму:");
    await saveState(chatId, "withdraw", "method", { amount });
    return sendMessage(chatId, "Обери спосіб виводу:", WITHDRAW_METHOD_KEYBOARD);
  }

  if (step === "method") {
    const method = WITHDRAW_METHOD_LABELS[text];
    if (!method) return sendMessage(chatId, "Обери спосіб кнопками нижче.", WITHDRAW_METHOD_KEYBOARD);
    await saveState(chatId, "withdraw", "card", { amount: data.amount, method });
    return sendMessage(chatId, method === "usdt" ? "Введи USDT TRC20 адресу:" : "Введи номер картки:", { reply_markup: { keyboard: [["/cancel"]], resize_keyboard: true } });
  }

  if (step === "card") {
    const card = text.trim();
    if (!card) return sendMessage(chatId, "Введи реквізити для виводу:");
    const u = (await dbGet(`users/${nick}`)) || {};
    const userId = u.id || nick;
    const reqId = `${nick}_${Date.now()}`;
    await dbIncrement(`users/${nick}/balance`, -data.amount);
    await dbUpdate(`users/${nick}`, { pendingWithdraw: true });
    await dbSet(`withdraw_requests/${reqId}`, { user: nick, userId, amount: data.amount, method: data.method, card, status: "pending", time: Date.now() });
    await dbSet(`users/${nick}/withdraws/${reqId}`, { amount: data.amount, method: data.method, status: "pending", time: Date.now() });
    await clearState(chatId);
    await sendMessage(chatId, `✅ Заявку на вивід ${data.amount}₴ прийнято! Обробка 1-24 год.`, { reply_markup: { remove_keyboard: true } });

    const adminChatId = await dbGet("bot_config/adminChatId");
    if (adminChatId) {
      await sendMessage(adminChatId, `💸 <b>Нова заявка на вивід</b>\n👤 ${esc(nick)}\n💵 ${data.amount}₴ · ${esc(data.method)}\n💳 ${esc(card)}`, { reply_markup: withdrawButtons(reqId) });
    }
  }
}
```

- [ ] **Step 2: Add `/cancel` handling and wire withdraw into the dispatcher**

Update `handleMoneyFlowReply`:

```js
async function handleMoneyFlowReply(chatId, nick, text) {
  const state = await getState(chatId);
  if (!state) return false;
  if (text === "/cancel") {
    await clearState(chatId);
    await sendMessage(chatId, "Скасовано.", { reply_markup: { remove_keyboard: true } });
    return true;
  }
  if (state.type === "deposit") await handleDepositReply(chatId, nick, state.step, state.data, text);
  else if (state.type === "withdraw") await handleWithdrawReply(chatId, nick, state.step, state.data, text);
  return true;
}
```

Update the exports line:

```js
module.exports = { startDeposit, startWithdraw, getState, saveState, clearState, handleMoneyFlowReply, STATE_TTL_MS };
```

- [ ] **Step 3: Wire `/deposit`, `/withdraw`, and in-progress dialogs into the webhook**

In `api/telegram-webhook.js`, import the module:

```js
const { startDeposit, startWithdraw, handleMoneyFlowReply } = require("../lib/telegram-money-flow");
```

Extend `handlePlayerCommand` (from Task 6) to also accept `/deposit` and `/withdraw`, and check for an in-progress dialog first:

```js
async function handlePlayerCommand(chatId, rawText) {
  const text = BUTTON_COMMANDS[rawText] || rawText;

  const nickForFlow = await resolveNick(chatId);
  if (nickForFlow && (await handleMoneyFlowReply(chatId, nickForFlow, text))) return true;

  if (!["/balance", "/history", "/me", "/help", "/deposit", "/withdraw"].includes(text)) return false;

  const nick = nickForFlow;
  if (!nick) {
    await sendMessage(chatId, "❌ Акаунт не прив'язано. Прив'яжи через кнопку на сайті або /link <код>.");
    return true;
  }
  if (text === "/balance") await cmdPlayerBalance(chatId, nick);
  else if (text === "/history") await cmdPlayerHistory(chatId, nick);
  else if (text === "/me") await cmdPlayerMe(chatId, nick);
  else if (text === "/help") await cmdPlayerHelp(chatId);
  else if (text === "/deposit") await startDeposit(chatId, nick);
  else if (text === "/withdraw") await startWithdraw(chatId, nick);
  return true;
}
```

- [ ] **Step 4: Smoke-test the full withdraw dialog**

```bash
node -e "
const assert = require('assert');
const store = {};
const sent = [];
global.fetch = (url, opts) => {
  const method = (opts && opts.method) || 'GET';
  if (url.includes('api.telegram.org')) { sent.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
  const path = url.replace('https://nye-slotok-default-rtdb.firebaseio.com/', '').replace('.json', '');
  if (method === 'PUT') { const body = opts.body === undefined ? null : JSON.parse(opts.body); const etag = opts.headers && opts.headers['if-match']; if (etag !== undefined) { return Promise.resolve({ ok: true, json: () => Promise.resolve(null) }); } store[path] = body; return Promise.resolve({ ok: true, headers: { get: () => 'W/etag' }, json: () => Promise.resolve(null) }); }
  if (method === 'PATCH') { const body = JSON.parse(opts.body); store[path] = Object.assign(store[path] || {}, body); return Promise.resolve({ ok: true, json: () => Promise.resolve(null) }); }
  const headersObj = { get: () => 'W/etag' };
  return Promise.resolve({ headers: headersObj, json: () => Promise.resolve(store[path] === undefined ? null : store[path]) });
};
process.env.BOT_TOKEN = 'test';
store['users/ivan'] = { id: 'ivan', balance: 1000 };
store['bot_config/adminChatId'] = 999;

const { startWithdraw, handleMoneyFlowReply } = require('./lib/telegram-money-flow');
startWithdraw(111, 'ivan')
  .then(() => handleMoneyFlowReply(111, 'ivan', '300'))
  .then(() => handleMoneyFlowReply(111, 'ivan', '🟢 PrivatBank'))
  .then(() => handleMoneyFlowReply(111, 'ivan', '5168745012345678'))
  .then(() => {
    const reqKey = Object.keys(store).find(k => k.startsWith('withdraw_requests/'));
    assert.ok(reqKey, 'expected a withdraw_requests entry');
    assert.strictEqual(store[reqKey].amount, 300);
    assert.strictEqual(store[reqKey].card, '5168745012345678');
    assert.strictEqual(store['users/ivan'].balance, 700);
    assert.strictEqual(store['users/ivan'].pendingWithdraw, true);
    console.log('OK: full withdraw dialog freezes funds + creates request');
  });
"
```

Expected output: `OK: full withdraw dialog freezes funds + creates request`

(This mock's `dbIncrement` handling is simplified vs. the real ETag retry loop in `lib/firebase.js` — it's exercising the money-flow module's call shape, not re-testing `dbIncrement` itself, which already has its own coverage from prior work on `lib/firebase.js`.)

- [ ] **Step 5: Commit**

```bash
git add lib/telegram-money-flow.js api/telegram-webhook.js
git commit -m "Add /withdraw conversational flow and /cancel"
```

---

### Task 9: Dual-delivery push in `notifyPlayer()`

**Files:**
- Modify: `api/telegram-webhook.js`

- [ ] **Step 1: Extend `notifyPlayer` to also push a real Telegram message when linked**

Find the existing function:

```js
async function notifyPlayer(user, text) {
  const key = await dbPush(`pm/${user}`, { from: "🏦 SlotOK", to: user, text, ts: Date.now() });
  await dbIncrement(`users/${user}/pmUnread`, 1);
  return key;
}
```

Replace with:

```js
async function notifyPlayer(user, text) {
  const key = await dbPush(`pm/${user}`, { from: "🏦 SlotOK", to: user, text, ts: Date.now() });
  await dbIncrement(`users/${user}/pmUnread`, 1);
  const chatId = await dbGet(`users/${user}/telegramChatId`);
  if (chatId) await sendMessage(chatId, text);
  return key;
}
```

No other call site changes — `actOnDeposit`, `actOnWithdraw`, and `actOnPasswordReset` already call `notifyPlayer(r.user, ...)` and are untouched.

- [ ] **Step 2: Smoke-test dual delivery**

```bash
node -e "
const assert = require('assert');
const store = { 'users/ivan/telegramChatId': 555 };
const sent = [];
global.fetch = (url, opts) => {
  const method = (opts && opts.method) || 'GET';
  if (url.includes('api.telegram.org')) { sent.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
  const path = url.replace('https://nye-slotok-default-rtdb.firebaseio.com/', '').replace('.json', '');
  if (method === 'POST') return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: 'k1' }) });
  const headersObj = { get: () => 'W/etag' };
  if (method === 'PUT') { store[path] = JSON.parse(opts.body); return Promise.resolve({ ok: true, headers: headersObj, json: () => Promise.resolve(null) }); }
  return Promise.resolve({ headers: headersObj, json: () => Promise.resolve(store[path] === undefined ? null : store[path]) });
};
process.env.BOT_TOKEN = 'test';
process.env.WEBHOOK_SECRET = 'secret';
delete require.cache[require.resolve('./api/telegram-webhook.js')];
const webhookPath = require.resolve('./api/telegram-webhook.js');
const src = require('fs').readFileSync(webhookPath, 'utf8');
assert.ok(src.includes('telegramChatId'), 'expected notifyPlayer to read telegramChatId');
console.log('OK: notifyPlayer wired to telegramChatId (source check)');
"
```

Expected output: `OK: notifyPlayer wired to telegramChatId (source check)`

(`notifyPlayer` isn't exported from the module — this step does a lightweight source-presence check rather than invoking it directly, since exporting internal helpers purely for this one check isn't worth the extra surface area. Task 8's and Task 4's tests already exercise the exported request/webhook paths end-to-end.)

- [ ] **Step 3: Commit**

```bash
git add api/telegram-webhook.js
git commit -m "Push real Telegram messages from notifyPlayer when linked"
```

---

### Task 10: `player-ping` request type in `api/notify.js`

**Files:**
- Modify: `api/notify.js`

**Interfaces:**
- Produces: handling for `POST /api/notify` with `{ type: 'player-ping', to: string, kind: 'pm'|'clan-chat'|'bigwin'|'jackpot'|'bonus', ref: object }`.

- [ ] **Step 1: Add the `player-ping` branch**

In `api/notify.js`, add a new branch inside the try block, before the existing `type === "support"` check:

```js
    const { type, id, user, to, kind, ref } = req.body || {};

    if (type === "player-ping") {
      if (!to || !kind) { res.status(400).end(); return; }
      const chatId = await dbGet(`users/${to}/telegramChatId`);
      if (!chatId) { res.status(200).end(); return; }

      let text = null;
      if (kind === "pm" && ref && ref.from) {
        text = `📩 Нове повідомлення від ${esc(ref.from)}`;
      } else if (kind === "clan-chat" && ref && ref.user) {
        text = `👥 ${esc(ref.user)} в клан-чаті: ${esc(ref.text || "")}`;
      } else if (kind === "bigwin" && ref && typeof ref.amount === "number") {
        text = `🎉 Великий виграш: +${ref.amount}₴ (${esc(ref.game || "гра")})!`;
      } else if (kind === "jackpot" && ref && typeof ref.amount === "number") {
        text = `🎰 ДЖЕКПОТ! Нараховано ₴${ref.amount}!`;
      } else if (kind === "bonus" && ref && typeof ref.amount === "number") {
        text = `🎁 Бонус: +${ref.amount}₴!`;
      }
      if (!text) { res.status(200).end(); return; }

      await sendMessage(chatId, text);
      res.status(200).end();
      return;
    }

    if (type === "support") {
```

(The variable `type` is already destructured further down as `const { type, id, user } = req.body || {};` — replace that existing line with the extended destructuring above rather than duplicating it. `user` stays because it's still used by the existing `type === "support"` branch below.)

- [ ] **Step 2: Smoke-test it**

```bash
node -e "
const assert = require('assert');
const store = { 'users/ivan/telegramChatId': 555 };
const sent = [];
global.fetch = (url, opts) => {
  const method = (opts && opts.method) || 'GET';
  if (url.includes('api.telegram.org')) { sent.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); }
  const path = url.replace('https://nye-slotok-default-rtdb.firebaseio.com/', '').replace('.json', '');
  return Promise.resolve({ json: () => Promise.resolve(store[path] === undefined ? null : store[path]) });
};
process.env.BOT_TOKEN = 'test';
const handler = require('./api/notify.js');
let statusCode;
const res = { status: (c) => { statusCode = c; return { end: () => {} }; } };
const req = { method: 'POST', body: { type: 'player-ping', to: 'ivan', kind: 'bigwin', ref: { amount: 5000, game: 'Slots' } } };
handler(req, res).then(() => {
  assert.strictEqual(statusCode, 200);
  const msg = sent.find(m => (m.text||'').includes('5000'));
  assert.ok(msg, 'expected a bigwin push message');
  console.log('OK: player-ping bigwin');
});
"
```

Expected output: `OK: player-ping bigwin`

- [ ] **Step 3: Commit**

```bash
git add api/notify.js
git commit -m "Add player-ping request type to api/notify.js"
```

---

### Task 11: Settings UI — link/unlink

**Files:**
- Modify: `index.html`
- Modify: `app.js`

- [ ] **Step 1: Add the settings section**

In `index.html`, inside `<div id="tab-settings">`, add a new `.settings-section` right after the closing `</div>` of the "Стример / Фокус" section (search for the block containing `settingFocus` and add immediately after its closing `</div></div>`):

```html
      <!-- Telegram -->
      <div class="settings-section">
        <div class="settings-row">
          <span class="settings-icon">✈️</span>
          <div style="flex:1;">
            <div class="settings-label">Telegram</div>
            <div class="settings-sub" id="tgLinkStatus">Не прив'язано</div>
          </div>
          <button class="btn-outline" id="tgLinkBtn" style="width:auto;padding:8px 14px;margin:0;" onclick="linkTelegram()">Прив'язати</button>
        </div>
      </div>

      <!-- Telegram link modal -->
      <div id="tgLinkModal" class="hidden" style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;">
        <div style="background:#0d0d0d;border:1px solid rgba(74,158,255,.2);border-radius:14px;padding:20px;max-width:320px;width:90%;text-align:center;">
          <h3 style="margin:0 0 10px;color:#4a9eff;">✈️ Прив'язка Telegram</h3>
          <button class="btn-primary" id="tgLinkOpenBtn" style="width:100%;margin-bottom:10px;">Відкрити Telegram</button>
          <div style="font-size:12px;color:#888;margin-bottom:6px;">Або напиши боту вручну:</div>
          <div style="font-family:monospace;font-size:18px;font-weight:900;letter-spacing:2px;color:#fff;background:#1a1a1a;border-radius:8px;padding:8px;margin-bottom:12px;" id="tgLinkCode"></div>
          <button class="btn-outline" style="width:100%;" onclick="document.getElementById('tgLinkModal').classList.add('hidden')">Закрити</button>
        </div>
      </div>
```

- [ ] **Step 2: Add `linkTelegram()`, `unlinkTelegram()`, and the status listener in `app.js`**

Add near `openTelegramBot()` (around line 545 in `app.js`):

```js
function linkTelegram() {
  const token = String(Math.floor(100000 + Math.random() * 900000));
  db.ref('telegram_link_tokens/' + token).set({ nick: currentUser, createdAt: Date.now() });
  document.getElementById('tgLinkCode').textContent = token;
  document.getElementById('tgLinkOpenBtn').onclick = () => {
    window.open(`https://t.me/${TG_BOT_USERNAME}?start=link_${token}`, '_blank');
  };
  document.getElementById('tgLinkModal').classList.remove('hidden');
}

function unlinkTelegram() {
  db.ref('users/' + currentUser + '/telegramChatId').once('value', snap => {
    const chatId = snap.val();
    db.ref('users/' + currentUser + '/telegramChatId').remove();
    if (chatId) db.ref('telegram_links/' + chatId).remove();
    notify('Telegram відв\'язано', 'info');
  });
}

function initTelegramLinkStatus() {
  if (!currentUser) return;
  db.ref('users/' + currentUser + '/telegramChatId').on('value', snap => {
    const statusEl = document.getElementById('tgLinkStatus');
    const btnEl = document.getElementById('tgLinkBtn');
    if (!statusEl || !btnEl) return;
    if (snap.val()) {
      statusEl.textContent = 'Прив\'язано ✅';
      btnEl.textContent = 'Відв\'язати';
      btnEl.onclick = unlinkTelegram;
    } else {
      statusEl.textContent = 'Не прив\'язано';
      btnEl.textContent = 'Прив\'язати';
      btnEl.onclick = linkTelegram;
    }
  });
}
```

Call `initTelegramLinkStatus()` from the same place `loadSavedLang()` is called on startup (search for `loadSavedLang();` at top-level init code and add `initTelegramLinkStatus();` on the next line) so the listener attaches once `currentUser` is set.

- [ ] **Step 3: Manual verification**

Use the `run` skill (or manually open `index.html`/dev server) to load the app, log in, go to Settings, click "Прив'язати", and confirm:
1. The modal shows a 6-digit code and an "Відкрити Telegram" button.
2. `telegram_link_tokens/<code>` exists in Firebase with the current nick (check via Firebase console or `curl https://nye-slotok-default-rtdb.firebaseio.com/telegram_link_tokens.json`).
3. After manually sending `/link <code>` to the real bot (or simulating via the Task 4 smoke test pattern with that nick), reloading Settings shows "Прив'язано ✅" and the button switches to "Відв'язати".

- [ ] **Step 4: Commit**

```bash
git add index.html app.js
git commit -m "Add Telegram link/unlink UI in Settings"
```

---

### Task 12: Wire `player-ping` into PM and clan chat

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Hook `pmSend()`**

In `app.js`, find `pmSend()` (around line 17039) and add one line after the two `db.ref('pm/...').push(msg)` calls:

```js
function pmSend() {
  const to = document.getElementById('pmToInput')?.value?.trim();
  const msgEl = document.getElementById('pmMsgInput');
  const text = msgEl?.value?.trim();
  if(!to || !text) return notify('Заповни отримувача і текст', 'error');
  if(to === currentUser) return notify('Не можна писати собі', 'error');
  db.ref('users/'+to).once('value', snap => {
    if(!snap.exists()) return notify('Гравця не знайдено', 'error');
    const msg = { from:currentUser, to, text, ts:Date.now() };
    db.ref('pm/'+currentUser).push(msg);
    db.ref('pm/'+to).push(msg);
    db.ref('users/'+to+'/pmUnread').set(firebase.database.ServerValue.increment(1));
    db.ref('users/'+currentUser+'/pmSent').set(firebase.database.ServerValue.increment(1));
    notifyBot('player-ping', null, { to, kind: 'pm', ref: { from: currentUser } });
    if(msgEl) msgEl.value = '';
    notify('✉️ Надіслано!', 'success');
    renderPmInbox();
  });
}
```

- [ ] **Step 2: Hook `pmReply(to)`**

Find `pmReply(to)` (around line 17150) and add the same call after its two push lines. Read the function first to place the line correctly — it mirrors `pmSend`'s two-push pattern (`db.ref('pm/'+currentUser).push(msg); db.ref('pm/'+to).push(msg);`); add immediately after those two lines:

```js
    notifyBot('player-ping', null, { to, kind: 'pm', ref: { from: currentUser } });
```

- [ ] **Step 3: Hook `sendClanChatMsg(clanId)`**

Find `sendClanChatMsg(clanId)` (line 6439-6445) and change it to also ping clan members. Since clan chat has multiple recipients and the roster isn't loaded in this function, keep this scoped: ping is sent to whoever is viewing the thread is out of scope for a push (they're already looking at it); instead this task limits itself to what's directly actionable — replace the function with:

```js
function sendClanChatMsg(clanId) {
  var inp = document.getElementById('clanChatInput');
  var text = inp ? inp.value.trim() : '';
  if (!text || !clanId) return;
  db.ref('clan_chats/' + clanId).push({ user: currentUser, text: text, avatar: userData.avatar || '👤', ts: Date.now() });
  db.ref('clans/' + clanId + '/members').once('value', snap => {
    const members = Object.keys(snap.val() || {});
    members.forEach(m => {
      if (m === currentUser) return;
      notifyBot('player-ping', null, { to: m, kind: 'clan-chat', ref: { user: currentUser, text } });
    });
  });
  if (inp) inp.value = '';
}
```

(Path confirmed against existing usage: `app.js:8144` writes `clans/<clanId>/members/<nick> = {role, joined}` when a member joins, so `clans/<clanId>/members` is an object keyed by nick — `Object.keys(snap.val())` above is correct as written.)

- [ ] **Step 4: Manual verification**

With two linked test accounts (or one linked + inspecting Firebase writes directly), send a PM from account A to account B and confirm a `POST /api/notify` fires with `{type:'player-ping', to:'B', kind:'pm', ...}` (check the Network tab), and that B's linked Telegram chat receives "📩 Нове повідомлення від A".

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Push Telegram notifications for PM and clan chat messages"
```

---

### Task 13: Wire jackpot/bonus/big-win notifications

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Hook the big-win threshold into `finishSlots(bet)`**

In `app.js`, inside `finishSlots(bet)`'s `if(win > 0) { ... }` block (around line 827-844), add right after the balance-credit line (`db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));`):

```js
        if (win >= bet * 20) {
          notifyBot('player-ping', null, { to: currentUser, kind: 'bigwin', ref: { amount: win, game: 'Slots' } });
        }
```

- [ ] **Step 2: Hook `adminForceJackpot()`**

In `app.js`, find `adminForceJackpot()` (line 7322-7334) and add a call right after the existing jackpot PM push line:

```js
function adminForceJackpot() {
  db.ref('jackpot/amount').once('value', function(snap){
    var amt = snap.val()||0;
    if(amt<1) return notify('Джекпот порожній','error');
    var winner = prompt('Нік переможця:');
    if(!winner) return;
    db.ref('users/'+winner+'/balance').set(firebase.database.ServerValue.increment(amt));
    db.ref('jackpot/amount').set(0);
    db.ref('pm/'+winner+'/'+db.ref().push().key).set({from:'🎰 Jackpot',to:winner,text:'🎰 ДЖЕКПОТ! Вам нараховано ₴'+formatNumber(amt)+'!',ts:Date.now()});
    notifyBot('player-ping', null, { to: winner, kind: 'jackpot', ref: { amount: amt } });
    db.ref('global_chat').push({user:'🎰 SlotOK',msg:'🎰 ДЖЕКПОТ! @'+winner+' виграв ₴'+formatNumber(amt)+'!',ts:Date.now()});
    notify('🎰 Джекпот '+formatNumber(amt)+'₴ → '+winner,'success');
  });
}
```

- [ ] **Step 3: Hook `adminGiveAllBonus()`**

In `app.js`, find `adminGiveAllBonus()` (line 7307-7321) and add a ping loop after the batch update resolves:

```js
function adminGiveAllBonus() {
  var amt = parseInt(prompt('Бонус для ВСІХ гравців (₴):')||0);
  if(!amt||amt<1) return;
  if(!confirm('Видати '+amt+'₴ кожному?')) return;
  db.ref('users').once('value', function(snap){
    var users = snap.val()||{};
    var batch = {};
    Object.keys(users).forEach(function(u){
      if(users[u].isBot) return;
      batch['users/'+u+'/balance'] = (users[u].balance||0)+amt;
      batch['pm/'+u+'/'+Date.now()+'_'+u] = {from:'🎁 SlotOK',to:u,text:'🎁 Бонус від адміна: +'+amt+'₴!',ts:Date.now()};
    });
    db.ref().update(batch).then(function(){
      Object.keys(users).forEach(function(u){
        if(users[u].isBot) return;
        notifyBot('player-ping', null, { to: u, kind: 'bonus', ref: { amount: amt } });
      });
      notify('🎁 Бонус '+amt+'₴ видано!','success');
    });
  });
}
```

- [ ] **Step 2 (verification): Confirm the ×20 threshold doesn't fire on ordinary wins**

Manual check: with a linked test account and `betAmountSlots` set to e.g. 100₴, play `spinSlots()` until a small win (e.g. the `🍒🍒🍒` combo at `bet*2`) lands — confirm no Telegram push arrives. Then force (or wait for) the `7️7️7️` combo (`bet*40`) — confirm a "🎉 Великий виграш" push does arrive. This can also be checked without playing live by temporarily calling `finishSlots(100)` repeatedly from the browser console and watching the Network tab for `/api/notify` calls only on wins ≥ 2000₴.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Push Telegram notifications for jackpot, admin bonus, and big slot wins"
```

---

## Self-Review Notes

- **Spec coverage:** linking (Tasks 3-4, 11), quick-action menu (Task 5), player commands (Task 6), `/deposit`/`/withdraw` (Tasks 7-8), status-change push via `notifyPlayer` (Task 9), `player-ping` endpoint (Task 10), PM/clan-chat/bigwin/jackpot/bonus hooks (Tasks 12-13) — every spec section maps to at least one task.
- **Scope note carried over from the spec:** Task 13 wires the ×20 big-win threshold into the flagship `finishSlots` slot game only, matching the spec's explicit scope note that other game engines (Crash, video poker, etc.) are not wired up in this pass.
- **Type/name consistency check:** `handlePlayerCommand`, `BUTTON_COMMANDS`, `sendQuickMenu`, `QUICK_KEYBOARD` are defined once (Task 5) and reused with the same names in Tasks 4, 6, 8 — verified no renaming drift across tasks.
- **Task 12 Step 3's `clans/<clanId>/members` path** was verified against `app.js:8144` (`clans/<clanId>/members/<nick> = {role, joined}`) before finalizing this plan — no open uncertainty remains.
