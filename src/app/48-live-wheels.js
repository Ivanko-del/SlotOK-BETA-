// ============================================================
// СПІЛЬНІ КОЛЕСА (v113): п'ять коліс в одній вкладці — 5, 10, 15, 30 хв
// і рулетка раз на годину. Один спін для всіх гравців.
// КРАШ НАЖИВО: один політ для всіх, видно чужі ставки й кешаути.
//
// Результати рахує сервер (lib/live.js, api/live.js): HMAC від секрету й
// номера раунду; хеш показуємо до спіну, сід — після. Виграш нараховується
// при наступному зверненні гравця до сервера, тож навіть якщо вкладку
// закрили — гроші не пропадуть (прийдуть у «settled»).
// ============================================================

const LW_GAMES = [
  { id: 'w5', label: '5 хв' }, { id: 'w10', label: '10 хв' }, { id: 'w15', label: '15 хв' },
  { id: 'w30', label: '30 хв' }, { id: 'r60', label: '1 год', hint: 'рулетка' },
];
const LW_FORTUNE = { a: { tone: 'primary', name: '×2' }, b: { tone: 'info', name: '×3' }, c: { tone: 'pos', name: '×8.5' }, d: { tone: 'special', name: '×17' }, e: { tone: 'accent', name: '×25' } };
const LW_ROULETTE = { red: { tone: 'neg', name: 'Червоне ×2' }, black: { tone: 'fg', name: 'Чорне ×2' }, green: { tone: 'pos', name: 'Зеро ×36' } };
const LW = {
  game: 'w5', st: null, offset: 0, choice: null, angle: {}, spinning: false, timer: null,
  betsRef: null, histRef: null, myBets: {}, resolving: {},
};
const lwNow = () => Date.now() + LW.offset;

async function liveApi(action, body) {
  const r = await serverApi('/api/live', Object.assign({ action }, body || {}));
  if (r.mode === 'server') {
    if (r.r.now) LW.offset = r.r.now - Date.now();
    lwSettled(r.r.settled);
  }
  return r;
}

// Повідомлення про розраховані раунди (і ті, що були без нас)
function lwSettled(list) {
  (list || []).forEach((s) => {
    if (s.game === 'legacy') { notify(`🎡 Стара рулетка закрита — ставку ₴${formatNumber(s.refund)} повернено`, 'info'); return; }
    if (s.game === 'crash') {
      if (s.win > 0 && s.out && !LC.paidShown[s.round]) notify(`🚀 Краш: автокешаут ×${s.out} — +₴${formatNumber(s.win)}`, 'success');
      return;
    }
    const name = (LW_GAMES.find((g) => g.id === s.game) || {}).label || s.game;
    if (s.win > 0) {
      notify(`🎡 Колесо ${name}: виграш +₴${formatNumber(s.win)}`, 'success');
      addToHistory(`Колесо ${name}: +₴${formatNumber(s.win)}`);
      if (s.win > s.staked) triggerWinReaction(s.win, 'Колесо ' + name);
    } else if (s.staked) addToHistory(`Колесо ${name}: −₴${formatNumber(s.staked)}`);
  });
}

async function initLiveWheels() {
  lwRenderTabs();
  const r = await liveApi('state', { which: 'all' });
  if (r.mode !== 'server') {
    const el = document.getElementById('lwStatus');
    if (el) el.textContent = r.mode === 'legacy' ? 'Спільні колеса працюють лише з сервером.' : 'Не вдалося завантажити — спробуй ще раз.';
    return;
  }
  LW.st = r.r;
  lwSetGame(LW.game, true);
  clearInterval(LW.timer);
  LW.timer = setInterval(lwTick, 250);
}
function lwRenderTabs() {
  const el = document.getElementById('lwTabs');
  if (!el || el.childElementCount) return;
  el.innerHTML = LW_GAMES.map((g) => `<button type="button" class="seg-item lw-tab" data-game="${g.id}" onclick="lwSetGame('${g.id}')"><span class="seg-label">${g.label}</span><span class="seg-hint" id="lwTabT_${g.id}">${g.hint || '…'}</span></button>`).join('');
}
function lwSetGame(game, silent) {
  LW.game = game;
  LW.choice = null;
  document.querySelectorAll('.lw-tab').forEach((b) => b.classList.toggle('active', b.dataset.game === game));
  lwDrawWheel();
  lwRenderChoices();
  lwListen();
  if (!silent) playSound && playSound('click');
}

// ── Колесо (canvas у 3D-нахилі) ──
function lwSegments(game) {
  if (game === 'r60') {
    const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    return LW.st.roulette.map((n) => ({ key: n === 0 ? 'green' : reds.has(n) ? 'red' : 'black', label: String(n) }));
  }
  return LW.st.layout.split('').map((k) => ({ key: k, label: LW_FORTUNE[k].name.replace('×', '') }));
}
function lwToneColor(tone) { return g3dVar('--' + tone) || '#888'; }
function lwDrawWheel() {
  const c = document.getElementById('lwWheel');
  if (!c || !LW.st) return;
  const size = 600;
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const segs = lwSegments(LW.game);
  const n = segs.length, R = size / 2, step = (Math.PI * 2) / n;
  const tones = LW.game === 'r60' ? LW_ROULETTE : LW_FORTUNE;
  ctx.clearRect(0, 0, size, size);
  segs.forEach((s, i) => {
    const a0 = -Math.PI / 2 + i * step - step / 2;
    ctx.beginPath(); ctx.moveTo(R, R); ctx.arc(R, R, R - 14, a0, a0 + step); ctx.closePath();
    ctx.fillStyle = s.key === 'black' ? (g3dVar('--surface-3') || '#222') : lwToneColor(tones[s.key].tone);
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = g3dVar('--ink-shadow') || '#000'; ctx.stroke();
    ctx.save(); ctx.translate(R, R); ctx.rotate(a0 + step / 2);
    ctx.fillStyle = s.key === 'black' ? (g3dVar('--fg') || '#fff') : (g3dVar('--ink-shadow') || '#000');
    ctx.font = `800 ${n > 40 ? 17 : 20}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(s.label, R - 26, 0);
    ctx.restore();
  });
  // обідок з «лампочками»
  ctx.beginPath(); ctx.arc(R, R, R - 7, 0, Math.PI * 2); ctx.lineWidth = 14; ctx.strokeStyle = g3dVar('--fg') || '#eee'; ctx.stroke();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(R + Math.cos(a) * (R - 7), R + Math.sin(a) * (R - 7), 3.2, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? (g3dVar('--accent') || '#f80') : (g3dVar('--warn') || '#fc0'); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(R, R, R * 0.17, 0, Math.PI * 2); ctx.fillStyle = g3dVar('--surface-1') || '#111'; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = g3dVar('--fg') || '#eee'; ctx.stroke();
  const prev = LW.st.wheels[LW.game].prev;
  if (LW.angle[LW.game] === undefined) LW.angle[LW.game] = -(prev.seg * 360) / n; // колесо стоїть на минулому результаті
  c.style.transition = 'none';
  c.style.transform = `rotate(${LW.angle[LW.game]}deg)`;
}
async function lwSpinTo(game, seg) {
  const c = document.getElementById('lwWheel');
  const n = game === 'r60' ? 37 : 54;
  const cur = LW.angle[game] || 0;
  let target = -(seg * 360) / n;
  while (target > cur - 360 * 6) target -= 360;
  LW.angle[game] = target;
  if (game !== LW.game || !c) return;
  LW.spinning = true;
  const dur = g3dReduced() ? 300 : 7000;
  c.style.transition = `transform ${dur}ms cubic-bezier(.12,.62,.08,1)`;
  c.style.transform = `rotate(${target}deg)`;
  await g3dSleep(dur + 150);
  LW.spinning = false;
}

// ── Таймер, спін і новий раунд ──
function lwFmt(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
async function lwTick() {
  if (!LW.st || !document.getElementById('lwWheel')) return;
  if (document.getElementById('tab-roulette')?.classList.contains('hidden')) { clearInterval(LW.timer); LW.timer = null; return; }
  const now = lwNow();
  LW_GAMES.forEach((g) => {
    const w = LW.st.wheels[g.id];
    const t = document.getElementById('lwTabT_' + g.id);
    if (w && t) t.textContent = now < w.endsAt ? lwFmt(w.endsAt - now) : 'спін!';
  });
  const w = LW.st.wheels[LW.game];
  const locked = now >= w.lockAt;
  const cd = document.getElementById('lwCountdown');
  if (cd) cd.textContent = now < w.endsAt ? lwFmt(w.endsAt - now) : '0:00';
  const ring = document.getElementById('lwRing');
  if (ring) ring.style.setProperty('--p', Math.max(0, Math.min(1, 1 - (w.endsAt - now) / w.period)));
  const st = document.getElementById('lwStatus');
  if (st && !LW.spinning && !(LW.msgUntil > Date.now())) st.textContent = locked ? 'Ставки закрито — зараз крутимо!' : 'Ставки відкриті. Один спін для всіх гравців.';
  const btn = document.getElementById('lwBetBtn');
  if (btn) btn.disabled = locked || LW.spinning;
  // Раунд скінчився — питаємо результат і крутимо (для кожного колеса, що скінчилось)
  for (const g of LW_GAMES) {
    const ww = LW.st.wheels[g.id];
    if (ww && now >= ww.endsAt + 300 && !LW.resolving[g.id + ww.n]) {
      LW.resolving[g.id + ww.n] = true;
      lwResolve(g.id, ww.n);
    }
  }
}
async function lwResolve(game, n) {
  const r = await liveApi('wheelResult', { game, round: n });
  if (r.mode !== 'server') { LW.resolving[game + n] = false; return; }
  const res = r.r;
  const st = document.getElementById('lwStatus');
  if (game === LW.game && st) st.textContent = 'Крутимо…';
  await lwSpinTo(game, res.seg);
  const fresh = await liveApi('state', { which: 'all' });
  if (fresh.mode === 'server') {
    const angles = LW.angle;
    LW.st = fresh.r; LW.angle = angles;
  }
  if (game === LW.game) {
    const tones = game === 'r60' ? LW_ROULETTE : LW_FORTUNE;
    if (st) st.textContent = `Випало: ${game === 'r60' ? res.num + ' · ' : ''}${tones[res.win].name}. Новий раунд — роби ставку!`;
    LW.msgUntil = Date.now() + 15000;
    LW.myBets = {};
    lwListen();
    lwRenderMine();
  }
}

// ── Ставки ──
function lwRenderChoices() {
  const el = document.getElementById('lwChoices');
  if (!el || !LW.st) return;
  const tones = LW.game === 'r60' ? LW_ROULETTE : LW_FORTUNE;
  const counts = {};
  lwSegments(LW.game).forEach((s) => { counts[s.key] = (counts[s.key] || 0) + 1; });
  el.innerHTML = Object.entries(tones).map(([k, t]) => `<button type="button" class="lw-choice tone-${t.tone}${LW.choice === k ? ' active' : ''}" onclick="lwPick('${k}')">
    <b>${t.name}</b><small>${counts[k]} з ${LW.game === 'r60' ? 37 : 54}</small></button>`).join('');
  const fair = document.getElementById('lwFair');
  const w = LW.st.wheels[LW.game];
  if (fair) fair.innerHTML = `Хеш раунду: <code>${w.commit.slice(0, 16)}…</code> · минулий сід: <code>${w.prev.seed.slice(0, 16)}…</code>`;
}
function lwPick(k) { LW.choice = k; lwRenderChoices(); }
async function lwPlaceBet() {
  if (!LW.choice) return notify('Обери сектор, на який ставиш', 'error');
  const amount = parseInt(document.getElementById('lwBet')?.value) || 0;
  if (!validateBet(amount)) return;
  const btn = document.getElementById('lwBetBtn');
  if (btn) btn.disabled = true;
  try {
    const r = await liveApi('wheelBet', { game: LW.game, choice: LW.choice, amount });
    if (r.mode !== 'server') return;
    addWager(amount);
    playSound && playSound('click');
    notify(`Ставка ₴${formatNumber(amount)} прийнята`, 'success');
  } finally { if (btn) btn.disabled = false; }
}
function lwListen() {
  if (LW.betsRef) { LW.betsRef.off(); LW.betsRef = null; }
  if (LW.histRef) { LW.histRef.off(); LW.histRef = null; }
  if (!LW.st || !db) return;
  const w = LW.st.wheels[LW.game];
  LW.betsRef = db.ref(`live_bets/${LW.game}/${w.n}`);
  LW.betsRef.on('value', (snap) => {
    const all = snap.val() || {};
    LW.myBets = all[currentUser] || {};
    lwRenderMine();
    const tones = LW.game === 'r60' ? LW_ROULETTE : LW_FORTUNE;
    const rows = Object.entries(all).map(([nick, b]) => ({ nick, total: Object.values(b).reduce((a, x) => a + x, 0), b })).sort((a, b) => b.total - a.total);
    const el = document.getElementById('lwPlayers');
    if (el) el.innerHTML = rows.length ? rows.slice(0, 30).map((r) => `<li class="${r.nick === currentUser ? 'is-me' : ''}"><span>${escapeHtml(r.nick)}</span><span class="lw-mini">${Object.keys(r.b).map((k) => `<i class="tone-${tones[k] ? tones[k].tone : 'fg'}"></i>`).join('')}</span><span class="num">₴${formatNumber(r.total)}</span></li>`).join('')
      : '<li class="room-empty">У цьому раунді ще ніхто не ставив.</li>';
    const cnt = document.getElementById('lwCount'); if (cnt) cnt.textContent = rows.length;
  }, () => {});
  LW.histRef = db.ref(`live_results/${LW.game}`).limitToLast(14);
  LW.histRef.on('value', (snap) => {
    const tones = LW.game === 'r60' ? LW_ROULETTE : LW_FORTUNE;
    const items = Object.values(snap.val() || {}).reverse();
    const el = document.getElementById('lwHistory');
    if (el) el.innerHTML = items.map((h) => `<span class="lw-hist tone-${(tones[h.win] || {}).tone || 'fg'}">${h.num !== undefined ? h.num : (tones[h.win] || {}).name || ''}</span>`).join('') || '<span class="field-hint">Історія з’явиться після першого спіну.</span>';
  }, () => {});
}
function lwRenderMine() {
  const el = document.getElementById('lwMine');
  if (!el) return;
  const tones = LW.game === 'r60' ? LW_ROULETTE : LW_FORTUNE;
  const e = Object.entries(LW.myBets || {});
  el.innerHTML = e.length ? 'Мої ставки: ' + e.map(([k, v]) => `<b class="tone-${tones[k] ? tones[k].tone : 'fg'}">${tones[k] ? tones[k].name : k} ₴${formatNumber(v)}</b>`).join(' · ') : 'У цьому раунді ти ще не ставив.';
}

// ══════════════════════════ КРАШ НАЖИВО ══════════════════════════
const LC = { cur: null, cfg: null, raf: null, pollAt: 0, polling: false, point: null, roundRef: null, curRef: null, histRef: null, me: null, paidShown: {}, busy: false, trail: [] };
async function initLiveCrash() {
  const r = await liveApi('state', { which: 'none' });
  if (r.mode !== 'server') { const s = document.getElementById('lcStatus'); if (s) s.textContent = 'Краш наживо працює лише з сервером.'; return; }
  LC.cfg = r.r.crashCfg;
  lcSetRound(r.r.crash);
  if (LC.curRef) LC.curRef.off();
  LC.curRef = db.ref('live_crash/cur');
  LC.curRef.on('value', (s) => { const c = s.val(); if (c && (!LC.cur || c.n !== LC.cur.n)) lcSetRound(c); }, () => {});
  if (LC.histRef) LC.histRef.off();
  LC.histRef = db.ref('live_crash/hist').limitToLast(16);
  LC.histRef.on('value', (s) => {
    const el = document.getElementById('lcHistory');
    if (el) el.innerHTML = Object.values(s.val() || {}).reverse().map((h) => `<span class="lc-hist${h.p >= 10 ? ' is-big' : h.p >= 2 ? ' is-ok' : ''}">×${h.p}</span>`).join('');
  }, () => {});
  cancelAnimationFrame(LC.raf);
  LC.raf = requestAnimationFrame(lcFrame);
}
function lcSetRound(c) {
  LC.cur = c; LC.point = c.point || null; LC.me = null; LC.trail = [];
  if (LC.roundRef) LC.roundRef.off();
  LC.roundRef = db.ref('live_crash/r/' + c.n);
  LC.roundRef.on('value', (s) => {
    const all = s.val() || {};
    LC.me = all[currentUser] || null;
    const rows = Object.entries(all).sort((a, b) => b[1].bet - a[1].bet);
    const el = document.getElementById('lcPlayers');
    if (el) el.innerHTML = rows.length ? rows.slice(0, 40).map(([n, b]) => `<li class="${n === currentUser ? 'is-me' : ''}${b.out ? ' is-out' : ''}"><span>${escapeHtml(n)}</span><span class="num">₴${formatNumber(b.bet)}</span><span class="num">${b.out ? '×' + b.out + ' · +₴' + formatNumber(b.win) : b.auto ? 'авто ×' + b.auto : '—'}</span></li>`).join('')
      : '<li class="room-empty">Ставок у цьому раунді ще немає.</li>';
    const cnt = document.getElementById('lcCount'); if (cnt) cnt.textContent = rows.length;
    lcButtons();
  }, () => {});
  const f = document.getElementById('lcFair');
  if (f) f.innerHTML = `Раунд #${c.n} · хеш: <code>${(c.commit || '').slice(0, 16)}…</code>`;
}
const lcMult = (ms) => Math.floor(Math.exp(LC.cfg.rate * Math.max(0, ms) / 1000) * 100) / 100;
function lcFrame() {
  if (document.getElementById('tab-livecrash')?.classList.contains('hidden')) { LC.raf = null; return; }
  LC.raf = requestAnimationFrame(lcFrame);
  if (!LC.cur || !LC.cfg) return;
  const now = lwNow();
  const big = document.getElementById('lcMult');
  const st = document.getElementById('lcStatus');
  const stage = document.getElementById('lcStage');
  if (now < LC.cur.startAt) {
    if (big) { big.textContent = 'Старт через ' + Math.ceil((LC.cur.startAt - now) / 1000) + ' с'; big.className = 'lc-mult is-wait'; }
    if (st) st.textContent = 'Приймаємо ставки на цей політ.';
    stage && stage.classList.remove('is-crashed', 'is-flying');
    lcDraw(1, false);
  } else if (LC.point) {
    if (big) { big.textContent = '×' + LC.point.toFixed(2); big.className = 'lc-mult is-crashed'; }
    if (st) st.textContent = 'Впало! Наступний раунд за кілька секунд.';
    stage && stage.classList.add('is-crashed');
    lcDraw(LC.point, true);
    if (now - LC.pollAt > 1500) lcPoll(); // після паузи сервер створить новий раунд
  } else {
    const m = lcMult(now - LC.cur.startAt);
    if (big) { big.textContent = '×' + m.toFixed(2); big.className = 'lc-mult is-flying'; }
    if (st) st.textContent = LC.me && !LC.me.out ? 'Летимо! Встигни забрати.' : 'Летимо!';
    stage && stage.classList.add('is-flying');
    lcDraw(m, false);
    if (now - LC.pollAt > 1000) lcPoll();
  }
  lcButtons();
}
async function lcPoll() {
  if (LC.polling) return;
  LC.polling = true; LC.pollAt = lwNow();
  try {
    const r = await serverApi('/api/live', { action: 'crashPoll' });
    if (r.mode !== 'server') return;
    LW.offset = r.r.now - Date.now();
    if (LC.cur && r.r.n === LC.cur.n && r.r.point && !LC.point) {
      LC.point = r.r.point;
      if (LC.me && !LC.me.out) {
        if (LC.me.auto && LC.me.auto <= LC.point) { /* автокешаут — гроші прийдуть з settled */ }
        else { playSound && playSound('loss'); addToHistory(`Краш наживо: −₴${formatNumber(LC.me.bet)}`); }
      }
      setTimeout(() => liveApi('state', { which: 'none' }), 600); // розрахувати автокешаут
      const f = document.getElementById('lcFair');
      if (f) f.innerHTML = `Раунд #${LC.cur.n} · точка ×${LC.point} · сід: <code>${(r.r.seed || '').slice(0, 16)}…</code>`;
    } else if (LC.cur && r.r.n !== LC.cur.n) lcSetRound({ n: r.r.n, startAt: r.r.startAt, commit: r.r.commit });
  } finally { LC.polling = false; }
}
function lcDraw(m, crashed) {
  const c = document.getElementById('lcCanvas');
  if (!c) return;
  const w = c.clientWidth || 600, h = c.clientHeight || 300;
  if (c.width !== w * 2) { c.width = w * 2; c.height = h * 2; }
  const ctx = c.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const top = Math.max(2, m * 1.25);
  const tMax = Math.log(top) / LC.cfg.rate;
  const X = (t) => 24 + (t / tMax) * (w - 48), Y = (v) => h - 20 - ((v - 1) / (top - 1)) * (h - 50);
  ctx.strokeStyle = g3dVar('--line'); ctx.lineWidth = 1;
  for (const v of [1, 2, 5, 10, 50, 100]) { if (v > top) break; ctx.beginPath(); ctx.moveTo(24, Y(v)); ctx.lineTo(w - 10, Y(v)); ctx.stroke(); ctx.fillStyle = g3dVar('--fg-3'); ctx.font = '11px sans-serif'; ctx.fillText('×' + v, 2, Y(v) - 2); }
  if (m <= 1 && !crashed) return;
  const tNow = Math.log(Math.max(1, m)) / LC.cfg.rate;
  ctx.beginPath();
  for (let k = 0; k <= 60; k++) { const t = (tNow * k) / 60; const v = Math.exp(LC.cfg.rate * t); k ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v)); }
  ctx.lineWidth = 4; ctx.strokeStyle = crashed ? g3dVar('--neg') : g3dVar('--accent'); ctx.stroke();
  ctx.lineTo(X(tNow), h - 20); ctx.lineTo(X(0), h - 20); ctx.closePath();
  ctx.globalAlpha = 0.12; ctx.fillStyle = crashed ? g3dVar('--neg') : g3dVar('--accent'); ctx.fill(); ctx.globalAlpha = 1;
  // ракета
  ctx.save(); ctx.translate(X(tNow), Y(m));
  ctx.fillStyle = crashed ? g3dVar('--neg') : g3dVar('--fg');
  ctx.beginPath(); ctx.arc(0, 0, crashed ? 9 : 7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function lcButtons() {
  const btn = document.getElementById('lcBtn');
  if (!btn || !LC.cur) return;
  const now = lwNow();
  const flying = now >= LC.cur.startAt && !LC.point;
  if (LC.me && !LC.me.out && flying) {
    const m = lcMult(now - LC.cur.startAt);
    btn.innerHTML = `<span class="ic i-cash" aria-hidden="true"></span>Забрати ₴${formatNumber(Math.floor(LC.me.bet * m))}`;
    btn.classList.add('is-cashout'); btn.disabled = LC.busy;
  } else if (now < LC.cur.startAt && !LC.me) {
    btn.innerHTML = '<span class="ic i-rocket" aria-hidden="true"></span>Поставити на політ';
    btn.classList.remove('is-cashout'); btn.disabled = LC.busy;
  } else {
    btn.classList.remove('is-cashout');
    btn.innerHTML = LC.me ? (LC.me.out ? `Забрано ×${LC.me.out}` : now < LC.cur.startAt ? 'Ставку прийнято' : 'Чекаємо наступний раунд') : 'Ставка — до старту раунду';
    btn.disabled = true;
  }
}
async function lcAction() {
  if (!LC.cur || LC.busy) return;
  const now = lwNow();
  LC.busy = true;
  try {
    if (LC.me && !LC.me.out && now >= LC.cur.startAt) {
      const r = await liveApi('crashCashout', { round: LC.cur.n });
      if (r.mode === 'server') {
        LC.paidShown[LC.cur.n] = true;
        playSound && playSound('win');
        notify(`🚀 Забрано ×${r.r.mult} — +₴${formatNumber(r.r.win)}`, 'success');
        addToHistory(`Краш наживо: +₴${formatNumber(r.r.win)}`);
        if (r.r.win > LC.me.bet) triggerWinReaction(r.r.win, 'Краш наживо');
      }
    } else if (!LC.me && now < LC.cur.startAt) {
      const amount = parseInt(document.getElementById('lcBet')?.value) || 0;
      if (!validateBet(amount)) return;
      const auto = parseFloat(document.getElementById('lcAuto')?.value) || null;
      const r = await liveApi('crashBet', { amount, auto });
      if (r.mode === 'server') { addWager(amount); playSound && playSound('click'); }
    }
  } finally { LC.busy = false; lcButtons(); }
}
