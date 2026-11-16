// ============================================================
// ДРУЗІ Й ЗАПРОШЕННЯ ЗА СТІЛ (v120). Усі зміни — на сервері (lib/friends.js
// через /api/reward); тут лише читання власних списків і інтерфейс.
//   friends/<я>            — друзі { since }
//   friend_requests/<я>    — вхідні запити { at }
//   room_invites/<я>       — запрошення за стіл { from, game, roomId, bet, at }
// Онлайн друга — з вузла online (window._onlineUsers); невідомо → нічого не показуємо.
// Посилання на стіл: /?room=<гра>:<id> → після входу питаємо підтвердження.
// ============================================================

const FR_INVITE_TTL = 5 * 60000;
const FR_ROOM_GAMES = ['holdem', 'durak', 'eights', 'ludo', 'battleship', 'fourrow', 'minesweeper', 'coinflip', 'rps', 'predict'];
const FR_GAME_NAMES = { holdem: 'Покер Hold’em', durak: 'Дурень', eights: 'Вісімки', ludo: 'Лудо', battleship: 'Морський бій', fourrow: 'Чотири в ряд', minesweeper: 'Сапер-дуель', coinflip: 'Coinflip', rps: 'Камінь-ножиці', predict: 'Prediction' };
const FR_ROOM_ID_RE = /^[a-z0-9]{12,40}$/;
const FR = { friends: {}, requests: {}, invites: {}, started: false, shown: {}, refs: [] };
window.FRIENDS_LIST = [];

const frGameName = (g) => FR_GAME_NAMES[g] || (typeof ROOM_GAME_NAMES !== 'undefined' && ROOM_GAME_NAMES[g]) || g;
const frFreshInvites = () => Object.entries(FR.invites).filter(([, v]) => v && typeof v.at === 'number' && Date.now() - v.at < FR_INVITE_TTL && FR_ROOM_GAMES.includes(v.game))
  .sort((a, b) => b[1].at - a[1].at);

// Запам'ятати посилання /?room=… до входу (як ?play=… у 08-…)
(function captureRoomLink() {
  try {
    const raw = new URLSearchParams(location.search).get('room');
    if (!raw) return;
    const [g, id] = raw.split(':');
    if (FR_ROOM_GAMES.includes(g) && FR_ROOM_ID_RE.test(id || '')) sessionStorage.setItem('slotok_room', g + ':' + id);
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch (e) { /* без посилання */ }
})();

async function friendsApi(action, nick, extra) {
  const r = await serverApi('/api/reward', Object.assign({ action, nick }, extra || {}));
  if (r.mode === 'legacy') notify('Друзі з’являться, щойно сервер буде налаштований', 'error');
  return r.mode === 'server' ? r.r : null;
}

function friendsStart() {
  if (FR.started || !db || !currentUser) return;
  FR.started = true;
  const watch = (path, key, after) => {
    const ref = db.ref(path + '/' + currentUser);
    ref.on('value', (s) => { FR[key] = s.val() || {}; after(); }, () => { /* правила ще не опубліковані */ });
    FR.refs.push(ref);
  };
  watch('friends', 'friends', () => { window.FRIENDS_LIST = Object.keys(FR.friends); friendsRender(); });
  watch('friend_requests', 'requests', friendsRender);
  watch('room_invites', 'invites', () => { friendsRender(); friendsInvitePopups(); });
  setInterval(() => { friendsRender(); friendsInvitePopups(); }, 15000);
  setTimeout(friendsOpenRoomLink, 1200);
}
// Старт, щойно гравець увійшов (без правок у 01-core.js)
setInterval(() => { if (!FR.started && typeof currentUser !== 'undefined' && currentUser && typeof db !== 'undefined' && db) friendsStart(); }, 1000);

// ── Екран «Друзі» ──
function friendsIsOnline(n) { return Array.isArray(window._onlineUsers) && window._onlineUsers.includes(n); }

function friendsRender() {
  const pending = Object.keys(FR.requests).length + frFreshInvites().length;
  document.querySelectorAll('.friends-badge').forEach((b) => { b.textContent = pending; b.classList.toggle('hidden', !pending); });
  const root = document.getElementById('friendsList');
  const screen = document.getElementById('tab-friends');
  if (!root || !screen || screen.classList.contains('hidden')) return;
  const reqs = Object.entries(FR.requests).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  const inv = frFreshInvites();
  const fr = Object.keys(FR.friends).sort((a, b) => (friendsIsOnline(b) - friendsIsOnline(a)) || a.localeCompare(b));
  let h = '';
  if (reqs.length) {
    h += `<div class="section-header"><span>Запити в друзі</span></div><div class="list">` + reqs.map(([n]) => `
      <div class="list-row">
        <span class="list-row-main"><span class="list-row-title">${escapeHtml(n)}</span><span class="list-row-sub">хоче додати тебе в друзі</span></span>
        <button type="button" class="btn btn-primary btn-sm" onclick="friendsAccept(${jsArg(n)})">Прийняти</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="friendsDecline(${jsArg(n)})">Відхилити</button>
      </div>`).join('') + `</div>`;
  }
  if (inv.length) {
    h += `<div class="section-header"><span>Запрошення за стіл</span></div><div class="list">` + inv.map(([id, v]) => `
      <div class="list-row">
        <span class="list-row-main"><span class="list-row-title">${escapeHtml(v.from)} · ${escapeHtml(frGameName(v.game))}</span><span class="list-row-sub">ставка ₴${formatNumber(v.bet)}</span></span>
        <button type="button" class="btn btn-primary btn-sm" onclick="friendsJoinInvite(${jsArg(id)})">Приєднатись</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="friendsDismissInvite(${jsArg(id)})">Відхилити</button>
      </div>`).join('') + `</div>`;
  }
  h += `<div class="section-header"><span>Друзі <span class="num">${fr.length}</span></span></div>`;
  h += fr.length ? `<div class="list">` + fr.map((n) => `
      <div class="list-row">
        <span class="list-row-main"><span class="list-row-title"><span data-pn="${escapeHtml(n)}">${escapeHtml(n)}</span>${friendsIsOnline(n) ? ' <span class="badge is-pos">онлайн</span>' : ''}</span></span>
        <button type="button" class="btn btn-ghost btn-icon" onclick="openPublicProfile(${jsArg(n)})" aria-label="Профіль" title="Профіль"><span class="ic i-person" aria-hidden="true"></span></button>
        <button type="button" class="btn btn-ghost btn-icon" onclick="messageUser(${jsArg(n)})" aria-label="Написати" title="Написати"><span class="ic i-mail" aria-hidden="true"></span></button>
        <button type="button" class="btn btn-ghost btn-icon" onclick="friendsRemove(${jsArg(n)})" aria-label="Видалити з друзів" title="Видалити з друзів"><span class="ic i-trash" aria-hidden="true"></span></button>
      </div>`).join('') + `</div>`
    : `<div class="room-empty">Друзів поки немає — додай першого за ніком.</div>`;
  root.innerHTML = h;
  if (typeof applyPlayerStyles === 'function') try { applyPlayerStyles(root); } catch (e) { /* косметика не критична */ }
}

async function friendsAddFromInput() {
  const inp = document.getElementById('friendsAddInput');
  const n = (inp && inp.value || '').trim();
  if (!n) return notify('Вкажи нік гравця', 'error');
  if (await friendsRequest(n) && inp) inp.value = '';
}
async function friendsRequest(nick) {
  const r = await friendsApi('friendRequest', nick);
  if (!r) return false;
  notify(r.state === 'friends' ? 'Тепер ви друзі' : r.state === 'pending' ? 'Запит уже надіслано' : 'Запит надіслано', 'success');
  return true;
}
async function friendsAccept(n) { const r = await friendsApi('friendAccept', n); if (r) notify('Тепер ви друзі', 'success'); }
async function friendsDecline(n) { await friendsApi('friendDecline', n); }
async function friendsRemove(n) {
  if (!(await confirmAction({ title: 'Видалити з друзів?', text: n + ' зникне зі списку друзів.', confirm: 'Видалити', danger: true }))) return;
  await friendsApi('friendRemove', n);
}
// Кнопка в публічному профілі
function friendsProfileButton(name) {
  if (name === currentUser) return '';
  if (FR.friends[name]) return `<button type="button" class="btn-outline" style="flex:1;" disabled><span class="ic i-check" aria-hidden="true"></span> Друзі</button>`;
  return `<button type="button" class="btn-outline" style="flex:1;" onclick="friendsRequest(${jsArg(name)})"><span class="ic i-users" aria-hidden="true"></span> В друзі</button>`;
}

// ── Запрошення за стіл: вікно вибору друга ──
function friendsRoomLink(game, id) { return location.origin + '/?room=' + game + ':' + id; }
async function friendsCopyLink(game, id) {
  const link = friendsRoomLink(game, id);
  try { await navigator.clipboard.writeText(link); notify('Посилання скопійовано', 'success'); }
  catch (e) { window.prompt('Скопіюй посилання:', link); }
}
function friendsInviteOpen(game, id) {
  if (!FR_ROOM_ID_RE.test(id || '')) return;
  document.getElementById('friendsInviteModal')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'friendsInviteModal';
  wrap.className = 'modal-backdrop is-sheet';
  const fr = Object.keys(FR.friends).sort((a, b) => (friendsIsOnline(b) - friendsIsOnline(a)) || a.localeCompare(b));
  wrap.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="frInvT">
    <h2 class="dialog-title" id="frInvT">Запросити за стіл</h2>
    <p class="dialog-text">${escapeHtml(frGameName(game))}. Друг сам вирішить, чи заходити: ставку списують лише після його згоди.</p>
    <div class="list fr-invite-list">${fr.length ? fr.map((n) => `
      <div class="list-row">
        <span class="list-row-main"><span class="list-row-title">${escapeHtml(n)}${friendsIsOnline(n) ? ' <span class="badge is-pos">онлайн</span>' : ''}</span></span>
        <button type="button" class="btn btn-primary btn-sm" data-nick="${escapeHtml(n)}" onclick="friendsSendInvite(this,${jsArg(game)},${jsArg(id)})">Запросити</button>
      </div>`).join('') : `<div class="room-empty">Друзів ще немає — додай їх у розділі «Друзі».</div>`}</div>
    <div class="dialog-actions">
      <button type="button" class="btn btn-secondary" onclick="friendsCopyLink(${jsArg(game)},${jsArg(id)})"><span class="ic i-link" aria-hidden="true"></span> Скопіювати посилання</button>
      <button type="button" class="btn btn-ghost" onclick="document.getElementById('friendsInviteModal').remove()">Закрити</button>
    </div></div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
}
async function friendsSendInvite(btn, game, id) {
  btn.disabled = true;
  const r = await friendsApi('friendInvite', btn.dataset.nick, { id });
  if (r) { btn.textContent = 'Надіслано'; notify('Запрошення надіслано', 'success'); } else btn.disabled = false;
}
// Кнопка «Запросити друга» в очікуванні столу (викликається з екранів ігор)
function friendsAttachInvite(waitElId, game, id) {
  const el = document.getElementById(waitElId);
  if (!el || !id) return;
  let bar = el.querySelector('.fr-invite-bar');
  if (bar && bar.dataset.id === id) return;
  if (!bar) { bar = document.createElement('div'); bar.className = 'fr-invite-bar'; el.appendChild(bar); }
  bar.dataset.id = id;
  bar.innerHTML = `<button type="button" class="btn btn-secondary btn-sm" onclick="friendsInviteOpen(${jsArg(game)},${jsArg(id)})"><span class="ic i-users" aria-hidden="true"></span> Запросити друга</button>`;
}

// ── Вхідні запрошення: спливаюча картка ──
function friendsInvitePopups() {
  let box = document.getElementById('friendsPopups');
  if (!box) { box = document.createElement('div'); box.id = 'friendsPopups'; box.className = 'fr-popups'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const live = new Map(frFreshInvites());
  box.querySelectorAll('.fr-popup').forEach((el) => { if (!live.has(el.dataset.id)) { el._off && el._off(); el.remove(); } });
  live.forEach(async (v, id) => {
    const sk = id + ':' + v.at;
    if (FR.shown[sk] || box.querySelector(`.fr-popup[data-id="${id}"]`)) return;
    FR.shown[sk] = true;
    // Не показуємо запрошення в кімнату, яка вже зайнята чи зникла
    let room = null;
    try { room = (await db.ref('rooms/' + v.game + '/' + id).once('value')).val(); } catch (e) { /* дочитаємо при вході */ }
    if (!room || room.status !== 'waiting' || Object.keys(room.players || {}).length >= room.size || (room.players || {})[currentUser]) { friendsDismissInvite(id); return; }
    const el = document.createElement('div');
    el.className = 'fr-popup';
    el.dataset.id = id;
    el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="fr-popup-text"><b>${escapeHtml(v.from)}</b> запрошує за стіл<br><span class="fr-popup-sub">${escapeHtml(frGameName(v.game))} · ставка <span class="num">₴${formatNumber(v.bet)}</span></span></div>
      <div class="fr-popup-actions">
        <button type="button" class="btn btn-primary btn-sm" onclick="friendsJoinInvite(${jsArg(id)})">Приєднатись</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="friendsDismissInvite(${jsArg(id)})">Відхилити</button>
      </div>`;
    box.appendChild(el);
    // Стіл заповнили чи закрили — картка зникає сама
    const ref = db.ref('rooms/' + v.game + '/' + id);
    const cb = ref.on('value', (snap) => {
      const r = snap.val();
      if (!r || r.status !== 'waiting' || Object.keys(r.players || {}).length >= r.size) { el.remove(); friendsDismissInvite(id); }
    });
    el._off = () => ref.off('value', cb);
    try { playSound && playSound('click'); } catch (e) { /* без звуку */ }
    setTimeout(() => { el._off && el._off(); el.remove(); }, Math.max(1000, FR_INVITE_TTL - (Date.now() - v.at)));
  });
}
function friendsRemovePopup(id) {
  const el = document.querySelector(`.fr-popup[data-id="${id}"]`);
  if (el) { el._off && el._off(); el.remove(); }
}
async function friendsDismissInvite(id) {
  friendsRemovePopup(id);
  delete FR.invites[id];
  friendsRender();
  if (FR_ROOM_ID_RE.test(id)) await friendsApi('friendInviteDismiss', '', { id });
}
async function friendsJoinInvite(id) {
  const v = FR.invites[id];
  if (!v) return;
  friendsRemovePopup(id);
  await friendsJoinRoom(v.game, id);
  friendsApi('friendInviteDismiss', '', { id });
}
// Вхід у кімнату друга: відкриваємо екран гри й заходимо звичайним join (ставку списує арбітр)
async function friendsJoinRoom(game, id) {
  if (!FR_ROOM_GAMES.includes(game) || !FR_ROOM_ID_RE.test(id)) return;
  try { openGame(game); } catch (e) { /* екран гри */ }
  await roomJoin(game, id);
}

// ── Посилання /?room=<гра>:<id> ──
async function friendsOpenRoomLink() {
  let raw = null;
  try { raw = sessionStorage.getItem('slotok_room'); sessionStorage.removeItem('slotok_room'); } catch (e) { /* без storage */ }
  if (!raw) return;
  const [game, id] = raw.split(':');
  if (!FR_ROOM_GAMES.includes(game) || !FR_ROOM_ID_RE.test(id || '')) return;
  let room = null;
  try { room = (await db.ref('rooms/' + game + '/' + id).once('value')).val(); } catch (e) { /* нижче скажемо «недоступна» */ }
  if (!room || room.status !== 'waiting') return notify('Ця кімната вже недоступна', 'error');
  const players = Object.keys(room.players || {});
  if (players.includes(currentUser)) { try { openGame(game); } catch (e) { /* ігровий екран */ } return; }
  if (players.length >= room.size) return notify('За цим столом уже немає місць', 'error');
  const ok = await confirmAction({
    title: 'Приєднатись до столу?',
    text: `${frGameName(game)} · господар ${room.host || '?'} · ставка ₴${formatNumber(room.bet)}. Ставку буде списано одразу після підтвердження.`,
    confirm: 'Приєднатись · ₴' + formatNumber(room.bet),
  });
  if (ok) await friendsJoinRoom(game, id);
}
