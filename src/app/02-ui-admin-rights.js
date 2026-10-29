// ============================================
// ІНТЕРФЕЙС
// ============================================
function updateUI() {
    if(!userData) return;
    if(typeof updateCurrencyDisplay === 'function') updateCurrencyDisplay();
    else document.querySelectorAll('.bal').forEach(e => e.textContent = formatNumber(userData.balance));
    document.getElementById('profileName').textContent = currentUser;
    document.getElementById('profileId').textContent = userData.id || '---';
    document.getElementById('profileEmail').textContent = userData.email || "-";
    document.getElementById('profileTag').textContent = userData.tag || "Гравець";
    document.getElementById('cashierUserId').textContent = userData.id || '---';
    const avDiv = document.getElementById('currentAvatar');
    if(userData.avatarUrl) {
      avDiv.innerHTML = `<img src="${safeUrl(userData.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else if(userData.avatar && userData.avatar.length > 2) {
      avDiv.innerHTML = `<img src="${safeUrl(userData.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      avDiv.innerHTML = escapeHtml(userData.avatar || '👤');
    }
    if(userData.bioInput) {
      const bio = document.getElementById('bioInput');
      if(bio && !bio.value) bio.value = userData.bioInput;
    }
    // Profile stats — animated update
    const ps = (el, val) => {
      const e = document.getElementById(el);
      if(!e) return;
      if(e.textContent !== String(val)) {
        e.style.animation = 'none';
        requestAnimationFrame(()=>{ e.style.animation = 'popIn .3s ease'; e.textContent = val; });
      }
    };
    // Numeric stats get a live count-up tween instead of an instant swap
    const pn = (el, target, prefix, suffix) => animateNumberText(document.getElementById(el), target, prefix, suffix);
    pn('profStatBalance', userData.balance || 0, '₴');
    pn('profStatBigWin',  userData.stats?.biggestWin || userData.maxWin || 0, '₴');
    const gamesPlayed = userData.stats?.gamesPlayed || userData.totalGames || 0;
    const gamesWon    = userData.stats?.gamesWon    || userData.totalWins  || 0;
    pn('profStatGames', gamesPlayed, '');
    pn('profStatWager', userData.totalWagered || userData.totalWager || 0, '₴');
    ps('profStatStreak', (userData.dailyStreak || 0) + '🔥');
    pn('profStatSlotsPlayed', userData.slotsPlayed || 0, '');
    pn('profStatDeposits', userData.totalDeposits || 0, '₴');
    const wr = gamesPlayed > 0 ? Math.round((gamesWon/gamesPlayed)*100) : 0;
    pn('profWinRate', wr, '', '%');
    const bar = document.getElementById('profWinRateBar');
    if(bar) setTimeout(()=>{ bar.style.width = Math.min(wr,100)+'%'; }, 300);
    const vip = getVipLevel ? getVipLevel(userData.totalWagered || 0) : null;
    ps('profStatVip', vip ? vip.name : '—');
    // Real-time balance listener
    if(!window._profileBalanceListener) {
      window._profileBalanceListener = true;
      db.ref('users/'+currentUser+'/balance').on('value', snap => {
        pn('profStatBalance', snap.val() || 0, '₴');
      });
    }
    updateVipUI();
    loadMyWithdraws();
    loadMyDeposits();
    const hb = document.getElementById('homeStatBalance');
    const hv = document.getElementById('homeStatVip');
    const hs = document.getElementById('homeStatStreak');
    if(hb) animateNumberText(hb, userData.balance||0, '₴');
    if(hs) hs.textContent = (userData.dailyStreak||0) + '🔥';
    const vipLevel = getVipLevel ? getVipLevel(userData.totalWagered||0) : null;
    if(hv) hv.textContent = vipLevel ? vipLevel.name : 'Немає';
    refreshCasinoCounters();
} // end updateProfileUI

// Лічильники «онлайн / гравців / виграшів» рахуються з усього вузла users.
// Раніше це робилось у updateUI(), яка викликається на КОЖНУ зміну власного
// балансу, тобто кожна ставка качала всю базу гравців (мегабайти, з паролями
// й історією). Тепер — не частіше ніж раз на 5 хвилин, а в проміжку показуємо
// останні пораховані значення.
let _casinoCountersAt = 0, _casinoCountersCache = null, _casinoCountersBusy = false;
function refreshCasinoCounters() {
  const paint = c => {
    if(!c) return;
    const ce = document.getElementById('casinoOnlineCount');
    const cw = document.getElementById('casinoTodayWins');
    const ct = document.getElementById('casinoTotalPlayers');
    if(ce) ce.textContent = Math.max(c.online,1)+'';
    if(cw) cw.textContent = formatNumber(c.wins);
    if(ct) ct.textContent = c.total+'';
  };
  paint(_casinoCountersCache);
  if(_casinoCountersBusy || Date.now() - _casinoCountersAt < 300000) return;
  _casinoCountersBusy = true;
  db.ref('users').once('value', snap => {
    _casinoCountersBusy = false;
    _casinoCountersAt = Date.now();
    const users = snap.val()||{};
    _casinoCountersCache = {
      total: Object.keys(users).filter(k=>!users[k].isBot).length,
      online: Object.values(users).filter(u=>u.lastSeen && Date.now()-u.lastSeen < 300000).length,
      wins: Object.values(users).reduce((s,u)=>s+(u.totalWins||0),0),
    };
    paint(_casinoCountersCache);
    // Екран входу показує суму ставок з цього агрегату, а не качає users сам.
    if(isAdminUser()) {
      const paid = Object.values(users).reduce((s,u)=>s+(u.totalWagered||0), 0);
      db.ref('casino_stats/totalWagered').set(paid).catch(() => {});
    }
  }, () => { _casinoCountersBusy = false; });
}

function checkAdmin() {
    if (currentUser.toLowerCase() === ADMIN_OWNER || userData.isAdmin === true) {
        document.getElementById('adminPanelBtnBox').classList.remove('hidden');
        document.getElementById('adminBadge').classList.remove('hidden');
        // Автозапуск бот-движка для адміна
        if(!_botEngine) setTimeout(startBotEngine, 3000);
    } else {
        // Support (role у профілі) бачить панель лише з вкладкою «Звернення»
        document.getElementById('adminPanelBtnBox').classList.toggle('hidden', !isSupportUser());
        document.getElementById('adminBadge').classList.add('hidden');
    }
}

function isAdminUser() {
  return !!(currentUser && (currentUser.toLowerCase() === ADMIN_OWNER || userData.isAdmin === true));
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  ПРАВА АДМІНІВ                                               ║
// ║  Чесно: сайт працює без бекенду, тож це операційний          ║
// ║  контроль (хто що бачить і може натиснути + журнал дій),     ║
// ║  а не криптографічний захист. Адмін із доступом до консолі   ║
// ║  браузера все одно може писати в базу напряму — прибрати це  ║
// ║  можна лише сервером, якого тут немає (ROADMAP.md).          ║
// ╚══════════════════════════════════════════════════════════════╝
const ADMIN_OWNER = 'theivankoo';   // власник: має все й не може бути понижений

// Одне право = доступ до однієї вкладки адмін-панелі, плюс до дій усередині неї
const ADMIN_PERMS = [
  { key:'requests',   icon:'📥', name:'Заявки',     desc:'Підтверджувати поповнення, виводи, скидання паролів' },
  { key:'stats',      icon:'📊', name:'Статистика', desc:'Дивитись зведення по сайту' },
  { key:'users',      icon:'👥', name:'Гравці',     desc:'Правити баланси, статуси, видаляти акаунти, обнулення' },
  { key:'bots',       icon:'🤖', name:'Боти',       desc:'Керувати ботами' },
  { key:'content',    icon:'📢', name:'Контент',    desc:'Новини та чат підтримки' },
  { key:'finance',    icon:'💰', name:'Фінанси',    desc:'RTP, джекпот, ручні нарахування' },
  { key:'security',   icon:'🛡️', name:'Безпека',    desc:'Розіграші, Shadow Mode, службові інструменти' },
  { key:'moderation', icon:'🎛️', name:'Модерація',  desc:'Бани, мути, вимкнення ігор, обслуговування' },
  { key:'admins',     icon:'👑', name:'Адміни',     desc:'Призначати адмінів, міняти права, налаштовувати анти-чіт' },
  { key:'feedback',   icon:'📨', name:'Звернення',  desc:'Питання, скарги й пропозиції гравців (є в усіх адмінів і в ролі support)' },
];

function isOwnerUser() {
  return !!(currentUser && currentUser.toLowerCase() === ADMIN_OWNER);
}

// Адміни, призначені до появи прав, не мають поля adminPerms — для них
// нічого не змінюється (повний доступ), доки власник не обмежить явно.
function adminCan(perm) {
  if(isOwnerUser()) return true;
  if(perm === 'feedback') return isSupportUser();
  if(!isAdminUser()) return false;
  const perms = userData && userData.adminPerms;
  if(!perms || typeof perms !== 'object') return true;
  return perms[perm] === true;
}

function requireAdminPerm(perm) {
  if(adminCan(perm)) return true;
  const p = ADMIN_PERMS.find(x => x.key === perm);
  notify('⛔ Немає доступу: ' + (p ? p.icon + ' ' + p.name : perm), 'error');
  return false;
}

// Плавний перелік числа замість миттєвої підміни тексту — для головних
// лічильників (баланс/ставки/виграші), щоб зміна значення відчувалась "живою"
function animateNumberText(el, target, prefix, suffix) {
  if(!el) return;
  prefix = prefix || ''; suffix = suffix || '';
  target = Number(target) || 0;
  const prevRaw = parseFloat(el.dataset.rawVal);
  const start = isNaN(prevRaw) ? target : prevRaw;
  if(Math.abs(target - start) < 0.5 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = prefix + formatNumber(target) + suffix;
    el.dataset.rawVal = target;
    return;
  }
  const dur = 500, t0 = performance.now();
  (function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + formatNumber(start + (target - start) * eased) + suffix;
    if(p < 1) requestAnimationFrame(step); else el.dataset.rawVal = target;
  })(t0);
}

function formatNumber(num) {
    if(num >= 1000000000) return (num/1000000000).toFixed(1) + 'B';
    if(num >= 1000000) return (num/1000000).toFixed(1) + 'M';
    if(num >= 1000) return (num/1000).toFixed(1) + 'k';
    return Math.floor(num).toLocaleString();
}

function notify(msg, type='info') {
    // Respect notification setting (except errors which always show)
    if(type !== 'error') {
      try {
        const s = JSON.parse(localStorage.getItem('slotok_settings')||'{}');
        if(s.notifs === false) return;
      } catch(e) { console.warn(e); }
    }
    const c = document.getElementById('toast-container');
    if(!c) return;
    const d = document.createElement('div');
    d.className = `toast ${type}`;
    d.innerHTML = `<span>${msg}</span>`;
    c.appendChild(d);
    setTimeout(() => d.remove(), 3500);
}

function playSound(type) { 
    try {
        // Check settings - getSetting may not be available yet, use localStorage directly
        try { const s = JSON.parse(localStorage.getItem('slotok_settings')||'{}'); if(s.sounds===false) return; } catch(e) { console.warn(e); }
        if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        const t = audioCtx.currentTime;
        if(type === 'click') {
            o.frequency.value = 800; g.gain.setValueAtTime(0.15, t);
            g.gain.exponentialRampToValueAtTime(0.01, t+0.08);
            o.start(t); o.stop(t+0.08);
        } else if(type === 'win') {
            o.type = 'sine';
            o.frequency.setValueAtTime(440, t);
            o.frequency.linearRampToValueAtTime(880, t+0.1);
            o.frequency.linearRampToValueAtTime(1320, t+0.25);
            g.gain.setValueAtTime(0.25, t); g.gain.linearRampToValueAtTime(0, t+0.5);
            o.start(t); o.stop(t+0.5);
            // Second tone for big win
            const o2 = audioCtx.createOscillator(); const g2 = audioCtx.createGain();
            o2.connect(g2); g2.connect(audioCtx.destination); o2.type = 'triangle';
            o2.frequency.setValueAtTime(660, t+0.1); o2.frequency.linearRampToValueAtTime(1100, t+0.4);
            g2.gain.setValueAtTime(0.15, t+0.1); g2.gain.linearRampToValueAtTime(0, t+0.5);
            o2.start(t+0.1); o2.stop(t+0.5);
        } else if(type === 'spin') {
            o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t);
            o.frequency.linearRampToValueAtTime(100, t+0.3);
            g.gain.setValueAtTime(0.1, t); g.gain.linearRampToValueAtTime(0, t+0.3);
            o.start(t); o.stop(t+0.3);
        } else if(type === 'deal') {
            o.frequency.setValueAtTime(600, t); o.frequency.setValueAtTime(400, t+0.05);
            g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.01, t+0.1);
            o.start(t); o.stop(t+0.1);
        } else if(type === 'loss') {
            o.type = 'sawtooth'; o.frequency.setValueAtTime(300, t);
            o.frequency.linearRampToValueAtTime(150, t+0.4);
            g.gain.setValueAtTime(0.15, t); g.gain.linearRampToValueAtTime(0, t+0.4);
            o.start(t); o.stop(t+0.4);
        } else if(type === 'bonus') {
            // Multi-tone fanfare
            [440,554,659,880].forEach((freq, i) => {
                const oi = audioCtx.createOscillator(); const gi = audioCtx.createGain();
                oi.connect(gi); gi.connect(audioCtx.destination); oi.type = 'sine';
                oi.frequency.value = freq; gi.gain.setValueAtTime(0.2, t+i*0.1);
                gi.gain.linearRampToValueAtTime(0, t+i*0.1+0.15);
                oi.start(t+i*0.1); oi.stop(t+i*0.1+0.15);
            });
        }
    } catch(e) { console.warn(e); }
}

function validateBet(amount) {
    if(isActiveCardFrozen()) {
        notify('🔒 Активна картка заблокована — розблокуй її в Гаманці', 'error');
        return false;
    }
    if(userData.autoFrozen) {
        notify('🚩 Акаунт тимчасово призупинено (підозріла активність) — звернись у підтримку', 'error');
        return false;
    }
    if(isRGLimitReached()) {
        updateRGLossWarnUI();
        notify('🛡️ Досягнуто ліміт "Відповідальної гри" — деталі в Налаштуваннях', 'error');
        return false;
    }
    // Без Math.abs: раніше -500 «валідувалось» як 500, а викликач далі списував
    // сирий -500 через increment(-bet), тобто НАРАХОВУВАВ гравцю гроші.
    const bet = Number.parseInt(amount, 10);
    if(!Number.isSafeInteger(bet) || bet <= 0 || bet > MAX_BET || !((userData.balance || 0) >= bet)) {
        notify("Недостатньо коштів або невірна сума!", "error");
        return false;
    }
    return bet;
}

function recordBalanceHistory() {
  if(!currentUser||!userData) return;
  db.ref('users/'+currentUser+'/balanceHistory').push(userData.balance||0);
}
function addToHistory(msg) {
    try { db.ref(`users/${currentUser}/history`).push({text: msg, date: Date.now()}); } catch(e) { console.warn(e); }
    // increment totalGames for rank tracking
    if(msg.includes('+') || msg.includes('-')) {
      db.ref('users/'+currentUser+'/totalGames').set(firebase.database.ServerValue.increment(1));
      if(msg.includes('+')) db.ref('users/'+currentUser+'/totalWins').set(firebase.database.ServerValue.increment(1));
    }
}

