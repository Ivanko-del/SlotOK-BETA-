# Telegram account linking + upgraded bot — design

Status: approved by user, pending spec review
Date: 2026-08-30

## Problem

The Telegram bot (`api/telegram-webhook.js`) currently only talks to one
hardcoded admin chat (`bot_config/adminChatId`). Players never get real
Telegram messages: "notifications" to a player are actually just an
in-app PM written to `pm/<nick>` (see `notifyPlayer()`), and the existing
`/start dep_<id>_<amount>` / `/start reset_<nick>` deep links are used
once for context and never persist a chatId↔account link.

The goal: let a player link their SlotOK account to their own Telegram
chat, turn the bot into something they actively use (quick-action menu,
balance/history, deposit/withdraw commands), and route select in-app
events to their linked chat as real push notifications.

## Scope

In scope:
- Persistent chatId↔nick linking (deep link + manual code fallback), with
  unlink from both bot and site.
- A persistent reply-keyboard menu shown on every bot screen, plus
  native Telegram slash-command menu registration.
- Player commands: `/balance`, `/history`, `/me`, `/help`.
- Conversational `/deposit` and `/withdraw` commands that write to the
  exact same Firebase paths the website's `submitDepositRequest()` /
  `submitWithdraw()` write to, so the existing admin-approval flow in
  `telegram-webhook.js` (`actOnDeposit` / `actOnWithdraw`) needs no
  changes.
- Real Telegram push (in addition to the existing in-app PM) for:
  deposit/withdraw approved or rejected, password reset completed, PM /
  support reply / clan chat message received, jackpot/bonus payouts
  (always), and regular slot wins at ≥×20 the bet (to avoid spam).

Out of scope (explicitly not this project):
- Telegram Mini App / `initData` HMAC verification (existing
  `initTelegramMiniApp()` stays a decorative greeting, untouched).
- Any of the XSS/security-review findings from the earlier session
  (PM thread escaping, `javascript:` URL scheme validation) — separate,
  already-tracked work.
- Rate limiting / anti-spam beyond the ×20 win threshold.

## Data model (Firebase Realtime Database)

| Path | Shape | Purpose |
|---|---|---|
| `users/<nick>/telegramChatId` | number | Player's linked Telegram chat, if any |
| `telegram_links/<chatId>` | string (nick) | Reverse index for O(1) lookup in the webhook |
| `telegram_link_tokens/<token>` | `{ nick, createdAt }` | One-time, 10-minute-TTL linking token |
| `telegram_state/<chatId>` | `{ step, type, data, updatedAt }` | In-progress `/deposit` or `/withdraw` conversation, 10-minute TTL |
| `bot_config/adminChatId` | number (existing) | Unchanged |

Both `telegramChatId` and `telegram_links` are written together and
cleared together so they never drift out of sync; the webhook always
reads `telegram_links/<chatId>` to resolve `nick`, and confirms
`users/<nick>/telegramChatId === chatId` before acting on player
commands (defends against a stale reverse-index entry after unlink).

## Linking flow

1. Site: a new "Прив'язати Telegram" control (in Settings, next to the
   existing `openTelegramBot()` deposit button) generates a 6-digit
   token, writes `telegram_link_tokens/<token> = { nick: currentUser,
   createdAt: Date.now() }`, and shows a modal with:
   - Primary: "Відкрити Telegram" → `https://t.me/<TG_BOT_USERNAME>?start=link_<token>`
   - Fallback: the raw code, with instructions to send `/link <code>`
     to the bot manually (covers cases where the deep link doesn't
     open, e.g. desktop browser without Telegram installed).
2. Webhook: `/start link_<token>` and the standalone `/link <token>`
   text command both call a shared `completeLink(chatId, token)`:
   - Reject if token missing or older than 10 minutes.
   - `dbSet('users/<nick>/telegramChatId', chatId)`,
     `dbSet('telegram_links/<chatId>', nick)`, delete the token.
   - Reply with a confirmation and send the quick-action reply keyboard.
3. `/unlink` in the bot, or an "Відв'язати" button in Settings, clears
   both `users/<nick>/telegramChatId` and `telegram_links/<chatId>`
   (the site already has both values loaded, so it can clear both
   directly without a round trip through the bot).
4. Settings shows live link status via a `users/<nick>/telegramChatId`
   listener — no polling needed.

## Bot UI ("more technological")

After `/start`, `/link`, or `/menu`, the bot sends a
`ReplyKeyboardMarkup` (`resize_keyboard: true`) that stays pinned under
the message box on every subsequent screen:

```
💰 Баланс     📊 Історія
📥 Поповнити  📤 Вивести
🔗 Мій акаунт ❓ Допомога
```

Each button maps to the same handler as its slash-command equivalent.
Slash commands are also registered via Telegram's `setMyCommands` API
(one-time call, e.g. run from a small setup script or on first webhook
invocation if not yet set) so the native "/" menu lists them too — both
mechanisms are cheap and complementary.

## Player commands

- `/balance` → reads `users/<nick>/balance`, replies with the amount.
- `/history` → last 10 entries from `users/<nick>/history`.
- `/me` → nick, balance, registration date, VIP level.
- `/help` → lists the commands above (mirrors the existing admin
  `/help` pattern already in `telegram-webhook.js`).

All four require an active link (resolved via `telegram_links/<chatId>`
→ `nick`); if unlinked, the bot replies with instructions to link first.

### `/deposit`

Conversational, state kept in `telegram_state/<chatId>`:
1. Ask amount (inline quick-amount buttons 100/300/500/1000 + "Інша
   сума" free-text option), validate ≥50₴ (same floor as the site).
2. Ask method (privat/mono/usdt — same set as the site).
3. Write `deposit_requests/<id>` with the identical shape
   `submitDepositRequest()` writes (`user`, `userId`, `amount`, `method`,
   `status: 'pending'`, `time`). From here the request flows through the
   *existing, unmodified* `actOnDeposit()` admin-approval logic.

### `/withdraw`

Mirrors `submitWithdraw()`:
1. Reject if `users/<nick>/pendingWithdraw` is already true, or if
   amount < 200₴, or if amount > current balance.
2. Ask amount, then method + payout details (card number / USDT
   address depending on method).
3. Freeze funds the same way the site does:
   `users/<nick>/balance -= amount`, `pendingWithdraw: true`, then write
   `withdraw_requests/<id>` — again flowing into the existing
   `actOnWithdraw()` logic unchanged.

`/cancel` aborts any in-progress dialog and clears
`telegram_state/<chatId>`. Any dialog untouched for 10 minutes is
treated as abandoned (checked lazily on the next interaction — no
scheduled cleanup job needed since this is a low-value, self-limiting
state).

## Notification expansion

**Approval/rejection events** (deposit, withdraw, password reset)
already flow through `notifyPlayer(user, text)` inside
`telegram-webhook.js`. It's extended to also call
`sendMessage(chatId, text)` when `users/<user>/telegramChatId` is set,
in addition to the existing `pm/<user>` write — this is a one-function
change; `actOnDeposit`, `actOnWithdraw`, `actOnPasswordReset` themselves
are untouched.

**Client-originated events** (PM / support reply / clan chat message
received, jackpot/bonus payout, big slot win) don't pass through the
webhook at all — they happen in `app.js` during gameplay/chat. A new
request type is added to the existing `api/notify.js` endpoint (which
already handles a `type: 'support'` case the same way):

- `type: 'player-ping'`, body `{ to, kind, ref }` — `kind` is one of
  `pm`, `support-reply`, `clan-chat`, `bigwin`, `jackpot`, `bonus`.
- The server never trusts amount/text from the request body — it reads
  `ref` back from Firebase (the PM's own path, the win's own record) the
  same way `notify.js` already re-reads deposit/withdraw requests by id
  before messaging the admin. Worst case a forged call triggers a
  notification for something that's genuinely in the DB — same trust
  boundary the file's existing comment already documents.
- Looks up `users/<to>/telegramChatId`; no-ops quietly if unlinked.
- For `bigwin`: the caller only invokes this endpoint when the win is
  ≥×20 the bet; jackpot and bonus payouts always notify (calls are
  cheap and these are already rare events).

## Error handling

- Expired/unknown link token → clear error message, no state change.
- `/deposit` or `/withdraw` invoked while unlinked → prompt to link
  first, no dialog started.
- Withdraw validation (min amount, sufficient balance, no existing
  pending withdraw) mirrors the site's checks exactly so the two entry
  points can't diverge in what they allow.
- `player-ping` failures (unlinked recipient, bad `ref`) fail silently
  (200 response, no-op) — same pattern `notify.js` already uses for
  "nothing to notify, quietly succeed".

## Testing

No unit test suite exists in this project; the webhook is a Vercel
serverless function. Verification is manual, covering: link via deep
link, link via manual `/link <code>`, expired/reused token rejection,
`/deposit` → admin approves → player receives push, `/withdraw` →
admin rejects → funds returned + push received, `/unlink` from both
bot and site, a sub-×20 win producing no push vs a ≥×20 win producing
one, and jackpot/bonus always notifying.
