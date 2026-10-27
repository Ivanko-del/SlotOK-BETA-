// ============================================================
// САПЕР (v112): класичний соло на час із рекордами + дуель онлайн на ставку
//
// Соло грається в браузері (без грошей): перший клік завжди безпечний,
// прапорці — правий клік, довге натискання або режим «прапорець»,
// клік по числу з потрібною кількістю прапорців відкриває сусідів.
// Рекорди — minesweeper_records/<рівень>/<нік> { t: секунд }.
// Дуель — через сервер (lib/room-games/minesweeper.js): однакове поле в
// обох, міни знає лише сервер; хто перший розмінує — виграв, підрив — поразка.
// ============================================================

const MS_LEVELS = {
  easy: { w: 9, h: 9, m: 10, name: 'Новачок' },
  medium: { w: 16, h: 16, m: 40, name: 'Любитель' },
  hard: { w: 30, h: 16, m: 99, name: 'Профі' },
};
const MS_DUEL_LEVELS = { easy: { w: 9, h: 9, m: 10, name: 'Новачок' }, medium: { w: 12, h: 12, m: 24, name: 'Любитель' } };
const MS = {
  mode: 'solo', level: 'easy', flagMode: false,
  solo: null, timer: null,
  duelLevel: 'easy', duel: null, unwatch: null, unlobby: null, flags: new Set(), pending: false,
};

function msNeighbours(w, h, i) {
  const x = i % w, y = Math.floor(i / w), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
  }
  return out;
}

function initMinesweeper() {
  msSetMode(MS.mode, true);
  if (!MS.solo) msNewSolo();
}
function msSetMode(mode, silent) {
  MS.mode = mode;
  document.querySelectorAll('.ms-mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('msSolo')?.classList.toggle('hidden', mode !== 'solo');
  document.getElementById('msDuel')?.classList.toggle('hidden', mode !== 'duel');
  if (mode === 'duel') msDuelEnter();
  else { MS.unlobby && MS.unlobby(); MS.unlobby = null; }
  if (!silent) playSound && playSound('click');
}
function msToggleFlagMode() {
  MS.flagMode = !MS.flagMode;
  document.querySelectorAll('.ms-flag-toggle').forEach((b) => { b.classList.toggle('active', MS.flagMode); b.setAttribute('aria-pressed', MS.flagMode); });
}

// ── Малювання поля (спільне для соло й дуелі) ─────────────────────────
// cells: рядок довжини w*h: '.' закрита, '0'–'8' відкрита, '*' міна, 'X' міна,
// на якій підірвався, 'F' прапорець, '/' помилковий прапорець (після поразки).
function msRenderBoard(el, w, h, cells, opts) {
  if (!el) return;
  el.style.setProperty('--cols', w);
  el.classList.toggle('is-over', !!(opts && opts.over));
  if (el.childElementCount !== w * h) {
    el.innerHTML = Array.from({ length: w * h }, (_, i) => `<div class="ms-cell" data-i="${i}"></div>`).join('');
  }
  for (let i = 0; i < w * h; i++) {
    const c = cells[i];
    const d = el.children[i];
    const cls = 'ms-cell' + (c === '.' ? '' : c === 'F' ? ' is-flag' : c === '*' ? ' is-open is-mine' : c === 'X' ? ' is-open is-mine is-boom' : c === '/' ? ' is-flag is-wrong' : ' is-open n' + c);
    if (d.className !== cls) {
      d.className = cls;
      d.innerHTML = c === 'F' || c === '/' ? '<span class="ic i-flag" aria-hidden="true"></span>'
        : c === '*' || c === 'X' ? '<span class="ic i-mine" aria-hidden="true"></span>'
        : /[1-8]/.test(c) ? c : '';
    }
  }
}

// Події поля: клік, правий клік, довге натискання (на телефоні)
function msBindBoard(el, onOpen, onFlag) {
  if (!el || el._msBound) return;
  el._msBound = true;
  let pressTimer = null, longFired = false;
  const cellOf = (e) => { const t = e.target.closest('.ms-cell'); return t ? +t.dataset.i : -1; };
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); const i = cellOf(e); if (i >= 0) onFlag(i); });
  el.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    longFired = false;
    const i = cellOf(e);
    clearTimeout(pressTimer);
    if (i >= 0 && e.pointerType !== 'mouse') pressTimer = setTimeout(() => { longFired = true; navigator.vibrate && navigator.vibrate(25); onFlag(i); }, 380);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, () => clearTimeout(pressTimer)));
  el.addEventListener('click', (e) => {
    const i = cellOf(e);
    if (i < 0 || longFired) return;
    if (MS.flagMode) onFlag(i); else onOpen(i);
  });
}

// ══════════════════════════ СОЛО ══════════════════════════
function msSetLevel(level) {
  MS.level = level;
  document.querySelectorAll('.ms-level').forEach((b) => b.classList.toggle('active', b.dataset.level === level));
  msNewSolo();
}
function msNewSolo() {
  const L = MS_LEVELS[MS.level];
  clearInterval(MS.timer);
  MS.solo = { w: L.w, h: L.h, m: L.m, mines: null, num: null, open: new Uint8Array(L.w * L.h), flags: new Set(), started: 0, over: false, won: false, boom: -1 };
  const el = document.getElementById('msBoard');
  if (el) el.innerHTML = '';
  msBindBoard(el, msSoloOpen, msSoloFlag);
  msSoloRender();
  msLoadRecords();
}
function msSoloPlace(first) {
  const s = MS.solo, total = s.w * s.h;
  const safe = new Set([first, ...msNeighbours(s.w, s.h, first)]);
  const pool = [];
  for (let i = 0; i < total; i++) if (!safe.has(i)) pool.push(i);
  const mines = new Set();
  while (mines.size < s.m) mines.add(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  s.mines = mines;
  s.num = Array.from({ length: total }, (_, i) => (mines.has(i) ? 9 : msNeighbours(s.w, s.h, i).filter((n) => mines.has(n)).length));
}
function msSoloReveal(i) {
  const s = MS.solo, stack = [i];
  while (stack.length) {
    const c = stack.pop();
    if (s.open[c] || s.flags.has(c)) continue;
    s.open[c] = 1;
    if (s.num[c] === 0) msNeighbours(s.w, s.h, c).forEach((n) => { if (!s.open[n]) stack.push(n); });
  }
}
function msSoloOpen(i) {
  const s = MS.solo;
  if (!s || s.over || s.flags.has(i)) return;
  if (!s.mines) {
    msSoloPlace(i);
    s.started = Date.now();
    MS.timer = setInterval(msSoloTick, 250);
  }
  if (s.open[i]) {
    // «Акорд»: на числі з потрібною кількістю прапорців відкриваємо сусідів
    const nb = msNeighbours(s.w, s.h, i);
    if (s.num[i] > 0 && nb.filter((n) => s.flags.has(n)).length === s.num[i]) nb.forEach((n) => { if (!s.open[n] && !s.flags.has(n)) msSoloStep(n); });
  } else msSoloStep(i);
  msSoloRender();
}
function msSoloStep(i) {
  const s = MS.solo;
  if (s.over) return;
  if (s.mines.has(i)) { s.over = true; s.boom = i; clearInterval(MS.timer); playSound && playSound('loss'); navigator.vibrate && navigator.vibrate([60, 40, 120]); return; }
  msSoloReveal(i);
  const opened = s.open.reduce((a, b) => a + b, 0);
  if (opened === s.w * s.h - s.m) {
    s.over = true; s.won = true; clearInterval(MS.timer);
    s.mines.forEach((m) => s.flags.add(m));
    const t = Math.round((Date.now() - s.started) / 100) / 10;
    s.time = t;
    playSound && playSound('bonus');
    msSaveRecord(MS.level, t);
  } else playSound && playSound('click');
}
function msSoloFlag(i) {
  const s = MS.solo;
  if (!s || s.over || s.open[i]) return;
  if (s.flags.has(i)) s.flags.delete(i); else s.flags.add(i);
  msSoloRender();
}
function msSoloTick() {
  const s = MS.solo, el = document.getElementById('msTime');
  if (el && s && s.started && !s.over) el.textContent = Math.floor((Date.now() - s.started) / 1000);
}
function msSoloRender() {
  const s = MS.solo;
  const cells = Array.from({ length: s.w * s.h }, (_, i) => {
    if (s.over && !s.won && s.mines && s.mines.has(i)) return i === s.boom ? 'X' : s.flags.has(i) ? 'F' : '*';
    if (s.over && !s.won && s.flags.has(i) && !(s.mines && s.mines.has(i))) return '/';
    if (s.flags.has(i)) return 'F';
    return s.open[i] ? String(s.num[i]) : '.';
  }).join('');
  msRenderBoard(document.getElementById('msBoard'), s.w, s.h, cells, { over: s.over });
  const left = document.getElementById('msLeft');
  if (left) left.textContent = s.m - s.flags.size;
  const face = document.getElementById('msFace');
  if (face) face.innerHTML = `<span class="ic i-${s.over ? (s.won ? 'trophy' : 'skull') : 'refresh'}" aria-hidden="true"></span>`;
  const st = document.getElementById('msStatus');
  if (st) {
    st.classList.remove('is-win', 'is-lose');
    if (s.over) st.classList.add(s.won ? 'is-win' : 'is-lose');
    st.textContent = s.won ? `Розміновано за ${s.time} с!` : s.over ? 'Бум! Спробуй ще раз.' : s.mines ? 'Шукай міни. Прапорець — правий клік, довге натискання або кнопка.' : 'Перший клік завжди безпечний.';
  }
  if (!s.started) { const t = document.getElementById('msTime'); if (t) t.textContent = '0'; }
}
function msSaveRecord(level, t) {
  if (!currentUser || !db) return;
  const ref = db.ref('minesweeper_records/' + level + '/' + currentUser);
  ref.once('value').then((snap) => {
    const cur = snap.val();
    if (cur && cur.t <= t) return;
    return ref.set({ t, at: Date.now() }).then(() => { notify(`Новий рекорд: ${t} с`, 'success'); msLoadRecords(); });
  }).catch(() => {});
}
function msLoadRecords() {
  const el = document.getElementById('msRecords');
  if (!el || !db) return;
  db.ref('minesweeper_records/' + MS.level).orderByChild('t').limitToFirst(10).once('value').then((snap) => {
    const rows = [];
    snap.forEach((c) => { rows.push([c.key, c.val().t]); });
    el.innerHTML = rows.length
      ? rows.map(([n, t], k) => `<li class="${n === currentUser ? 'is-me' : ''}"><span class="num">${k + 1}</span><span>${escapeHtml(n)}</span><span class="num">${t} с</span></li>`).join('')
      : '<li class="room-empty">Рекордів ще немає — будь першим.</li>';
  }).catch(() => { el.innerHTML = ''; });
}

// ══════════════════════════ ДУЕЛЬ ══════════════════════════
ROOM_HOOKS.minesweeper = {
  onJoined: (id) => msDuelOpen(id),
  onLeft: () => msDuelClose(),
};
function msSetDuelLevel(level) {
  MS.duelLevel = level;
  document.querySelectorAll('.ms-dlevel').forEach((b) => b.classList.toggle('active', b.dataset.level === level));
}
async function msDuelEnter() {
  if (!MS.unlobby) MS.unlobby = roomLobby('minesweeper', document.getElementById('msRooms'), { describe: (o) => (MS_DUEL_LEVELS[o.level] || {}).name || '' });
  if (!MS.duel) {
    const id = await roomResume('minesweeper');
    if (id) msDuelOpen(id);
  }
}
async function msDuelCreate() {
  const bet = parseInt(document.getElementById('msBet')?.value) || 0;
  const id = await roomCreate('minesweeper', bet, { level: MS.duelLevel });
  if (id) { notify('Кімнату створено — чекаємо суперника', 'success'); msDuelOpen(id); }
}
function msDuelOpen(id) {
  if (MS.duel && MS.duel.id === id) return;
  msDuelClose(true);
  MS.duel = { id, announced: false };
  MS.flags = new Set();
  document.getElementById('msDuelLobby')?.classList.add('hidden');
  document.getElementById('msDuelGame')?.classList.remove('hidden');
  const el = document.getElementById('msDuelBoard');
  if (el) el.innerHTML = '';
  msBindBoard(el, msDuelOpenCell, msDuelFlag);
  MS.unwatch = roomWatch('minesweeper', id, msDuelUpdate);
  clearInterval(MS.duelTimer);
  MS.duelTimer = setInterval(() => { if (MS.duel && MS.duel.last) msDuelHud(MS.duel.last); }, 500);
}
function msDuelClose(keepLobby) {
  MS.unwatch && MS.unwatch(); MS.unwatch = null;
  clearInterval(MS.duelTimer);
  MS.duel = null;
  if (!keepLobby) {
    document.getElementById('msDuelGame')?.classList.add('hidden');
    document.getElementById('msDuelLobby')?.classList.remove('hidden');
  }
}
function msDuelUpdate(u) {
  if (!MS.duel) return;
  MS.duel.last = u;
  const { meta, pub, priv } = u;
  const wait = meta.status === 'waiting';
  document.getElementById('msDuelWait')?.classList.toggle('hidden', !wait);
  document.getElementById('msDuelPlay')?.classList.toggle('hidden', wait);
  if (wait) {
    const w = document.getElementById('msDuelWaitText');
    if (w) w.textContent = `Ставка ₴${formatNumber(meta.bet)} · ${(MS_DUEL_LEVELS[u.opts.level] || {}).name || ''}. Чекаємо суперника…`;
    return;
  }
  if (meta.status === 'cancelled') { notify('Кімнату скасовано, ставку повернено', 'info'); msDuelClose(); return; }
  if (!pub) return;
  let cells = (priv && priv.cells) || '.'.repeat(pub.w * pub.h);
  if (pub.over && pub.mines) {
    // '*' у моєму вигляді — міна, на якій я підірвався; решту мін показуємо після кінця
    const arr = cells.replace(/\*/g, 'X').split('');
    pub.mines.forEach((m) => { if (arr[m] === '.') arr[m] = '*'; });
    cells = arr.join('');
  }
  // Мої прапорці — лише на закритих клітинках
  const arr = cells.split('');
  MS.flags.forEach((f) => { if (arr[f] === '.') arr[f] = 'F'; else MS.flags.delete(f); });
  msRenderBoard(document.getElementById('msDuelBoard'), pub.w, pub.h, arr.join(''), { over: pub.over });
  msDuelHud(u);
  if (meta.status === 'finished' && !MS.duel.announced) {
    MS.duel.announced = true;
    roomAnnounce(u.result, meta.bet, 'Сапер-дуель');
  }
}
function msDuelHud(u) {
  const { meta, pub, players, seat } = u;
  if (!pub) return;
  const bars = document.getElementById('msDuelBars');
  if (bars) bars.innerHTML = players.map((n, i) => {
    const pct = Math.round((pub.progress[i] / pub.total) * 100);
    return `<div class="ms-bar${i === seat ? ' is-me' : ''}${pub.boom[i] ? ' is-boom' : ''}">
      <div class="ms-bar-top"><span>${escapeHtml(n)}${i === seat ? ' (ти)' : ''}</span><span class="num">${pub.boom[i] ? 'підірвався' : pct + '%'}</span></div>
      <div class="ms-bar-track"><div class="ms-bar-fill" style="width:${pct}%"></div></div></div>`;
  }).join('');
  const t = document.getElementById('msDuelTime');
  if (t) t.textContent = pub.over ? '—' : roomSecondsLeft(pub.until) + ' с';
  const st = document.getElementById('msDuelStatus');
  if (st) {
    st.classList.remove('is-win', 'is-lose');
    if (meta.status === 'finished' && u.result) {
      st.classList.add((u.result.winners || []).includes(currentUser) ? 'is-win' : 'is-lose');
      st.textContent = roomResultText(u.result, meta.bet);
    } else st.textContent = pub.over ? 'Підрахунок…' : 'Хто перший розмінує поле — забирає банк. Міна — поразка.';
  }
  document.getElementById('msDuelLeave')?.classList.toggle('hidden', meta.status !== 'playing');
  document.getElementById('msDuelAgain')?.classList.toggle('hidden', meta.status !== 'finished');
}
async function msDuelOpenCell(i) {
  const d = MS.duel;
  if (!d || !d.last || !d.last.pub || d.last.pub.over || MS.pending || MS.flags.has(i)) return;
  const cells = (d.last.priv && d.last.priv.cells) || '';
  if (cells[i] && cells[i] !== '.') return;
  MS.pending = true;
  document.querySelector(`#msDuelBoard .ms-cell[data-i="${i}"]`)?.classList.add('is-pending');
  try { await roomApi('act', { id: d.id, move: { c: i } }); }
  finally { MS.pending = false; }
}
function msDuelFlag(i) {
  const d = MS.duel;
  if (!d || !d.last || !d.last.pub || d.last.pub.over) return;
  if (MS.flags.has(i)) MS.flags.delete(i); else MS.flags.add(i);
  msDuelUpdate(d.last);
}
function msDuelLeave() { if (MS.duel) roomLeaveConfirm('minesweeper', MS.duel.id, MS.duel.last && MS.duel.last.meta.status === 'playing'); }
function msDuelBack() { msDuelClose(); }
