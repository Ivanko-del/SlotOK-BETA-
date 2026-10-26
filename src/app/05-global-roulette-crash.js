// ╔══════════════════════════════════════════════════════════════╗
// ║              🎡  GLOBAL ROULETTE  —  v58                   ║
// ║  Спін раз на годину, всі гравці разом, Firebase-синхронізація║
// ╚══════════════════════════════════════════════════════════════╝
const GR_MIN = 5000;
const GR_MAX = 100000000;
const GR_HOUR_MS = 60 * 60 * 1000; // 1 година
let grSelectedColor = null;
let grCurrentRoundId = null;
let grRoundListener = null;
let grTimerInterval = null;
let grWheelDrawn = false;
let grTotalDeg = 0; // накопичений кут колеса

// Колірна схема колеса (36 секторів + 1 зелений, як европейська рулетка)
// Порядок: 0(green), 32(red),15(black),19(red),4(black),21(red),2(black),25(red),
//          17(black),34(red),6(black),27(red),13(black),36(red),11(black),30(red),
//          8(black),23(red),10(black),5(red),24(black),16(red),33(black),1(red),
//          20(black),14(red),31(black),9(red),22(black),18(red),29(black),7(red),
//          28(black),12(red),35(black),3(red),26(black)
const GR_WHEEL_NUMS = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const GR_WHEEL_COLORS = n => n===0 ? 'green' : [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n) ? 'red' : 'black';

// Малюємо Canvas-колесо
function grDrawWheel() {
  const canvas = document.getElementById('grWheelCanvas');
  if(!canvas) return;
  const size = canvas.parentElement.offsetWidth || 300;
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size/2, cy = size/2, r = size/2;
  const total = GR_WHEEL_NUMS.length;
  const segAngle = (2 * Math.PI) / total;

  GR_WHEEL_NUMS.forEach((num, i) => {
    const startA = i * segAngle - Math.PI/2;
    const endA   = startA + segAngle;
    const col = GR_WHEEL_COLORS(num);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r - 2, startA, endA);
    ctx.closePath();
    ctx.fillStyle = col === 'green' ? '#1a8a3a' : col === 'red' ? '#b91c1c' : '#1a1a1a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,55,.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r - 2, startA, endA);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(212,175,55,.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(startA + segAngle/2);
    ctx.textAlign = 'right';
    ctx.fillStyle = col === 'green' ? '#fff' : '#f0e0c0';
    ctx.font = `bold ${Math.max(9, size/30)}px Arial`;
    ctx.fillText(num, r - 8, 4);
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, 2*Math.PI);
  ctx.strokeStyle = 'rgba(212,175,55,.6)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, 2*Math.PI);
  ctx.fillStyle = '#08060e';
  ctx.fill();
  ctx.strokeStyle = 'rgba(212,175,55,.4)';
  ctx.lineWidth = 3;
  ctx.stroke();

  grWheelDrawn = true;
}

// Розрахунок поточного раунду (epoch-based)
function grGetCurrentRound() {
  const epoch = Math.floor(Date.now() / GR_HOUR_MS);
  return `round_${epoch}`;
}

function grGetRoundStart() {
  return Math.floor(Date.now() / GR_HOUR_MS) * GR_HOUR_MS;
}

function grGetRoundEnd() {
  return grGetRoundStart() + GR_HOUR_MS;
}

// Ініціалізація глобальної рулетки
function initGlobalRoulette() {
  setTimeout(() => { grDrawWheel(); }, 100);
  grCurrentRoundId = grGetCurrentRound();
  grStartTimer();
  grListenRound();
  grLoadHistory();
}

// Таймер зворотного відліку
function grStartTimer() {
  if(grTimerInterval) clearInterval(grTimerInterval);
  grTimerInterval = setInterval(() => {
    const now = Date.now();
    const end = grGetRoundEnd();
    const remaining = end - now;
    const total = GR_HOUR_MS;

    // Перевіряємо чи не змінився раунд
    const newRoundId = grGetCurrentRound();
    if(newRoundId !== grCurrentRoundId) {
      grCurrentRoundId = newRoundId;
      grListenRound();
      grLoadHistory();
    }

    if(remaining <= 0) {
      document.getElementById('grTimerDisplay') && (document.getElementById('grTimerDisplay').textContent = '00:00');
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const timeStr = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    const timerEl = document.getElementById('grTimerDisplay');
    if(timerEl) timerEl.textContent = timeStr;

    const pct = (remaining / total) * 100;
    const barEl = document.getElementById('grTimerBar');
    if(barEl) barEl.style.width = pct + '%';

    if(remaining < 60000) {
      if(timerEl) timerEl.style.color = 'var(--red)';
      const statusEl = document.getElementById('grSpinStatus');
      if(statusEl) statusEl.textContent = '🔴 Спін незабаром! Ставки закриваються!';
    } else if(remaining < 300000) {
      if(timerEl) timerEl.style.color = '#f39c12';
      const statusEl = document.getElementById('grSpinStatus');
      if(statusEl) statusEl.textContent = '⚠️ Залишилось менше 5 хвилин!';
    } else {
      if(timerEl) timerEl.style.color = 'var(--accent)';
      const statusEl = document.getElementById('grSpinStatus');
      if(statusEl) statusEl.textContent = '✅ Прийом ставок відкрито';
    }
  }, 1000);
}

// Firebase-слухач поточного раунду
function grListenRound() {
  if(grRoundListener) db.ref('global_roulette/rounds/'+grCurrentRoundId).off();
  const ref = db.ref('global_roulette/rounds/' + grCurrentRoundId);
  let isFirstSnapshot = true;
  grRoundListener = ref.on('value', snap => {
    const round = snap.val() || {};
    grRenderBets(round.bets || {});
    grRenderMyBet(round.bets || {});
    // Якщо раунд вже завершений — показати результат.
    // Анімуємо тільки коли результат приходить "наживо" (не при відкритті вкладки на вже завершеному раунді).
    if(round.result) grShowResult(round.result, round.bets || {}, !isFirstSnapshot);
    isFirstSnapshot = false;
  });
}

function selectGrColor(color) {
  grSelectedColor = color;
  ['red','green','black'].forEach(c => {
    const btn = document.getElementById('gr-btn-'+c);
    if(!btn) return;
    const isSelected = c === color;
    btn.style.transform = isSelected ? 'scale(1.05)' : 'scale(1)';
    if(c === 'red')  btn.style.border = isSelected ? '2px solid #f04060' : '2px solid rgba(180,40,40,.4)';
    if(c === 'green') btn.style.border = isSelected ? '2px solid var(--green)' : '2px solid rgba(40,160,60,.3)';
    if(c === 'black') btn.style.border = isSelected ? '2px solid #aaa' : '2px solid rgba(120,120,120,.2)';
    btn.style.boxShadow = isSelected ? `0 0 20px ${c==='red'?'rgba(240,64,96,.4)':c==='green'?'rgba(61,214,140,.3)':'rgba(180,180,180,.2)'}` : 'none';
  });
  playSound('click');
}

function setGrBet(n) {
  const inp = document.getElementById('grBetAmount');
  if(inp) inp.value = n;
}

function placeGrBet() {
  if(!currentUser) return notify('Увійди в акаунт', 'error');
  if(!grSelectedColor) return notify('Оберіть колір: 🔴 🟢 ⚫', 'error');
  const amt = parseInt(document.getElementById('grBetAmount').value);
  if(!amt || amt < GR_MIN) return notify(`Мінімальна ставка ₴${formatNumber(GR_MIN)}`, 'error');
  if(amt > GR_MAX) return notify(`Максимальна ставка ₴${formatNumber(GR_MAX)}`, 'error');
  if((userData.balance||0) < amt) return notify('Недостатньо коштів', 'error');

  // Перевіряємо чи є вже ставка в цьому раунді
  db.ref('global_roulette/rounds/'+grCurrentRoundId+'/bets/'+currentUser).once('value', snap => {
    if(snap.val()) return notify('Ти вже зробив ставку в цьому раунді!', 'error');

    // Перевіряємо чи є ще час (мінімум 10 сек)
    if(grGetRoundEnd() - Date.now() < 10000) return notify('Ставки закрито! Чекай наступного раунду.', 'error');

    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-amt));
    addWager(amt);
    const bet = { user: currentUser, color: grSelectedColor, amount: amt, ts: Date.now() };
    db.ref('global_roulette/rounds/'+grCurrentRoundId+'/bets/'+currentUser).set(bet).then(() => {
      notify(`🎡 Ставку ${formatNumber(amt)}₴ на ${grSelectedColor==='red'?'🔴 Червоне':grSelectedColor==='green'?'🟢 Зелене':'⚫ Чорне'} прийнято!`, 'success');
      playSound('click');
      db.ref('global_roulette/rounds/'+grCurrentRoundId+'/totalBank').set(firebase.database.ServerValue.increment(amt));
      db.ref('global_roulette/rounds/'+grCurrentRoundId+'/betCount').set(firebase.database.ServerValue.increment(1));
      trackQuest('rouletteBets', 1);
      trackQuest('totalGames', 1);
      trackQuest('weekWager', amt);
      db.ref('users/'+currentUser+'/rouletteBets').set(firebase.database.ServerValue.increment(1));
      trackLbStat('wager', amt); trackLbStat('games', 1);
      publishLiveBet('Global Roulette','🎡', amt, grSelectedColor==='red'?'🔴':grSelectedColor==='green'?'🟢':'⚫');
      grMaybeScheduleSpin();
    });
  });
}

// Рендер ставок всіх гравців
function grRenderBets(bets) {
  const el = document.getElementById('grAllBets'); if(!el) return;
  const list = Object.values(bets);
  const countEl = document.getElementById('grBetCount');
  const bankEl  = document.getElementById('grBankDisplay');
  if(countEl) countEl.textContent = list.length;
  const totalBank = list.reduce((s, b) => s + (b.amount||0), 0);
  if(bankEl) bankEl.textContent = '₴' + formatNumber(totalBank);

  if(!list.length) { el.innerHTML = '<div style="text-align:center;color:var(--sub);font-size:13px;padding:16px;">Перший в цьому раунді!</div>'; return; }
  const sorted = [...list].sort((a,b) => b.amount - a.amount);
  el.innerHTML = sorted.map(b => {
    const colorEmoji = b.color==='red'?'🔴':b.color==='green'?'🟢':'⚫';
    const colorName = b.color==='red'?'Червоне':b.color==='green'?'Зелене':'Чорне';
    const mult = b.color==='green' ? 14 : 2;
    const isMe = b.user === currentUser;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;margin-bottom:6px;
      background:${isMe?'rgba(212,175,55,.08)':'var(--box)'};
      border:1px solid ${isMe?'rgba(212,175,55,.3)':'var(--border)'};
      border-radius:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--input);display:flex;align-items:center;justify-content:center;font-size:16px;">${colorEmoji}</div>
        <div>
          <div style="font-size:13px;font-weight:700;">${escapeHtml(b.user)}${isMe?' <span style="color:var(--accent);font-size:10px;">(Ти)</span>':''}</div>
          <div style="font-size:11px;color:var(--sub);">${colorName} · ×${mult}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:14px;font-weight:800;color:var(--accent);">₴${formatNumber(b.amount)}</div>
        <div style="font-size:10px;color:var(--sub);">→ ₴${formatNumber(b.amount * mult)}</div>
      </div>
    </div>`;
  }).join('');
}

// Мій статус ставки
function grRenderMyBet(bets) {
  const el = document.getElementById('grMyBetStatus'); if(!el) return;
  const myBet = bets[currentUser];
  if(!myBet) {
    el.innerHTML = '<span style="color:var(--sub);">Ставку не зроблено</span>';
    const btn = document.getElementById('grBetBtn');
    if(btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '🎡 ЗРОБИТИ СТАВКУ'; }
    return;
  }
  const colorEmoji = myBet.color==='red'?'🔴':myBet.color==='green'?'🟢':'⚫';
  const colorName = myBet.color==='red'?'Червоне':myBet.color==='green'?'Зелене':'Чорне';
  const mult = myBet.color==='green' ? 14 : 2;
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div style="text-align:left;">
        <div style="font-size:16px;font-weight:800;">${colorEmoji} ${colorName}</div>
        <div style="font-size:12px;color:var(--sub);margin-top:2px;">Потенційний виграш</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:18px;font-weight:900;color:var(--accent);">₴${formatNumber(myBet.amount)}</div>
        <div style="font-size:13px;color:var(--green);">→ ₴${formatNumber(myBet.amount * mult)}</div>
      </div>
    </div>`;
  const btn = document.getElementById('grBetBtn');
  if(btn) { btn.disabled = true; btn.style.opacity = '0.45'; btn.textContent = '✅ Ставку зроблено'; }
}

// Планувальник спіну — кожен клієнт стежить за Firebase
// Адміністратор (або перший хто зайшов) виконує spin коли час настав
function grMaybeScheduleSpin() {
  const timeToSpin = grGetRoundEnd() - Date.now();
  if(timeToSpin <= 0) { grExecuteSpin(); return; }
  setTimeout(() => {
    // Перевіряємо чи ще не розрахований цей раунд
    db.ref('global_roulette/rounds/'+grCurrentRoundId+'/result').once('value', snap => {
      if(!snap.val()) grExecuteSpin();
    });
  }, timeToSpin + 500);
}

// Виконати спін — тільки один клієнт повинен це зробити
// Використовуємо Firebase transaction для атомарності
function grExecuteSpin() {
  const roundRef = db.ref('global_roulette/rounds/'+grCurrentRoundId);
  roundRef.child('spinLock').transaction(current => {
    if(current) return; // вже хтось інший крутить
    return Date.now();
  }, (err, committed) => {
    if(!committed) return; // не наш раунд крутити
    // Генеруємо результат
    const idx = Math.floor(Math.random() * GR_WHEEL_NUMS.length);
    const winNum = GR_WHEEL_NUMS[idx];
    const winColor = GR_WHEEL_COLORS(winNum);
    const spinResult = { number: winNum, color: winColor, idx, ts: Date.now() };
    roundRef.child('result').set(spinResult);
    roundRef.child('bets').once('value', bSnap => {
      const bets = bSnap.val() || {};
      Object.values(bets).forEach(bet => {
        if(bet.color === winColor) {
          const mult = winColor === 'green' ? 14 : 2;
          const payout = Math.floor(bet.amount * mult);
          db.ref('users/'+bet.user+'/balance').set(firebase.database.ServerValue.increment(payout));
        }
      });
    });
    db.ref('global_roulette/history').push(spinResult);
  });
}

// Анімація колеса та відображення результату
function grShowResult(result, bets, animated) {
  if(!result || grShowResult._shown === grCurrentRoundId) return;
  grShowResult._shown = grCurrentRoundId;

  const wheelEl = document.getElementById('grWheel');
  if(wheelEl && result.idx !== undefined) {
    const segAngle = 360 / GR_WHEEL_NUMS.length;
    // Обертаємо так, щоб сектор result.idx потрапив на стрілку (вгорі)
    const targetAngle = 360 - (result.idx * segAngle + segAngle/2);
    const spins = 5 + Math.floor(Math.random()*3);
    const totalRot = spins * 360 + targetAngle;
    grTotalDeg += totalRot;
    wheelEl.style.transition = animated!==false ? 'transform 8s cubic-bezier(.17,.67,.12,.99)' : 'none';
    wheelEl.style.transform = `rotate(${grTotalDeg}deg)`;
  }

  const myBet = bets[currentUser];
  const colorEmoji = result.color==='red'?'🔴':result.color==='green'?'🟢':'⚫';
  const colorName  = result.color==='red'?'Червоне':result.color==='green'?'Зелене':'Чорне';

  setTimeout(() => {
    if(myBet) {
      const won = myBet.color === result.color;
      const mult = result.color==='green' ? 14 : 2;
      const payout = won ? Math.floor(myBet.amount * mult) : 0;
      if(won) {
        playSound('bonus');
        notify(`🎡 ${colorEmoji} ${result.number} — ВИГРАШ +₴${formatNumber(payout)}!`, 'success');
        if(payout>=1000) triggerWinReaction(payout, 'Global Roulette');
        if(payout>=10000) addToWinFeed('Global Roulette', payout, mult);
        addToHistory(`Global Roulette: +${payout}`);
      } else {
        playSound('loss');
        notify(`🎡 ${colorEmoji} ${result.number} — Програш -₴${formatNumber(myBet.amount)}`, 'error');
      }
    }

    // Оновлюємо UI кнопки ставки для нового раунду
    const btn = document.getElementById('grBetBtn');
    if(btn) { btn.disabled = false; btn.style.opacity='1'; btn.textContent='🎡 ЗРОБИТИ СТАВКУ'; }
    const myStatusEl = document.getElementById('grMyBetStatus');
    if(myStatusEl) myStatusEl.innerHTML = '<span style="color:var(--sub);">Новий раунд! Роби ставку.</span>';
  }, animated !== false ? 8500 : 500);
}

// Завантаження останніх спінів
function grLoadHistory() {
  db.ref('global_roulette/history').limitToLast(15).once('value', snap => {
    const hist = snap.val();
    const el = document.getElementById('grHistory'); if(!el) return;
    if(!hist) { el.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:8px;">Немає спінів</div>'; return; }
    const items = Object.values(hist).reverse();
    el.innerHTML = items.map(h => {
      const col = h.color==='red'?'#b91c1c':h.color==='green'?'#1a8a3a':'#1a1a1a';
      const border = h.color==='red'?'#f04060':h.color==='green'?'#3dd68c':'#555';
      return `<div style="flex-shrink:0;width:44px;height:44px;border-radius:50%;background:${col};border:2px solid ${border};
        display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#fff;
        box-shadow:0 2px 8px rgba(0,0,0,.4);">${h.number}</div>`;
    }).join('');
  });
}

// Підписуємось на нові результати з Firebase для ВСІХ гравців
function grListenForResults() {
  db.ref('global_roulette/history').limitToLast(1).on('child_added', snap => {
    const r = snap.val(); if(!r) return;
    // Оновлюємо анімацію колеса для всіх хто онлайн
    const colorEmoji = r.color==='red'?'🔴':r.color==='green'?'🟢':'⚫';
    if(document.getElementById('grTimerDisplay')) {
      // Перезавантажуємо ставки нового раунду
      setTimeout(() => {
        grCurrentRoundId = grGetCurrentRound();
        grListenRound();
        grLoadHistory();
      }, 9000);
    }
  });
}

// Планувальник для поточної сесії
function grScheduleNextSpin() {
  const ms = grGetRoundEnd() - Date.now() + 500;
  setTimeout(() => {
    db.ref('global_roulette/rounds/'+grCurrentRoundId+'/result').once('value', snap => {
      if(!snap.val()) grExecuteSpin();
    });
  }, ms);
}

// Публічний ініціалізатор (викликається при switchTab('roulette'))
window.initGlobalRoulette = initGlobalRoulette;

// --- Сундуки ---
async function startChests(){ 
    const b = validateBet(document.getElementById('betAmountChests').value); 
    if(!b) return; 
    // Із сервером ставка списується при відкритті скрині (api/play «chests»).
    const serverMode = await serverAuthEnabled();
    if(!serverMode) db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
    const g = document.getElementById('chestsGrid'); 
    g.innerHTML = ""; 
    for(let i=0; i<3; i++){ 
        const d = document.createElement('div'); 
        d.className = "chest-item"; 
        d.textContent = "📦"; 
        d.onclick = async () => { 
            if(g.dataset.busy) return;
            let w;
            if(serverMode) {
                g.dataset.busy = '1';
                let srv;
                try { srv = await serverPlay('chests', b, {}); } finally { delete g.dataset.busy; }
                if(srv.mode === 'error') return;
                w = srv.mode === 'server' ? srv.r.payout : 0;
                Array.from(g.children).forEach(c => c.onclick = null);
                d.textContent = w ? "💰" : "💨";
                if(w){ playSound('win'); notify(`+${w} ₴`, "success"); addToHistory(`Chests: +${w}`); } else { playSound('click'); }
                return;
            }
            // 40% × 2.4 = 96% (було × 2.5 = рівно 100%, без переваги закладу)
            w = Math.random() > 0.6 ? Math.floor(b*2.4) : 0; 
            d.textContent = w ? "💰" : "💨"; 
            if(w){ db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(w)); playSound('win'); notify(`+${w} ₴`, "success"); addToHistory(`Chests: +${w}`); } 
            else { playSound('click'); }
            Array.from(g.children).forEach(c => c.onclick = null);
        }; 
        g.appendChild(d); 
    }
}

// --- Краш ---
let crashInt; let isCrashPlaying = false; let crashActiveBet = 0;
// ── Crash на сервері (api/round.js) ──
// Точку вибуху знає лише сервер; множник він рахує за своїм годинником.
// Клієнт анімує той самий ріст (100 мс на тік) і раз на ~0.7 с питає «ще летить?».
// Окремі прапорці: клік «Забрати» не має губитись, поки йде фоновий poll.
let crashServer = false, crashPollInt = null, crashBusy = false, crashPolling = false, crashCashing = false;
function crashStopTimers() {
    if(crashInt) { clearInterval(crashInt); crashInt = null; }
    if(crashPollInt) { clearInterval(crashPollInt); crashPollInt = null; }
}
function crashLostUI(point) {
    crashStopTimers();
    isCrashPlaying = false;
    const shown = point ? Number(point).toFixed(2) : document.getElementById('crashDisplay').textContent.replace('x','');
    document.getElementById('crashDisplay').textContent = shown + 'x';
    notify("💥 КРАШ на " + shown + "x!", "error");
    updateStreak(false); trackSession(false, crashActiveBet);
    document.getElementById('crashDisplay').style.color = "red";
    setTimeout(()=> { document.getElementById('crashDisplay').style.color = "white"; document.getElementById('crashDisplay').textContent = "1.00x"; }, 2000);
    document.getElementById('crashBtn').classList.remove('hidden');
    document.getElementById('crashCashoutBtn').classList.add('hidden');
}
function crashWonUI(w, mult) {
    crashStopTimers();
    isCrashPlaying = false;
    const b = crashActiveBet;
    document.getElementById('crashDisplay').textContent = Number(mult).toFixed(2) + 'x';
    trackQuest('crashCashouts', 1);
    trackLbStat('wins', w); trackLbStat('profit', w - b);
    notify(`🚀 Виведено: +${w} ₴`, "success");
    addToHistory(`Crash: +${w} (x${mult})`);
    updateStreak(true); trackSession(true, b); recordBalanceHistory();
    document.getElementById('crashBtn').classList.remove('hidden');
    document.getElementById('crashCashoutBtn').classList.add('hidden');
}
function crashHandleServer(r) {
    if(r.status === 'lost') return crashLostUI(r.view && r.view.point);
    if(r.status === 'done') return crashWonUI(r.payout, r.mult);
}
async function crashPollServer() {
    if(!isCrashPlaying || crashPolling || crashCashing) return;
    crashPolling = true;
    let srv;
    try { srv = await serverRound('move', 'crash', { move: { poll: true } }); } finally { crashPolling = false; }
    // Поки йде кешаут, відповідь poll ігноруємо — результат покаже сам кешаут.
    if(!isCrashPlaying || crashCashing) return;
    if(srv.mode === 'server') crashHandleServer(srv.r);
    else if(srv.status === 409) crashLostUI();
}
async function startCrashServer(b) {
    const autoCashoutTarget = parseFloat(document.getElementById('crashAutoCashout')?.value)||0;
    crashBusy = true;
    let srv;
    try { srv = await serverRound('start', 'crash', { bet: b, params: { auto: autoCashoutTarget > 1 ? autoCashoutTarget : 0 } }); } finally { crashBusy = false; }
    if(srv.mode !== 'server') return;
    crashServer = true;
    crashActiveBet = b;
    addWager(b);
    trackQuest('totalGames', 1);
    trackQuest('weekWager', b);
    trackLbStat('wager', b); trackLbStat('games', 1);
    publishLiveBet('Краш','🚀', b, '');
    document.getElementById('crashBtn').classList.add('hidden');
    document.getElementById('crashCashoutBtn').classList.remove('hidden');
    if(autoCashoutTarget > 1) document.getElementById('crashAutoLabel').textContent = autoCashoutTarget+'x';
    isCrashPlaying = true;
    let m = 1.00;
    crashInt = setInterval(() => {
        m += 0.03 + (m * 0.002);
        document.getElementById('crashDisplay').textContent = m.toFixed(2) + 'x';
        // Автокешаут рахує сервер; тут лише одразу питаємо, щоб показати результат.
        if(autoCashoutTarget > 1 && m >= autoCashoutTarget) crashPollServer();
    }, 100);
    crashPollInt = setInterval(crashPollServer, 700);
}

async function startCrash() {
    if(isCrashPlaying || crashBusy) return;
    if(await serverAuthEnabled()) {
        const b = validateBet(document.getElementById('betAmountCrash').value);
        if(!b) return;
        return startCrashServer(b);
    }
    crashServer = false;
    return startCrashLegacy();
}
function startCrashLegacy() {
    // Без цього захисту швидкий повторний клік по "Старт" міг запустити ще один
    // setInterval поверх активного раунду: старий крашInt губився (перезаписувався
    // цим глобальним "crashInt"), лишався жити вічно й нескінченно накручував
    // множник у DOM — наступний "Забрати" читав це шалене число й нараховував
    // величезну виплату. Простий guard на вхід прибирає весь клас багу.
    if(isCrashPlaying) return;
    const b = validateBet(document.getElementById('betAmountCrash').value);
    if(!b) return;
    if(crashInt) { clearInterval(crashInt); crashInt = null; }
    crashActiveBet = b;  // зберігаємо ставку — не читаємо input під час гри
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
    addWager(b);
    trackQuest('totalGames', 1);
    trackQuest('weekWager', b);
    trackLbStat('wager', b); trackLbStat('games', 1);
    publishLiveBet('Краш','🚀', b, '');
    document.getElementById('crashBtn').classList.add('hidden'); 
    document.getElementById('crashCashoutBtn').classList.remove('hidden'); 
    let m = 1.00; 
    // crashPoint: переважно 1.0–2.5x, зрідка вище
    // 3% раундів — миттєвий краш на 1.00x (як у звичайних краш-іграх). Без
    // нього автокешаут на ~1.05x давав RTP трохи понад 100% — гарантований плюс.
    const instantCrash = Math.random() < 0.03;
    const crashRng = Math.random();
    const newPLuck = getNewPlayerLuck();
    let crashPoint;
    if(instantCrash && !newPLuck) { crashPoint = 1.0; }
    else if(newPLuck) { crashPoint = 1.3 + Math.random() * 5; }        // нові гравці: 1.3–6.3x
    else if(crashRng < 0.45) { crashPoint = 1 + Math.random() * 0.5; }  // 45%: краш 1.0–1.5x
    else if(crashRng < 0.75) { crashPoint = 1.5 + Math.random() * 1.5; }// 30%: 1.5–3.0x
    else if(crashRng < 0.92) { crashPoint = 3 + Math.random() * 4; }    // 17%: 3–7x
    else { crashPoint = 7 + Math.random() * 15; }                        // 8%: 7–22x
    isCrashPlaying = true; 
    const autoCashoutTarget = parseFloat(document.getElementById('crashAutoCashout')?.value)||0;
    if(autoCashoutTarget > 1) document.getElementById('crashAutoLabel').textContent = autoCashoutTarget+'x';
    crashInt = setInterval(() => { 
        m += 0.03 + (m * 0.002); 
        document.getElementById('crashDisplay').textContent = m.toFixed(2) + 'x'; 
        // Auto cashout
        if(autoCashoutTarget > 1 && m >= autoCashoutTarget && isCrashPlaying) {
          cashoutCrash(); return;
        }
        if(m >= crashPoint){
            clearInterval(crashInt); crashInt = null;
            isCrashPlaying = false;
            notify("💥 КРАШ на " + m.toFixed(2) + "x!", "error");
            updateStreak(false); trackSession(false, crashActiveBet);
            document.getElementById('crashDisplay').style.color = "red";
            setTimeout(()=> { document.getElementById('crashDisplay').style.color = "white"; document.getElementById('crashDisplay').textContent = "1.00x"; }, 2000);
            document.getElementById('crashBtn').classList.remove('hidden'); 
            document.getElementById('crashCashoutBtn').classList.add('hidden'); 
        } 
    }, 100); 
}

async function cashoutCrash() { 
    if(!isCrashPlaying) return;
    if(crashServer) {
        if(crashCashing) return;
        const claim = parseFloat(document.getElementById('crashDisplay').textContent);
        crashCashing = true;
        let srv;
        try { srv = await serverRound('cashout', 'crash', { claim }); } finally { crashCashing = false; }
        if(srv.mode === 'server') crashHandleServer(srv.r);
        else if(srv.status === 409) crashLostUI();
        return;
    }
    isCrashPlaying = false;  // скидаємо ОДРАЗУ щоб запобігти подвійному кліку
    clearInterval(crashInt); crashInt = null;
    const b = crashActiveBet;  // читаємо збережену ставку, не input
    const mult = parseFloat(document.getElementById('crashDisplay').textContent);
    const w = Math.floor(b * mult); 
    // ServerValue.increment — безпечно від race condition
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(w));
    trackQuest('crashCashouts', 1);
    trackLbStat('wins', w); trackLbStat('profit', w - b);
    notify(`🚀 Виведено: +${w} ₴`, "success"); 
    addToHistory(`Crash: +${w} (x${mult})`);
    updateStreak(true); trackSession(true, b); recordBalanceHistory();
    document.getElementById('crashBtn').classList.remove('hidden'); 
    document.getElementById('crashCashoutBtn').classList.add('hidden'); 
}

