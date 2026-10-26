// ============================================
// КЕНО
// ============================================
let kenoSelected = new Set();

function initKeno() {
  const g = document.getElementById('kenoGrid');
  if(!g || g.children.length > 0) return;
  g.innerHTML = '';
  for(let i=1; i<=40; i++) {
    const d = document.createElement('div');
    d.className = 'keno-num'; d.textContent = i; d.dataset.n = i;
    d.onclick = () => toggleKeno(i, d);
    g.appendChild(d);
  }
}

function toggleKeno(n, el) {
  if(kenoSelected.has(n)) { kenoSelected.delete(n); el.classList.remove('picked'); }
  else if(kenoSelected.size < 10) { kenoSelected.add(n); el.classList.add('picked'); }
  else { notify('Максимум 10 чисел', 'error'); return; }
  document.getElementById('kenoSelected').textContent = `Обрано: ${kenoSelected.size} / 10`;
}

function clearKeno() {
  kenoSelected.clear();
  document.querySelectorAll('.keno-num').forEach(el => el.classList.remove('picked','hit','miss'));
  document.getElementById('kenoSelected').textContent = 'Обрано: 0 / 10';
}

// Виплати Keno (20 кульок із 40) — та сама таблиця, що в lib/games.js.
// Стара була від Keno «20 із 80» і при 20 із 40 давала RTP 150–763%.
const KENO_PAY = {
  1: [0, 1.9], 2: [0, 0.5, 2.8], 3: [0, 0, 1, 5], 4: [0, 0, 0.4, 1.5, 8],
  5: [0, 0, 0.3, 0.8, 2.2, 10], 6: [0, 0, 0, 0.5, 1.2, 4, 16], 7: [0, 0, 0, 0.2, 0.7, 2, 6, 24],
  8: [0, 0, 0, 0.2, 0.4, 1, 3, 10, 40], 9: [0, 0, 0, 0, 0.3, 0.6, 1.5, 5, 16, 80],
  10: [0, 0, 0, 0, 0.1, 0.4, 1, 2.5, 7.5, 25, 125],
};
let kenoBusy = false;
async function playKeno() {
  if(kenoBusy) return;
  if(kenoSelected.size < 1) return notify('Оберіть хоча б 1 число', 'error');
  const b = validateBet(document.getElementById('betAmountKeno').value);
  if(!b) return;
  kenoBusy = true;
  let srv;
  try { srv = await serverPlay('keno', b, { picks: [...kenoSelected] }); } finally { kenoBusy = false; }
  if(srv.mode === 'error') return;

  let drawn;
  if(srv.mode === 'server') {
    drawn = new Set(srv.r.drawn);
  } else {
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
    // Тягнемо 20 чисел
    drawn = new Set();
    while(drawn.size < 20) drawn.add(Math.floor(Math.random()*40)+1);
  }

  const hits = [...kenoSelected].filter(n => drawn.has(n)).length;
  const total = kenoSelected.size;
  const mult = (KENO_PAY[total] || [0])[hits] || 0;
  const win = srv.mode === 'server' ? srv.r.payout : Math.floor(b * mult);

  // Показати результат
  document.querySelectorAll('.keno-num').forEach(el => {
    const n = parseInt(el.dataset.n);
    el.classList.remove('picked');
    if(drawn.has(n) && kenoSelected.has(n)) el.classList.add('hit');
    else if(drawn.has(n)) el.classList.add('miss');
  });

  document.getElementById('kenoSelected').innerHTML = `<b style="color:${win>0?'var(--green)':'var(--red)'}">Вгадано: ${hits}/${total} → ${win>0?'+'+win+' ₴':'Програш'}</b>`;

  if(win > 0) {
    if(srv.mode !== 'server') db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
    playSound('win'); notify(`🔢 Кено: +${win} ₴ (${hits} влучань)`, 'success');
    addToHistory(`Keno ${hits}/${total}: +${win}`);
  } else { addToHistory(`Keno ${hits}/${total}: -${b}`); }

  kenoSelected.clear();
}

// ============================================
// СКРЕТЧ-КАРТКА
// ============================================
let scratchRevealed = 0, scratchValues = [], scratchBetAmt = 0, scratchDone = false;
let scratchServerPaid = false; // виграш уже зарахував сервер при купівлі

async function buyScratch() {
  const btn = document.getElementById('scratchBuyBtn');
  if(btn && btn.disabled) return;  // запобігаємо подвійному кліку
  if(btn) btn.disabled = true;
  const b = validateBet(document.getElementById('betAmountScratch').value);
  if(!b) { if(btn) btn.disabled = false; return; }
  const srv = await serverPlay('scratch', b, {});
  if(srv.mode === 'error') { if(btn) btn.disabled = false; return; }
  scratchBetAmt = b;
  scratchServerPaid = srv.mode === 'server';
  if(!scratchServerPaid) db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
  if(btn) btn.classList.add('hidden');
  if(btn) btn.disabled = false;
  scratchRevealed = 0; scratchDone = false;
  const symbols = ['💰','💎','7️','🍒','🔔','⭐','🍋','🎯','🃏','🎪'];
  scratchValues = [];
  let winSym = null;
  if(scratchServerPaid) {
    winSym = srv.r.symbol;
  } else {
    const r = Math.random();
    const luck = getNewPlayerLuck();
    const winChance = luck ? r * 0.4 : r; // lucky players have better odds
    // ⭐ 8,8% замість 10%: раніше RTP був рівно 100% (як у lib/games.js scratch).
    if(winChance < 0.02)       winSym = '💎';
    else if(winChance < 0.08)  winSym = '💰';
    else if(winChance < 0.168) winSym = '⭐';
  }
  // 82%+ → no winning combination

  if(winSym) {
    // Put exactly 3 of the winning symbol, rest are all different
    scratchValues.push(winSym, winSym, winSym);
    const others = symbols.filter(s => s !== winSym);
    others.sort(() => Math.random()-0.5);
    for(let i=0; i<6; i++) scratchValues.push(others[i % others.length]);
  } else {
    // Guaranteed no 3-in-a-row: pick 9 symbols ensuring no sym appears 3+ times
    const pool = [...symbols, ...symbols].sort(() => Math.random()-0.5);
    const counts = {};
    for(let sym of pool) {
      if((counts[sym]||0) < 2) { scratchValues.push(sym); counts[sym]=(counts[sym]||0)+1; }
      if(scratchValues.length === 9) break;
    }
    while(scratchValues.length < 9) scratchValues.push(symbols[Math.floor(Math.random()*symbols.length)]);
  }
  scratchValues.sort(() => Math.random()-0.5);

  const grid = document.getElementById('scratchGrid');
  grid.innerHTML = '';
  document.getElementById('scratchResult').textContent = '';
  scratchValues.forEach((sym, i) => {
    const cell = document.createElement('div');
    cell.className = 'scratch-cell';
    cell.innerHTML = `<div class="scratch-overlay">Стерти</div><span style="opacity:0">${sym}</span>`;
    cell.onclick = () => revealScratch(i, cell, sym);
    grid.appendChild(cell);
  });
  playSound('click');
}

function revealScratch(idx, cell, sym) {
  if(scratchDone || cell.classList.contains('scratched')) return;
  cell.classList.add('scratched');
  cell.innerHTML = sym;
  scratchRevealed++;
  playSound('click');
  if(scratchRevealed >= 9) finishScratch();
}

function finishScratch() {
  scratchDone = true;
  const counts = {};
  scratchValues.forEach(s => counts[s] = (counts[s]||0)+1);
  const best = Object.entries(counts).find(([,v]) => v >= 3);
  let win = 0, msg = '';
  if(best) {
    const mults = {'💎': 20, '💰': 5, '⭐': 3};
    const mult = mults[best[0]] || 2;
    win = Math.floor(scratchBetAmt * mult);
    msg = `🎉 Три ${best[0]}! Виграш: +${win} ₴`;
  } else { msg = '😔 Немає трьох однакових'; }

  document.getElementById('scratchResult').innerHTML = `<b style="color:${win>0?'var(--green)':'var(--fg-3)'}">${msg}</b>`;
  if(win > 0) {
    if(!scratchServerPaid) db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
    playSound('win'); addToHistory(`Scratch: +${win}`);
  } else { addToHistory(`Scratch: -${scratchBetAmt}`); }
  setTimeout(() => document.getElementById('scratchBuyBtn').classList.remove('hidden'), 1500);
}

// ============================================
// КОЛЕСО ФОРТУНИ
// ============================================
// FORTUNE WHEEL: 24 сегменти — більшість програшні/мінімальні
const FORTUNE_SEGMENTS = [
  {label:'x0',    mult:0,    color:'#1a0202'},
  {label:'x0.2',  mult:0.2,  color:'#1a1a1a'},
  {label:'x0',    mult:0,    color:'#0d0d0d'},
  {label:'x0.5',  mult:0.5,  color:'#252525'},
  {label:'x0',    mult:0,    color:'#1a0202'},
  {label:'x1',    mult:1,    color:'#1a3060'},
  {label:'x0',    mult:0,    color:'#0d0d0d'},
  {label:'x0.2',  mult:0.2,  color:'#1a1a1a'},
  {label:'x0',    mult:0,    color:'#1a0202'},
  {label:'x0.5',  mult:0.5,  color:'#252525'},
  {label:'x0',    mult:0,    color:'#0d0d0d'},
  {label:'x2',    mult:2,    color:'#1a4020'},
  {label:'x0',    mult:0,    color:'#1a0202'},
  {label:'x0.2',  mult:0.2,  color:'#1a1a1a'},
  {label:'x0',    mult:0,    color:'#0d0d0d'},
  {label:'x0.5',  mult:0.5,  color:'#252525'},
  {label:'x0',    mult:0,    color:'#1a0202'},
  {label:'x3',    mult:3,    color:'#3a1060'},
  {label:'x0',    mult:0,    color:'#0d0d0d'},
  {label:'x0.2',  mult:0.2,  color:'#1a1a1a'},
  {label:'x0',    mult:0,    color:'#1a0202'},
  {label:'x5',    mult:5,    color:'#5c3a00'},
  {label:'x0.2',  mult:0.2,  color:'#1a1a1a'},
  {label:'x10🎉', mult:10,   color:'#4a0080'},
];
// Шанс виграшу: ~21% (5 з 24 сегментів > x0.5), решта програш/дуже мало
let fortuneRotation = 0, fortuneSpinning = false;

function drawFortuneWheel(rotation=0) {
  const canvas = document.getElementById('fortuneCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 130, cy = 130, r = 124;
  const seg = FORTUNE_SEGMENTS.length;
  const arc = (2 * Math.PI) / seg;
  ctx.clearRect(0,0,260,260);
  FORTUNE_SEGMENTS.forEach((s, i) => {
    const startAngle = rotation + i * arc;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + arc);
    ctx.closePath(); ctx.fillStyle = s.color; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); ctx.translate(cx, cy);
    ctx.rotate(startAngle + arc/2);
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(s.label, r - 8, 4);
    ctx.restore();
  });
}


// ============================================================
// LUCKY STREAK — перші 3 гри нового гравця
// ============================================================
function getNewPlayerLuck() {
  const left = userData.luckyGamesLeft || 0;
  return left > 0;
}
function consumeLuckyGame() {
  if(!getNewPlayerLuck()) return;
  const left = Math.max(0, (userData.luckyGamesLeft||0) - 1);
  const used  = (userData.luckyGamesUsed||0) + 1;
  db.ref('users/'+currentUser).update({ luckyGamesLeft: left, luckyGamesUsed: used });
  if(left === 0) {
    setTimeout(()=> notify('🎮 Везіння закінчилось — удачі у грі!','info'), 500);
  } else {
    notify(`🍀 Везіння: ще ${left} удачлив${left===1?'а':'і'} гр${left===1?'а':'и'}!`, 'info');
  }
}

async function spinFortune() {
  if(fortuneSpinning) return;
  const b = validateBet(document.getElementById('betAmountFortune').value);
  if(!b) return;
  fortuneSpinning = true;
  const srv = await serverPlay('fortune', b, {});
  if(srv.mode === 'error') { fortuneSpinning = false; return; }
  if(srv.mode !== 'server') db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
  addWager(b);
  trackLbStat('wager', b); trackLbStat('games', 1);
  publishLiveBet('Колесо','🎡', b, '');
  fortuneSpinning = true;
  document.getElementById('fortuneBtn').disabled = true;
  playSound('spin');

  const seg = FORTUNE_SEGMENTS.length;
  const arc = (2 * Math.PI) / seg;
  const winIdx = srv.mode === 'server' ? srv.r.segment : Math.floor(Math.random() * seg);

  // Pointer (▼) is at TOP of wheel = angle -π/2 in canvas coordinates.
  // Segment i is drawn from angle (rotation + i*arc) to (rotation + (i+1)*arc).
  // For pointer to land in center of segment winIdx:
  //   rotation_final + winIdx*arc + arc/2 = -π/2  (mod 2π)
  //   rotation_final = -π/2 - winIdx*arc - arc/2
  const neededRot = -Math.PI/2 - winIdx * arc - arc/2;

  // How many radians to rotate forward from current position
  let diff = ((neededRot - fortuneRotation) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI);
  if(diff < 0.3) diff += 2 * Math.PI; // at least one full segment

  const totalRotation = fortuneRotation + 5 * 2 * Math.PI + diff;
  const steps = 120, duration = 4500;
  let step = 0;
  const startRot = fortuneRotation;

  const anim = setInterval(() => {
    step++;
    const progress = step / steps;
    const ease = 1 - Math.pow(1 - progress, 4);
    const current = startRot + (totalRotation - startRot) * ease;
    drawFortuneWheel(current);
    if(step >= steps) {
      clearInterval(anim);
      // Store exact final angle for next spin
      fortuneRotation = ((neededRot % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
      drawFortuneWheel(fortuneRotation);

      const won = FORTUNE_SEGMENTS[winIdx];
      const win = srv.mode === 'server' ? srv.r.payout : Math.floor(b * won.mult);
      document.getElementById('fortuneResult').innerHTML =
        `<span style="color:${win>0?'var(--green)':'var(--red)'}">${won.label} → ${win > 0 ? '+'+formatNumber(win)+' ₴' : '0 ₴'}</span>`;
      if(win > 0) {
        consumeLuckyGame();
        if(srv.mode !== 'server') db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
        playSound(won.mult >= 10 ? 'bonus' : 'win');
        if(won.mult >= 10) notify('🎉 ВЕЛИКИЙ ВИГРАШ: +'+formatNumber(win)+' ₴!', 'success');
        else notify('🎡 '+won.label+': +'+formatNumber(win)+' ₴', 'success');
        addToHistory('Fortune '+won.label+': +'+win);
        if(win >= 500) addToWinFeed('Fortune', win, won.mult);
      } else {
        playSound('loss');
        addToHistory('Fortune '+won.label+': -'+b);
      }
      fortuneSpinning = false;
      document.getElementById('fortuneBtn').disabled = false;
    }
  }, duration/steps);
}

