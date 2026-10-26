// ============================================================
// ===== TOWER CLIMB GAME =====
// ============================================================
let towerState = null;

let towerBusy = false;
async function startTower() {
  if(towerBusy || (towerState && towerState.active)) return;
  const bet = validateBet(document.getElementById('towerBet').value);
  if(!bet) return;
  const diff = parseInt(document.getElementById('towerDiff').value) || 2;
  towerBusy = true;
  let srv;
  try { srv = await serverRound('start', 'tower', { bet, params: { diff } }); } finally { towerBusy = false; }
  if(srv.mode === 'error') return;
  if(srv.mode !== 'server') db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  addWager(bet);
  playSound('click');
  const cols = 4;
  towerState = { bet, diff, cols, level:0, multiplier:1.0, active:true, server: srv.mode === 'server' };
  document.getElementById('towerStartArea').classList.add('hidden');
  document.getElementById('towerGameArea').classList.remove('hidden');
  document.getElementById('towerCashoutBtn').style.display = 'none';
  renderTowerGrid();
}

function renderTowerGrid() {
  if(!towerState) return;
  const grid = document.getElementById('towerGrid'); if(!grid) return;
  grid.innerHTML = '';
  const TOTAL_LEVELS = 10;
  for(let lv=0;lv<TOTAL_LEVELS;lv++) {
    const row = document.createElement('div');
    row.className = 'tower-row';
    row.id = 'tower-row-' + lv;
    for(let c=0;c<towerState.cols;c++) {
      const cell = document.createElement('div');
      cell.className = 'tower-cell';
      cell.id = `tower-cell-${lv}-${c}`;
      if(lv < towerState.level) { cell.classList.add('disabled'); cell.innerHTML = '⬜'; }
      else if(lv > towerState.level) { cell.classList.add('disabled'); cell.innerHTML = '🔒'; }
      else { cell.innerHTML = '🟦'; cell.onclick = () => towerClick(c); }
      row.appendChild(cell);
    }
    const mult = getTowerMult(lv);
    const badge = document.createElement('div');
    badge.style.cssText = 'font-size:10px;color:var(--fg-4);min-width:36px;text-align:center;display:flex;align-items:center;';
    badge.textContent = 'x'+mult.toFixed(2);
    row.appendChild(badge);
    grid.appendChild(row);
  }
  updateTowerUI();
}

function getTowerMult(level) {
  const diff = towerState ? towerState.diff : 2;
  const safe = towerState.cols - diff;
  const total = towerState.cols;
  const prob = safe/total;
  return parseFloat((Math.pow(1/prob, level+1) * 0.97).toFixed(2));
}

async function towerClick(col) {
  if(!towerState || !towerState.active || towerBusy) return;
  const lv = towerState.level;
  const diff = towerState.diff;
  const cols = towerState.cols;

  let mines = [];
  let serverDone = null;
  if(towerState.server) {
    // Міни поверху кидає сервер у момент ходу.
    towerBusy = true;
    let srv;
    try { srv = await serverRound('move', 'tower', { move: { col } }); } finally { towerBusy = false; }
    if(srv.mode !== 'server') { if(srv.status === 409) towerReset(); return; }
    mines = srv.r.view.rows[srv.r.view.rows.length - 1].mines;
    if(srv.r.status === 'done') serverDone = srv.r;
  } else {
    // Place mines randomly
    while(mines.length < diff) {
      const m = Math.floor(Math.random()*cols);
      if(!mines.includes(m)) mines.push(m);
    }
  }

  const isMine = mines.includes(col);

  // Reveal all cells on this row
  for(let c=0;c<cols;c++) {
    const cell = document.getElementById(`tower-cell-${lv}-${c}`);
    if(!cell) continue;
    cell.onclick = null;
    cell.classList.add('disabled');
    if(mines.includes(c)) { cell.classList.add('mine'); cell.innerHTML = '💣'; }
    else { cell.classList.add('safe'); cell.innerHTML = '✅'; }
  }

  if(isMine) {
    // BOOM
    towerState.active = false;
    playSound('loss');
    notify('💥 МІНА! Ви програли ' + towerState.bet + '₴', 'error');
    document.getElementById('towerCashoutBtn').style.display = 'none';
    addToHistory('Tower: -' + towerState.bet);
    setTimeout(() => towerReset(), 2500);
  } else {
    towerState.level++;
    towerState.multiplier = getTowerMult(lv);
    updateTowerUI();
    if(serverDone) {
      // Верхівка — сервер уже виплатив.
      towerFinishUI(serverDone.payout, serverDone.mult);
    } else if(towerState.level >= 10) {
      // Max level!
      towerCashout();
    } else {
      document.getElementById('towerCashoutBtn').style.display = 'block';
      playSound('win');
      renderTowerGrid();
    }
  }
}

function updateTowerUI() {
  if(!towerState) return;
  const mult = getTowerMult(Math.max(0, towerState.level-1));
  const win = Math.floor(towerState.bet * mult);
  document.getElementById('towerLevel').textContent = towerState.level;
  document.getElementById('towerMult').textContent = 'x' + mult.toFixed(2);
  document.getElementById('towerWin').textContent = formatNumber(win) + ' ₴';
}

async function towerCashout() {
  if(!towerState || !towerState.active || towerBusy) return;
  if(towerState.server) {
    if(towerState.level < 1) return;
    towerBusy = true;
    let srv;
    try { srv = await serverRound('cashout', 'tower'); } finally { towerBusy = false; }
    if(srv.mode !== 'server') return;
    return towerFinishUI(srv.r.payout, srv.r.mult);
  }
  towerState.active = false;
  const mult = getTowerMult(Math.max(0, towerState.level-1));
  const win = Math.floor(towerState.bet * mult);
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
  towerFinishUI(win, mult);
}
// Спільний фінал кешауту (баланс уже змінено — сервером або вище в towerCashout).
function towerFinishUI(win, mult) {
  if(towerState) towerState.active = false;
  playSound('bonus');
  notify('🏆 Кешаут! +' + formatNumber(win) + '₴ (x'+mult.toFixed(2)+')', 'success');
  addToHistory('Tower x'+mult.toFixed(2)+': +'+win);
  if(win >= 500) addToWinFeed('Tower', win, mult);
  document.getElementById('towerCashoutBtn').style.display = 'none';
  setTimeout(towerReset, 2500);
}

function towerReset() {
  towerState = null;
  document.getElementById('towerStartArea').classList.remove('hidden');
  document.getElementById('towerGameArea').classList.add('hidden');
  document.getElementById('towerGrid').innerHTML = '';
}

// ============================================================
// ===== HI-LO CARDS GAME =====
// ============================================================
let hiloState = null;

let hiloBusy = false;
async function startHilo() {
  if(hiloBusy) return;
  const bet = validateBet(document.getElementById('hiloBet').value);
  if(!bet) return;
  hiloBusy = true;
  let srv;
  try { srv = await serverRound('start', 'hilo', { bet, params: {} }); } finally { hiloBusy = false; }
  if(srv.mode === 'error') return;
  addWager(bet);
  playSound('deal');
  if(srv.mode === 'server') {
    // Колода лежить на сервері; тут лише поточна карта.
    hiloState = { bet, server: true, deck: [], streak: 0, multiplier: 1.0, currentCard: srv.r.view.current };
  } else {
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
    const deck = [];
    for(const r of RANKS) for(const s of SUITS) deck.push({rank:r, suit:s});
    deck.sort(()=>Math.random()-0.5);
    hiloState = { bet, deck, streak:0, multiplier:1.0, currentCard: deck.pop() };
  }
  document.getElementById('hiloGameArea').classList.remove('hidden');
  renderHiloCard(hiloState.currentCard);
  updateHiloUI();
}

function renderHiloCard(card) {
  const el = document.getElementById('hiloCurrentCard'); if(!el) return;
  const isRed = card.suit === '♥' || card.suit === '♦';
  const rank = card.rank;
  el.style.color = isRed ? 'var(--neg)' : 'var(--on-accent)';
  el.textContent = rank + card.suit;
}

// Множник кроку: 0.97 / P(вгадати), де P рахується по картах, що лишались у
// колоді перед ходом (нічиї перетягуються, тому не враховуються).
function hiloStepMult(curVal, dir, deck) {
  let win = 0, lose = 0;
  deck.forEach(c => { const v = cardValue(c.rank); if(v === curVal) return; ((dir === 'high') === (v > curVal)) ? win++ : lose++; });
  if(win === 0) return 0;
  // Без нижньої межі 1.0: «гарантований» хід (вище від двійки) дає ×0.97 —
  // інакше на ньому можна було б безкоштовно накручувати множник.
  return 0.97 * (win + lose) / win;
}
async function hiloGuessServer(dir) {
  if(hiloBusy) return;
  hiloBusy = true;
  let srv;
  try { srv = await serverRound('move', 'hilo', { move: { dir } }); } finally { hiloBusy = false; }
  if(srv.mode !== 'server') {
    if(srv.status === 409) { hiloState = null; document.getElementById('hiloGameArea').classList.add('hidden'); document.getElementById('hiloCashoutBtn').classList.add('hidden'); }
    return;
  }
  const r = srv.r;
  playSound('deal');
  if((r.view.last || []).some(h => h.tie)) notify('🔄 Нічия! Перетягуємо.','info');
  hiloState.currentCard = r.view.current;
  renderHiloCard(r.view.current);
  if(r.status === 'lost') {
    playSound('loss');
    notify('❌ Невірно! Ви програли ' + hiloState.bet + '₴', 'error');
    addToHistory('Hi-Lo: -' + hiloState.bet);
    hiloState = null;
    setTimeout(() => {
      document.getElementById('hiloGameArea').classList.add('hidden');
      document.getElementById('hiloCashoutBtn').classList.add('hidden');
    }, 1500);
    return;
  }
  hiloState.streak = r.view.streak;
  hiloState.multiplier = r.view.multiplier;
  playSound('win');
  notify('✅ Правильно! Серія: ' + hiloState.streak, 'success');
  updateHiloUI();
  document.getElementById('hiloCashoutBtn').classList.remove('hidden');
}
function hiloGuess(dir) {
  if(hiloState && hiloState.server) return hiloGuessServer(dir);
  if(!hiloState || !hiloState.deck.length) return;
  // Вгадати неможливо (напр. «вище» від туза) — не спалюємо ставку даремно.
  if(hiloStepMult(cardValue(hiloState.currentCard.rank), dir, hiloState.deck) === 0) {
    return notify(dir === 'high' ? 'Вищої карти вже не буде — обери «нижче»' : 'Нижчої карти вже не буде — обери «вище»', 'info');
  }
  playSound('deal');
  const next = hiloState.deck.pop();
  const curVal = cardValue(hiloState.currentCard.rank);
  const nextVal = cardValue(next.rank);
  let correct;
  if(dir==='high') correct = nextVal > curVal;
  else             correct = nextVal < curVal;
  // Equal: re-draw
  if(nextVal === curVal) { hiloState.currentCard = next; renderHiloCard(next); notify('🔄 Нічия! Перетягуємо.','info'); return; }

  if(correct) {
    hiloState.streak++;
    // Множник за реальним шансом вгадати (97%), а не фіксований ×1.5: раніше
    // на двійці/тузі виграш був гарантований, а в середньому крок давав ~112%.
    hiloState.multiplier = parseFloat((hiloState.multiplier * hiloStepMult(curVal, dir, hiloState.deck.concat([next]))).toFixed(2));
    hiloState.currentCard = next;
    renderHiloCard(next);
    playSound('win');
    notify('✅ Правильно! Серія: ' + hiloState.streak, 'success');
    updateHiloUI();
    document.getElementById('hiloCashoutBtn').classList.remove('hidden');
  } else {
    hiloState.currentCard = next;
    renderHiloCard(next);
    playSound('loss');
    notify('❌ Невірно! Ви програли ' + hiloState.bet + '₴', 'error');
    addToHistory('Hi-Lo: -' + hiloState.bet);
    hiloState = null;
    setTimeout(() => {
      document.getElementById('hiloGameArea').classList.add('hidden');
      document.getElementById('hiloCashoutBtn').classList.add('hidden');
    }, 1500);
  }
}

async function hiloCashout() {
  if(!hiloState || hiloBusy) return;
  let win;
  if(hiloState.server) {
    hiloBusy = true;
    let srv;
    try { srv = await serverRound('cashout', 'hilo'); } finally { hiloBusy = false; }
    if(srv.mode !== 'server' || !hiloState) return;
    win = srv.r.payout;
    hiloState.multiplier = srv.r.mult;
  } else {
    win = Math.floor(hiloState.bet * hiloState.multiplier);
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
  }
  playSound('bonus');
  notify('💰 Кешаут! +' + formatNumber(win) + '₴', 'success');
  addToHistory('Hi-Lo x'+hiloState.multiplier+': +'+win);
  if(win >= 500) addToWinFeed('Hi-Lo', win, hiloState.multiplier);
  hiloState = null;
  document.getElementById('hiloGameArea').classList.add('hidden');
  document.getElementById('hiloCashoutBtn').classList.add('hidden');
}

function updateHiloUI() {
  if(!hiloState) return;
  const win = Math.floor(hiloState.bet * hiloState.multiplier);
  document.getElementById('hiloStreak').textContent = hiloState.streak;
  document.getElementById('hiloMult').textContent = 'x' + hiloState.multiplier;
  document.getElementById('hiloWin').textContent = formatNumber(win) + ' ₴';
}

// ============================================================
// ===== DICE ROLL =====
// ============================================================
function updateDiceUI() {
  const val = parseInt(document.getElementById('diceSlider').value);
  document.getElementById('diceNumLabel').textContent = val;
  document.getElementById('diceOverNum').textContent = val;
  document.getElementById('diceUnderNum').textContent = val;
  const overChance = (99 - val) / 99;
  const underChance = (val - 1) / 99;
  document.getElementById('diceChance').textContent = Math.round(overChance*100) + '% / ' + Math.round(underChance*100) + '%';
  const mult = parseFloat((0.97 / Math.max(overChance, underChance)).toFixed(2));
  document.getElementById('diceMult').textContent = 'x' + mult.toFixed(2);
}

let diceBusy = false;
// Називалась rollDice, але window.rollDice перевизначено на rollDiceFair нижче.
async function rollDiceClassic(dir) {
  if(diceBusy) return;
  const bet = validateBet(document.getElementById('diceBet').value);
  if(!bet) return;
  const target = parseInt(document.getElementById('diceSlider').value);
  diceBusy = true;
  let srv;
  try { srv = await serverPlay('dice', bet, { target, dir }); } finally { diceBusy = false; }
  if(srv.mode === 'error') return;
  let result, win, mult, winAmt;
  if(srv.mode === 'server') {
    // Ставку й виграш уже записав сервер одним атомарним записом.
    ({ result, win, mult } = srv.r);
    winAmt = srv.r.payout;
  } else {
    result = Math.floor(Math.random()*99)+1;
    win = (dir==='over') ? result > target : result < target;
    const chance = dir==='over' ? (99-target)/99 : (target-1)/99;
    mult = parseFloat((0.97/chance).toFixed(2));
    winAmt = Math.floor(bet * mult);
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  }
  addWager(bet);
  trackLbStat('wager', bet); trackLbStat('games', 1);
  publishLiveBet('Dice','🎲', bet, '');
  playSound('spin');

  const resEl = document.getElementById('diceResult');
  const histEl = document.getElementById('diceHistory');
  resEl.innerHTML = '';

  setTimeout(() => {
    if(win) {
      if(srv.mode !== 'server') db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(winAmt));
      playSound('win');
      resEl.innerHTML = `<span style="color:var(--green);font-weight:900;">🎲 ${result} — ВИГРАШ! +${formatNumber(winAmt)} ₴</span>`;
      notify('🎲 ' + result + ' → +' + formatNumber(winAmt) + '₴', 'success');
      addToHistory('Dice '+result+': +'+winAmt);
      if(winAmt >= 500) addToWinFeed('Dice', winAmt, mult);
    } else {
      playSound('loss');
      resEl.innerHTML = `<span style="color:var(--red);font-weight:900;">🎲 ${result} — Програш -${formatNumber(bet)} ₴</span>`;
      notify('🎲 ' + result + ' — Програш', 'error');
      addToHistory('Dice '+result+': -'+bet);
    }
    const dot = document.createElement('div');
    dot.className = 'dice-result-dot';
    dot.style.background = win ? 'var(--green)' : 'var(--red)';
    dot.textContent = result;
    histEl.insertBefore(dot, histEl.firstChild);
    if(histEl.children.length > 20) histEl.removeChild(histEl.lastChild);
  }, 600);
}

// ============================================================
// ===== DOUBLE GAME =====
// ============================================================
let doubleSpinning = false;
const DOUBLE_HISTORY = [];

async function betDouble(color) {
  if(doubleSpinning) return;
  const bet = validateBet(document.getElementById('doubleBet').value);
  if(!bet) return;
  doubleSpinning = true;
  const srv = await serverPlay('double', bet, { color });
  if(srv.mode === 'error') { doubleSpinning = false; return; }
  if(srv.mode !== 'server') db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  addWager(bet);
  playSound('spin');

  // Red: 46.5%, Black: 46.5%, Green: 7% — на сервері, якщо він налаштований
  const r = Math.random();
  const newPLuck2 = getNewPlayerLuck();
  const result = srv.mode === 'server' ? srv.r.result : newPLuck2
    ? (r < 0.48 ? 'red' : r < 0.96 ? 'black' : 'green')
    : (r < 0.465 ? 'red' : r < 0.93 ? 'black' : 'green');
  const mult = result === 'green' ? 14 : 2;
  const win = color === result;

  // Spin wheel animation
  const wheel = document.getElementById('doubleWheel');
  const spinAngle = 720 + Math.floor(Math.random()*360);
  wheel.style.transform = `rotate(${spinAngle}deg)`;

  setTimeout(() => {
    doubleSpinning = false;
    const resultEl = document.getElementById('doubleResult');
    const emoji = result==='red'?'🔴':result==='black'?'⚫':'🟢';
    const resColor = result==='red'?'#e74c3c':result==='black'?'#777':'#2ecc71';

    if(win) {
      const winAmt = srv.mode === 'server' ? srv.r.payout : Math.floor(bet * mult);
      if(srv.mode !== 'server') db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(winAmt));
      playSound(mult>=14 ? 'bonus' : 'win');
      resultEl.innerHTML = `<span style="color:${resColor}">${emoji} ${result.toUpperCase()} — +${formatNumber(winAmt)} ₴ (x${mult})</span>`;
      notify(emoji + ' ' + result + ' → +' + formatNumber(winAmt) + '₴', 'success');
      addToHistory('Double '+result+' x'+mult+': +'+winAmt);
      if(winAmt>=500) addToWinFeed('Double', winAmt, mult);
    } else {
      playSound('loss');
      resultEl.innerHTML = `<span style="color:${resColor}">${emoji} ${result.toUpperCase()} — Програш -${formatNumber(bet)} ₴</span>`;
      notify(emoji + ' ' + result + ' — Програш', 'error');
      addToHistory('Double '+result+': -'+bet);
    }

    // History
    DOUBLE_HISTORY.unshift(result);
    const histEl = document.getElementById('doubleHistory');
    if(histEl) {
      histEl.innerHTML = DOUBLE_HISTORY.slice(0,15).map(c =>
        '<div style="width:28px;height:28px;border-radius:50%;background:' +
        (c==='red'?'var(--neg)':c==='black'?'var(--info)':'var(--primary)') +
        ';display:flex;align-items:center;justify-content:center;font-size:12px;">' +
        (c==='red'?'🔴':c==='black'?'⚫':'🟢') + '</div>'
      ).join('');
    }
  }, 3000);
}

