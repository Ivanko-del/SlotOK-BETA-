function spinRR() {
  const rev = document.getElementById('rrRevolver');
  const angle = 60 * Math.floor(Math.random() * 6) + Math.random()*30;
  rev.style.transform = 'rotate('+angle+'deg)';
}

function shootRR() {
  const b = validateBet(document.getElementById('betAmountRR').value);
  if(!b) return;
  if(!rrActive) {
    rrBet = b;
    rrActive = true;
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
    addWager(b); trackQuest('totalGames',1); trackLbStat('wager',b); trackLbStat('games',1);
  }
  spinRR();
  // 1/6 chance of bullet
  const remaining = RR_CHAMBERS - rrSurvived;
  const bulletChance = 1 / remaining;
  const bang = Math.random() < bulletChance;
  if(bang) {
    // BANG — lost
    const log = document.getElementById('rrLog');
    log.innerHTML = '<div style="color:#ff6b6b;font-size:15px;font-weight:900;text-align:center;">💥 БАМ! Ви програли!</div>';
    notify('💥 БАМ! -'+formatNumber(rrBet)+'₴', 'error');
    addToHistory('RR: -'+rrBet);
    document.getElementById('rrShootBtn').disabled = false;
    document.getElementById('rrWalkBtn').disabled = true;
    rrSurvived = 0; rrActive = false;
    document.getElementById('rrSurvivedCount').textContent = 0;
    updateRRDisplay();
  } else {
    rrSurvived++;
    document.getElementById('rrSurvivedCount').textContent = rrSurvived;
    const mult = Math.pow(6/5, rrSurvived);
    const win = Math.floor(rrBet * mult);
    const log = document.getElementById('rrLog');
    log.innerHTML = '<div style="color:#3dd68c;font-size:13px;font-weight:700;text-align:center;">✅ Клік! Порожній барабан<br><span style="font-size:11px;color:#777;">Якщо вийдете зараз — отримаєте ₴'+formatNumber(win)+'</span></div>';
    notify('😮 Пронесло! '+rrSurvived+' поспіль', 'info');
    document.getElementById('rrWalkBtn').disabled = false;
    updateRRDisplay();
    if(rrSurvived >= 5) {
      // Auto win — survived all
      walkAwayRR();
    }
  }
}

function walkAwayRR() {
  if(!rrActive && rrSurvived === 0) return;
  const mult = Math.pow(6/5, rrSurvived);
  const win = Math.floor(rrBet * mult);
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
  trackLbStat('wins', win); trackLbStat('profit', win-rrBet);
  notify('💰 Вийшли з ×'+mult.toFixed(2)+' = +'+formatNumber(win)+'₴', 'success');
  addToHistory('RR: +'+win+' (×'+mult.toFixed(2)+')');
  recordBalanceHistory();
  rrSurvived = 0; rrActive = false;
  document.getElementById('rrSurvivedCount').textContent = 0;
  document.getElementById('rrWalkBtn').disabled = true;
  document.getElementById('rrLog').innerHTML = '<div style="color:#444;text-align:center;font-size:12px;">Натисни стріляти...</div>';
  updateRRDisplay();
}

function updateRRDisplay() {
  const remaining = Math.max(1, RR_CHAMBERS - rrSurvived);
  const nextMult = Math.pow(6/5, rrSurvived+1);
  document.getElementById('rrMultiplierDisplay').textContent = '×'+nextMult.toFixed(2)+' при виживанні';
  document.getElementById('rrMaxMult').textContent = Math.pow(6/5, 5).toFixed(1);
}

// ═══════════════════════════════════════════
// 🧠 QUIZ BATTLE
// ═══════════════════════════════════════════
const QUIZ_QUESTIONS = [
  {q:'Яка столиця України?',o:['Харків','Одеса','Київ','Львів'],a:2},
  {q:'Скільки кольорів у веселці?',o:['5','6','7','8'],a:2},
  {q:'Яка столиця Австралії?',o:['Сідней','Мельбурн','Канберра','Брісбен'],a:2},
  {q:'Хімічна формула води?',o:['H2O','HO2','H3O','OH2'],a:0},
  {q:'Скільки хромосом у людини?',o:['44','46','48','42'],a:1},
  {q:'Який рік заснування Apple?',o:['1974','1975','1976','1977'],a:2},
  {q:'Швидкість світла (км/с)?',o:['200 000','300 000','400 000','150 000'],a:1},
  {q:'Найвища гора світу?',o:['К2','Канченджанга','Евересту','Лхоцзе'],a:2},
  {q:'Скільки гравців у футболі на полі?',o:['9','10','11','12'],a:2},
  {q:'Яка планета найбільша?',o:['Сатурн','Юпітер','Уран','Нептун'],a:1},
  {q:'Хто написав "Кобзар"?',o:['Леся Українка','Іван Франко','Т.Шевченко','М.Коцюбинський'],a:2},
  {q:'2^10 = ?',o:['512','1024','2048','256'],a:1},
  {q:'Яке місто найбільше за населенням?',o:['Шанхай','Пекін','Токіо','Джакарта'],a:2},
  {q:'Куди рухається стрілка годинника?',o:['Проти сонця','За сонцем','Не рухається','Залежить від годинника'],a:1},
  {q:'Скільки нот в октаві?',o:['6','7','8','9'],a:1},
];

let quizBet=0, quizQ=0, quizCorrect=0, quizActive=false, quizTimer=null, quizCurrentQ=null;
// quizAnswered — гвард від спаму по answerQuiz() на ОДНІЙ і тій самій
// відповіді: без нього кожен клік планував свій власний setTimeout(nextQuizQuestion),
// жоден з яких не скасовував інші, і quizBet зростав/quizQ рахувався за
// кожен клік окремо. Коли ці стек-накопичені таймери спрацьовували, quizQ
// вже міг бути ≥10 у кожному з них — і endQuiz() виплачував ту саму ставку
// по кілька разів. quizNextTimer прибирає це накопичення таймерів.
let quizAnswered = false, quizNextTimer = null;

function startQuiz() {
  if(quizActive) return;
  const b = validateBet(document.getElementById('betAmountQuiz').value);
  if(!b) return;
  quizBet = b;
  quizQ = 0; quizCorrect = 0; quizActive = true;
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
  addWager(b); trackQuest('totalGames',1); trackLbStat('wager',b);
  document.getElementById('quizStartPanel').style.display = 'none';
  document.getElementById('quizTimerWrap').style.display = 'block';
  nextQuizQuestion();
}

function nextQuizQuestion() {
  clearTimeout(quizNextTimer); quizNextTimer = null;
  if(quizQ >= 10) { endQuiz(); return; }
  quizAnswered = false;
  const pool = [...QUIZ_QUESTIONS].sort(()=>Math.random()-.5);
  quizCurrentQ = pool[quizQ % pool.length];
  document.getElementById('quizQ').textContent = quizQ+1;
  document.getElementById('quizQuestion').innerHTML = '<div style="font-size:15px;font-weight:700;line-height:1.4;">'+quizCurrentQ.q+'</div>';
  const opts = document.getElementById('quizOptions');
  opts.innerHTML = quizCurrentQ.o.map((o,i)=>`<button class="quiz-option" onclick="answerQuiz(${i})">${String.fromCharCode(65+i)}. ${o}</button>`).join('');
  const bar = document.getElementById('quizTimer');
  bar.style.transition = 'none'; bar.style.width = '100%';
  setTimeout(()=>{ bar.style.transition='width 10s linear'; bar.style.width='0%'; }, 50);
  clearTimeout(quizTimer);
  quizTimer = setTimeout(()=>{ answerQuiz(-1); }, 10000);
}

function answerQuiz(choice) {
  if(!quizActive || quizAnswered) return;
  quizAnswered = true;
  clearTimeout(quizTimer);
  const correct = choice === quizCurrentQ.a;
  const opts = document.getElementById('quizOptions');
  opts.querySelectorAll('.quiz-option').forEach((btn,i)=>{
    if(i===quizCurrentQ.a) btn.classList.add('correct');
    else if(i===choice) btn.classList.add('wrong');
    btn.disabled = true;
  });
  if(correct) {
    quizCorrect++;
    document.getElementById('quizCorrect').textContent = quizCorrect;
    // Correct: +12% gain (was 20% — now harder to compound)
    const gain = Math.floor(quizBet * 0.12);
    quizBet += gain;
  } else if(choice >= 0) {
    // Wrong: lose 25% (was 10% — bigger penalty)
    quizBet = Math.max(0, Math.floor(quizBet * 0.75));
  } else {
    // Timeout: lose 35% (was 15% — much bigger penalty)
    quizBet = Math.max(0, Math.floor(quizBet * 0.65));
    notify('⏱ Час вийшов! -35%', 'error');
  }
  document.getElementById('quizPrize').textContent = '₴'+formatNumber(quizBet);
  quizQ++;
  clearTimeout(quizNextTimer);
  quizNextTimer = setTimeout(nextQuizQuestion, 1200);
}

function endQuiz() {
  if(!quizActive) return;
  quizActive = false;
  clearTimeout(quizTimer);
  const originalBet = parseInt(document.getElementById('betAmountQuiz')?.value) || 100;
  // Stricter cap: max 2.5x (was 4x) — need 10/10 to get anywhere near this
  quizBet = Math.min(quizBet, Math.floor(originalBet * 2.5));
  // Only pay out if answered at least 6 correctly (was 0)
  if(quizBet > originalBet && quizCorrect >= 6) {
    const profit = quizBet - originalBet;
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(quizBet));
    trackLbStat('wins', quizBet);
    notify('🧠 '+quizCorrect+'/10 правильно! +'+formatNumber(profit)+'₴', 'success');
    addToHistory('Quiz: +'+profit+' ('+quizCorrect+'/10)');
    recordBalanceHistory();
  } else if(quizBet > 0 && quizCorrect >= 4) {
    // 4-5 correct: get back part of bet
    const refund = Math.floor(originalBet * 0.5);
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(refund));
    notify('🧠 '+quizCorrect+'/10 — повернено 50% ставки: +'+formatNumber(refund)+'₴', 'info');
  } else {
    notify('🧠 '+quizCorrect+'/10 — надто мало правильних відповідей. Ставка втрачена!', 'error');
  }
  const icon = quizCorrect>=8?'🏆':quizCorrect>=6?'✅':quizCorrect>=4?'😐':'😢';
  document.getElementById('quizQuestion').innerHTML =
    '<div style="text-align:center;padding:20px;">' +
    '<div style="font-size:32px;margin-bottom:8px;">'+icon+'</div>' +
    '<div style="font-size:15px;font-weight:700;">'+quizCorrect+'/10 правильно</div>' +
    '<div style="font-size:11px;color:#666;margin-top:6px;">Потрібно 6+ для прибутку · 4-5 = повернення 50%</div>' +
    '</div>';
  document.getElementById('quizOptions').innerHTML = '';
  document.getElementById('quizStartPanel').style.display = 'block';
  document.getElementById('quizTimerWrap').style.display = 'none';
}

// ═══════════════════════════════════════════
// 🔥 STREAK SYSTEM
// ═══════════════════════════════════════════
let winStreak = 0, lossStreak = 0;

function updateStreak(won) {
  if(won) {
    winStreak++;
    lossStreak = 0;
    if(winStreak === 3) notify('🔥 Серія виграшів x3! +5% до наступної ставки!', 'success');
    if(winStreak === 5) notify('⚡ СЕРІЯ x5! Отримай бонус у щоденному колесі!', 'success');
    if(winStreak >= 5) trackQuest('streak5', 1);
  } else {
    lossStreak++;
    winStreak = 0;
  }
  // Update streak banner if visible
  const sb = document.getElementById('streakBanner');
  if(sb) {
    if(winStreak >= 2) {
      sb.style.display = 'flex';
      sb.querySelector('#streakText').textContent = '🔥 Серія виграшів: '+winStreak+'  •  +'+Math.min(winStreak*5,25)+'% до виплат';
    } else { sb.style.display = 'none'; }
  }
}

// ═══════════════════════════════════════════
// ⏱ SESSION ANALYTICS
// ═══════════════════════════════════════════
let sessionStart = Date.now(), sessionBets = 0, sessionWins = 0, sessionLosses = 0;

function trackSession(won, amount) {
  sessionBets++;
  if(won) sessionWins++; else sessionLosses++;
  updateSessionBar();
}

function updateSessionBar() {
  const sb = document.getElementById('sessionBarStreak');
  if(sb) sb.textContent = winStreak > 0 ? '🔥'+winStreak : '0';
  const elapsed = Math.floor((Date.now()-sessionStart)/60000);
  const el = document.getElementById('sessionBarTime');
  if(el) el.textContent = elapsed+'хв';
  const bets = document.getElementById('sessionBarBets');
  if(bets) bets.textContent = sessionBets;
  const wr = document.getElementById('sessionBarWR');
  if(wr && sessionBets>0) wr.textContent = Math.round(sessionWins/sessionBets*100)+'%';
}

// ═══════════════════════════════════════════
// 📦 DEPOSIT PACKAGES
// ═══════════════════════════════════════════
function initDepositPackages() {
  const pkg = document.getElementById('depositPackages');
  if(!pkg) return;
  const packages = [
    {amount:200, bonus:0, label:'Старт', icon:'🔹'},
    {amount:500, bonus:50, label:'Базовий', icon:'🔸'},
    {amount:1000, bonus:200, label:'Стандарт', icon:'⭐', popular:true},
    {amount:2500, bonus:625, label:'Великий', icon:'💎'},
    {amount:5000, bonus:1500, label:'VIP', icon:'👑'},
    {amount:10000, bonus:4000, label:'Хайроллер', icon:'🚀'},
  ];
  pkg.innerHTML = packages.map(p=>`
    <div class="dep-package${p.popular?' popular':''}" data-amount="${p.amount}" onclick="selectDepPackage(${p.amount},${p.bonus})">
      <div class="dep-package-amount">${formatNumber(p.amount)} ₴</div>
      ${p.bonus>0?'<div class="dep-package-bonus">+'+formatNumber(p.bonus)+' ₴</div>':'<div class="dep-package-bonus none">Без бонусу</div>'}
      <div class="dep-package-total">${p.bonus>0?'Разом '+formatNumber(p.amount+p.bonus)+' ₴':'Тільки депозит'}</div>
      <div class="dep-package-label">${p.label}</div>
    </div>
  `).join('');
}

// Раніше пакет писав суму в #depositAmount/#betDepAmt — таких полів у Касі
// немає, тож вибір пакета нічого не робив. Тепер він задає ту саму змінну
// selectedDepAmount, яку читає submitDepositRequest().
function selectDepPackage(amount, bonus) {
  selectedDepAmount = amount;
  ksClearDepositAmountUI();
  const card = document.querySelector('#depositPackages .dep-package[data-amount="' + amount + '"]');
  if(card) card.classList.add('is-selected');
  const custom = document.getElementById('customDepAmount');
  if(custom) custom.value = '';
  document.getElementById('customAmountBox')?.classList.add('hidden');
  notify(bonus > 0
    ? 'Пакет ' + formatNumber(amount) + ' ₴ · бонус +' + formatNumber(bonus) + ' ₴'
    : 'Сума ' + formatNumber(amount) + ' ₴', 'info');
  if(bonus > 0) localStorage.setItem('pendingDepBonus', JSON.stringify({amount, bonus, ts: Date.now()}));
  else localStorage.removeItem('pendingDepBonus');
}

// ═══════════════════════════════════════════
// 🛡️ FRAUD DETECTION (admin-side)
// ═══════════════════════════════════════════
function runFraudCheck() {
  db.ref('users').limitToFirst(500).once('value', snap => {
    const users = snap.val()||{};
    const suspicious = [];
    Object.entries(users).forEach(([u, data])=>{
      const balance = data.balance||0;
      const totalWager = data.totalWagered || data.totalWager || 0;
      // Flag: balance >> wager (unusual gains)
      if(balance > 100000 && totalWager < balance*0.1) suspicious.push({user:u, reason:'balance/wager ratio', balance, totalWager});
      // Flag: too many rapid wins
      const recentWins = data.recentWins||0;
      if(recentWins > 50) suspicious.push({user:u, reason:'50+ recent wins', balance, recentWins});
    });
    const container = document.getElementById('fraudList');
    if(!container) return;
    if(!suspicious.length) { container.innerHTML='<div style="color:#3dd68c;text-align:center;padding:14px;">✅ Підозрілих гравців не знайдено</div>'; return; }
    container.innerHTML = suspicious.map(s=>`
      <div style="background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.2);border-radius:10px;padding:10px;margin-bottom:6px;">
        <div style="font-size:12px;font-weight:700;color:#ff6b6b;">⚠️ ${escapeHtml(s.user)}</div>
        <div style="font-size:10px;color:#777;">Причина: ${s.reason}</div>
        <div style="font-size:10px;color:#555;">Баланс: ₴${formatNumber(s.balance||0)}</div>
        <button class="btn-red" style="padding:6px 12px;font-size:11px;margin-top:6px;" onclick="admBanUser(${jsArg(s.user)},this)">🚫 Заблокувати</button>
      </div>
    `).join('');
  });
}

// ═══════════════════════════════════════════
// ⚙️ RTP CONTROL (admin)
// ═══════════════════════════════════════════
function loadRTPSettings() {
  db.ref('admin_settings/rtp').once('value', snap => {
    const data = snap.val()||{};
    const defaults = {slots:96, crash:97, mines:95, plinko:94, blackjack:98, roulette:97, default:96};
    const container = document.getElementById('rtpGrid');
    if(!container) return;
    container.innerHTML = Object.entries({...defaults, ...data}).map(([game, val])=>`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <div style="font-size:11px;flex:1;color:#aaa;">${game}</div>
        <input type="number" value="${val}" min="50" max="99" style="width:65px;background:var(--box);border:1px solid var(--border);border-radius:8px;color:#fff;padding:4px 8px;font-size:12px;" id="rtp_${game}">
        <span style="font-size:10px;color:#555;">%</span>
      </div>
    `).join('');
  });
}

function saveRTPSettings() {
  const container = document.getElementById('rtpGrid');
  if(!container) return;
  const data = {};
  container.querySelectorAll('input').forEach(inp => {
    const game = inp.id.replace('rtp_','');
    data[game] = parseInt(inp.value)||96;
  });
  db.ref('admin_settings/rtp').set(data).then(()=>notify('✅ RTP збережено','success'));
}

// ═══════════════════════════════════════════
// 📦 ЛУТ-БОКСИ — контроль виплат (admin)
// ═══════════════════════════════════════════
// Базові ваги призів уже налаштовані на RTP < 100% (89/92/96%). Цей повзунок
// дає адміну ще один множник поверх них — суто для гнучкості, без потреби
// редагувати код і робити новий деплой. Клемпиться на [50,100]%, тож
// випадковою чи помилковою зміною неможливо знову зробити ящики +EV.
function loadLootboxEdgeSetting() {
  const el = document.getElementById('lootboxEdgeInput');
  if(!el) return;
  db.ref('admin_settings/lootboxEdge').once('value', snap => {
    const v = snap.val();
    el.value = Math.round((typeof v === 'number' ? Math.min(1, Math.max(0.5, v)) : 1) * 100);
  });
}
function saveLootboxEdgeSetting() {
  const el = document.getElementById('lootboxEdgeInput');
  if(!el) return;
  const pct = Math.min(100, Math.max(50, parseInt(el.value) || 100));
  el.value = pct;
  db.ref('admin_settings/lootboxEdge').set(pct / 100).then(() => {
    logAdminAction('lootbox_edge', `${pct}%`);
    notify(`✅ Виплата лут-боксів: ${pct}% від базової`, 'success');
  });
}

// ═══════════════════════════════════════════
// 📱 PWA INSTALL
// ═══════════════════════════════════════════
let pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  pwaInstallPrompt = e;
  const btn = document.getElementById('pwaInstallBtn');
  if(btn) btn.classList.add('visible');
});

function installPWA() {
  if(!pwaInstallPrompt) return notify('Вже встановлено або недоступно','info');
  pwaInstallPrompt.prompt();
  pwaInstallPrompt.userChoice.then(r => {
    if(r.outcome==='accepted') notify('✅ SlotOK встановлено!','success');
    pwaInstallPrompt = null;
    const btn = document.getElementById('pwaInstallBtn');
    if(btn) btn.classList.remove('visible');
  });
}

// ═══════════════════════════════════════════
// 🔔 PUSH NOTIFICATIONS
// ═══════════════════════════════════════════
// sendNativeNotif та requestPushPermission визначені нижче (фіча 4)

// ═══════════════════════════════════════════
// ⚡ ANIMATION SPEED
// ═══════════════════════════════════════════
function setAnimSpeed(multiplier, silent) {
  document.documentElement.style.setProperty('--anim-speed', multiplier+'');
  localStorage.setItem('animSpeed', multiplier);
  if(multiplier === 0) {
    document.documentElement.style.setProperty('--transition','none');
  } else {
    document.documentElement.style.setProperty('--transition', (0.2/multiplier)+'s');
  }
  if(!silent) notify('⚡ Швидкість анімацій: '+(multiplier===2?'Швидко':multiplier===1?'Нормально':multiplier===0.5?'Повільно':'Вимкнено'),'info');
}

function loadAnimSpeed() {
  const saved = parseFloat(localStorage.getItem('animSpeed')||'1');
  setAnimSpeed(saved, true);
  const sel = document.getElementById('animSpeedSelect');
  if(sel) sel.value = saved;
}

// ═══════════════════════════════════════════
// 🌌 LIVE WALLPAPERS
// ═══════════════════════════════════════════
let liveWpActive = false, liveWpAnim = null;

function toggleLiveWallpaper(type) {
  const canvas = document.getElementById('liveBgCanvas');
  if(!canvas) return;
  if(liveWpActive && liveWpActive===type) {
    liveWpActive = false;
    canvas.classList.remove('active');
    cancelAnimationFrame(liveWpAnim);
    localStorage.setItem('liveWp','none');
    document.querySelectorAll('.live-wallpaper-btn').forEach(b=>b.classList.remove('active'));
    return;
  }
  liveWpActive = type;
  canvas.classList.add('active');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  document.querySelectorAll('.live-wallpaper-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('.live-wallpaper-btn[data-wp="'+type+'"]')?.classList.add('active');
  localStorage.setItem('liveWp', type);
  if(type==='stars') animStars(ctx, canvas);
  else if(type==='matrix') animMatrix(ctx, canvas);
  else if(type==='rain') animRain(ctx, canvas);
}

function animStars(ctx, canvas) {
  const stars = Array.from({length:120},()=>({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*1.5,s:Math.random()*.5+.1}));
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    stars.forEach(s=>{
      s.y -= s.s; if(s.y<0) s.y=canvas.height;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,'+(0.3+Math.random()*.3)+')'; ctx.fill();
    });
    if(liveWpActive==='stars') liveWpAnim = requestAnimationFrame(draw);
  }
  draw();
}

function animMatrix(ctx, canvas) {
  const cols = Math.floor(canvas.width/16), drops = Array(cols).fill(0);
  const chars = 'アイウエオカキクケコサシスセソ0123456789ABCDEF'.split('');
  function draw() {
    ctx.fillStyle='rgba(0,0,0,.05)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#0f0'; ctx.font='14px monospace';
    drops.forEach((y,i)=>{
      ctx.fillText(chars[Math.floor(Math.random()*chars.length)],i*16,y*16);
      if(y*16>canvas.height && Math.random()>.975) drops[i]=0;
      drops[i]++;
    });
    if(liveWpActive==='matrix') liveWpAnim = requestAnimationFrame(draw);
  }
  draw();
}

function animRain(ctx, canvas) {
  const drops = Array.from({length:100},()=>({x:Math.random()*canvas.width,y:Math.random()*canvas.height,s:Math.random()*3+2,l:Math.random()*15+10}));
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='rgba(74,158,255,.4)'; ctx.lineWidth=1;
    drops.forEach(d=>{
      ctx.beginPath(); ctx.moveTo(d.x,d.y); ctx.lineTo(d.x-2,d.y+d.l); ctx.stroke();
      d.y+=d.s; d.x-=1;
      if(d.y>canvas.height){d.y=-20;d.x=Math.random()*canvas.width;}
    });
    if(liveWpActive==='rain') liveWpAnim = requestAnimationFrame(draw);
  }
  draw();
}

function loadLiveWallpaper() {
  const saved = localStorage.getItem('liveWp');
  if(saved && saved!=='none') toggleLiveWallpaper(saved);
}



