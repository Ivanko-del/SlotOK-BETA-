// ============================================================
// СТОЛИ НА 2–4 ГРАВЦІВ (v115): Вісімка, Дурень (онлайн 2–4), Лудо
// Правила — lib/room-games/eights.js, durak.js, ludo.js; гроші й ходи —
// лише через сервер (api/room.js). Господар може почати раніше, ніж стіл
// заповниться (action "start").
// ============================================================

const TBL = {};
const TBL_CFG = {
  eights: { name: 'Вісімка', render: eightsRender },
  durak: { name: 'Дурень онлайн', render: durakRender },
  ludo: { name: 'Лудо', render: ludoRender },
};
const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_NAME = { s: 'піки', h: 'черви', d: 'бубни', c: 'трефи' };

function cardHtmlP(card, opts) {
  opts = opts || {};
  if (!card) return '<span class="pcard is-empty"></span>';
  const r = card.slice(0, -1), s = card.slice(-1);
  const red = s === 'h' || s === 'd';
  return `<button type="button" class="pcard${red ? ' is-red' : ''}${opts.cls ? ' ' + opts.cls : ''}" ${opts.click ? `onclick="${opts.click}"` : 'tabindex="-1"'} ${opts.disabled ? 'disabled' : ''} aria-label="${r} ${SUIT_NAME[s]}">
    <span class="pc-r">${r}</span><span class="pc-s">${SUIT_SYM[s]}</span><span class="pc-big">${SUIT_SYM[s]}</span></button>`;
}

function initTable(game) {
  const t = TBL[game] || (TBL[game] = { id: null, size: 2, unwatch: null, lobbyStop: null, last: null, local: {} });
  document.querySelectorAll(`#tab-${game} .tbl-size`).forEach((b) => b.classList.toggle('active', +b.dataset.n === t.size));
  if (!t.lobbyStop) t.lobbyStop = roomLobby(game, document.getElementById(game + 'Rooms'), { describe: () => '' });
  if (!t.id) roomResume(game).then((id) => { if (id) tableOpen(game, id); });
}
function tableSize(game, n) {
  TBL[game].size = n;
  document.querySelectorAll(`#tab-${game} .tbl-size`).forEach((b) => b.classList.toggle('active', +b.dataset.n === n));
}
async function tableCreate(game) {
  const bet = parseInt(document.getElementById(game + 'Bet')?.value) || 0;
  const id = await roomCreate(game, bet, {}, TBL[game].size);
  if (id) { notify('Стіл створено — чекаємо гравців', 'success'); tableOpen(game, id); }
}
['eights', 'durak', 'ludo'].forEach((g) => { ROOM_HOOKS[g] = { onJoined: (id) => tableOpen(g, id), onLeft: () => tableClose(g) }; });

function tableOpen(game, id) {
  const t = TBL[game] || (TBL[game] = { size: 2, local: {} });
  if (t.id === id) return;
  tableClose(game, true);
  Object.assign(t, { id, announced: false, last: null, local: {} });
  document.querySelectorAll(`#tab-${game} .mass-reset`).forEach((el) => { el.innerHTML = ''; Object.keys(el.dataset).forEach((k) => delete el.dataset[k]); });
  document.getElementById(game + 'Lobby')?.classList.add('hidden');
  document.getElementById(game + 'Game')?.classList.remove('hidden');
  t.unwatch = roomWatch(game, id, (u) => tableUpdate(game, u));
  clearInterval(t.timer);
  t.timer = setInterval(() => { if (t.last) tableTimer(game, t.last); }, 500);
}
function tableClose(game, keepLobby) {
  const t = TBL[game];
  if (!t) return;
  t.unwatch && t.unwatch(); t.unwatch = null;
  clearInterval(t.timer); t.id = null;
  if (!keepLobby) {
    document.getElementById(game + 'Game')?.classList.add('hidden');
    document.getElementById(game + 'Lobby')?.classList.remove('hidden');
  }
}
function tableUpdate(game, u) {
  const t = TBL[game];
  if (!t || !t.id) return;
  t.last = u;
  const { meta } = u;
  if (meta.status === 'cancelled') { notify('Стіл закрито, ставку повернено', 'info'); tableClose(game); return; }
  const wait = meta.status === 'waiting';
  document.getElementById(game + 'Wait')?.classList.toggle('hidden', !wait);
  document.getElementById(game + 'Play')?.classList.toggle('hidden', wait);
  if (wait) {
    const el = document.getElementById(game + 'WaitText');
    if (el) el.innerHTML = `Ставка <b class="num">₴${formatNumber(meta.bet)}</b> · гравців <b class="num">${u.players.length}</b> з ${meta.size}`;
    const ch = document.getElementById(game + 'WaitPlayers');
    if (ch) ch.innerHTML = u.players.map((p) => `<span class="mass-chip${p === currentUser ? ' is-me' : ''}">${escapeHtml(p)}</span>`).join('');
    document.getElementById(game + 'StartNow')?.classList.toggle('hidden', !(meta.host === currentUser && u.players.length >= 2));
    return;
  }
  if (!u.pub) return;
  TBL_CFG[game].render(u, t);
  tableTimer(game, u);
  const st = document.getElementById(game + 'Result');
  if (st && meta.status === 'finished' && u.result) {
    st.classList.remove('is-win', 'is-lose');
    st.classList.add((u.result.winners || []).includes(currentUser) ? 'is-win' : 'is-lose');
    st.textContent = roomResultText(u.result, meta.bet);
  }
  document.getElementById(game + 'Again')?.classList.toggle('hidden', meta.status !== 'finished');
  document.getElementById(game + 'Leave')?.classList.toggle('hidden', meta.status !== 'playing');
  if (meta.status === 'finished' && !t.announced) { t.announced = true; roomAnnounce(u.result, meta.bet, TBL_CFG[game].name); }
}
function tableTimer(game, u) {
  const el = document.getElementById(game + 'Timer');
  if (el && u.pub) el.textContent = u.pub.until && !u.pub.over ? roomSecondsLeft(u.pub.until) + ' с' : '';
}
async function tableStartNow(game) { const t = TBL[game]; if (t && t.id) await roomApi('start', { id: t.id }); }
function tableLeave(game) { const t = TBL[game]; if (t && t.id) roomLeaveConfirm(game, t.id, t.last && t.last.meta.status === 'playing'); }
function tableBack(game) { tableClose(game); }
async function tableAct(game, move) {
  const t = TBL[game];
  if (!t || !t.id || t.busy) return;
  t.busy = true;
  try { const r = await roomApi('act', { id: t.id, move }); if (r.mode === 'server') playSound && playSound('click'); }
  finally { t.busy = false; }
}
// Суперники по колу (від мене за годинниковою)
function tableSeats(u, fn) {
  const n = u.players.length, me = Math.max(0, u.seat);
  const out = [];
  for (let k = 1; k < n; k++) { const i = (me + k) % n; out.push(fn(i, u.players[i])); }
  return out.join('');
}

// ══════════════════════════ ВІСІМКА ══════════════════════════
function eightsRender(u, t) {
  const { pub, priv, seat, players } = u;
  const myTurn = pub.turn === seat && !pub.over;
  const opp = document.getElementById('eightsOpp');
  if (opp) opp.innerHTML = tableSeats(u, (i, n) => `<div class="tbl-opp${pub.turn === i ? ' is-turn' : ''}${pub.out[i] ? ' is-out' : ''}">
    <span class="tbl-opp-name">${escapeHtml(n)}</span><span class="tbl-backs">${'<i></i>'.repeat(Math.min(pub.counts[i], 12))}</span><span class="num">${pub.counts[i]}</span></div>`);
  const mid = document.getElementById('eightsMid');
  if (mid) mid.innerHTML = `<div class="tbl-deck"><span class="pcard is-back"></span><small class="num">${pub.deck}</small></div>
    ${cardHtmlP(pub.top, { cls: 'is-top' })}
    <div class="tbl-suit ${pub.suit === 'h' || pub.suit === 'd' ? 'is-red' : ''}" title="Масть зараз">${SUIT_SYM[pub.suit]}</div>`;
  const hand = document.getElementById('eightsHand');
  if (hand && priv && priv.hand) {
    const can = new Set(priv.can || []);
    hand.innerHTML = priv.hand.slice().sort().map((c) => cardHtmlP(c, { cls: can.has(c) && myTurn ? 'is-playable' : 'is-dim', click: myTurn && can.has(c) ? `eightsPlay('${c}')` : '' })).join('');
  }
  const acts = document.getElementById('eightsActs');
  if (acts) acts.innerHTML = myTurn
    ? (pub.drew ? `<button type="button" class="btn btn-ghost" onclick="tableAct('eights',{a:'pass'})">Пас</button>` : `<button type="button" class="btn btn-ghost" onclick="tableAct('eights',{a:'draw'})">Взяти карту</button>`)
    : '';
  const st = document.getElementById('eightsStatus');
  if (st && !pub.over) {
    const l = pub.last;
    const lastTxt = l ? (l.card ? `${escapeHtml(players[l.seat])} зіграв ${l.card.slice(0, -1)}${SUIT_SYM[l.card.slice(-1)]}${l.card.startsWith('8') ? ' → ' + SUIT_NAME[l.suit] : ''}${l.hit !== undefined ? ` — ${escapeHtml(players[l.hit])} бере 2` : ''}` : `${escapeHtml(players[l.seat])} бере карту`) : '';
    st.innerHTML = (myTurn ? '<b>Твій хід.</b> ' : `Ходить ${escapeHtml(players[pub.turn])}. `) + lastTxt;
  }
  if (myTurn && t.local.turnSeen !== pub.until) { t.local.turnSeen = pub.until; navigator.vibrate && navigator.vibrate(30); }
}
function eightsPlay(card) {
  if (card.startsWith('8')) {
    const box = document.getElementById('eightsSuit');
    if (box) {
      box.innerHTML = '<span>Обери масть:</span>' + ['s', 'h', 'd', 'c'].map((s) => `<button type="button" class="tbl-suit ${s === 'h' || s === 'd' ? 'is-red' : ''}" onclick="document.getElementById('eightsSuit').classList.add('hidden');tableAct('eights',{a:'play',card:'${card}',suit:'${s}'})">${SUIT_SYM[s]}</button>`).join('');
      box.classList.remove('hidden');
      return;
    }
  }
  tableAct('eights', { a: 'play', card });
}

// ══════════════════════════ ДУРЕНЬ 2–4 ══════════════════════════
function durakRender(u, t) {
  const { pub, priv, seat, players } = u;
  const isDef = pub.defender === seat, isAtt = pub.attacker === seat, out = pub.out[seat];
  const role = (i) => (pub.out[i] ? 'вийшов' : i === pub.attacker ? 'ходить' : i === pub.defender ? 'відбивається' : pub.passed.includes(i) ? 'бито' : '');
  const opp = document.getElementById('durakOpp');
  if (opp) opp.innerHTML = tableSeats(u, (i, n) => `<div class="tbl-opp${i === pub.defender ? ' is-def' : ''}${i === pub.attacker ? ' is-turn' : ''}${pub.out[i] ? ' is-out' : ''}">
    <span class="tbl-opp-name">${escapeHtml(n)}</span><span class="tbl-backs">${'<i></i>'.repeat(Math.min(pub.counts[i], 10))}</span><span class="tbl-role">${role(i)}</span></div>`);
  const mid = document.getElementById('durakMid');
  if (mid) mid.innerHTML = `<div class="tbl-deck">${pub.deck ? cardHtmlP(pub.trumpCard, { cls: 'is-trump' }) : `<div class="tbl-suit ${pub.trump === 'h' || pub.trump === 'd' ? 'is-red' : ''}">${SUIT_SYM[pub.trump]}</div>`}<small class="num">${pub.deck} у колоді</small></div>
    <div class="dk-table">${pub.table.map((p, i) => `<div class="dk-pair${!p.d && isDef ? ' is-target' : ''}${t.local.target === i ? ' is-picked' : ''}" ${!p.d && isDef ? `onclick="durakTarget(${i})"` : ''}>${cardHtmlP(p.a)}${p.d ? cardHtmlP(p.d, { cls: 'is-cover' }) : ''}</div>`).join('') || '<span class="field-hint">Стіл порожній</span>'}</div>`;
  const open = pub.table.filter((p) => !p.d).length;
  const ranks = new Set(pub.table.flatMap((p) => [p.a, p.d].filter(Boolean).map((c) => c.slice(0, -1))));
  const canThrow = !isDef && !out && pub.table.length && pub.table.length < pub.limit && open < pub.counts[pub.defender];
  const hand = document.getElementById('durakHand');
  if (hand && priv && priv.hand) {
    const order = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const sorted = priv.hand.slice().sort((a, b) => (a.slice(-1) === pub.trump) - (b.slice(-1) === pub.trump) || a.slice(-1).localeCompare(b.slice(-1)) || order.indexOf(a.slice(0, -1)) - order.indexOf(b.slice(0, -1)));
    hand.innerHTML = sorted.map((c) => {
      let ok = false;
      if (isDef && open) ok = true;
      else if (isAtt && !pub.table.length) ok = true;
      else if (canThrow && ranks.has(c.slice(0, -1))) ok = true;
      return cardHtmlP(c, { cls: ok ? 'is-playable' : 'is-dim', click: ok ? `durakCard('${c}')` : '' });
    }).join('');
  }
  const acts = document.getElementById('durakActs');
  if (acts) acts.innerHTML = (isDef && open ? `<button type="button" class="btn btn-danger" onclick="tableAct('durak',{a:'take'})">Взяти</button>` : '')
    + (!isDef && !out && pub.table.length && !open && !pub.passed.includes(seat) ? `<button type="button" class="btn btn-ghost" onclick="tableAct('durak',{a:'pass'})">Бито</button>` : '');
  const st = document.getElementById('durakStatus');
  if (st && !pub.over) {
    st.innerHTML = out ? 'Ти вийшов — не дурень! Чекаємо кінця.'
      : isDef ? (open ? '<b>Відбивайся:</b> обери атаку, потім карту (або просто карту). Не можеш — «Взяти».' : 'Відбився — чекаємо, чи підкинуть ще.')
      : isAtt && !pub.table.length ? '<b>Твій хід:</b> поклади карту.'
      : canThrow ? 'Можеш підкинути карту того ж рангу або натиснути «Бито».'
      : `Ходить ${escapeHtml(players[pub.attacker])}, відбивається ${escapeHtml(players[pub.defender])}.`;
  }
}
function durakTarget(i) { const t = TBL.durak; t.local.target = i; if (t.last) durakRender(t.last, t); }
function durakCard(card) {
  const t = TBL.durak, u = t.last;
  if (!u) return;
  const { pub, seat } = u;
  if (pub.defender === seat) {
    let i = t.local.target;
    const pair = pub.table[i];
    if (!pair || pair.d) i = pub.table.findIndex((p) => !p.d);
    t.local.target = null;
    return tableAct('durak', { a: 'defend', i, card });
  }
  tableAct('durak', { a: 'attack', card });
}

// ══════════════════════════ ЛУДО ══════════════════════════
// Коло з 52 клітинок на полі 15×15 (рядок, стовпець), від старту кольору 0.
const LUDO_PATH = (() => {
  const p = [];
  for (let c = 1; c <= 5; c++) p.push([6, c]);
  for (let r = 5; r >= 0; r--) p.push([r, 6]);
  p.push([0, 7], [0, 8]);
  for (let r = 1; r <= 5; r++) p.push([r, 8]);
  for (let c = 9; c <= 14; c++) p.push([6, c]);
  p.push([7, 14], [8, 14]);
  for (let c = 13; c >= 9; c--) p.push([8, c]);
  for (let r = 9; r <= 14; r++) p.push([r, 8]);
  p.push([14, 7], [14, 6]);
  for (let r = 13; r >= 9; r--) p.push([r, 6]);
  for (let c = 5; c >= 0; c--) p.push([8, c]);
  p.push([7, 0], [6, 0]);
  return p;
})();
const LUDO_HOME = [[[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]], [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]], [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]], [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]];
const LUDO_BASE = [[0, 0], [0, 9], [9, 9], [9, 0]];
const LUDO_TONE = ['neg', 'pos', 'warn', 'info'];
const LUDO_SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
function ludoCell(color, rel, k) {
  if (rel < 0) { const [r0, c0] = LUDO_BASE[color]; return [r0 + 1 + (k > 1 ? 3 : 0), c0 + 1 + (k % 2 ? 3 : 0)]; }
  if (rel <= 50) return LUDO_PATH[(color * 13 + rel) % 52];
  if (rel <= 55) return LUDO_HOME[color][rel - 51];
  return [7, 7];
}
function ludoBoardHtml() {
  let h = '';
  LUDO_BASE.forEach(([r, c], color) => { h += `<div class="ld-base tone-${LUDO_TONE[color]}" style="grid-area:${r + 1}/${c + 1}/span 6/span 6"></div>`; });
  LUDO_PATH.forEach(([r, c], i) => {
    const startColor = [0, 13, 26, 39].indexOf(i);
    h += `<div class="ld-cell${LUDO_SAFE.has(i) ? ' is-safe' : ''}${startColor >= 0 ? ' is-start tone-' + LUDO_TONE[startColor] : ''}" style="grid-area:${r + 1}/${c + 1}">${LUDO_SAFE.has(i) && startColor < 0 ? '<span class="ic i-star" aria-hidden="true"></span>' : ''}</div>`;
  });
  LUDO_HOME.forEach((cells, color) => cells.forEach(([r, c]) => { h += `<div class="ld-cell is-home tone-${LUDO_TONE[color]}" style="grid-area:${r + 1}/${c + 1}"></div>`; }));
  h += '<div class="ld-center" style="grid-area:7/7/span 3/span 3"></div>';
  return h;
}
function ludoRender(u, t) {
  const { pub, seat, players } = u;
  const board = document.getElementById('ludoBoard');
  if (board && !board.dataset.built) { board.dataset.built = '1'; board.innerHTML = ludoBoardHtml() + '<div class="ld-tokens" id="ludoTokens"></div>'; }
  const toks = document.getElementById('ludoTokens');
  const myMove = pub.turn === seat && pub.phase === 'move' && !pub.over;
  if (toks) {
    const stack = {};
    toks.innerHTML = pub.tokens.map((arr, s) => arr.map((rel, k) => {
      if (pub.out[s]) return '';
      const color = pub.colors[s];
      const [r, c] = ludoCell(color, rel, k);
      const key = r + ',' + c; const off = stack[key] = (stack[key] || 0) + 1;
      const can = myMove && s === seat && pub.legal.includes(k);
      return `<button type="button" class="ld-token tone-${LUDO_TONE[color]}${can ? ' is-legal' : ''}${s === seat ? ' is-mine' : ''}" style="grid-area:${r + 1}/${c + 1};--off:${off - 1}" ${can ? `onclick="tableAct('ludo',{a:'move',t:${k}})"` : 'tabindex="-1"'} aria-label="фішка ${k + 1}">${rel === 56 ? '<span class="ic i-check" aria-hidden="true"></span>' : ''}</button>`;
    }).join('')).join('');
  }
  const pl = document.getElementById('ludoPlayers');
  if (pl) pl.innerHTML = players.map((n, i) => `<span class="mass-chip tone-${LUDO_TONE[pub.colors[i]]}${pub.turn === i ? ' is-turn' : ''}${pub.out[i] ? ' is-out' : ''}${i === seat ? ' is-me' : ''}"><i class="ld-dot"></i>${escapeHtml(n)} · ${pub.tokens[i].filter((x) => x === 56).length}/4</span>`).join('');
  // Кубик: CSS-3D куб із «Кубиків»
  const die = document.getElementById('ludoDie');
  if (die && !die.childElementCount) die.innerHTML = [1, 2, 3, 4, 5, 6].map((v) => `<div class="cr-face f${v}">${'<i></i>'.repeat(v)}</div>`).join('');
  const val = pub.dice || (pub.last && pub.last.roll) || (pub.last && pub.last.dice);
  if (die && val && die.dataset.v !== String(val) + (pub.last && pub.last.seat)) {
    die.dataset.v = String(val) + (pub.last && pub.last.seat);
    die.style.transition = 'none';
    die.style.transform = `rotateX(${720 + Math.random() * 360}deg) rotateY(${720 + Math.random() * 360}deg)`;
    void die.offsetWidth;
    die.style.transition = 'transform .9s cubic-bezier(.2,.8,.2,1)';
    die.style.transform = CR_CSS_ROT[val];
  }
  const rollBtn = document.getElementById('ludoRoll');
  if (rollBtn) rollBtn.disabled = !(pub.turn === seat && pub.phase === 'roll' && !pub.over);
  const st = document.getElementById('ludoStatus');
  if (st && !pub.over) {
    const l = pub.last;
    const lt = l ? (l.roll ? `${escapeHtml(players[l.seat])} викинув ${l.roll}${l.none ? ' — ходів нема' : ''}` : l.to !== undefined ? `${escapeHtml(players[l.seat])} пішов на ${l.dice}${l.hit && l.hit.length ? ' і збив фішку!' : ''}` : '') : '';
    st.innerHTML = (pub.turn === seat ? (pub.phase === 'roll' ? '<b>Кидай кубик!</b> ' : '<b>Обери фішку</b> (підсвічені). ') : `Хід ${escapeHtml(players[pub.turn])}. `) + lt;
  }
}

// Стара онлайн-кімната «Карти» (браузерна, карти суперника видно в базі) —
// якщо сервер і правила готові, ведемо в новий серверний «Дурень онлайн».
// Гра проти AI лишається як була.
const _legacyOpenCardLobby = openCardLobby;
openCardLobby = async function () {
  if (await roomsReady()) return openGame('durak');
  return _legacyOpenCardLobby();
};
