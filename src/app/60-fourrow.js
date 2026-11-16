// ============================================================
// ЧОТИРИ В РЯД — онлайн 1×1 на ставку (сервер: lib/room-games/fourrow.js)
//
// Сітка 7×6, фішка падає в колонку. Хід перевіряє й рахує сервер, клієнт лише
// малює «3D»-поле (CSS-перспектива, фішки з об'ємом, анімація падіння лише
// на transform). Сітка приходить рядком з 42 символів: '.', '0', '1'.
// ============================================================
const FOUR_W = 7, FOUR_H = 6;
const FOUR = { online: null, unwatch: null, unlobby: null, pending: false, timer: null };

function initFourRow() {
  if (!FOUR.unlobby) FOUR.unlobby = roomLobby('fourrow', document.getElementById('frRooms'));
  if (!FOUR.online) roomResume('fourrow').then((id) => { if (id) frOpen(id); });
}
ROOM_HOOKS.fourrow = { onJoined: (id) => frOpen(id), onLeft: () => frClose() };

async function frCreate() {
  const bet = parseInt(document.getElementById('frBet')?.value) || 0;
  const id = await roomCreate('fourrow', bet, {});
  if (id) { notify('Кімнату створено — чекаємо суперника', 'success'); frOpen(id); }
}
function frOpen(id) {
  if (FOUR.online && FOUR.online.id === id) return;
  frClose(true);
  FOUR.online = { id, announced: false, lastKey: null, seen: false };
  document.getElementById('frLobby')?.classList.add('hidden');
  document.getElementById('frGame')?.classList.remove('hidden');
  const board = document.getElementById('frBoard');
  if (board) board.innerHTML = '';
  FOUR.unwatch = roomWatch('fourrow', id, frUpdate);
  clearInterval(FOUR.timer);
  FOUR.timer = setInterval(() => { if (FOUR.online && FOUR.online.last) frHud(FOUR.online.last); }, 500);
}
function frClose(keepLobby) {
  FOUR.unwatch && FOUR.unwatch(); FOUR.unwatch = null;
  clearInterval(FOUR.timer);
  FOUR.online = null;
  if (!keepLobby) {
    document.getElementById('frGame')?.classList.add('hidden');
    document.getElementById('frLobby')?.classList.remove('hidden');
  }
}

// Побудова сітки один раз: 6 рядків × 7 колонок клітинок (кожна — гніздо з фішкою)
function frBuild(el) {
  if (el.childElementCount === FOUR_W * FOUR_H) return;
  el.innerHTML = Array.from({ length: FOUR_W * FOUR_H }, (_, i) =>
    `<button type="button" class="fr-cell" data-c="${i % FOUR_W}" tabindex="-1" aria-label="Колонка ${i % FOUR_W + 1}"><span class="fr-disc"></span></button>`).join('');
  el.addEventListener('click', (e) => { const t = e.target.closest('.fr-cell'); if (t) frDrop(+t.dataset.c); });
}
function frRender(pub, seat) {
  const el = document.getElementById('frBoard');
  if (!el) return;
  frBuild(el);
  const key = pub.last ? pub.last.r + ':' + pub.last.c + ':' + pub.board.replace(/\./g, '').length : '';
  const animate = FOUR.online.seen && key && key !== FOUR.online.lastKey;
  FOUR.online.lastKey = key; FOUR.online.seen = true;
  const win = new Set(pub.line || []);
  for (let i = 0; i < FOUR_W * FOUR_H; i++) {
    const v = pub.board[i], disc = el.children[i].firstChild;
    let cls = 'fr-disc' + (v === '0' ? ' is-p0' : v === '1' ? ' is-p1' : '') + (v !== '.' && v === String(seat) ? ' is-mine' : '') + (win.has(i) ? ' is-win' : '');
    if (pub.last && i === pub.last.r * FOUR_W + pub.last.c && v !== '.') {
      cls += ' is-last';
      if (animate) { cls += ' is-drop'; disc.style.setProperty('--fr-from', `${-(pub.last.r + 1) * 100}%`); }
    }
    const keepDrop = disc.classList.contains('is-drop') && !animate && pub.last && i === pub.last.r * FOUR_W + pub.last.c;
    if (keepDrop) cls += ' is-drop';
    if (disc.className !== cls) disc.className = cls;
  }
  const mine = !pub.over && pub.turn === seat;
  el.classList.toggle('is-active', mine);
  el.classList.toggle('is-over', !!pub.over);
}
function frUpdate(u) {
  if (!FOUR.online) return;
  FOUR.online.last = u;
  const { meta, pub, seat } = u;
  const wait = meta.status === 'waiting';
  if (meta.status === 'cancelled') { notify('Кімнату скасовано, ставку повернено', 'info'); frClose(); return; }
  document.getElementById('frWait')?.classList.toggle('hidden', !wait);
  document.getElementById('frPlay')?.classList.toggle('hidden', wait);
  if (wait) {
    const w = document.getElementById('frWaitText');
    if (w) w.textContent = `Ставка ₴${formatNumber(meta.bet)}. Чекаємо суперника…`;
    typeof friendsAttachInvite === 'function' && friendsAttachInvite('frWait', 'fourrow', FOUR.online.id);
    return;
  }
  if (!pub) return;
  const prev = FOUR.online.lastKey;
  frRender(pub, seat);
  if (FOUR.online.lastKey !== prev && prev !== null) playSound && playSound('click');
  frHud(u);
  if (meta.status === 'finished' && !FOUR.online.announced) { FOUR.online.announced = true; roomAnnounce(u.result, meta.bet, 'Чотири в ряд'); }
}
function frHud(u) {
  const { meta, pub, seat, players } = u;
  if (!pub) return;
  const s = document.getElementById('frStatus');
  if (s) {
    s.classList.remove('is-win', 'is-lose');
    if (meta.status === 'finished' && u.result) {
      s.classList.add((u.result.winners || []).includes(currentUser) ? 'is-win' : 'is-lose');
      s.textContent = roomResultText(u.result, meta.bet);
    } else {
      const mine = pub.turn === seat;
      s.textContent = (mine ? 'Твій хід — обери колонку' : `Ходить ${players[1 - seat] || 'суперник'}`) + ` · ${roomSecondsLeft(pub.until)} с` + (pub.timeouts[seat] ? ` · пропущено ходів: ${pub.timeouts[seat]}/3` : '');
    }
  }
  const legend = document.getElementById('frLegend');
  if (legend) legend.innerHTML = [0, 1].map((p) => `<span class="fr-key"><i class="fr-chip is-p${p}"></i>${p === seat ? 'Ти' : escapeHtml(players[p] || 'Суперник')}</span>`).join('');
  document.getElementById('frLeave')?.classList.toggle('hidden', meta.status !== 'playing');
  document.getElementById('frAgain')?.classList.toggle('hidden', meta.status !== 'finished');
}
async function frDrop(c) {
  const o = FOUR.online;
  if (!o || !o.last || FOUR.pending) return;
  const { pub, seat } = o.last;
  if (!pub || pub.over || pub.turn !== seat || pub.board[c] !== '.') return;
  FOUR.pending = true;
  try { await roomApi('act', { id: o.id, move: { c } }); }
  finally { FOUR.pending = false; }
}
function frLeave() { if (FOUR.online) roomLeaveConfirm('fourrow', FOUR.online.id, FOUR.online.last && FOUR.online.last.meta.status === 'playing'); }
function frBack() { frClose(); }
