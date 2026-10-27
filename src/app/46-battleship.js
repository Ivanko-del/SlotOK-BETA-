// ============================================================
// МОРСЬКИЙ БІЙ (v112): з ботом (без грошей, у браузері) + онлайн 1×1 на ставку
//
// Онлайн — через сервер (lib/room-games/battleship.js): флот суперника знає
// лише сервер, розстановку він перевіряє, влучання рахує сам. Правила:
// флот 4,3,3,2,2,2,1,1,1,1, кораблі не торкаються навіть кутами; влучив —
// стріляєш ще; потоплений корабель обводиться промахами.
// ============================================================

const BS_N = 10;
const BS_FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
const BS = {
  mode: 'bot',
  bot: null,
  online: null, unwatch: null, unlobby: null, myFleet: null, pending: false,
};

function bsCells(ship) {
  const out = [];
  for (let k = 0; k < ship.len; k++) out.push(ship.dir === 'v' ? (ship.y + k) * BS_N + ship.x : ship.y * BS_N + ship.x + k);
  return out;
}
function bsAround(i) {
  const x = i % BS_N, y = Math.floor(i / BS_N), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < BS_N && ny < BS_N) out.push(ny * BS_N + nx);
  }
  return out;
}
function bsRandomFleet() {
  for (;;) {
    const ships = [], halo = new Set();
    let ok = true;
    for (const len of BS_FLEET) {
      let placed = false;
      for (let t = 0; t < 300 && !placed; t++) {
        const dir = Math.random() < 0.5 ? 'v' : 'h';
        const x = Math.floor(Math.random() * (dir === 'h' ? BS_N - len + 1 : BS_N));
        const y = Math.floor(Math.random() * (dir === 'v' ? BS_N - len + 1 : BS_N));
        const ship = { x, y, len, dir };
        const cs = bsCells(ship);
        if (cs.some((c) => halo.has(c))) continue;
        cs.forEach((c) => bsAround(c).forEach((a) => halo.add(a)));
        ships.push(ship); placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
}

// Малювання поля. shots — рядок 100 символів ('.', 'o', 'x', '#'),
// fleet — мої кораблі (або null для поля суперника).
function bsRender(el, shots, fleet, opts) {
  if (!el) return;
  opts = opts || {};
  if (el.childElementCount !== BS_N * BS_N) {
    el.innerHTML = Array.from({ length: BS_N * BS_N }, (_, i) => `<div class="bs-cell" data-i="${i}"></div>`).join('');
  }
  const part = {};
  (fleet || []).forEach((s) => bsCells(s).forEach((c, k) => {
    part[c] = 'is-ship ' + (s.dir === 'v' ? 'is-v' : 'is-h') + (k === 0 ? ' is-head' : '') + (k === s.len - 1 ? ' is-tail' : '') + (s.len === 1 ? ' is-solo' : '');
  }));
  for (let i = 0; i < BS_N * BS_N; i++) {
    const c = shots[i];
    const cls = 'bs-cell' + (part[i] ? ' ' + part[i] : '') + (c === 'o' ? ' is-miss' : c === 'x' ? ' is-hit' : c === '#' ? ' is-sunk' : '') + (opts.last === i ? ' is-last' : '');
    const d = el.children[i];
    if (d.className !== cls) d.className = cls;
  }
  el.classList.toggle('is-active', !!opts.active);
}
function bsBind(el, onFire) {
  if (!el || el._bsBound) return;
  el._bsBound = true;
  el.addEventListener('click', (e) => { const t = e.target.closest('.bs-cell'); if (t) onFire(+t.dataset.i); });
}

function initBattleship() { bsSetMode(BS.mode, true); }
function bsSetMode(mode, silent) {
  BS.mode = mode;
  document.querySelectorAll('.bs-mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('bsBot')?.classList.toggle('hidden', mode !== 'bot');
  document.getElementById('bsOnline')?.classList.toggle('hidden', mode !== 'online');
  if (mode === 'bot' && !BS.bot) bsBotNew();
  if (mode === 'online') bsOnlineEnter();
  else { BS.unlobby && BS.unlobby(); BS.unlobby = null; }
  if (!silent) playSound && playSound('click');
}

// ══════════════════════════ З БОТОМ ══════════════════════════
function bsBotNew() {
  BS.bot = {
    phase: 'place', fleets: [bsRandomFleet(), bsRandomFleet()],
    shots: ['.'.repeat(100), '.'.repeat(100)], turn: 0, over: false, winner: -1, hunt: [], last: -1,
  };
  bsBind(document.getElementById('bsBotEnemy'), bsBotFire);
  bsBotRender();
}
function bsBotShuffle() { if (BS.bot && BS.bot.phase === 'place') { BS.bot.fleets[0] = bsRandomFleet(); bsBotRender(); } }
function bsBotStart() { if (BS.bot && BS.bot.phase === 'place') { BS.bot.phase = 'fire'; bsBotRender(); } }
// Постріл; повертає 'miss' | 'hit' | 'sunk' | null
function bsShoot(st, target, c) {
  const b = st.shots[target].split('');
  if (b[c] !== '.') return null;
  const ship = st.fleets[target].find((s) => bsCells(s).includes(c));
  if (!ship) { b[c] = 'o'; st.shots[target] = b.join(''); return 'miss'; }
  b[c] = 'x';
  const cs = bsCells(ship);
  if (cs.every((k) => b[k] === 'x' || b[k] === '#')) {
    cs.forEach((k) => { b[k] = '#'; });
    cs.forEach((k) => bsAround(k).forEach((a) => { if (b[a] === '.') b[a] = 'o'; }));
    st.shots[target] = b.join('');
    return 'sunk';
  }
  st.shots[target] = b.join('');
  return 'hit';
}
const bsAllSunk = (st, t) => !st.shots[t].includes('x') && st.fleets[t].every((s) => bsCells(s).every((k) => st.shots[t][k] === '#'));
function bsBotFire(c) {
  const st = BS.bot;
  if (!st || st.phase !== 'fire' || st.over || st.turn !== 0) return;
  const r = bsShoot(st, 1, c);
  if (!r) return;
  st.last = c;
  playSound && playSound(r === 'miss' ? 'click' : 'win');
  if (bsAllSunk(st, 1)) { st.over = true; st.winner = 0; bsBotRender(); return; }
  if (r === 'miss') { st.turn = 1; bsBotRender(); setTimeout(bsBotAi, 650); }
  else bsBotRender();
}
// Бот: «полювання» по шаховому візерунку, після влучання — добиває вздовж лінії
function bsBotAi() {
  const st = BS.bot;
  if (!st || st.over || st.turn !== 1) return;
  const board = st.shots[0];
  const hits = [...board].map((c, i) => (c === 'x' ? i : -1)).filter((i) => i >= 0);
  let cand = [];
  if (hits.length) {
    const xs = hits.map((i) => i % BS_N), ys = hits.map((i) => Math.floor(i / BS_N));
    const line = hits.length > 1 ? (xs.every((x) => x === xs[0]) ? 'v' : 'h') : null;
    hits.forEach((h) => {
      const x = h % BS_N, y = Math.floor(h / BS_N);
      const opts = [];
      if (line !== 'v') { if (x > 0) opts.push(h - 1); if (x < BS_N - 1) opts.push(h + 1); }
      if (line !== 'h') { if (y > 0) opts.push(h - BS_N); if (y < BS_N - 1) opts.push(h + BS_N); }
      opts.forEach((o) => { if (board[o] === '.') cand.push(o); });
    });
  }
  if (!cand.length) cand = [...board].map((c, i) => (c === '.' && (i % BS_N + Math.floor(i / BS_N)) % 2 === 0 ? i : -1)).filter((i) => i >= 0);
  if (!cand.length) cand = [...board].map((c, i) => (c === '.' ? i : -1)).filter((i) => i >= 0);
  const c = cand[Math.floor(Math.random() * cand.length)];
  const r = bsShoot(st, 0, c);
  st.lastMine = c;
  if (bsAllSunk(st, 0)) { st.over = true; st.winner = 1; bsBotRender(); return; }
  if (r === 'miss') st.turn = 0;
  bsBotRender();
  if (st.turn === 1) setTimeout(bsBotAi, 650);
}
function bsBotRender() {
  const st = BS.bot;
  bsRender(document.getElementById('bsBotMine'), st.shots[0], st.fleets[0], { last: st.lastMine });
  bsRender(document.getElementById('bsBotEnemy'), st.shots[1], st.over ? st.fleets[1] : null, { active: st.phase === 'fire' && st.turn === 0 && !st.over, last: st.last });
  document.getElementById('bsBotPlace')?.classList.toggle('hidden', st.phase !== 'place');
  document.getElementById('bsBotEnemyWrap')?.classList.toggle('is-dim', st.phase === 'place');
  const s = document.getElementById('bsBotStatus');
  if (s) {
    s.classList.remove('is-win', 'is-lose');
    if (st.over) s.classList.add(st.winner === 0 ? 'is-win' : 'is-lose');
    s.textContent = st.phase === 'place' ? 'Розстав флот: «Перемішати» — інша розстановка, «До бою» — почати.'
      : st.over ? (st.winner === 0 ? 'Перемога! Флот бота на дні.' : 'Бот потопив твій флот.')
      : st.turn === 0 ? 'Твій постріл — тисни на поле суперника.' : 'Стріляє бот…';
  }
  document.getElementById('bsBotAgain')?.classList.toggle('hidden', !st.over);
  bsFleetLeft(document.getElementById('bsBotLeft'), st.shots[1]);
}
// Скільки кораблів суперника ще на плаву: потоплені ('#') рахуємо прямо з
// дошки пострілів — зв'язні групи клітинок і є кораблі.
function bsFleetLeft(el, shots) {
  if (!el) return;
  const seen = new Set(), sunk = [];
  for (let i = 0; i < BS_N * BS_N; i++) {
    if (shots[i] !== '#' || seen.has(i)) continue;
    let len = 0;
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const c = stack.pop(); len++;
      const x = c % BS_N;
      [x > 0 ? c - 1 : -1, x < BS_N - 1 ? c + 1 : -1, c - BS_N, c + BS_N].forEach((n) => {
        if (n >= 0 && n < BS_N * BS_N && shots[n] === '#' && !seen.has(n)) { seen.add(n); stack.push(n); }
      });
    }
    sunk.push(len);
  }
  el.innerHTML = BS_FLEET.map((len) => {
    const k = sunk.indexOf(len);
    if (k >= 0) sunk.splice(k, 1);
    return `<span class="bs-pip${k >= 0 ? ' is-sunk' : ''}" style="--len:${len}" aria-label="${len}-палубний${k >= 0 ? ', потоплено' : ''}"></span>`;
  }).join('');
}

// ══════════════════════════ ОНЛАЙН ══════════════════════════
ROOM_HOOKS.battleship = { onJoined: (id) => bsOnlineOpen(id), onLeft: () => bsOnlineClose() };
async function bsOnlineEnter() {
  if (!BS.unlobby) BS.unlobby = roomLobby('battleship', document.getElementById('bsRooms'));
  if (!BS.online) { const id = await roomResume('battleship'); if (id) bsOnlineOpen(id); }
}
async function bsOnlineCreate() {
  const bet = parseInt(document.getElementById('bsBet')?.value) || 0;
  const id = await roomCreate('battleship', bet, {});
  if (id) { notify('Кімнату створено — чекаємо суперника', 'success'); bsOnlineOpen(id); }
}
function bsOnlineOpen(id) {
  if (BS.online && BS.online.id === id) return;
  bsOnlineClose(true);
  BS.online = { id, announced: false };
  BS.myFleet = bsRandomFleet();
  document.getElementById('bsLobby')?.classList.add('hidden');
  document.getElementById('bsGame')?.classList.remove('hidden');
  bsBind(document.getElementById('bsEnemy'), bsOnlineFire);
  BS.unwatch = roomWatch('battleship', id, bsOnlineUpdate);
  clearInterval(BS.timer);
  BS.timer = setInterval(() => { if (BS.online && BS.online.last) bsOnlineHud(BS.online.last); }, 500);
}
function bsOnlineClose(keepLobby) {
  BS.unwatch && BS.unwatch(); BS.unwatch = null;
  clearInterval(BS.timer);
  BS.online = null;
  if (!keepLobby) {
    document.getElementById('bsGame')?.classList.add('hidden');
    document.getElementById('bsLobby')?.classList.remove('hidden');
  }
}
function bsOnlineUpdate(u) {
  if (!BS.online) return;
  BS.online.last = u;
  const { meta, pub, priv, seat } = u;
  const wait = meta.status === 'waiting';
  if (meta.status === 'cancelled') { notify('Кімнату скасовано, ставку повернено', 'info'); bsOnlineClose(); return; }
  document.getElementById('bsWait')?.classList.toggle('hidden', !wait);
  document.getElementById('bsPlay')?.classList.toggle('hidden', wait);
  if (wait) { const w = document.getElementById('bsWaitText'); if (w) w.textContent = `Ставка ₴${formatNumber(meta.bet)}. Чекаємо суперника…`; return; }
  if (!pub) return;
  const placing = pub.phase === 'place' && !pub.placed[seat];
  const myFleet = (priv && priv.fleet) || BS.myFleet;
  const enemy = 1 - seat;
  bsRender(document.getElementById('bsMine'), pub.shots[seat], myFleet, { last: pub.last && pub.last.by === enemy ? pub.last.c : -1 });
  bsRender(document.getElementById('bsEnemy'), pub.shots[enemy], pub.fleets ? pub.fleets[enemy] : null, {
    active: pub.phase === 'fire' && pub.turn === seat && !pub.over, last: pub.last && pub.last.by === seat ? pub.last.c : -1,
  });
  document.getElementById('bsPlace')?.classList.toggle('hidden', !placing);
  document.getElementById('bsEnemyWrap')?.classList.toggle('is-dim', pub.phase === 'place');
  bsFleetLeft(document.getElementById('bsLeft'), pub.shots[enemy]);
  bsOnlineHud(u);
  if (pub.last && BS.online.lastShot !== JSON.stringify(pub.last)) {
    BS.online.lastShot = JSON.stringify(pub.last);
    playSound && playSound(pub.last.r === 'miss' ? 'click' : 'win');
  }
  if (meta.status === 'finished' && !BS.online.announced) { BS.online.announced = true; roomAnnounce(u.result, meta.bet, 'Морський бій'); }
}
function bsOnlineHud(u) {
  const { meta, pub, seat, players } = u;
  if (!pub) return;
  const s = document.getElementById('bsStatus');
  if (s) {
    s.classList.remove('is-win', 'is-lose');
    if (meta.status === 'finished' && u.result) {
      s.classList.add((u.result.winners || []).includes(currentUser) ? 'is-win' : 'is-lose');
      s.textContent = roomResultText(u.result, meta.bet);
    } else if (pub.phase === 'place') {
      s.textContent = pub.placed[seat] ? `Чекаємо, поки ${escapeHtml(players[1 - seat] || 'суперник')} розставить флот… ${roomSecondsLeft(pub.until)} с`
        : `Розстав флот: ${roomSecondsLeft(pub.until)} с (не встигнеш — розставимо самі).`;
    } else {
      const mine = pub.turn === seat;
      s.textContent = (mine ? 'Твій постріл' : `Стріляє ${players[1 - seat] || 'суперник'}`) + ` · ${roomSecondsLeft(pub.until)} с` + (pub.timeouts[seat] ? ` · пропущено ходів: ${pub.timeouts[seat]}/3` : '');
    }
  }
  document.getElementById('bsLeave')?.classList.toggle('hidden', meta.status !== 'playing');
  document.getElementById('bsAgain')?.classList.toggle('hidden', meta.status !== 'finished');
}
function bsOnlineShuffle() { BS.myFleet = bsRandomFleet(); if (BS.online && BS.online.last) bsOnlineUpdate(BS.online.last); }
async function bsOnlineReady() {
  if (!BS.online) return;
  const r = await roomApi('act', { id: BS.online.id, move: { ships: BS.myFleet } });
  if (r.mode === 'server') playSound && playSound('click');
}
async function bsOnlineFire(c) {
  const o = BS.online;
  if (!o || !o.last || BS.pending) return;
  const { pub, seat } = o.last;
  if (!pub || pub.phase !== 'fire' || pub.over || pub.turn !== seat || pub.shots[1 - seat][c] !== '.') return;
  BS.pending = true;
  document.querySelector(`#bsEnemy .bs-cell[data-i="${c}"]`)?.classList.add('is-pending');
  try { await roomApi('act', { id: o.id, move: { c } }); }
  finally { BS.pending = false; }
}
function bsOnlineLeave() { if (BS.online) roomLeaveConfirm('battleship', BS.online.id, BS.online.last && BS.online.last.meta.status === 'playing'); }
function bsOnlineBack() { bsOnlineClose(); }
