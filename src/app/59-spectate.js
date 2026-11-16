// ============================================================
// РЕЖИМ ГЛЯДАЧА: дивитись чужі онлайн-столи наживо, не беручи участі.
// Працює лише з ПУБЛІЧНИМ вузлом rooms/<гра>/<id> (приватне — карти, руки —
// глядачу недоступне і правилами, і кодом: roomWatch(..., {spectate:true})
// не підписується на room_private і не смикає таймери). Ходити глядач не може:
// сервер (lib/rooms.js act) відхиляє не-учасника, ставок немає, баланс не чіпаємо.
// Екран — той самий рендер столу (50-tables.js / 52-holdem.js), але з класом
// is-spectating (кнопки дій приховано, див. 80-spectate.css).
// Лічильник «N глядачів»: room_watchers/<id>/<нік> (onDisconnect знімає).
// ============================================================

const SPEC_GAMES = ['holdem', 'durak', 'eights', 'ludo'];
const SPEC = { cur: null, live: {}, counts: {} };

function spectateWord(n) { return n === 1 ? 'глядач' : (n >= 2 && n <= 4 ? 'глядачі' : 'глядачів'); }

// ── Список «Наживо» у лобі гри ──
function spectateLiveMount(game) {
  if (!SPEC_GAMES.includes(game) || !db) return;
  const rooms = document.getElementById(game + 'Rooms');
  if (!rooms) return;
  let box = document.getElementById(game + 'Live');
  if (!box) {
    box = document.createElement('div');
    box.id = game + 'Live';
    box.className = 'sp-live hidden';
    const label = rooms.previousElementSibling;
    rooms.parentNode.insertBefore(box, label && label.classList.contains('field-label') ? label : rooms);
  }
  if (SPEC.live[game]) return;
  const ref = db.ref('rooms/' + game).orderByChild('status').equalTo('playing');
  const cb = ref.on('value', (snap) => {
    const list = Object.entries(snap.val() || {}).filter(([, r]) => !Object.prototype.hasOwnProperty.call(r.players || {}, currentUser))
      .sort((a, b) => (b[1].created || 0) - (a[1].created || 0)).slice(0, 12);
    if (!list.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = `<div class="field-label">Наживо</div><div class="room-list">${list.map(([id, r]) => {
      const names = Object.keys(r.players || {});
      let hand = '';
      try { const v = r.v ? JSON.parse(r.v) : null; if (v && v.hand) hand = ' · роздача ' + v.hand; } catch (e) { /* ignore */ }
      return `<div class="room-row">
        <div class="room-row-main">
          <div class="room-row-host">${escapeHtml(names.slice(0, 4).join(', '))}</div>
          <div class="room-row-meta"><span class="num">₴${formatNumber(r.bet)}</span> · ${names.length} гравців${escapeHtml(hand)}</div>
        </div>
        <button type="button" class="btn btn-secondary room-row-btn" onclick="spectateOpen(${jsArg(game)},${jsArg(id)})"><span class="ic i-eye" aria-hidden="true"></span>Дивитись</button>
      </div>`;
    }).join('')}</div>`;
  }, () => { box.classList.add('hidden'); });
  SPEC.live[game] = () => { ref.off('value', cb); delete SPEC.live[game]; };
}
function spectateLiveStop() { Object.values(SPEC.live).forEach((f) => f()); }

// ── Лічильник глядачів (бачать і гравці, і глядачі) ──
function spectateCountStart(game, id) {
  spectateCountStop(game);
  if (!db) return;
  const ref = db.ref('room_watchers/' + id);
  const cb = ref.on('value', (s) => {
    const n = Object.keys(s.val() || {}).length;
    const el = document.getElementById(game + 'Watchers');
    if (el) { el.textContent = n ? `${n} ${spectateWord(n)}` : ''; el.classList.toggle('hidden', !n); }
  }, () => {});
  SPEC.counts[game] = () => { ref.off('value', cb); delete SPEC.counts[game]; };
}
function spectateCountStop(game) { SPEC.counts[game] && SPEC.counts[game](); }
function spectateChip(game) {
  if (document.getElementById(game + 'Watchers')) return;
  const top = document.querySelector(`#${game}Play .tbl-top`);
  if (!top) return;
  const el = document.createElement('span');
  el.id = game + 'Watchers'; el.className = 'sp-count hidden';
  top.insertBefore(el, top.firstChild);
}

// ── Відкрити / закрити режим глядача ──
function spectateOpen(game, id) {
  if (!SPEC_GAMES.includes(game) || !db) return;
  const t = TBL[game];
  if (t && t.id && !t.spectate) { notify('Спершу заверши свою гру за цим столом', 'info'); return; }
  spectateStop();
  switchTab(game);
  const tt = TBL[game] || (TBL[game] = { size: 2, local: {} });
  if (tt.id) return;
  Object.assign(tt, { id, announced: true, last: null, local: {}, spectate: true });
  SPEC.cur = { game, id };
  document.querySelectorAll(`#tab-${game} .mass-reset`).forEach((el) => { el.innerHTML = ''; Object.keys(el.dataset).forEach((k) => delete el.dataset[k]); });
  document.getElementById('tab-' + game)?.classList.add('is-spectating');
  document.getElementById(game + 'Lobby')?.classList.add('hidden');
  document.getElementById(game + 'Game')?.classList.remove('hidden');
  spectateBar(game);
  spectateChip(game);
  tt.unwatch = roomWatch(game, id, (u) => { u.spectate = true; tableUpdate(game, u); }, { spectate: true });
  clearInterval(tt.timer);
  tt.timer = setInterval(() => { if (tt.last) tableTimer(game, tt.last); }, 500);
  try {
    const me = db.ref('room_watchers/' + id + '/' + currentUser);
    me.onDisconnect().remove();
    me.set(Date.now()).catch(() => {});
    SPEC.cur.presence = me;
  } catch (e) { /* лічильник — не критично */ }
  spectateCountStart(game, id);
}
function spectateBar(game) {
  const g = document.getElementById(game + 'Game');
  if (!g || g.querySelector('.sp-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'sp-bar';
  bar.innerHTML = `<span class="mass-chip sp-chip"><span class="ic i-eye" aria-hidden="true"></span>Ви глядач</span><span class="sp-count hidden" id="${game}WatchersBar"></span><button type="button" class="btn btn-ghost sp-exit" onclick="spectateStop()">Вийти</button>`;
  g.insertBefore(bar, g.firstChild);
}
function spectateStop() {
  const cur = SPEC.cur;
  if (!cur) return;
  SPEC.cur = null;
  const t = TBL[cur.game];
  try { if (cur.presence) { cur.presence.onDisconnect().cancel(); cur.presence.remove(); } } catch (e) { /* ignore */ }
  spectateCountStop(cur.game);
  if (t && t.spectate) {
    t.spectate = false;
    t.unwatch && t.unwatch(); t.unwatch = null;
    clearInterval(t.timer); t.id = null; t.last = null;
    document.getElementById(cur.game + 'Result')?.classList.remove('is-win', 'is-lose');
    const r = document.getElementById(cur.game + 'Result'); if (r) r.textContent = '';
  }
  document.getElementById('tab-' + cur.game)?.classList.remove('is-spectating');
  document.getElementById(cur.game + 'Game')?.classList.add('hidden');
  document.getElementById(cur.game + 'Lobby')?.classList.remove('hidden');
}
// Підсумок для глядача: без «ти виграв/програв»
function spectateDecorate(game, u) {
  const wait = document.getElementById(game + 'Wait'); wait && wait.classList.add('hidden');
  const st = document.getElementById(game + 'Result');
  if (st) {
    st.classList.remove('is-win', 'is-lose');
    st.textContent = u.meta.status === 'finished' && u.result
      ? (u.result.draw ? 'Нічия' : 'Переміг(ли): ' + (u.result.winners || []).join(', ')) + (u.result.text ? ' · ' + u.result.text : '')
      : '';
  }
  const bar = document.getElementById(game + 'WatchersBar'), chip = document.getElementById(game + 'Watchers');
  if (bar && chip) { bar.textContent = chip.textContent; bar.classList.toggle('hidden', chip.classList.contains('hidden')); }
}

// ── Прив'язки до існуючого коду (перекриття функцій, див. README) ──
const _spInitTable = initTable;
initTable = function (game) { _spInitTable(game); spectateLiveMount(game); };
const _spSwitchTab = switchTab;
switchTab = function (id, el) {
  if (SPEC.cur && SPEC.cur.game !== id) spectateStop();
  spectateLiveStop();
  return _spSwitchTab.apply(this, arguments);
};
const _spTableOpen = tableOpen;
tableOpen = function (game, id) {
  const t = TBL[game];
  if (t && t.spectate) spectateStop();
  _spTableOpen(game, id);
  spectateChip(game);
  spectateCountStart(game, id);
};
const _spTableClose = tableClose;
tableClose = function (game, keepLobby) {
  if (SPEC.cur && SPEC.cur.game === game) spectateStop();
  spectateCountStop(game);
  return _spTableClose(game, keepLobby);
};
