# SlotOK Casino — notes for Claude

Vanilla-JS app: `index.html` + `style.css` + `app.js`, using the Firebase
Realtime Database from the client, plus Vercel functions in `api/` (server
games, login, rewards). Deployed on Vercel from the `main` branch.

## `app.js` is generated — edit `src/app/*.js`

`app.js` (~24k lines) is built by concatenating `src/app/NN-name.js` in order
(`npm run build:app`, `scripts/build-app.js`). The browser still loads one
`app.js`. Edit the pieces in `src/app/`, run `npm run build:app`, commit both;
`npm test` fails if `app.js` is stale. The pieces are one shared global
script, not modules — see `src/app/README.md` for what lives where.
Reward tables (VIP, Battle Pass, bonuses) live in `shared/rewards.js`, which
both the browser and the server (`lib/progress.js`) load.

## `style.css` is generated too — edit `src/css/*.css`

Design system «Нічна друкарня» — read `DESIGN_SYSTEM.md` before touching UI.
`style.css` is built from `src/css/NN-*.css` (`npm run build:css`); icons from
`src/icons/icons.js` (`npm run build:icons` → `src/css/05-icons.css`, then
build:css). `npm test` fails if either is stale. Rules:
- colours, spacing, radii, shadows, fonts — only tokens from `00-tokens.css`
  (`var(--…)`), never raw hex; after pasting foreign markup run
  `node scripts/codemod-tokens.js <file>`;
- no emoji as UI icons: use `<span class="ic i-name" aria-hidden="true">`;
  emoji already in markup/JS are mapped to icons by `emoji-icons.js`
  (`EMOJI_ICONS`);
- theme = `html[data-theme]` (dark/light, none = auto), accent =
  `html[data-accent]` — via `applyThemeVars` / `setAccentColor`;
- new game bet input → add its id to `BET_INPUT_IDS`, main action function →
  `GAME_CTA_FNS` in `src/app/42-game-ui.js`;
- critical actions confirm through `confirmAction()` (`src/app/41-ui-confirm.js`).

## Where the remaining work is written down

Big unfinished directions live in `ROADMAP.md` at the repo root — sports-bet
settlement, the poker engine, multiplayer, the per-screen design migration,
global chat, the Telegram bot, and the two FCM keys only the owner can create.
Each entry names its entry point in the code, so a new session does not have to
re-investigate. When something there ships, move it into `BUILTIN_CHANGELOG`
and drop it from the roadmap.

## Changelog — update it every time you ship a change

Whenever you make a change that a player would notice (a fix, a new feature,
a game rebalance, a UI change) — add an entry to `BUILTIN_CHANGELOG` in
`src/app/17-changelog.js` (search for `const BUILTIN_CHANGELOG`; then
`npm run build:app`). This feeds the
in-app "Оновлення" list under Home → Новини → Оновлення (`loadChangelog()`).

- Bump `CURRENT_VERSION` (right above the array) to match the new entry's
  `version`, so the "NEW" badge and Firebase auto-seed (`seedChangelogIfAdmin`)
  stay correct.
- Add the new entry as the **first** element of the array, with a real fixed
  date (`Date.UTC(year, monthIndex, day)` — `monthIndex` is 0-based) rather
  than a `Date.now()`-relative expression, so ordering stays correct
  regardless of when a player later loads the page.
- Use the existing `sections: [{ type: 'new'|'fix'|'improve', title, items: [...] }]`
  shape, and write items in player-facing language (what changed for them),
  not implementation detail.
- If several small fixes ship together, it's fine to group them under one
  "🐛 Дрібні виправлення" section rather than one entry each.

There used to be a second, hand-written static changelog (an `updates-modal`
reachable from a "📜 Оновлення" button in the Ще/More tab) that duplicated
this and silently went stale. It was removed and its historical content
merged into `BUILTIN_CHANGELOG`. Don't recreate a second changelog surface —
`BUILTIN_CHANGELOG` is the one source of truth for "what's new."

## Security model (since the October 2026 audit — see SECURITY.md)

- **Login** goes through `api/auth.js` (server checks the password, returns a
  Firebase custom token, uid = nick). Until `FIREBASE_SERVICE_ACCOUNT_KEY` is
  set it answers 503 and `app.js` falls back to the old in-browser check —
  keep both paths working when touching `authLogin`/`authRegister`.
- **Password hashes** move to `user_secrets/<nick>` (server-only) via
  `lib/secrets.js`; never read `pass`/`securityAnswerHash` from new client code.
- **Database rules** are generated: edit `scripts/build-rules.js`, run
  `npm run build:rules`, and `npm test` (includes an emulator test of both
  rule sets). A new top-level DB node must be added there, or it will be
  denied once the rules are deployed.
- **Rendering data from the DB:** use `escapeHtml()` for text, `safeUrl()` for
  `src`/`href`, and `jsArg()` for values inside `onclick="…"`.

## Local stack for online games (`npm run dev`)

`scripts/dev-stack.js` starts the Firebase emulators (Auth :9099, Realtime
Database :9000 with `database.rules.json`) and serves the site plus `api/*.js`
on http://localhost:8123. The page connects to the emulators by itself
(`window.SLOTOK_EMULATOR`, injected only by the dev server), and the server
side switches to them via `lib/emulator.js` (env
`FIREBASE_DATABASE_EMULATOR_HOST`, ignored on Vercel). Sign-up/login work
through `api/auth.js` as in prod. Use it to test multiplayer with several
Playwright contexts; the admin REST shortcut is `?access_token=owner`.
Needs Java and `npx firebase-tools` (first run downloads it).

## Push notifications (FCM) — two manual steps left to fully activate

Client (`app.js`) and server (`api/notify.js` + `lib/fcm.js`) plumbing for
real push notifications (delivered even when the app is fully closed, not
just backgrounded) is built and wired in, but two values are still
placeholders because they're per-project secrets/keys only the site owner
can generate:

1. **`FCM_VAPID_KEY`** in `app.js` (search for it) — a *public* key, not a
   secret. Firebase Console → Project Settings → Cloud Messaging → Web Push
   certificates → generate one, paste the value in directly (safe to commit).
2. **`FIREBASE_SERVICE_ACCOUNT_KEY`** — a real secret, must NEVER be pasted
   into chat or committed to the repo. Firebase Console → Project Settings →
   Service Accounts → Generate new private key → paste the whole downloaded
   JSON as this env var's value in Vercel (Project Settings → Environment
   Variables, Production). `lib/fcm.js` reads it at request time and no-ops
   quietly if it's missing, so the rest of the site is unaffected either way.

Until both are set, `registerFcmToken()` and `sendPush()`/`sendPushToUser()`
are inert (the existing tab-open-only notifications via `sendNativeNotif`
keep working as before).

## Git workflow on this repo

PRs are squash-merged into `main`. The long-lived work branch
(`claude/ai-chat-support-phrases-bfjqp5` at time of writing) gets far behind
`main` after every merge, so before starting new work: `git fetch origin main`,
confirm the branch's tree is identical to `origin/main` (`git diff --stat HEAD
origin/main`), then `git reset origin/main` (safe — working tree is
untouched) before committing new changes on top.
