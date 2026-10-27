// ============================================================
// МАСОВІ ІГРИ (v114): Бінго, Вікторина-баттл, Королівська битва — до 30–40
// гравців за одним столом. Вхід «Грати в наступній грі» (api/room.js
// action "quick"): стіл збирає гравців 45 с і стартує, якщо їх ≥ 2.
// Правила — lib/room-games/bingo.js, quizbattle.js, royale.js.
// ============================================================

const MASS = {};
const MASS_TIERS = [50, 200, 1000];
const MASS_CFG = {
  bingo: { name: 'Бінго', render: bingoRender },
  quizbattle: { name: 'Вікторина-баттл', render: quizRender },
  royale: { name: 'Королівська битва', render: royaleRender },
};

function initMassGame(game) {
  const m = MASS[game] || (MASS[game] = { id: null, unwatch: null, timer: null, last: null, announced: false });
  const tiers = document.getElementById(game + 'Tiers');
  if (tiers && !tiers.childElementCount) {
    tiers.innerHTML = MASS_TIERS.map((b) => `<button type="button" class="mass-tier" onclick="massQuick('${game}',${b})"><span>Вхід</span><b class="num">₴${formatNumber(b)}</b></button>`).join('');
  }
  if (!m.lobbyStop) m.lobbyStop = massLobbyInfo(game);
  if (!m.id) roomResume(game).then((id) => { if (id) massOpen(game, id); });
}
// Скільки людей уже чекає за кожним столом
function massLobbyInfo(game) {
  if (!db) return () => {};
  const ref = db.ref('rooms/' + game).orderByChild('status').equalTo('waiting');
  const cb = ref.on('value', (snap) => {
    const by = {};
    Object.values(snap.val() || {}).forEach((r) => { by[r.bet] = Math.max(by[r.bet] || 0, Object.keys(r.players || {}).length); });
    document.querySelectorAll(`#${game}Tiers .mass-tier`).forEach((b, i) => {
      const n = by[MASS_TIERS[i]] || 0;
      b.classList.toggle('is-hot', n > 0);
      b.querySelector('span').textContent = n ? `чекають: ${n}` : 'Вхід';
    });
  }, () => {});
  return () => ref.off('value', cb);
}
async function massQuick(game, bet) {
  if (!validateBet(bet)) return;
  const r = await roomApi('quick', { game, bet });
  if (r.mode !== 'server') { if (r.mode === 'legacy') notify('Ця гра працює лише з сервером', 'error'); return; }
  playSound && playSound('click');
  massOpen(game, r.r.id);
}
ROOM_HOOKS.bingo = { onJoined: (id) => massOpen('bingo', id), onLeft: () => massClose('bingo') };
ROOM_HOOKS.quizbattle = { onJoined: (id) => massOpen('quizbattle', id), onLeft: () => massClose('quizbattle') };
ROOM_HOOKS.royale = { onJoined: (id) => massOpen('royale', id), onLeft: () => massClose('royale') };

function massOpen(game, id) {
  const m = MASS[game] || (MASS[game] = {});
  if (m.id === id) return;
  massClose(game, true);
  Object.assign(m, { id, announced: false, last: null, local: {} });
  // Нова гра — чисте поле (картка бінго, двері, питання з минулої гри)
  document.querySelectorAll(`#tab-${game} .mass-reset`).forEach((el) => { el.innerHTML = ''; Object.keys(el.dataset).forEach((k) => delete el.dataset[k]); });
  document.getElementById(game + 'Lobby')?.classList.add('hidden');
  document.getElementById(game + 'Game')?.classList.remove('hidden');
  m.unwatch = roomWatch(game, id, (u) => massUpdate(game, u));
  clearInterval(m.timer);
  m.timer = setInterval(() => { if (m.last) massUpdate(game, m.last, true); }, 250);
}
function massClose(game, keepLobby) {
  const m = MASS[game];
  if (!m) return;
  m.unwatch && m.unwatch(); m.unwatch = null;
  clearInterval(m.timer); m.timer = null; m.id = null;
  if (!keepLobby) {
    document.getElementById(game + 'Game')?.classList.add('hidden');
    document.getElementById(game + 'Lobby')?.classList.remove('hidden');
  }
}
function massUpdate(game, u, fromTimer) {
  const m = MASS[game];
  if (!m || !m.id) return;
  m.last = u;
  const { meta } = u;
  if (meta.status === 'cancelled') { if (!fromTimer) { notify('Гравців не набралось — ставку повернено', 'info'); massClose(game); } return; }
  const wait = meta.status === 'waiting';
  document.getElementById(game + 'Wait')?.classList.toggle('hidden', !wait);
  document.getElementById(game + 'Play')?.classList.toggle('hidden', wait);
  if (wait) {
    const n = (u.players || []).length;
    const el = document.getElementById(game + 'WaitText');
    if (el) el.innerHTML = `Ставка <b class="num">₴${formatNumber(meta.bet)}</b> · гравців: <b class="num">${n}</b> з ${meta.size}<br>Старт через <b class="num">${roomSecondsLeft(meta.startBy)} с</b>${n < 2 ? ' — потрібно хоча б 2 гравці' : ''}`;
    const list = document.getElementById(game + 'WaitPlayers');
    if (list && !fromTimer) list.innerHTML = (u.players || []).map((p) => `<span class="mass-chip${p === currentUser ? ' is-me' : ''}">${escapeHtml(p)}</span>`).join('');
    return;
  }
  if (!u.pub) return;
  MASS_CFG[game].render(u, m, fromTimer);
  const st = document.getElementById(game + 'Result');
  if (st && meta.status === 'finished' && u.result) {
    st.classList.remove('is-win', 'is-lose');
    st.classList.add((u.result.winners || []).includes(currentUser) ? 'is-win' : 'is-lose');
    st.textContent = roomResultText(u.result, meta.bet);
  }
  document.getElementById(game + 'Again')?.classList.toggle('hidden', meta.status !== 'finished');
  document.getElementById(game + 'Leave')?.classList.toggle('hidden', meta.status !== 'playing');
  if (meta.status === 'finished' && !m.announced) { m.announced = true; roomAnnounce(u.result, meta.bet, MASS_CFG[game].name); }
}
function massLeave(game) { const m = MASS[game]; if (m && m.id) roomLeaveConfirm(game, m.id, m.last && m.last.meta.status === 'playing'); }
function massBack(game) { massClose(game); }

// ══════════════════════════ БІНГО ══════════════════════════
const BINGO_COLS = ['B', 'I', 'N', 'G', 'O'];
function bingoBallTone(n) { return ['info', 'neg', 'fg', 'pos', 'warn'][Math.floor((n - 1) / 15)]; }
function bingoRender(u, m, fromTimer) {
  const { pub, priv, players, seat } = u;
  const now = Date.now();
  const card = document.getElementById('bingoCard');
  const drawn = new Set(pub.drawn);
  if (card && priv && priv.card) {
    if (!card.childElementCount) {
      card.innerHTML = BINGO_COLS.map((c) => `<div class="bingo-head">${c}</div>`).join('') +
        priv.card.map((n, i) => `<div class="bingo-cell${n === 0 ? ' is-free' : ''}" data-i="${i}">${n === 0 ? '<span class="ic i-star" aria-hidden="true"></span>' : n}</div>`).join('');
    }
    priv.card.forEach((n, i) => {
      const el = card.querySelector(`.bingo-cell[data-i="${i}"]`);
      if (el && n && drawn.has(n) && !el.classList.contains('is-hit')) el.classList.add('is-hit');
    });
  }
  const last = pub.drawn[pub.drawn.length - 1];
  const ball = document.getElementById('bingoBall');
  if (ball) {
    if (now < pub.start) { ball.className = 'bingo-ball is-wait'; ball.innerHTML = `<small>старт</small><b>${roomSecondsLeft(pub.start)}</b>`; }
    else if (last && ball.dataset.n !== String(last)) {
      ball.dataset.n = last;
      ball.className = 'bingo-ball tone-' + bingoBallTone(last);
      void ball.offsetWidth; ball.classList.add('is-new');
      ball.innerHTML = `<small>${BINGO_COLS[Math.floor((last - 1) / 15)]}</small><b>${last}</b>`;
      if (priv && priv.card && priv.card.includes(last)) playSound && playSound('click');
    }
  }
  const recent = document.getElementById('bingoRecent');
  if (recent && !fromTimer) recent.innerHTML = pub.drawn.slice(-9, -1).reverse().map((n) => `<span class="bingo-mini tone-${bingoBallTone(n)}">${n}</span>`).join('');
  const info = document.getElementById('bingoInfo');
  if (info) {
    const mine = pub.prog[seat] || [5, 24];
    info.innerHTML = `Куля <b class="num">${pub.drawn.length}</b>/75 · до лінії тобі: <b class="num">${mine[0]}</b> · до бінго: <b class="num">${mine[1]}</b>` +
      (pub.lineW ? `<br>Лінію взяли: ${pub.lineW.map((s) => escapeHtml(players[s] || '?')).join(', ')}` : '<br>Перша лінія — 40% банку, повна картка — 60%');
  }
  const top = document.getElementById('bingoTop');
  if (top && !fromTimer) {
    const rows = players.map((n, i) => ({ n, i, p: pub.prog[i] })).filter((r) => !pub.left[r.i]).sort((a, b) => a.p[1] - b.p[1]).slice(0, 8);
    top.innerHTML = rows.map((r) => `<li class="${r.n === currentUser ? 'is-me' : ''}"><span>${escapeHtml(r.n)}</span><span class="num">лінія −${r.p[0]}</span><span class="num">бінго −${r.p[1]}</span></li>`).join('');
  }
}

// ══════════════════════════ ВІКТОРИНА ══════════════════════════
function quizRender(u, m, fromTimer) {
  const { pub, priv, players, seat } = u;
  const now = Date.now();
  const q = document.getElementById('qbQuestion');
  const opts = document.getElementById('qbOptions');
  const bar = document.getElementById('qbBar');
  const head = document.getElementById('qbHead');
  if (now < pub.start && !pub.over) {
    if (q) q.textContent = `Перше питання через ${roomSecondsLeft(pub.start)} с…`;
    if (opts) opts.innerHTML = '';
    if (head) head.textContent = `${pub.n} питань · ${players.length} гравців`;
    return;
  }
  if (head) head.textContent = pub.over ? 'Вікторину завершено' : `Питання ${Math.min(pub.i + 1, pub.n)} з ${pub.n}`;
  if (pub.q && q && q.dataset.i !== String(pub.i)) { q.dataset.i = pub.i; q.textContent = pub.q.q; m.local.chosen = null; if (opts) opts.innerHTML = ''; }
  if (pub.q && opts) {
    const my = priv && priv.answers ? priv.answers[pub.i] : -1;
    const chosen = my >= 0 ? my : m.local.chosen;
    const html = pub.q.o.map((o, k) => {
      let cls = 'qb-opt';
      if (chosen === k) cls += ' is-chosen';
      if (pub.q.a !== undefined) cls += k === pub.q.a ? ' is-right' : chosen === k ? ' is-wrong' : ' is-dim';
      return `<button type="button" class="${cls}" ${chosen !== null && chosen !== undefined || pub.q.a !== undefined ? 'disabled' : ''} onclick="quizAnswer(${pub.i},${k})"><span class="qb-key">${'ABCD'[k]}</span>${escapeHtml(o)}</button>`;
    }).join('');
    if (opts.dataset.html !== html) { opts.dataset.html = html; opts.innerHTML = html; }
  }
  if (bar && pub.until) {
    const span = pub.phase === 'ask' ? pub.ask : pub.show;
    bar.style.setProperty('--p', Math.max(0, Math.min(1, (pub.until - now) / span)));
    bar.classList.toggle('is-show', pub.phase === 'show');
  }
  const board = document.getElementById('qbScores');
  if (board && !fromTimer) {
    const rows = players.map((n, i) => ({ n, i, s: pub.scores[i], ok: pub.answered && pub.answered[i] })).sort((a, b) => b.s - a.s);
    board.innerHTML = rows.slice(0, 10).map((r, k) => `<li class="${r.n === currentUser ? 'is-me' : ''}"><span class="num">${k + 1}</span><span>${escapeHtml(r.n)}${r.ok && pub.phase === 'ask' ? ' <span class="ic i-check" aria-hidden="true"></span>' : ''}</span><span class="num">${r.s}</span></li>`).join('');
  }
}
async function quizAnswer(i, k) {
  const m = MASS.quizbattle;
  if (!m || !m.id || m.local.chosen !== null && m.local.chosen !== undefined) return;
  m.local.chosen = k;
  if (m.last) quizRender(m.last, m, false);
  const r = await roomApi('act', { id: m.id, move: { q: i, a: k } });
  if (r.mode !== 'server') { m.local.chosen = null; }
}

// ══════════════════════════ КОРОЛІВСЬКА БИТВА ══════════════════════════
function royaleRender(u, m, fromTimer) {
  const { pub, priv, players, seat } = u;
  const alive = pub.alive.filter(Boolean).length;
  const me = pub.alive[seat];
  const head = document.getElementById('ryHead');
  if (head) head.innerHTML = `Раунд <b class="num">${pub.round}</b> · живих <b class="num">${alive}</b> з ${players.length}${pub.until && !pub.over ? ` · <b class="num">${roomSecondsLeft(pub.until)} с</b>` : ''}`;
  const doors = document.getElementById('ryDoors');
  if (doors) {
    const myPick = priv ? priv.pick : null;
    const show = pub.phase === 'show' && pub.last;
    const counts = show ? pub.last.counts : null;
    const html = [0, 1, 2, 3].map((d) => {
      let cls = 'ry-door';
      if (myPick === d) cls += ' is-mine';
      if (show) cls += d === pub.last.trap ? ' is-trap is-open' : ' is-open';
      const label = show ? (d === pub.last.trap ? '<span class="ic i-bomb" aria-hidden="true"></span>' : `<span class="num">${counts[d]}</span>`) : `<span class="num">${d + 1}</span>`;
      return `<button type="button" class="${cls}" ${!me || pub.phase !== 'pick' || pub.over ? 'disabled' : ''} onclick="royalePick(${d})"><span class="ry-leaf"></span><span class="ry-in">${label}</span></button>`;
    }).join('');
    if (doors.dataset.html !== html) { doors.dataset.html = html; doors.innerHTML = html; }
  }
  const st = document.getElementById('ryStatus');
  if (st && !pub.over) {
    st.textContent = !me ? 'Ти вибув — дивись, хто переможе.'
      : pub.phase === 'pick' ? (priv && priv.pick !== null ? 'Двері обрано. Чекаємо інших…' : 'Обери двері! Не встигнеш — оберемо навмання.')
      : pub.last && pub.last.out.length ? `Пастка за дверима ${pub.last.trap + 1}: вибуло ${pub.last.out.length}.` : 'Пастка порожня — всі живі!';
  }
  if (pub.phase === 'show' && pub.last && m.local.shown !== pub.rounds) {
    m.local.shown = pub.rounds;
    if (pub.last.out.includes(seat)) { playSound && playSound('loss'); navigator.vibrate && navigator.vibrate([80, 40, 160]); }
    else if (me) playSound && playSound('win');
  }
  const list = document.getElementById('ryPlayers');
  if (list && !fromTimer) list.innerHTML = players.map((n, i) => `<span class="mass-chip${pub.alive[i] ? '' : ' is-out'}${n === currentUser ? ' is-me' : ''}">${escapeHtml(n)}</span>`).join('');
}
async function royalePick(d) {
  const m = MASS.royale;
  if (!m || !m.id) return;
  const r = await roomApi('act', { id: m.id, move: { door: d } });
  if (r.mode === 'server') playSound && playSound('click');
}
