// ═══════════════════════════════════════════
// AUTH SCREEN — particles + stats
// ═══════════════════════════════════════════

function initAuthCanvas() {
  const canvas = document.getElementById('authCanvas');
  if(!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const particles = Array.from({length:60}, () => ({
    x: Math.random()*canvas.width,
    y: Math.random()*canvas.height,
    r: Math.random()*2+.5,
    vx: (Math.random()-.5)*.3,
    vy: (Math.random()-.5)*.3,
    alpha: Math.random()*.6+.1,
    color: Math.random() > .6 ? '#d4af37' : '#ffffff'
  }));
  // Floating emojis
  const emojis = ['🎰','🃏','🎲','🎯','💎','🏆','🍀','⭐'];
  const floaters = Array.from({length:8}, (_, i) => ({
    emoji: emojis[i],
    x: Math.random()*canvas.width,
    y: Math.random()*canvas.height,
    vy: -.2 - Math.random()*.3,
    alpha: .12,
    size: 18+Math.random()*14
  }));
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // BG gradient
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.height*.8);
    grad.addColorStop(0, 'rgba(20,8,0,1)');
    grad.addColorStop(.5, 'rgba(8,3,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = grad; ctx.fillRect(0,0,canvas.width,canvas.height);
    // Particles
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if(p.x<0) p.x=canvas.width; if(p.x>canvas.width) p.x=0;
      if(p.y<0) p.y=canvas.height; if(p.y>canvas.height) p.y=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = p.color.replace(')', ','+p.alpha+')').replace('rgb','rgba');
      ctx.globalAlpha = p.alpha; ctx.fill(); ctx.globalAlpha=1;
    });
    // Floaters
    floaters.forEach(f => {
      f.y += f.vy; if(f.y < -30) { f.y = canvas.height+30; f.x=Math.random()*canvas.width; }
      ctx.font = f.size+'px serif'; ctx.globalAlpha = f.alpha;
      ctx.fillText(f.emoji, f.x, f.y); ctx.globalAlpha=1;
    });
    // Gold scan line
    const scanY = (Date.now()/30)%canvas.height;
    const scanGrad = ctx.createLinearGradient(0,scanY-20,0,scanY+20);
    scanGrad.addColorStop(0,'rgba(212,175,55,0)');
    scanGrad.addColorStop(.5,'rgba(212,175,55,.03)');
    scanGrad.addColorStop(1,'rgba(212,175,55,0)');
    ctx.fillStyle=scanGrad; ctx.fillRect(0,scanY-20,canvas.width,40);
    requestAnimationFrame(draw);
  }
  draw();
}

let _authJackpotListener = null;
function stopAuthStatsListeners() {
  if(_authJackpotListener) { db.ref('casino_stats/jackpot').off('value', _authJackpotListener); _authJackpotListener = null; }
  stopAuthCoins();
  stopAuthWinTicker();
}
function loadAuthStats() {
  // Екран входу бачить кожен анонімний відвідувач. Раніше тут качався весь
  // вузол users (з хешами паролів, історією, IP) лише щоб порахувати кількість
  // гравців. ?shallow=true повертає тільки ключі — кілобайти замість мегабайтів.
  fetch(firebaseConfig.databaseURL + '/users.json?shallow=true')
    .then(r => r.ok ? r.json() : {})
    .then(users => {
      const count = Object.keys(users || {}).length;
      const online = Math.max(1, Math.floor(count*0.12 + Math.random()*3));
      const el1 = document.getElementById('authStatPlayers');
      const el2 = document.getElementById('authStatOnline');
      if(el1) el1.textContent = count+'';
      if(el2) el2.textContent = online+'';
    }).catch(() => {});
  db.ref('casino_stats/totalWagered').once('value', snap => {
    const el3 = document.getElementById('authStatPaid');
    if(el3) el3.textContent = '₴'+formatNumber(Math.max(Number(snap.val())||0, 1500000));
  }, () => {});
  // Real jackpot
  if(_authJackpotListener) db.ref('casino_stats/jackpot').off('value', _authJackpotListener);
  _authJackpotListener = snap => {
    const j = snap.val() || 850000;
    const el = document.getElementById('authJackpot');
    if(el) el.textContent = '₴ ' + formatNumber(j);
  };
  db.ref('casino_stats/jackpot').on('value', _authJackpotListener);
  // Floating coins in bg
  initAuthCoins();
  // Live win ticker
  initAuthWinTicker();
  // Password strength listener
  const passInput = document.getElementById('regPass');
  if(passInput) passInput.addEventListener('input', e => {
    const v = e.target.value;
    let strength = 0;
    if(v.length >= 6) strength++;
    if(v.length >= 10) strength++;
    if(/[0-9]/.test(v)) strength++;
    if(/[!@#$%^&*]/.test(v)) strength++;
    const fill = document.getElementById('passStrengthFill');
    if(!fill) return;
    const colors = ['#e74c3c','#f39c12','#d4af37','#3dd68c'];
    fill.style.width = (strength*25)+'%';
    fill.style.background = colors[Math.max(0,strength-1)];
  });
}

let _authCoinsInterval = null;
function initAuthCoins() {
  const container = document.getElementById('authCoins');
  if(!container) return;
  if(_authCoinsInterval) clearInterval(_authCoinsInterval);
  const symbols = ['🪙','💎','🎰','⭐','🃏','🎲','🔔','🍒'];
  _authCoinsInterval = setInterval(() => {
    if(container.children.length > 14) return;
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${Math.random()*100}%;top:-30px;font-size:${16+Math.random()*14}px;animation:coinRain ${5+Math.random()*8}s linear forwards;pointer-events:none;`;
    el.textContent = symbols[Math.floor(Math.random()*symbols.length)];
    container.appendChild(el);
    setTimeout(()=>el.remove(), 14000);
  }, 800);
}
function stopAuthCoins() {
  if(_authCoinsInterval) { clearInterval(_authCoinsInterval); _authCoinsInterval = null; }
}

// Жива стрічка останніх великих виграшів на екрані входу — той самий
// "win_feed", що й на головній (addToWinFeed), лише в горизонтальній
// бігучій стрічці, як #rateTicker. Показуємо ще до логіну, щоб екран
// не виглядав мертвим/статичним.
const AUTH_WIN_TICKER_GAME_EMOJI = { 'Слоти':'🎰','Slots':'🎰','Краш':'🚀','Crash':'🚀','Mines':'💣','Roulette':'🎡','Рулетка':'🎡','Blackjack':'🃏','Блекджек':'🃏','Plinko':'🔻','Dice':'🎲','Fortune':'🎡','Hi-Lo':'🃏','Limbo':'🌀','Poker':'♠️','Balloon':'🎈','Dragon Tower':'🐉','Шахи':'♟️' };
let _authWinTickerListener = null;
function initAuthWinTicker() {
  const inner = document.getElementById('authWinTickerInner');
  if(!inner) return;
  if(_authWinTickerListener) db.ref('win_feed').off('value', _authWinTickerListener);
  _authWinTickerListener = snap => {
    const data = snap.val() || {};
    const items = Object.values(data).sort((a,b) => b.time - a.time).slice(0, 10);
    if(!items.length) {
      inner.innerHTML = '<span class="auth-win-ticker-item">🎰 Приєднуйся першим — і саме твій виграш зʼявиться тут!</span>'.repeat(2);
      return;
    }
    const renderItem = it => {
      const emoji = AUTH_WIN_TICKER_GAME_EMOJI[it.game] || '🎰';
      return `<span class="auth-win-ticker-item">${emoji} <span class="awt-user">${escapeHtml(it.user||'Гравець')}</span> виграв <b>+₴${formatNumber(it.amount)}</b> у ${escapeHtml(it.game||'')}</span>`;
    };
    // Дублюємо список двічі підряд — так tickerScroll (0% → -50%) закільцьовується без "стрибка"
    const html = items.map(renderItem).join('') + items.map(renderItem).join('');
    inner.innerHTML = html;
  };
  db.ref('win_feed').orderByChild('time').limitToLast(10).on('value', _authWinTickerListener);
}
function stopAuthWinTicker() {
  if(_authWinTickerListener) { db.ref('win_feed').off('value', _authWinTickerListener); _authWinTickerListener = null; }
}

function spawnWinCoins(amount) {
  const count = amount > 10000 ? 20 : amount > 1000 ? 12 : 6;
  const symbols = ['🪙','💎','🤑','⭐','✨','🏆'];
  for(let i = 0; i < count; i++) {
    setTimeout(()=>{
      const el = document.createElement('div');
      el.className = 'win-coin';
      const startX = 40 + Math.random()*60; // %
      const startY = 40 + Math.random()*30; // %
      el.style.cssText = `left:${startX}%;top:${startY}%;--tx:${(Math.random()-0.5)*200}px;--ty:${-100-Math.random()*200}px;--tr:${(Math.random()-0.5)*720}deg;`;
      el.textContent = symbols[Math.floor(Math.random()*symbols.length)];
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), 1300);
    }, i * 80);
  }
}

// Init auth screen when shown
function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  setTimeout(initAuthCanvas, 50);
  setTimeout(loadAuthStats, 800);
}


// ═══════════════════════════════════════════════════════
// 🏇 HORSE RACING
// ═══════════════════════════════════════════════════════
const HORSES = [
  {name:'Блискавка', emoji:'🐎', odds:1.8,  color:'#e74c3c', winChance:0.38},
  {name:'Магія',     emoji:'🦄', odds:2.8,  color:'#c9a0ff', winChance:0.25},
  {name:'Буря',      emoji:'🐴', odds:4.2,  color:'#4a9eff', winChance:0.22},
  {name:'Темний',    emoji:'🏇', odds:6.5,  color:'#ff9f43', winChance:0.15},
];
// House edge: sum of (1/odds * winChance) < 1 → casino advantage ~8%
let hrSelectedHorse = -1, hrBet = 0, hrRacing = false;

function selectHorse(idx, el) {
  if(hrRacing) return;
  hrSelectedHorse = idx;
  document.querySelectorAll('.horse-lane').forEach((l,i)=>{ l.classList.toggle('selected', i===idx); });
  document.getElementById('hrHorseDisplay').textContent = HORSES[idx].emoji+' '+HORSES[idx].name;
  document.getElementById('hrWinDisplay').textContent = '×'+HORSES[idx].odds;
}

function startHorseRace() {
  if(hrRacing) return;
  if(hrSelectedHorse < 0) return notify('Оберіть коня!','error');
  const b = validateBet(document.getElementById('betAmountHR').value);
  if(!b) return;
  hrBet = b; hrRacing = true;
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
  addWager(b); trackQuest('totalGames',1); trackLbStat('wager',b); trackLbStat('games',1);
  document.getElementById('hrStartBtn').disabled = true;
  document.getElementById('hrStatus').textContent = '🏇 Гонка почалась!';
  HORSES.forEach((_,i) => { const bar = document.getElementById('hbar'+i); if(bar) bar.style.width='0'; });

  const progress = [0,0,0,0];
  const speeds   = HORSES.map(() => 2.5 + Math.random() * 4);

  // Determine winner by weighted chance (not pure odds-based)
  const rng = Math.random();
  let cum = 0, winner = 0;
  for(let hi = 0; hi < HORSES.length; hi++) {
    cum += HORSES[hi].winChance;
    if(rng < cum) { winner = hi; break; }
    winner = hi;
  }
  // Give winner a speed boost so it actually wins the animation
  speeds[winner] = Math.max(...speeds) * 1.15 + Math.random() * 0.5;

  const raceInt = setInterval(() => {
    HORSES.forEach((_,i) => {
      progress[i] += speeds[i] * (0.8 + Math.random() * 0.4);
      const bar = document.getElementById('hbar'+i);
      if(bar) bar.style.width = Math.min(progress[i], 100)+'%';
    });
    if(progress[winner] >= 100) {
      clearInterval(raceInt);
      hrRacing = false;
      document.getElementById('hrStartBtn').disabled = false;
      const won = winner === hrSelectedHorse;
      if(won) {
        // Cap max payout at 8x to prevent abuse on low-odds horses
        const rawWin = Math.floor(hrBet * HORSES[winner].odds);
        const winAmt = Math.min(rawWin, hrBet * 8);
        db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(winAmt));
        trackLbStat('wins', winAmt);
        notify('🏆 '+HORSES[winner].emoji+' переміг! +'+formatNumber(winAmt)+'₴ (×'+HORSES[winner].odds+')', 'success');
        addToHistory('Гонки: +'+winAmt+' (×'+HORSES[winner].odds+')');
        document.getElementById('hrStatus').textContent = '🏆 '+HORSES[winner].name+' переміг! +'+formatNumber(winAmt)+'₴';
        updateStreak(true); recordBalanceHistory();
        publishLiveBet('Скачки 🏇','🏇', hrBet, HORSES[winner].odds);
      } else {
        notify('❌ '+HORSES[winner].emoji+' '+HORSES[winner].name+' переміг. Твій кінь програв.', 'error');
        addToHistory('Гонки: -'+hrBet);
        document.getElementById('hrStatus').textContent = '❌ '+HORSES[winner].name+' переміг';
        updateStreak(false);
      }
      trackSession(won, hrBet);
    }
  }, 150);
}

// ═══════════════════════════════════════════════════════
// 🎨 COLOR PREDICTION
// ═══════════════════════════════════════════════════════
let colorChoice = null, colorBetAmt = 0;
const COLOR_HISTORY_MAX = 20;
let colorHistoryArr = [];

function placColorBet(color, el) {
  colorChoice = color;
  document.querySelectorAll('.color-bet-btn').forEach(b => b.classList.remove('selected'));
  if(el) el.classList.add('selected');
  document.getElementById('colorBetStatus').textContent = 'Поставлено: '+(color==='red'?'🔴 Червоний':color==='green'?'🟢 Зелений':'⚪ Білий');
  document.getElementById('colorSpinBtn').disabled = false;
  document.getElementById('colorSpinBtn').style.opacity = '1';
}

function spinColorWheel() {
  if(!colorChoice) return;
  const b = validateBet(document.getElementById('betAmountColor').value);
  if(!b) return;
  colorBetAmt = b;
  document.getElementById('colorSpinBtn').disabled = true;
  document.getElementById('colorSpinBtn').textContent = '🎡 Крутимо...';
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
  addWager(b); trackQuest('totalGames',1); trackLbStat('wager',b); trackLbStat('games',1);
  // Result: 47% red, 47% green, 6% white
  const r = Math.random();
  let result, mult, bg;
  if(r < 0.47) { result='red'; mult=2; bg='rgba(231,76,60,0.3)'; }
  else if(r < 0.94) { result='green'; mult=2; bg='rgba(61,214,140,0.3)'; }
  else { result='white'; mult=14; bg='rgba(255,255,255,0.2)'; }
  // Animate spin
  const display = document.getElementById('colorResultDisplay');
  let spins = 0;
  const spinInt = setInterval(() => {
    const r2 = Math.random();
    const tmp = r2<.47?'🔴':r2<.94?'🟢':'⚪';
    display.textContent = tmp; spins++;
    if(spins >= 12) {
      clearInterval(spinInt);
      const emoji = result==='red'?'🔴':result==='green'?'🟢':'⚪';
      display.textContent = emoji;
      display.style.background = bg;
      // Add to history
      colorHistoryArr.unshift(result);
      if(colorHistoryArr.length > COLOR_HISTORY_MAX) colorHistoryArr.pop();
      renderColorHistory();
      const won = result === colorChoice;
      if(won) {
        const w = Math.floor(b*mult);
        db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(w));
        notify('🎨 +'+formatNumber(w)+'₴ (×'+mult+')', 'success');
        addToHistory('ColorBet: +'+w+' ('+result+')');
        trackLbStat('wins',w); updateStreak(true);
      } else {
        notify('🎨 Випало '+(result==='red'?'Червоний':result==='green'?'Зелений':'Білий')+'. Програш!','error');
        addToHistory('ColorBet: -'+b); updateStreak(false);
      }
      trackSession(won, b);
      document.getElementById('colorSpinBtn').disabled = false;
      document.getElementById('colorSpinBtn').textContent = '🎨 КРУТИТИ';
      colorChoice = null;
      document.querySelectorAll('.color-bet-btn').forEach(btn=>btn.classList.remove('selected'));
      document.getElementById('colorSpinBtn').disabled = true;
      document.getElementById('colorSpinBtn').style.opacity = '.5';
    }
  }, 100);
}

function renderColorHistory() {
  const el = document.getElementById('colorHistory');
  if(!el) return;
  el.innerHTML = colorHistoryArr.map(c=>`<div style="width:16px;height:16px;border-radius:50%;background:${c==='red'?'var(--neg)':c==='green'?'var(--pos)':'var(--paper)'};flex-shrink:0;"></div>`).join('');
}

// ═══════════════════════════════════════════════════════
// 💬 GLOBAL CHAT
// ═══════════════════════════════════════════════════════
let globalChatListener = null;
let chatPendingImage = null;
let chatPendingIsVideo = false;

// Delegated click handler for chat media, bound once — avoids putting
// user-controlled URLs inside inline onclick="" JS strings (XSS via quote breakout).
if (!window._chatMediaClickBound) {
  window._chatMediaClickBound = true;
  document.addEventListener('click', e => {
    const openImg = e.target.closest('[data-open-img]');
    if (openImg) { window.open(openImg.getAttribute('data-open-img'), '_blank'); return; }
    const vid = e.target.closest('[data-fullscreen-toggle]');
    if (vid && vid.requestFullscreen) vid.requestFullscreen();
  });
}

