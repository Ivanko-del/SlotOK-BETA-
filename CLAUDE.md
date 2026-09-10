# SlotOK Casino — notes for Claude

Single-file vanilla-JS app: `app.js` (~20k lines) + `index.html` + `style.css`,
using the Firebase Realtime Database directly from the client. Deployed on
Vercel from the `main` branch.

## Changelog — update it every time you ship a change

Whenever you make a change that a player would notice (a fix, a new feature,
a game rebalance, a UI change) — add an entry to `BUILTIN_CHANGELOG` in
`app.js` (near the top, search for `const BUILTIN_CHANGELOG`). This feeds the
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

## Git workflow on this repo

PRs are squash-merged into `main`. The long-lived work branch
(`claude/ai-chat-support-phrases-bfjqp5` at time of writing) gets far behind
`main` after every merge, so before starting new work: `git fetch origin main`,
confirm the branch's tree is identical to `origin/main` (`git diff --stat HEAD
origin/main`), then `git reset origin/main` (safe — working tree is
untouched) before committing new changes on top.
