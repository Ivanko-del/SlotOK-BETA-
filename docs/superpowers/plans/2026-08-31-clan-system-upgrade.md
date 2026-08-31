# Clan System Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing minimal clan feature into roles + permissions, open/private clans with join requests, weekly tasks that reset and pay real bank-funded rewards, tiered bank perks (cashback boost, cosmetics, creation discount), and a combined-score clan league.

**Architecture:** Everything is a direct client → Firebase Realtime Database write/read, same trust model as the rest of this app (no backend). All new UI is generated inline as HTML strings from `app.js`, same pattern the existing clan code already uses — `index.html` only gets new static containers, never new dynamic markup.

**Tech Stack:** Vanilla JS, Firebase Realtime Database (compat SDK, `db.ref(...)`), no build step, no test framework (confirmed: no `package.json` in this repo).

**Spec:** `docs/superpowers/specs/2026-08-31-clan-system-upgrade-design.md`

## Global Constraints

- No backend validation anywhere — every permission check (role, privacy, bank balance) is client-side JS, matching every other feature in this app.
- No new dependencies. No new files unless a task says so explicitly.
- Weekly data is keyed by `getWeekStr()` (app.js:9191) — Sunday-anchored `YYYY-MM-DD` string, the same convention the quest system already uses. Never invent a separate reset/cron mechanism.
- This repo has no test framework. "Test" steps in this plan mean: `node --check app.js` for syntax, plus a throwaway Playwright verification script (scratch dir, not committed) using `startDemoMode()` (app.js ~6255) and a stubbed in-memory `db.ref` — never let a verification script write to the real production Firebase. This mirrors the verification approach already used earlier in this project for the button-CSS and clan-bank-display fixes.
- Every new user-facing string is Ukrainian, matching the rest of the UI.
- Reuse existing helpers: `formatNumber`, `escapeHtml`, `notify`, `getWeekStr`, `firebase.database.ServerValue.increment`. Don't reimplement them.

---

## Task 1: Weekly-bucketed clan data (privacy field + weekly wager/games)

**Files:**
- Modify: `app.js:8140-8156` (`createClan`)
- Modify: `app.js:8261-8265` (`trackClanWager`)
- Modify: `app.js:8202-8258` (`loadMyClan`)

**Interfaces:**
- Produces: `clans/<id>/privacy` (`'open'` | `'private'`), `clans/<id>/weekly/<weekStr>/{wager,games}` — every later task that reads clan activity reads from here, not from the old `weekWager`/`weekGames` top-level fields.

- [ ] **Step 1: Add `privacy: 'open'` to `createClan`**

In `app.js`, in `createClan()` (around line 8148), change the `db.ref('clans/' + clanId).set({...})` call to include the new field:

```js
  db.ref('clans/' + clanId).set({
    name, tag, desc, leader,
    bank: 0, privacy: 'open',
    members: { [currentUser]: { role: 'leader', joined: Date.now() } },
    created: Date.now(), weekWager: 0
  });
```

(Only the added `privacy: 'open'` line changes — `weekWager: 0` is left as-is for now, it becomes dead but harmless; nothing reads it after this task.)

- [ ] **Step 2: Repoint `trackClanWager` at the weekly bucket**

Replace the whole function body (app.js:8261-8265):

```js
function trackClanWager(amount) {
  if(!userData.clanId) return;
  const week = getWeekStr();
  db.ref('clans/' + userData.clanId + '/weekly/' + week + '/wager').transaction(v => (v||0) + amount);
  db.ref('clans/' + userData.clanId + '/weekly/' + week + '/games').transaction(v => (v||0) + 1);
}
```

- [ ] **Step 3: Repoint `loadMyClan`'s stats + task rendering at the weekly bucket**

In `loadMyClan(clanId)` (app.js:8202), the function currently does a single `once('value', snap => {...})` read of `clans/<id>`. It needs the current week's bucket too. Replace the whole function:

```js
function loadMyClan(clanId) {
  const week = getWeekStr();
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) { leaveClan(); return; }
    const wk = (c.weekly && c.weekly[week]) || { wager: 0, games: 0 };
    const banner = document.getElementById('myClanBanner');
    const members = c.members ? Object.keys(c.members) : [];
    banner.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<div><span style="font-size:11px;color:var(--green);border:1px solid var(--green);padding:1px 6px;border-radius:6px;">[' + c.tag + ']</span>' +
        '<span class="clan-name" style="font-size:18px;margin-left:8px;">' + c.name + '</span></div>' +
        '<span style="font-size:20px;">' + (c.leader===currentUser?'👑':'') + '</span>' +
      '</div>' +
      '<div style="color:#aaa;font-size:13px;margin-bottom:10px;">' + (c.desc||'') + '</div>' +
      '<div class="clan-stats">' +
        '<div class="clan-stat"><div class="clan-stat-v">' + members.length + '</div><div class="clan-stat-l">Учасників</div></div>' +
        '<div class="clan-stat"><div class="clan-stat-v">' + formatNumber(c.bank||0) + '₴</div><div class="clan-stat-l">Банк клану</div></div>' +
        '<div class="clan-stat"><div class="clan-stat-v">' + formatNumber(wk.wager||0) + '₴</div><div class="clan-stat-l">Ставки/тиж</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;margin-top:8px;">' +
        '<input id="clanBankDepositInput" type="number" min="100" placeholder="Сума (мін. 100₴)" style="flex:1;min-width:0;margin:0;">' +
        '<button class="btn-gold" style="width:auto;flex-shrink:0;padding:0 16px;" onclick="depositToClanBank(\'' + clanId + '\', parseInt(document.getElementById(\'clanBankDepositInput\').value))">🏦 Внести</button>' +
      '</div>';

    const mList = document.getElementById('clanMembersList');
    mList.innerHTML = '';
    members.forEach(name => {
      const role = c.members[name] && c.members[name].role || 'member';
      mList.innerHTML += '<div class="clan-member-row">' +
        '<div class="clan-member-avatar">' + (name===currentUser?'🙋':'👤') + '</div>' +
        '<div style="flex:1;"><div style="font-weight:bold;font-size:14px;">' + name + '</div></div>' +
        '<span class="clan-role ' + role + '">' + (role==='leader'?'👑 Лідер':role==='officer'?'🎖️ Офіцер':'🛡️ Учасник') + '</span>' +
      '</div>';
    });

    const tList = document.getElementById('clanTasksList');
    const paid = (c.weekly && c.weekly[week] && c.weekly[week].paid) || {};
    const CLAN_TASKS = [
      { id: 'wager5k',  goal: 5000,  label: 'Поставити 5 000₴ спільно',  reward: 500,  key: 'wager' },
      { id: 'wager25k', goal: 25000, label: 'Поставити 25 000₴ спільно', reward: 2000, key: 'wager' },
      { id: 'games3pp', goal: members.length * 3, label: 'Кожен грає 3 ігри (' + (members.length*3) + ' разів)', reward: 1000, key: 'games' }
    ];
    tList.innerHTML = CLAN_TASKS.map(t => {
      const prog = Math.min(t.goal, wk[t.key] || 0);
      const pct  = Math.min(100, (prog/t.goal)*100);
      const done = prog >= t.goal;
      const isPaid = !!paid[t.id];
      return '<div class="clan-task ' + (done?'done':'') + '">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">' +
          '<span style="font-size:13px;">' + t.label + '</span>' +
          '<span style="color:var(--accent);font-size:12px;font-weight:bold;">+' + t.reward + '₴</span>' +
        '</div>' +
        '<div class="quest-prog-bar"><div class="quest-prog-fill" style="width:' + pct + '%"></div></div>' +
        '<div style="font-size:11px;color:#777;">' + formatNumber(prog) + ' / ' + formatNumber(t.goal) + '</div>' +
        (isPaid ? '<div style="color:var(--green);font-size:12px;margin-top:4px;">✅ Виконано і виплачено</div>' : '') +
      '</div>';
    }).join('');
  });
  initClanChat(clanId);
}
```

Note: the claim button for a completed-but-unpaid task is added in Task 4, once `claimClanTask` exists — this step only wires the data source and the `id`/`paid` fields the button will need.

- [ ] **Step 4: `node --check` syntax verification**

Run: `node --check "C:\Users\ivank\OneDrive\Робочий стіл\SlotOK-BETA-\app.js"`
Expected: no output (exit code 0).

- [ ] **Step 5: Playwright verification (stubbed db, no real writes)**

Write `$CLAUDE_JOB_DIR/tmp/verify-task1.js` (adjust path to whatever scratch dir the executing session uses):

```js
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8123/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => startDemoMode());
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const week = getWeekStr();
    const store = { 'clans/testclan': {
      name: 'Test', tag: 'TST', leader: currentUser, bank: 1000, privacy: 'open',
      members: { [currentUser]: { role: 'leader' } },
      weekly: { [week]: { wager: 6000, games: 2 } }
    }};
    const writes = [];
    function makeRef(path) {
      return {
        once: (e, cb) => { const s = { val: () => store[path] }; cb && cb(s); return Promise.resolve(s); },
        transaction: (fn) => { writes.push(['transaction', path]); return Promise.resolve(); },
        on: (e, cb) => cb({ val: () => store[path] || null }), off: () => {},
        set: (v) => { writes.push(['set', path, v]); return Promise.resolve(); },
        push: () => ({ key: 'k' }),
      };
    }
    db.ref = (p) => makeRef(p);
    window.__writes = writes;
    userData.clanId = 'testclan';
    switchTab('clans'); loadClanTab();
    return {
      taskText: document.getElementById('clanTasksList').innerText,
      bankStat: document.getElementById('myClanBanner').innerText
    };
  });
  console.log('RESULT:', JSON.stringify(result, null, 2));
  console.log('ERRORS:', JSON.stringify(errors));
  await browser.close();
})();
```

Run it against a local static server (`npx --yes http-server . -p 8123` in the repo root, or reuse whatever local server the session already has running) with `node verify-task1.js`.

Expected: `RESULT.taskText` contains `"6 000 / 25 000"` for the second task (25k goal) and `"6 000 / 5 000"` progress line showing the 5k task complete (its `done` class applied); `bankStat` contains `"1 000₴"`. `ERRORS` is `[]`.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "Bucket clan wager/games/tasks by week, add privacy field to new clans"
```

---

## Task 2: Open/private clans + join-request queue

**Files:**
- Modify: `app.js:8180-8190` (`joinClan`)
- Modify: `app.js:8158-8178` (`loadPublicClans`)
- Create: `app.js` new functions `toggleClanPrivacy(clanId)`, `respondToJoinRequest(clanId, uid, accept)`
- Modify: `app.js:8202+` (`loadMyClan`, from Task 1) — append privacy toggle + pending-requests rendering
- Modify: `index.html:1981-1994` (`#myClanSection`) — add two containers

**Interfaces:**
- Consumes: `c.privacy`, `c.members[uid].role` (from Task 1's data model).
- Produces: `clans/<id>/joinRequests/<uid> = {name, ts}`; `toggleClanPrivacy`, `respondToJoinRequest` used by Task 3's permission-gated UI too.

- [ ] **Step 1: Branch `joinClan` on privacy**

Replace `app.js:8180-8190`:

```js
function joinClan(clanId) {
  if(userData.clanId) return notify('Ви вже в клані!', 'error');
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return notify('Клан не знайдено', 'error');
    if(c.privacy === 'private') {
      db.ref('clans/' + clanId + '/joinRequests/' + currentUser).set({ name: currentUser, ts: Date.now() });
      notify('📩 Заявку надіслано, очікуйте на підтвердження', 'success');
      return;
    }
    db.ref('clans/' + clanId + '/members/' + currentUser).set({ role: 'member', joined: Date.now() });
    db.ref('users/' + currentUser).update({ clanId });
    notify('🛡️ Ви вступили до клану ' + c.name, 'success');
    loadClanTab();
  });
}
```

- [ ] **Step 2: Show a different button label for private clans in the browse list**

In `loadPublicClans()` (app.js:8158-8178), the button line currently is:

```js
        '<button class="btn-green" style="padding:8px;font-size:12px;" onclick="joinClan(\'' + id + '\')">➕ Вступити</button>' +
```

Replace it with:

```js
        '<button class="btn-green" style="padding:8px;font-size:12px;" onclick="joinClan(\'' + id + '\')">' + (c.privacy === 'private' ? '📩 Подати заявку' : '➕ Вступити') + '</button>' +
```

- [ ] **Step 3: Add `toggleClanPrivacy` and `respondToJoinRequest`**

Add after `joinClan` (app.js, right after the function from Step 1):

```js
function toggleClanPrivacy(clanId) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    const role = c.members[currentUser] && c.members[currentUser].role;
    if(role !== 'leader' && role !== 'officer') return notify('Тільки лідер або офіцер', 'error');
    const next = c.privacy === 'private' ? 'open' : 'private';
    db.ref('clans/' + clanId + '/privacy').set(next);
    notify(next === 'private' ? '🔒 Клан тепер приватний' : '🌐 Клан тепер відкритий', 'info');
    loadMyClan(clanId);
  });
}

function respondToJoinRequest(clanId, uid, accept) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    const role = c.members[currentUser] && c.members[currentUser].role;
    if(role !== 'leader' && role !== 'officer') return notify('Тільки лідер або офіцер', 'error');
    if(accept) {
      db.ref('clans/' + clanId + '/members/' + uid).set({ role: 'member', joined: Date.now() });
      db.ref('users/' + uid).update({ clanId });
      notify('✅ ' + uid + ' прийнято до клану', 'success');
    } else {
      notify('❌ Заявку від ' + uid + ' відхилено', 'info');
    }
    db.ref('clans/' + clanId + '/joinRequests/' + uid).remove();
    loadMyClan(clanId);
  });
}
```

- [ ] **Step 4: Add static containers in `index.html`**

In `index.html`, inside `#myClanSection` (around line 1982, right after `<div id="myClanBanner" ...></div>`), add:

```html
        <div id="clanPrivacySection"></div>
        <div id="clanJoinRequestsSection"></div>
```

- [ ] **Step 5: Render privacy toggle + pending requests in `loadMyClan`**

In `loadMyClan` (the version from Task 1), inside the `once('value', snap => {...})` callback, right after the `banner.innerHTML = ...;` block, add:

```js
    const myRole = c.members[currentUser] && c.members[currentUser].role || 'member';
    const isLeaderOrOfficer = myRole === 'leader' || myRole === 'officer';

    const privacyEl = document.getElementById('clanPrivacySection');
    if(privacyEl) {
      privacyEl.innerHTML = isLeaderOrOfficer
        ? '<button class="btn-outline" style="margin:8px 0;" onclick="toggleClanPrivacy(\'' + clanId + '\')">' +
            (c.privacy === 'private' ? '🔒 Приватний — натисни щоб відкрити' : '🌐 Відкритий — натисни щоб зробити приватним') +
          '</button>'
        : '';
    }

    const reqEl = document.getElementById('clanJoinRequestsSection');
    if(reqEl) {
      const reqs = c.joinRequests ? Object.keys(c.joinRequests) : [];
      reqEl.innerHTML = (isLeaderOrOfficer && reqs.length)
        ? '<div class="section-header">📩 Заявки на вступ (' + reqs.length + ')</div>' +
          reqs.map(uid => '<div class="clan-member-row"><div style="flex:1;">' + uid + '</div>' +
            '<button class="btn-green" style="width:auto;padding:4px 10px;font-size:11px;" onclick="respondToJoinRequest(\'' + clanId + '\',\'' + uid + '\',true)">✅</button>' +
            '<button class="btn-outline" style="width:auto;padding:4px 10px;font-size:11px;margin-left:4px;" onclick="respondToJoinRequest(\'' + clanId + '\',\'' + uid + '\',false)">❌</button>' +
          '</div>').join('')
        : '';
    }
```

- [ ] **Step 6: `node --check` verification**

Run: `node --check app.js` — expect exit 0.

- [ ] **Step 7: Playwright verification**

Extend the Task 1 stub store with `privacy: 'private'` and a `joinRequests: { someguy: { name: 'someguy', ts: Date.now() } }` entry, call `loadClanTab()`, and assert `document.getElementById('clanJoinRequestsSection').innerText` contains `someguy`. Then call `respondToJoinRequest('testclan','someguy',true)` against the stub and assert `window.__writes` contains a `['set','clans/testclan/members/someguy', {role:'member',...}]`-shaped entry and a `['remove','clans/testclan/joinRequests/someguy']` entry (extend the stub's `makeRef` from Task 1 with a `remove` method that also pushes to `writes`).

Expected: request renders, accept produces the two writes, no console errors.

- [ ] **Step 8: Commit**

```bash
git add app.js index.html
git commit -m "Add open/private clans with join-request queue"
```

---

## Task 3: Roles — promote, demote, kick, disband, leader-guarded leave

**Files:**
- Modify: `app.js:8192-8200` (`leaveClan`)
- Create: `app.js` new functions `promoteOfficer`, `demoteOfficer`, `kickMember`, `disbandClan`
- Modify: `loadMyClan`'s member-row rendering (from Task 1/2) to add an action menu

**Interfaces:**
- Consumes: `c.members[uid].role`, current user's own role (same pattern as Task 2's permission checks).
- Produces: role transitions members/officers/tasks depend on for display everywhere else.

- [ ] **Step 1: Add the four role/membership functions**

Add these after `respondToJoinRequest` (from Task 2) in `app.js`:

```js
function promoteOfficer(clanId, uid) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    if(c.leader !== currentUser) return notify('Тільки лідер', 'error');
    const targetRole = c.members[uid] && c.members[uid].role;
    if(!targetRole) return;
    if(targetRole === 'officer') {
      // Transfer leadership: target becomes leader, caller becomes officer.
      db.ref('clans/' + clanId).update({
        leader: uid,
        ['members/' + uid + '/role']: 'leader',
        ['members/' + currentUser + '/role']: 'officer'
      });
      notify('👑 Лідерство передано ' + uid, 'success');
    } else {
      db.ref('clans/' + clanId + '/members/' + uid + '/role').set('officer');
      notify('🎖️ ' + uid + ' підвищено до офіцера', 'success');
    }
    loadMyClan(clanId);
  });
}

function demoteOfficer(clanId, uid) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    if(c.leader !== currentUser) return notify('Тільки лідер', 'error');
    db.ref('clans/' + clanId + '/members/' + uid + '/role').set('member');
    notify('🛡️ ' + uid + ' понижено до учасника', 'info');
    loadMyClan(clanId);
  });
}

function kickMember(clanId, uid) {
  if(uid === currentUser) return;
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    const myRole = c.members[currentUser] && c.members[currentUser].role;
    const targetRole = c.members[uid] && c.members[uid].role;
    if(myRole !== 'leader' && myRole !== 'officer') return notify('Немає прав', 'error');
    if(targetRole === 'leader' || (targetRole === 'officer' && myRole !== 'leader')) return notify('Немає прав кікнути цього гравця', 'error');
    if(!confirm('Кікнути ' + uid + ' з клану?')) return;
    db.ref('clans/' + clanId + '/members/' + uid).remove();
    db.ref('users/' + uid + '/clanId').remove();
    notify('👢 ' + uid + ' виключено з клану', 'info');
    loadMyClan(clanId);
  });
}

function disbandClan(clanId) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    if(c.leader !== currentUser) return notify('Тільки лідер', 'error');
    if(!confirm('Розпустити клан "' + c.name + '"? Це незворотньо, банк клану (' + formatNumber(c.bank||0) + '₴) буде втрачено.')) return;
    const members = c.members ? Object.keys(c.members) : [];
    members.forEach(uid => db.ref('users/' + uid + '/clanId').remove());
    db.ref('clans/' + clanId).remove();
    notify('Клан розпущено', 'info');
    loadClanTab();
  });
}
```

- [ ] **Step 2: Guard the leader out of self-service `leaveClan`**

Replace `app.js:8192-8200`:

```js
function leaveClan() {
  if(!userData.clanId) return;
  const clanId = userData.clanId;
  db.ref('clans/' + clanId + '/leader').once('value', snap => {
    if(snap.val() === currentUser) {
      return notify('Лідер не може покинути клан — передай лідерство (👑 на офіцері) або розпусти клан', 'error');
    }
    db.ref('clans/' + clanId + '/members/' + currentUser).remove();
    db.ref('users/' + currentUser + '/clanId').remove();
    if (_clanChatListener) { db.ref('clan_chats/' + clanId).off('value', _clanChatListener); _clanChatListener = null; }
    notify('Ви покинули клан', 'info');
    loadClanTab();
  });
}
```

- [ ] **Step 3: Add the per-member action menu to the member-row rendering**

In `loadMyClan`'s member loop (introduced in Task 1, extended here), replace:

```js
    members.forEach(name => {
      const role = c.members[name] && c.members[name].role || 'member';
      mList.innerHTML += '<div class="clan-member-row">' +
        '<div class="clan-member-avatar">' + (name===currentUser?'🙋':'👤') + '</div>' +
        '<div style="flex:1;"><div style="font-weight:bold;font-size:14px;">' + name + '</div></div>' +
        '<span class="clan-role ' + role + '">' + (role==='leader'?'👑 Лідер':role==='officer'?'🎖️ Офіцер':'🛡️ Учасник') + '</span>' +
      '</div>';
    });
```

with:

```js
    members.forEach(name => {
      const role = c.members[name] && c.members[name].role || 'member';
      const iAmLeader = myRole === 'leader';
      const canKick = isLeaderOrOfficer && name !== currentUser && role !== 'leader' && !(role === 'officer' && !iAmLeader);
      const canPromoteDemote = iAmLeader && name !== currentUser && role !== 'leader';
      mList.innerHTML += '<div class="clan-member-row">' +
        '<div class="clan-member-avatar">' + (name===currentUser?'🙋':'👤') + '</div>' +
        '<div style="flex:1;"><div style="font-weight:bold;font-size:14px;">' + name + '</div></div>' +
        '<span class="clan-role ' + role + '">' + (role==='leader'?'👑 Лідер':role==='officer'?'🎖️ Офіцер':'🛡️ Учасник') + '</span>' +
        (canPromoteDemote ?
          '<button class="btn-outline" style="width:auto;padding:2px 8px;font-size:10px;margin-left:6px;" onclick="' +
            (role==='member' ? 'promoteOfficer' : 'demoteOfficer') + '(\'' + clanId + '\',\'' + name + '\')">' +
            (role==='member' ? '⬆️' : '⬇️') + '</button>' : '') +
        (canKick ?
          '<button class="btn-outline" style="width:auto;padding:2px 8px;font-size:10px;margin-left:4px;color:#e74c3c;" onclick="kickMember(\'' + clanId + '\',\'' + name + '\')">👢</button>'
          : '') +
      '</div>';
    });
```

Rationale for this change vs. the original draft: the spec's permission table (design doc, "Roles & permissions") grants promote/demote to the Leader only, but kick to both Leader and Officer (Officer excluded from kicking the Leader or other Officers). The original draft's single `canManage` flag gated both actions together, which would have rendered working-looking promote/demote buttons for Officers that `promoteOfficer`/`demoteOfficer` (Task 3 Step 1) then silently reject with a "Тільки лідер" error — a real UI/permission mismatch, not just a style nit. Split into `canKick` (Leader+Officer, spec's kick rule) and `canPromoteDemote` (Leader only) so the rendered UI matches what the functions actually allow.

Note: `myRole` and `isLeaderOrOfficer` are already computed earlier in the function (Task 2, Step 5) — this step just uses them.

Also add a disband button to `myClanBanner`'s leader-only area — append to the end of the `banner.innerHTML` string (from Task 1/2) when `c.leader === currentUser`:

```js
    if(c.leader === currentUser) {
      banner.innerHTML += '<button class="btn-outline" style="width:auto;margin-top:8px;color:#e74c3c;" onclick="disbandClan(\'' + clanId + '\')">💥 Розпустити клан</button>';
    }
```

- [ ] **Step 4: `node --check` verification**

Run: `node --check app.js` — expect exit 0.

- [ ] **Step 5: Playwright verification**

Extend the stub store with a second, `officer`-role member and a third `member`-role member. As the leader (`currentUser`), call `loadClanTab()` and assert the officer's and member's rows each render exactly one promote/demote (⬆️/⬇️) button and one kick (`👢`) button, and the leader's own row renders neither. Then switch `currentUser`'s role in the stub to `'officer'` (keep the same two other members), reload, and assert: the plain member's row still renders a kick button but **no** promote/demote button; the other officer's row renders neither kick nor promote/demote (an Officer cannot manage another Officer). Then switch `currentUser`'s role in the stub to `'member'`, reload, and assert no action buttons render for anyone. Finally, back as leader, call `kickMember('testclan','somemember')` against the stub and assert `window.__writes` contains a `remove` on `clans/testclan/members/somemember` and on `users/somemember/clanId`.

Expected: all four assertions pass, `ERRORS` is `[]`.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "Add clan roles: promote/demote officers, kick, disband, leader-guarded leave"
```

---

## Task 4: Bank-funded weekly task rewards

**Files:**
- Create: `app.js` new function `claimClanTask(clanId, taskId)`
- Modify: `loadMyClan`'s task-card rendering (from Task 1) to add the claim button

**Interfaces:**
- Consumes: `clans/<id>/weekly/<weekStr>/{wager,games,paid}` (Task 1), `clans/<id>/bank`.
- Produces: `clans/<id>/weekly/<weekStr>/paid/<taskId> = true`, decrements `bank`, increments every member's `users/<uid>/balance`.

- [ ] **Step 1: Add `claimClanTask`**

Add after `disbandClan` (Task 3) in `app.js`. It needs the same `CLAN_TASKS` definition `loadMyClan` uses — duplicate the small array rather than extracting a shared constant into a new file (YAGNI: two 5-line copies is cheaper than a module split for a single-file-per-concern app):

```js
const CLAN_TASK_DEFS = [
  { id: 'wager5k',  goal: 5000,  reward: 500,  key: 'wager' },
  { id: 'wager25k', goal: 25000, reward: 2000, key: 'wager' },
  { id: 'games3pp', goal: 0 /* computed per-clan */, reward: 1000, key: 'games' }
];

function claimClanTask(clanId, taskId) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    const myRole = c.members[currentUser] && c.members[currentUser].role;
    if(myRole !== 'leader' && myRole !== 'officer') return notify('Тільки лідер або офіцер', 'error');
    const week = getWeekStr();
    const wk = (c.weekly && c.weekly[week]) || { wager: 0, games: 0 };
    const members = Object.keys(c.members || {});
    const def = CLAN_TASK_DEFS.find(t => t.id === taskId);
    if(!def) return;
    const goal = taskId === 'games3pp' ? members.length * 3 : def.goal;
    const already = wk.paid && wk.paid[taskId];
    if(already) return notify('Вже виплачено цього тижня', 'info');
    if((wk[def.key] || 0) < goal) return notify('Завдання ще не виконано', 'error');
    if((c.bank || 0) < def.reward) return notify('Недостатньо в банку клану', 'error');

    const share = Math.floor(def.reward / members.length);
    const updates = {
      ['bank']: firebase.database.ServerValue.increment(-def.reward),
      ['weekly/' + week + '/paid/' + taskId]: true
    };
    db.ref('clans/' + clanId).update(updates);
    members.forEach(uid => db.ref('users/' + uid + '/balance').set(firebase.database.ServerValue.increment(share)));
    notify('🎁 Нагороду виплачено: +' + share + '₴ кожному учаснику', 'success');
    loadMyClan(clanId);
  });
}
```

- [ ] **Step 2: Add the claim button to the task-card rendering**

In `loadMyClan`'s `CLAN_TASKS.map(...)` block (from Task 1), the line rendering the "paid" state is:

```js
        (isPaid ? '<div style="color:var(--green);font-size:12px;margin-top:4px;">✅ Виконано і виплачено</div>' : '') +
```

Replace it with:

```js
        (isPaid ? '<div style="color:var(--green);font-size:12px;margin-top:4px;">✅ Виконано і виплачено</div>' :
          done ? (isLeaderOrOfficer
            ? '<button class="btn-gold" style="width:auto;padding:4px 12px;font-size:11px;margin-top:6px;" onclick="claimClanTask(\'' + clanId + '\',\'' + t.id + '\')">🎁 Забрати нагороду</button>'
            : '<div style="color:#777;font-size:12px;margin-top:4px;">⏳ Очікує на лідера/офіцера</div>')
          : '') +
```

- [ ] **Step 3: `node --check` verification**

Run: `node --check app.js` — expect exit 0.

- [ ] **Step 4: Playwright verification**

Stub a clan with 2 members, `bank: 1000`, `weekly.<week>.wager: 6000` (5k task complete, unpaid). As leader, `loadClanTab()`, assert task card shows the "🎁 Забрати нагороду" button. Click it (`claimClanTask('testclan','wager5k')` in-page), then assert `window.__writes` contains an `update` on `clans/testclan` with `bank` decremented and `weekly/<week>/paid/wager5k: true`, plus two `set`-with-increment writes on each member's `users/<uid>/balance` for `250` each (500/2 members). Also verify: set `bank: 100` (below the 500 reward), re-run claim, assert `notify`/no write happens (check `window.__writes` length unchanged) — this is the insufficient-bank guard.

Expected: both scenarios match, `ERRORS` is `[]`.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Pay clan weekly task rewards out of the clan bank, split across members"
```

---

## Task 5: Tiered bank perks + cashback hook

**Files:**
- Modify: `app.js:83-97` (`startDataSync`'s `on('value', ...)` handler) — hook the clan-bank listener
- Create: `app.js` new functions `getClanBankTier(bank)`, `syncClanBankListener()`
- Modify: `app.js:8850-8852` (`addWager`'s cashback calc)
- Modify: `app.js:8928` (`updateCashierCashbackUI`'s displayed rate)
- Modify: `loadMyClan` — render current/next perk tier

**Interfaces:**
- Produces: module-level `clanCashbackBonus` (number, e.g. `0.001` for +0.1%) that `addWager()` reads on every bet.

- [ ] **Step 1: Add the tier table and the listener sync function**

Add near `trackClanWager` (app.js, after Task 1's edits), before `loadPublicClans` is fine too — anywhere at top level:

```js
const CLAN_BANK_TIERS = [
  { min: 100000, cashback: 0.005, label: 'Тір 3', tag: 'gold-animated' },
  { min: 25000,  cashback: 0.0025, label: 'Тір 2', tag: 'gold' },
  { min: 5000,   cashback: 0.001, label: 'Тір 1', tag: 'green' },
  { min: 0,      cashback: 0,     label: 'Без тіру', tag: 'none' }
];
function getClanBankTier(bank) {
  return CLAN_BANK_TIERS.find(t => (bank || 0) >= t.min);
}

var clanCashbackBonus = 0;
var _clanBankListener = null;
var _clanBankListenerClanId = null;
function syncClanBankListener() {
  const clanId = userData && userData.clanId;
  if(clanId === _clanBankListenerClanId) return;
  if(_clanBankListener && _clanBankListenerClanId) {
    db.ref('clans/' + _clanBankListenerClanId + '/bank').off('value', _clanBankListener);
  }
  _clanBankListenerClanId = clanId || null;
  clanCashbackBonus = 0;
  if(!clanId) return;
  _clanBankListener = db.ref('clans/' + clanId + '/bank').on('value', snap => {
    clanCashbackBonus = getClanBankTier(snap.val() || 0).cashback;
  });
}
```

- [ ] **Step 2: Call `syncClanBankListener()` on every userData update**

In `startDataSync()` (app.js:83), right after `userData = data;` (line 97), add one line:

```js
            userData = data; 
            syncClanBankListener();
```

- [ ] **Step 3: Add the bonus into the per-bet cashback calc**

In `addWager()`, the current line (app.js:8852) is:

```js
    const rawCashback = Math.floor(amount * vip.cashback);
```

Change to:

```js
    const rawCashback = Math.floor(amount * (vip.cashback + clanCashbackBonus));
```

- [ ] **Step 4: Reflect the bonus in the cashback panel's displayed rate**

In `updateCashierCashbackUI()`, the line (app.js:8928) is:

```js
        <div style="font-size:10px;color:#555;margin-top:2px;">${vip.icon} ${vip.name} • ${(vip.cashback*100).toFixed(1)}% з ставки</div>
```

Change to:

```js
        <div style="font-size:10px;color:#555;margin-top:2px;">${vip.icon} ${vip.name} • ${((vip.cashback+clanCashbackBonus)*100).toFixed(2)}% з ставки${clanCashbackBonus>0?' (+клан)':''}</div>
```

- [ ] **Step 5: Render the perk tier in `loadMyClan`**

In `loadMyClan`'s callback (Task 1/2/3 version), after the `clanJoinRequestsSection` block, add:

```js
    const tier = getClanBankTier(c.bank || 0);
    const nextTier = CLAN_BANK_TIERS.slice().reverse().find(t => t.min > (c.bank || 0));
    const perkEl = document.getElementById('clanPerkSection');
    if(perkEl) {
      perkEl.innerHTML = '<div class="section-header">💎 Кланові перки</div>' +
        '<div class="box" style="padding:10px;">' +
          '<div style="font-size:13px;">' + tier.label + ': <b style="color:var(--accent);">+' + (tier.cashback*100).toFixed(2) + '%</b> кешбеку для всіх учасників' + (tier.min>=25000?' + колір тегу/банера':'') + (tier.min>=100000?' + знижка 50% на створення клану':tier.min>=25000?' + знижка 25% на створення клану':'') + '</div>' +
          (nextTier ? '<div style="font-size:11px;color:#777;margin-top:4px;">До наступного тіру: ' + formatNumber(nextTier.min - (c.bank||0)) + '₴</div>' : '<div style="font-size:11px;color:var(--green);margin-top:4px;">Максимальний тір!</div>') +
        '</div>';
    }
```

And add the container in `index.html`, inside `#myClanSection` right after `<div id="clanJoinRequestsSection"></div>` (Task 2, Step 4):

```html
        <div id="clanPerkSection"></div>
```

- [ ] **Step 6: `node --check` verification**

Run: `node --check app.js` — expect exit 0.

- [ ] **Step 7: Playwright verification**

In-page: set the stubbed clan's `bank` to `30000`, call `loadClanTab()`, assert `document.getElementById('clanPerkSection').innerText` contains `Тір 2` and `0.25%`. Separately, directly call `getClanBankTier(0).cashback === 0` and `getClanBankTier(100000).cashback === 0.005` via `page.evaluate` and assert both. Then verify the listener wiring: call `syncClanBankListener()` with `userData.clanId` set to the stub clan id (whose stubbed `bank/on` handler should fire synchronously since the stub's `on()` calls back immediately) and assert `clanCashbackBonus` matches the tier for that bank value.

Expected: all four assertions pass, `ERRORS` is `[]`.

- [ ] **Step 8: Commit**

```bash
git add app.js index.html
git commit -m "Add tiered clan bank perks (cashback boost, cosmetics, creation discount)"
```

---

## Task 6: Clan league (combined score ranking)

**Files:**
- Create: `app.js` new function `recalcClanScore(clanId)`
- Modify: `depositToClanBank` (existing function, added earlier this session), `claimClanTask` (Task 4), `trackClanWager` (Task 1) — call `recalcClanScore` after each
- Create: `app.js` new function `loadClanLeague()`
- Modify: `index.html:1952-1959` (`#tab-clans`, the `#clanView` placeholder area) — add a league container visible regardless of membership

**Interfaces:**
- Produces: `clans/<id>/score` (number), queryable via `orderByChild('score').limitToLast(20)`.

- [ ] **Step 1: Add `recalcClanScore`**

Add near `getClanBankTier` (Task 5) in `app.js`:

```js
function recalcClanScore(clanId) {
  const week = getWeekStr();
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    const wager = (c.weekly && c.weekly[week] && c.weekly[week].wager) || 0;
    const score = (c.bank || 0) + wager * 3;
    db.ref('clans/' + clanId + '/score').set(score);
  });
}
```

- [ ] **Step 2: Call it from every bank/wager-changing action**

In `depositToClanBank(clanId, amount)` (existing function from earlier this session, currently ends with `notify(...); const inp = ...; loadMyClan(clanId);`), add one line right before `loadMyClan(clanId);`:

```js
  recalcClanScore(clanId);
```

In `claimClanTask` (Task 4), add the same line right before its final `loadMyClan(clanId);`.

In `trackClanWager` (Task 1's version), append at the end of the function:

```js
  recalcClanScore(userData.clanId);
```

- [ ] **Step 3: Add `loadClanLeague`**

```js
function loadClanLeague() {
  const el = document.getElementById('clanLeagueList');
  if(!el) return;
  db.ref('clans').orderByChild('score').limitToLast(20).once('value', snap => {
    const data = snap.val();
    if(!data) { el.innerHTML = '<div style="color:#777;font-size:13px;padding:10px 0;text-align:center;">Ліга поки порожня</div>'; return; }
    const ranked = Object.entries(data).sort((a,b) => (b[1].score||0) - (a[1].score||0));
    el.innerHTML = ranked.map(([id, c], i) => {
      const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':('#'+(i+1));
      return '<div class="clan-member-row">' +
        '<div style="width:28px;text-align:center;font-weight:bold;">' + medal + '</div>' +
        '<div style="flex:1;"><span style="color:var(--green);">[' + c.tag + ']</span> ' + c.name + '</div>' +
        '<div style="font-weight:bold;color:var(--accent);">' + formatNumber(c.score||0) + '</div>' +
      '</div>';
    }).join('');
  });
}
```

- [ ] **Step 4: Wire it into the clans tab and call it from `loadClanTab`**

In `index.html`, inside `#tab-clans` right after the `#clanView` div (line 1959, before `<!-- Якщо немає клану -->`), add:

```html
      <div class="section-header">🏆 Ліга кланів</div>
      <div id="clanLeagueList"></div>
```

In `loadClanTab()` (app.js:8127), add a call to `loadClanLeague()` at the top of the function (it should render regardless of whether the user is in a clan):

```js
function loadClanTab() {
  loadClanLeague();
  const clanId = userData.clanId;
```

- [ ] **Step 5: `node --check` verification**

Run: `node --check app.js` — expect exit 0.

- [ ] **Step 6: Playwright verification**

Extend the stub store with two clans, `score: 5000` and `score: 12000`. Stub `orderByChild`/`limitToLast` to just return `makeRef(path)` (already the case from earlier stubs) whose `once` returns the full `store['clans']` object — for this test, seed `store['clans'] = { clanA: {...}, clanB: {...} }` directly rather than the single `clans/testclan` key used in prior tasks. Call `loadClanTab()` and assert `document.getElementById('clanLeagueList').innerText` lists the higher-score clan (`clanB`, 12000) before the lower one, and shows `🥇` next to it.

Expected: ordering assertion passes, `ERRORS` is `[]`.

- [ ] **Step 7: Commit**

```bash
git add app.js index.html
git commit -m "Add clan league ranked by combined bank+activity score"
```

---

## Task 7: Full-flow visual verification and manual browser check

**Files:** none (verification only)

- [ ] **Step 1: Run a combined Playwright flow covering all six prior tasks**

Reuse the stubbed store from Tasks 1-6 (multi-member clan, one private clan with a pending request, one task complete-unpaid, a populated league) in a single script and screenshot each state: `clan-tab-league.png`, `clan-tab-mine.png`, `clan-tab-privacy-toggle.png`, `clan-tab-join-requests.png`, `clan-tab-task-claim.png`, `clan-tab-perks.png`. Confirm zero console errors across the whole run.

- [ ] **Step 2: Manual visual pass in an actual browser**

Per the standing instruction to visually verify UI changes before pushing: open the same local server URL in a real (non-headless) browser session, click through create clan → toggle privacy → deposit → view perks → view league, and confirm nothing looks broken (overlapping text, oversized buttons — the exact class of bug fixed earlier this session in PM/support/clan chat input rows). Fix anything found before proceeding.

- [ ] **Step 3: Report results to the user**

Summarize what was verified and ask before pushing to `origin`, per this session's established rhythm (implement → verify visually → push only when asked).

---

## Self-Review Notes

- **Spec coverage:** roles/permissions (Task 3), privacy + join requests (Task 2), weekly tasks + bank-funded rewards (Tasks 1 & 4), bank perks incl. cashback hook (Task 5), league (Task 6), UI changes (spread across all tasks), function inventory (all listed functions created/modified exactly as named in the spec) — all covered.
- **Placeholder scan:** no TBD/TODO; every step has literal code.
- **Type/name consistency checked:** `clanCashbackBonus`, `getClanBankTier`, `CLAN_BANK_TIERS`, `recalcClanScore`, `myRole`/`isLeaderOrOfficer` (defined once in Task 2 Step 5, reused as-is in Tasks 3 and 5 without redefinition — later tasks' code blocks assume they're already in scope inside the same `loadMyClan` callback), `CLAN_TASK_DEFS` vs the inline `CLAN_TASKS` array in `loadMyClan` (intentionally two separate lists — one drives rendering with labels, one drives the claim function's payout math — cross-checked that `id`/`goal`/`reward`/`key` line up between them for all three tasks).
