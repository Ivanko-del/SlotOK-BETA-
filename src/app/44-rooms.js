// ============================================================
// ОНЛАЙН-КІМНАТИ (v112): спільний клієнт для ігор через api/room.js
//
// Хід, ставки й виплати рахує сервер (lib/rooms.js). Тут:
//   roomApi(action, body)      — запит до /api/room (ті самі режими, що serverApi);
//   roomLobby(game, el, opts)  — живий список кімнат, що чекають суперника;
//   roomWatch(game, id, cb)    — підписка на публічний і мій приватний вигляд;
//   roomResume(game, cb)       — після перезавантаження повернутись у свою кімнату.
// Таймери: коли дедлайн минув, будь-який клієнт у кімнаті смикає "tick" —
// сервер сам вирішить, чий хід прострочено.
// ============================================================

const ROOM_GAME_NAMES = {
  minesweeper: 'Сапер', battleship: 'Морський бій', coinflip: 'Coinflip', rps: 'Камінь-ножиці', predict: 'Prediction',
};

async function roomApi(action, body) {
  return serverApi('/api/room', Object.assign({ action }, body || {}));
}

// Список кімнат, що чекають гравців. opts.onJoin(id) — після входу;
// opts.describe(pubOpts) — підпис параметрів кімнати.
function roomLobby(game, el, opts) {
  if (!el || !db) return () => {};
  opts = opts || {};
  const ref = db.ref('rooms/' + game).orderByChild('status').equalTo('waiting');
  const cb = ref.on('value', (snap) => {
    const rooms = Object.entries(snap.val() || {}).sort((a, b) => (b[1].created || 0) - (a[1].created || 0));
    if (!rooms.length) { el.innerHTML = `<div class="room-empty">Відкритих кімнат немає — створи свою.</div>`; return; }
    el.innerHTML = rooms.map(([id, r]) => {
      const players = Object.keys(r.players || {});
      const mine = players.includes(currentUser);
      let o = {};
      try { o = JSON.parse(r.opts || '{}'); } catch (e) { /* старий запис */ }
      const extra = opts.describe ? opts.describe(o) : '';
      return `<div class="room-row${mine ? ' is-mine' : ''}">
        <div class="room-row-main">
          <div class="room-row-host">${escapeHtml(r.host || '?')}${mine ? ' <span class="badge">ти</span>' : ''}</div>
          <div class="room-row-meta"><span class="num">₴${formatNumber(r.bet)}</span> · ${players.length}/${r.size} гравців${extra ? ' · ' + escapeHtml(extra) : ''}</div>
        </div>
        ${mine
          ? `<button type="button" class="btn btn-ghost room-row-btn" onclick="roomLeaveConfirm(${jsArg(game)},${jsArg(id)})">Скасувати</button>`
          : `<button type="button" class="btn btn-primary room-row-btn" onclick="roomJoin(${jsArg(game)},${jsArg(id)})">Грати · ₴${formatNumber(r.bet)}</button>`}
      </div>`;
    }).join('');
  }, () => { el.innerHTML = `<div class="room-empty">Онлайн-кімнати ще не активовані на сервері.</div>`; });
  return () => ref.off('value', cb);
}

const ROOM_HOOKS = {}; // game → { onJoined(id) }
async function roomJoin(game, id) {
  const r = await roomApi('join', { id });
  if (r.mode !== 'server') { if (r.mode === 'legacy') notify('Онлайн-ігри зараз недоступні', 'error'); return; }
  playSound && playSound('click');
  ROOM_HOOKS[game] && ROOM_HOOKS[game].onJoined(id);
}
async function roomCreate(game, bet, opts, size) {
  if (!validateBet(bet)) return null;
  const r = await roomApi('create', { game, bet, opts: opts || {}, size: size || 0 });
  if (r.mode !== 'server') { if (r.mode === 'legacy') notify('Онлайн-ігри зараз недоступні', 'error'); return null; }
  return r.r.id;
}
async function roomLeaveConfirm(game, id, playing) {
  const ok = await confirmAction(playing
    ? { title: 'Здатися?', text: 'Гра зараховується як поразка, ставку не повернуть.', confirm: 'Здатися', danger: true }
    : { title: 'Скасувати кімнату?', text: 'Ставку буде повернено.', confirm: 'Скасувати кімнату' });
  if (!ok) return;
  const r = await roomApi('leave', { id });
  if (r.mode === 'server') ROOM_HOOKS[game] && ROOM_HOOKS[game].onLeft && ROOM_HOOKS[game].onLeft(id);
}

// Підписка на кімнату. cb({ meta, pub, priv, seat, players }) на кожну зміну.
function roomWatch(game, id, cb) {
  let meta = null, priv = null, privVer = 0, stopped = false, tickAt = 0, fixTimer = null;
  const pubRef = db.ref('rooms/' + game + '/' + id);
  const privRef = db.ref('room_private/' + id + '/' + currentUser);
  const emit = () => {
    if (stopped || !meta) return;
    let pub = null, result = null, o = {};
    try { pub = meta.v ? JSON.parse(meta.v) : null; } catch (e) { pub = null; }
    try { result = meta.result ? JSON.parse(meta.result) : null; } catch (e) { result = null; }
    try { o = JSON.parse(meta.opts || '{}'); } catch (e) { o = {}; }
    const players = Object.entries(meta.players || {}).sort((a, b) => a[1] - b[1]).map(([n]) => n);
    cb({ meta, pub, priv, seat: players.indexOf(currentUser), players, result, opts: o });
    // Приватний вигляд відстав від публічного — дочитуємо через API
    if (meta.v && meta.ver > privVer && players.includes(currentUser) && meta.status === 'playing') {
      clearTimeout(fixTimer);
      fixTimer = setTimeout(async () => {
        if (stopped || privVer >= meta.ver) return;
        const r = await roomApi('view', { id });
        if (r.mode === 'server' && r.r.priv) { priv = r.r.priv; privVer = r.r.ver; emit(); }
      }, 1500);
    }
    // Дедлайн минув — просимо сервер розібратися (раз на дедлайн)
    if (pub && pub.until && !pub.over && meta.status === 'playing' && tickAt !== pub.until) {
      const wait = pub.until - Date.now() + 400 + Math.random() * 600;
      const at = pub.until;
      setTimeout(() => { if (!stopped && tickAt !== at) { tickAt = at; roomApi('tick', { id }); } }, Math.max(0, wait));
    }
  };
  const onPub = (s) => { meta = s.val(); emit(); };
  const onPriv = (s) => {
    const p = s.val();
    if (p && p.ver >= privVer) { privVer = p.ver; try { priv = JSON.parse(p.v); } catch (e) { priv = null; } }
    emit();
  };
  pubRef.on('value', onPub);
  privRef.on('value', onPriv, () => {});
  return () => { stopped = true; clearTimeout(fixTimer); pubRef.off('value', onPub); privRef.off('value', onPriv); };
}

// Повернутися в мою відкриту кімнату цієї гри (після перезавантаження).
async function roomResume(game) {
  const r = await roomApi('mine', {});
  if (r.mode !== 'server') return null;
  const mine = (r.r.rooms || []).find((x) => x.game === game);
  return mine ? mine.id : null;
}

// Секунд до дедлайну (для таймерів у UI)
function roomSecondsLeft(until) { return Math.max(0, Math.ceil((until - Date.now()) / 1000)); }

// Підсумок для гравця: виграв / програв / нічия + сума
function roomResultText(result, bet) {
  if (!result) return '';
  const got = (result.payouts || {})[currentUser] || 0;
  if (result.draw) return `Нічия — ставку ₴${formatNumber(bet)} повернено`;
  if ((result.winners || []).includes(currentUser)) return `Перемога! +₴${formatNumber(got)}${result.text ? ' · ' + result.text : ''}`;
  return `Поразка — −₴${formatNumber(bet)}${result.text ? ' · ' + result.text : ''}`;
}
function roomAnnounce(result, bet, gameName) {
  if (!result) return;
  const won = (result.winners || []).includes(currentUser);
  const got = (result.payouts || {})[currentUser] || 0;
  addToHistory(`${gameName}: ${result.draw ? 'нічия' : won ? '+₴' + formatNumber(got) : '−₴' + formatNumber(bet)}`);
  if (won) { playSound && playSound('bonus'); triggerWinReaction(got, gameName); }
  else if (!result.draw) playSound && playSound('loss');
}
