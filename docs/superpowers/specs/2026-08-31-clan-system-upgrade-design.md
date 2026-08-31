# Clan System Upgrade — Design Spec

Date: 2026-08-31
Status: Approved by user in chat, pending written-spec review

## Overview

The current clan system (`app.js` ~8140-8258) is minimal: create/join/leave a clan,
a bank number that only ever goes up (deposit works, nothing else touches it),
and three hardcoded weekly "tasks" that track lifetime totals and never reset or
pay out. This spec upgrades clans into a real feature: roles with permissions,
open/private clans with a join-request queue, weekly tasks that reset and pay
real rewards out of the clan bank, tiered bank perks (cashback boost, cosmetics,
creation discount), and a combined-score clan league.

Consistent with the rest of this app, there is no backend — every write in this
spec is a direct client → Firebase Realtime Database write, same trust model as
balances, VIP, and existing clan code today.

## Goals

- Roles: Leader, Officer, Member, each with distinct permissions.
- Clans can be Open (instant join, today's behavior) or Private (join request,
  approved/rejected by Leader/Officer).
- Weekly tasks actually reset (keyed like the existing quest system) and pay a
  real reward out of the clan bank, split across members.
- Clan bank perks: cashback % boost for all members, cosmetic tag/banner colors,
  and a discount on clan creation/tag-change cost — unlocked by bank-balance tiers.
- A clan league ranks clans by a combined score (bank + weekly activity + size).
- Fix the two reported bugs: bank display not updating, and clan chat issues
  (chat itself works once the input-row CSS bug is fixed — no separate chat
  backend bug was found).

## Non-goals

- No server-side validation — matches the existing trust model of this app.
- No anti-cheat beyond what `antiCheatRecordBet` already does.
- No clan search/filter beyond the existing "first 10 clans" list.
- No historical league seasons/archiving — the league is a live, current-state
  ranking, not a resettable season (avoids snapshot/archive complexity not asked for).

## Data model

```
clans/<clanId>: {
  name, tag, desc, leader,       // unchanged
  bank: number,                  // unchanged, persists forever
  privacy: 'open' | 'private',   // NEW, default 'open' (matches today's behavior)
  members: { <uid>: { role: 'leader'|'officer'|'member', joined } },
  joinRequests: { <uid>: { name, ts } },   // NEW, only used when privacy === 'private'
  weekly: {
    <weekStr>: {                 // weekStr = getWeekStr(), same convention as quests
      wager: number,
      games: number,
      paid: { <taskId>: true }   // marks a task's reward already claimed this week
    }
  },
  score: number,                 // NEW, denormalized combined score (see League)
  created
}
```

`weekWager`/`weekGames` (today's fields, never reset) are dropped in favor of
`weekly/<weekStr>/wager` and `weekly/<weekStr>/games` — same bucketing pattern
`getWeekStr()` already provides for quests, so tasks naturally reset every week
with no separate cron/reset code needed. Old clans simply start a fresh empty
bucket the first time they're touched post-upgrade; their stale `weekWager`/
`weekGames` fields are left in place but no longer read (cheap, no migration
script needed).

## Roles & permissions

| Action | Leader | Officer | Member |
|---|---|---|---|
| Deposit to bank | ✅ | ✅ | ✅ |
| Chat | ✅ | ✅ | ✅ |
| Toggle privacy (open/private) | ✅ | ✅ | ❌ |
| Approve/reject join request | ✅ | ✅ | ❌ |
| Kick a member | ✅ | ✅ (not Leader/other Officers) | ❌ |
| Promote member → officer / demote | ✅ | ❌ | ❌ |
| Disband clan | ✅ | ❌ | ❌ |
| Claim a completed weekly task's reward | ✅ | ✅ | ❌ |

Leaving is always self-service (`leaveClan`) except the Leader: `leaveClan()`
gets one new guard — if `currentUser === c.leader`, it refuses and tells the
Leader to either `promoteOfficer` someone first (promoting also transfers
`leader`) or call `disbandClan()` instead. A Leader-less clan is not a
supported state, so this is a hard block, not a warning.

## Privacy & join flow

- `privacy` defaults to `'open'` on create — existing `joinClan()` behavior
  (instant join) is preserved for open clans, zero change for the common case.
- Private clans: `joinClan()` branches — writes to `joinRequests/<uid>` instead
  of `members/<uid>`. New `respondToJoinRequest(clanId, uid, accept)` (Leader/
  Officer only, enforced client-side like every other permission here) either
  moves the request into `members` or deletes it.
- `toggleClanPrivacy(clanId)` flips `privacy` between the two values.

## Weekly tasks & bank-funded rewards

Tasks stay as the existing 3 hardcoded definitions (wager 5k/25k, games-per-member)
but read/write `weekly/<weekStr>/wager` and `weekly/<weekStr>/games` instead of
the old top-level fields. `trackClanWager()` is updated to increment the
weekly-bucketed path.

When a task's progress reaches its goal, the UI shows a "🎁 Забрати" button
(Leader/Officer only) instead of just a checkmark. `claimClanTask(clanId, taskId)`:
1. Re-reads the clan to confirm the task is actually complete and not already
   in `weekly/<weekStr>/paid`.
2. Requires `bank >= reward` — if the bank can't cover it, the button shows
   "Недостатньо в банку" and does nothing (no partial/IOU payouts — YAGNI).
3. Decrements `bank` by `reward`, marks `weekly/<weekStr>/paid/<taskId> = true`,
   and splits `reward` evenly across all current members via one `update()`
   with a per-member `balance` increment path for each.

This makes the bank a real sink (perks, task rewards) not just a number that
only grows, and ties task rewards to money the clan actually deposited.

## Bank perks (tiered by bank balance)

Perks are derived from `bank` directly (no separate "unlocked" flag to keep in
sync) — a tier's benefits apply whenever bank balance is at/above threshold,
and are lost automatically if the bank ever drops back below it (spending on
task rewards can cost a tier — that tension is intentional, not a bug).

| Tier | Bank ≥ | Cashback boost (all members) | Cosmetic | Creation/tag-change discount |
|---|---|---|---|---|
| 1 | 5,000₴ | +0.1% | Colored clan tag | — |
| 2 | 25,000₴ | +0.25% | Colored tag + banner | 25% off |
| 3 | 100,000₴ | +0.5% | Colored tag + animated banner | 50% off |

Discount applies to the existing 500₴ creation cost and to a new tag-change
action (out of scope to build tag-changing UI now if not already present —
confirmed not present, so the discount line only currently applies to creation
cost; documented here so it's ready if tag-editing is added later).

### Cashback hook mechanics

`addWager()` (app.js:8840) computes `vip.cashback` per bet from `getVipLevel()`.
The clan bonus is added on top of that rate, not looked up via a live DB read
on every bet (too hot a path). Instead: whenever the logged-in user has a
`clanId`, a single `db.ref('clans/'+clanId+'/bank').on('value', ...)` listener
(set up once, alongside the existing clan-chat listener pattern) keeps a
module-level `clanCashbackBonus` variable in sync with the current tier. This
mirrors the "live listener, not repeated reads" approach already used for clan
chat, and costs one extra listener per session instead of one extra read per
bet. `addWager()`'s cashback line becomes
`const rate = vip.cashback + clanCashbackBonus;` — everything downstream
(per-bet clamp, weekly clamp via `userData.cashbackWeekStart/cashbackWeekUsed`)
is unchanged.

## League / ranking

`score = bank + weekly.wager * 3` (current week's wager weighted 3x so the
league rewards ongoing activity, not just a big historic bank balance sitting
idle). Recomputed and written to `clans/<clanId>/score` inline, in the same
`update()` call, by every action that changes `bank` or `weekly.<weekStr>.wager`
(deposit, task claim, `trackClanWager`) — denormalized so the leaderboard can
use `orderByChild('score').limitToLast(20)`, the same query shape already used
elsewhere in this codebase for leaderboards (`getLbPeriodKey`/leaderboard code
at app.js:13247). A new `loadClanLeague()` renders this into a new "🏆 Ліга
кланів" list inside the clans tab, above or beside the existing "browse public
clans" list.

## UI changes

- Clan bank card: adds the deposit row (done) — now also shows which perk tier
  is currently active and progress to the next tier.
- Member list: role badge becomes tap-able for Leader/Officer to open a small
  action sheet (promote/demote/kick), hidden entirely for Members viewing others.
- New "🔒/🌐 Приватність" toggle and pending-join-requests list, visible to
  Leader/Officer only, on private clans.
- New "🏆 Ліга кланів" section.
- Task cards get a claim button when complete and unpaid (Leader/Officer only);
  Members see "Очікує на лідера/офіцера" instead of a button.

## Function inventory

New: `toggleClanPrivacy`, `respondToJoinRequest`, `kickMember`, `promoteOfficer`,
`demoteOfficer`, `disbandClan`, `claimClanTask`, `loadClanLeague`,
`recalcClanScore` (helper, called inline wherever bank/weekly.wager changes).

Modified: `createClan` (add `privacy: 'open'`), `joinClan` (branch on privacy),
`leaveClan` (block the Leader per the guard above), `trackClanWager` (write to
`weekly/<weekStr>/wager` instead of `weekWager`), `loadMyClan` (render new
sections, read from `weekly/<weekStr>`), `addWager` (add `clanCashbackBonus`
to the cashback rate), plus a new clan-bank listener set up alongside the
existing clan-chat listener whenever `userData.clanId` is set.

## Testing approach

No test framework exists in this repo (confirmed, no `package.json`). Same
approach as the rest of this session: `node --check app.js` for syntax, then
Playwright against the local static server with `startDemoMode()` and a fully
stubbed `db.ref` (in-memory fake store, no real Firebase writes) to exercise
every new function — role permission checks (member cannot see leader-only
buttons), join-request accept/reject, task claim with/without sufficient bank,
tier-perk display at each threshold, and league ordering — plus a manual visual
pass in the browser before pushing, per standing instruction.

## Out of scope

- No push notifications for join requests/task completion.
- No clan disband confirmation beyond a plain `confirm()` dialog.
- No tag-change UI (discount is defined for when it's added later).
- No season resets/archival for the league.
