// ============================================================
// COINFLIP / КАМІНЬ-НОЖИЦІ / PREDICTION через сервер (v112)
//
// Старі версії (28-pvp-leaderboard-limbo.js) рахували результат у браузері:
// монету кидав той, хто приєднався; хід суперника й загадане число лежали в
// базі відкрито. Коли сервер увімкнено (serverAuthEnabled), ці ж кнопки йдуть
// через api/room.js (lib/room-games/coinflip|rps|predict.js), а екрани ті самі.
// Без сервера (локальний запуск) працюють старі функції.
// ============================================================

const PVP_SRV = { cf: null, rps: null, pd: null };
const _legacyPvp = {
  createCfRoom, loadCfRooms, createRpsRoom, loadRpsRooms, playRps, createPdRoom, loadPdRooms, submitPdGuess,
};

// Чекаємо кінця кімнати й викликаємо done(u) один раз
function pvpWatchUntilDone(game, id, slot, onUpdate, done) {
  if (PVP_SRV[slot]) PVP_SRV[slot].stop();
  let finished = false;
  const stop = roomWatch(game, id, (u) => {
    if (u.meta.status === 'cancelled') { stop(); PVP_SRV[slot] = null; notify('Кімнату скасовано, ставку повернено', 'info'); return; }
    onUpdate && onUpdate(u);
    if (u.meta.status === 'finished' && u.result && !finished) {
      finished = true; stop(); PVP_SRV[slot] = null;
      done(u);
    }
  });
  PVP_SRV[slot] = { id, stop };
}
const pvpOpponent = (u) => u.players.find((n) => n !== currentUser) || '???';
const pvpWon = (u) => (u.result.winners || []).includes(currentUser);
const pvpPay = (u) => (u.result.payouts || {})[currentUser] || 0;

// ── Coinflip ──
createCfRoom = async function () {
  if (!(await serverAuthEnabled())) return _legacyPvp.createCfRoom();
  const bet = parseInt(document.getElementById('cfBetInput').value) || 0;
  const id = await roomCreate('coinflip', bet, { side: cfSelectedSide });
  if (!id) return;
  notify('🪙 Кімнату створено! Чекаємо суперника...', 'success');
  switchCfTab('join');
  cfServerWatch(id);
};
function cfServerWatch(id) {
  pvpWatchUntilDone('coinflip', id, 'cf', null, (u) => {
    const won = pvpWon(u);
    showCfResult(won, u.pub.result, u.pub.side, u.meta.bet, pvpPay(u), pvpOpponent(u));
    roomAnnounce(u.result, u.meta.bet, 'Coinflip');
    if (won) addToWinFeed('Coinflip', pvpPay(u), 2);
  });
}
loadCfRooms = async function () {
  if (!(await serverAuthEnabled())) return _legacyPvp.loadCfRooms();
  if (!PVP_SRV.cfLobby) PVP_SRV.cfLobby = roomLobby('coinflip', document.getElementById('cfRoomsList'), { describe: (o) => (o.side === 'tails' ? 'господар на Решку' : 'господар на Орла') });
};
ROOM_HOOKS.coinflip = {
  onJoined: (id) => cfServerWatch(id),
  onLeft: () => { if (PVP_SRV.cf) { PVP_SRV.cf.stop(); PVP_SRV.cf = null; } },
};

// ── Камінь-ножиці-папір ──
function rpsShowArea(text) {
  document.getElementById('rps-panel-create')?.classList.add('hidden');
  document.getElementById('rps-panel-join')?.classList.add('hidden');
  document.getElementById('rpsGameArea')?.classList.remove('hidden');
  const st = document.getElementById('rpsStatus'); if (st) st.textContent = text;
  ['rock', 'scissors', 'paper'].forEach((c) => { const el = document.getElementById('rps-' + c); if (el) el.style.opacity = '1'; });
}
function rpsServerWatch(id) {
  rpsCurrentRoom = id; rpsRole = 'server';
  pvpWatchUntilDone('rps', id, 'rps', (u) => {
    if (u.meta.status === 'waiting') { rpsShowArea('⏳ Чекаємо суперника...'); return; }
    if (u.meta.status !== 'playing' || !u.pub) return;
    const mine = u.priv && u.priv.my;
    const st = document.getElementById('rpsStatus');
    if (st) st.textContent = mine ? `⏳ Чекаємо ходу суперника... ${roomSecondsLeft(u.pub.until)} с` : `🎮 Роби хід! ${roomSecondsLeft(u.pub.until)} с`;
  }, (u) => {
    const seat = u.seat, moves = (u.pub && u.pub.moves) || [];
    const my = moves[seat], opp = moves[1 - seat];
    const oppEl = document.getElementById('rpsOpponentMove');
    if (oppEl) oppEl.textContent = RPS_EMOJI[opp] || '❓';
    showRpsResult(pvpWon(u), !!u.result.draw, my, opp, u.meta.bet, pvpPay(u));
    roomAnnounce(u.result, u.meta.bet, 'RPS');
    rpsCurrentRoom = null; rpsRole = null;
  });
}
createRpsRoom = async function () {
  if (!(await serverAuthEnabled())) return _legacyPvp.createRpsRoom();
  const bet = parseInt(document.getElementById('rpsBetInput').value) || 0;
  const id = await roomCreate('rps', bet, {});
  if (!id) return;
  rpsShowArea('⏳ Чекаємо суперника...');
  rpsServerWatch(id);
};
loadRpsRooms = async function () {
  if (!(await serverAuthEnabled())) return _legacyPvp.loadRpsRooms();
  if (!PVP_SRV.rpsLobby) PVP_SRV.rpsLobby = roomLobby('rps', document.getElementById('rpsRoomsList'));
};
playRps = async function (choice) {
  if (rpsRole !== 'server') return _legacyPvp.playRps(choice);
  if (!rpsCurrentRoom) return;
  const r = await roomApi('act', { id: rpsCurrentRoom, move: { m: choice } });
  if (r.mode !== 'server') return;
  ['rock', 'scissors', 'paper'].forEach((c) => { const el = document.getElementById('rps-' + c); if (el) el.style.opacity = c === choice ? '1' : '0.3'; });
};
ROOM_HOOKS.rps = {
  onJoined: (id) => { rpsShowArea('🎮 Роби хід!'); rpsServerWatch(id); },
  onLeft: () => { if (PVP_SRV.rps) { PVP_SRV.rps.stop(); PVP_SRV.rps = null; } },
};

// ── Prediction Duel ──
function pdServerResult(u) {
  const seat = u.seat, g = (u.pub && u.pub.guesses) || [], secret = u.pub && u.pub.secret;
  const my = g[seat], opp = g[1 - seat];
  showPdResult(pvpWon(u), !!u.result.draw, secret, my, opp, Math.abs(my - secret), Math.abs(opp - secret), u.meta.bet, pvpPay(u), pvpOpponent(u));
  roomAnnounce(u.result, u.meta.bet, 'Predict');
  if (pvpWon(u)) addToWinFeed('Predict', pvpPay(u), 2);
  pdCurrentRoom = null; pdRole = null;
}
createPdRoom = async function () {
  if (!(await serverAuthEnabled())) return _legacyPvp.createPdRoom();
  const bet = parseInt(document.getElementById('pdBetInput').value) || 0;
  const guess = parseInt(document.getElementById('pdGuessInput').value);
  if (!guess || guess < 1 || guess > 100) return notify('Число від 1 до 100', 'error');
  const id = await roomCreate('predict', bet, { guess });
  if (!id) return;
  pdCurrentRoom = id; pdRole = 'server';
  notify('🔮 Кімнату створено! Твоє число бачиш лише ти.', 'success');
  switchPdTab('join');
  pvpWatchUntilDone('predict', id, 'pd', null, pdServerResult);
};
loadPdRooms = async function () {
  if (!(await serverAuthEnabled())) return _legacyPvp.loadPdRooms();
  if (!PVP_SRV.pdLobby) PVP_SRV.pdLobby = roomLobby('predict', document.getElementById('pdRoomsList'));
};
submitPdGuess = async function () {
  if (pdRole !== 'server') return _legacyPvp.submitPdGuess();
  const g = parseInt(document.getElementById('pdJoinGuessInput').value);
  if (!g || g < 1 || g > 100) return notify('Число від 1 до 100', 'error');
  const r = await roomApi('act', { id: pdCurrentRoom, move: { g } });
  if (r.mode === 'server') { const s = document.getElementById('pdJoinStatus'); if (s) s.textContent = '⏳ Рахуємо…'; }
};
ROOM_HOOKS.predict = {
  onJoined: (id) => {
    pdCurrentRoom = id; pdRole = 'server';
    document.getElementById('pd-panel-join')?.classList.add('hidden');
    document.getElementById('pdJoinGuessArea')?.classList.remove('hidden');
    const s = document.getElementById('pdJoinStatus'); if (s) s.textContent = '🔮 Вгадай число від 1 до 100! На відповідь 60 с.';
    pvpWatchUntilDone('predict', id, 'pd', null, pdServerResult);
  },
  onLeft: () => { if (PVP_SRV.pd) { PVP_SRV.pd.stop(); PVP_SRV.pd = null; } },
};
