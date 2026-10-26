// ============================================
// ===== VIP СИСТЕМА =====
// ============================================
// Вибір гравця живе в базі (cashbackOff) — його читає й сервер, який
// нараховує кешбек за серверні ставки. Старе значення з localStorage
// переносимо туди один раз.
function getCashbackEnabled() {
  try {
    if(localStorage.getItem('cashback_enabled') === 'false' && currentUser && userData) {
      localStorage.removeItem('cashback_enabled');
      if(userData.cashbackOff !== true) setCashbackEnabled(false);
    }
  } catch(e) { console.warn(e); }
  return !(userData && userData.cashbackOff === true);
}
function setCashbackEnabled(val) {
  if(!currentUser) return;
  if(userData) userData.cashbackOff = val ? null : true;
  db.ref('users/'+currentUser+'/cashbackOff').set(val ? null : true);
}

function addWager(amount) {
  if(!userData.isBot) antiCheatRecordBet(amount);
  // Progressive jackpot: 0.05% of wager
  try { db.ref('jackpot/amount').set(firebase.database.ServerValue.increment(Math.ceil(amount*0.0005))); } catch(e) { console.warn(e); }
  // Частину, яку вже врахував сервер (серверні ігри), не пишемо вдруге.
  if(Date.now() - _serverWagerCreditAt > 15000) _serverWagerCredit = 0;
  const covered = Math.min(_serverWagerCredit, amount);
  _serverWagerCredit -= covered;
  amount -= covered;
  if(amount <= 0) return;
  const inc = firebase.database.ServerValue.increment;
  const wagered = (userData.totalWagered || 0) + amount;
  const vip = getVipLevel(wagered);
  const prevVip = getVipLevel(userData.totalWagered || 0);
  const updates = { totalWagered: inc(amount) };

  // Cashback (only if enabled by user)
  if((vip.cashback + clanCashbackBonus) > 0 && getCashbackEnabled()) {
    // Raw cashback for this bet
    const rawCashback = Math.floor(amount * (vip.cashback + clanCashbackBonus));
    // Clamp per-bet
    const betCashback = Math.min(rawCashback, CASHBACK_MAX_PER_BET);
    if(betCashback > 0) {
      // Check weekly limit
      const weeklyUsed = userData.cashbackWeekUsed || 0;
      const weekStart  = userData.cashbackWeekStart || 0;
      const now = Date.now();
      const oneWeek = 7 * 24 * 3600 * 1000;
      const isNewWeek = (now - weekStart) >= oneWeek;
      const currentWeekUsed = isNewWeek ? 0 : weeklyUsed;
      const canAdd = Math.max(0, CASHBACK_MAX_PER_WEEK - currentWeekUsed);
      const finalCashback = Math.min(betCashback, canAdd);
      if(finalCashback > 0) {
        // Accumulate pending cashback (user claims it from cashier)
        updates.cashbackPending   = inc(finalCashback);
        updates.cashbackWeekUsed  = currentWeekUsed + finalCashback;
        updates.cashbackWeekStart = isNewWeek ? now : weekStart;
      }
    }
  }

  // VIP level up
  if(vip.index > prevVip.index) {
    setTimeout(() => notify(`🎉 VIP підвищено до ${vip.icon} ${vip.name}!`, 'success'), 700);
    notifyBot('player-ping', null, { to: currentUser, kind: 'vipup', ref: { name: vip.name, icon: vip.icon } });
  }
  db.ref('users/' + currentUser).update(updates);
  // Battle Pass XP: 1 XP per 100₴ wagered
  addBpXP(Math.floor(amount / 100));
}

// Claim cashback from cashier
async function claimCashback() {
  let pending = userData.cashbackPending || 0;
  if(pending <= 0) return notify('Немає накопиченого кешбеку', 'info');
  if(pending < CASHBACK_MIN_CLAIM) return notify(`❌ Мінімум для виплати: ${CASHBACK_MIN_CLAIM} ₴. Зараз: ${formatNumber(pending)} ₴`, 'error');
  const srv = await serverReward('cashback');
  if(srv.mode === 'error') return;
  if(srv.mode === 'server') pending = srv.r.amount;
  else db.ref('users/'+currentUser).update({
    balance: firebase.database.ServerValue.increment(pending),
    cashbackPending: 0,
    cashbackTotalClaimed: (userData.cashbackTotalClaimed||0) + pending
  });
  playSound('win');
  notify(`💰 Кешбек отримано: +${formatNumber(pending)} ₴`, 'success');
  addToHistory('Кешбек: +'+pending);
  addCardTransaction('in', pending, 'Кешбек нараховано', 'SlotOK Casino');
  updateCashierCashbackUI();
  updateRakebackUI();
}

function toggleCashback(el) {
  const enabled = el.checked;
  setCashbackEnabled(enabled);
  notify(enabled ? '💰 Кешбек увімкнено' : '💰 Кешбек вимкнено', 'info');
}

function updateCashierCashbackUI() {
  const el = document.getElementById('cashierCashbackPanel');
  if(!el) return;
  if(!userData) { el.innerHTML = '<div class="ks-muted">Завантаження…</div>'; return; }

  const pending   = userData.cashbackPending || 0;
  const weekUsed  = userData.cashbackWeekUsed || 0;
  const weekStart = userData.cashbackWeekStart || Date.now();
  const daysLeft  = Math.max(0, Math.ceil((7*24*3600000 - (Date.now()-weekStart)) / 86400000));
  const weekLeft  = Math.max(0, CASHBACK_MAX_PER_WEEK - weekUsed);
  const wagered   = userData.totalWagered || 0;
  const vip       = getVipLevel(wagered);
  const enabled   = getCashbackEnabled();
  const hasNext   = vip.index < VIP_LEVELS.length - 1;
  const nextVip   = VIP_LEVELS[Math.min(vip.index + 1, VIP_LEVELS.length - 1)];
  const tierPct   = hasNext
    ? Math.min(100, Math.max(0, ((wagered - vip.min) / (nextVip.min - vip.min)) * 100))
    : 100;

  el.innerHTML = `
    <div class="ks-tier">
      <div class="ks-tier-mark">${vip.icon}</div>
      <div style="flex:1;min-width:0;">
        <div class="ks-tier-name">${vip.name}</div>
        <div class="ks-tier-note ks-num">${((vip.cashback + clanCashbackBonus) * 100).toFixed(2)}% з кожної ставки${clanCashbackBonus > 0 ? ' · бонус клану' : ''}</div>
      </div>
      <label style="display:flex;align-items:center;gap:9px;cursor:pointer;">
        <span class="ks-hint">${enabled ? 'Увімк.' : 'Вимк.'}</span>
        <div class="toggle-switch" style="width:40px;height:22px;"><input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleCashback(this)"><div class="toggle-slider"></div></div>
      </label>
    </div>

    <section class="ks-panel">
      <div class="ks-panel-body">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ks-fg-3);margin-bottom:9px;">
          <span>${vip.name}</span>
          <span>${hasNext ? nextVip.name : 'Максимальний рівень'}</span>
        </div>
        <div class="ks-meter"><div class="ks-meter-fill" style="width:${tierPct}%;"></div></div>
        ${hasNext ? `<div style="text-align:right;font-size:11px;color:var(--ks-fg-3);margin-top:8px;">До «${nextVip.name}» — ще ${formatNumber(Math.max(0, nextVip.min - wagered))} ₴ ставок</div>` : ''}
      </div>
    </section>

    <section class="ks-panel">
      <div class="ks-stats">
        <div class="ks-stat">
          <div class="ks-stat-lbl">Накопичено</div>
          <div class="ks-stat-val is-pos">${formatNumber(pending)} ₴</div>
        </div>
        <div class="ks-stat">
          <div class="ks-stat-lbl">Ліміт тижня</div>
          <div class="ks-stat-val is-acc">${formatNumber(weekLeft)} ₴</div>
        </div>
        <div class="ks-stat">
          <div class="ks-stat-lbl">Скидання</div>
          <div class="ks-stat-val">${daysLeft} дн</div>
        </div>
      </div>
    </section>

    <div class="ks-copy" style="align-items:flex-start;">
      <span style="color:var(--ks-acc);margin-top:1px;">${ksIcon('shield', 17)}</span>
      <div class="ks-copy-main ks-hint">Не більше <b>${CASHBACK_MAX_PER_BET} ₴</b> за одну ставку і <b>${formatNumber(CASHBACK_MAX_PER_WEEK)} ₴</b> за тиждень. Забрати можна від <b>2 000 ₴</b>.</div>
    </div>

    <button class="ks-btn is-pos is-block" onclick="claimCashback()" ${pending <= 0 ? 'disabled' : ''}>
      Забрати ${formatNumber(pending)} ₴
    </button>

    <section class="ks-panel" style="margin-top:14px;">
      <div class="ks-row">
        <div class="ks-icn is-pos">${ksIcon('percent')}</div>
        <div class="ks-row-main"><div class="ks-row-title">Усього отримано кешбеку</div></div>
        <div class="ks-row-value is-pos">${formatNumber(userData.cashbackTotalClaimed || 0)} ₴</div>
      </div>
    </section>`;
}

function updateVipUI() {
  const wagered = userData.totalWagered || 0;
  const vip = getVipLevel(wagered);
  const nextVip = VIP_LEVELS[Math.min(vip.index + 1, VIP_LEVELS.length - 1)];
  
  // Значок у профілі
  const slotikyHeaderEl = document.getElementById('headerSlotiky');
  if(slotikyHeaderEl) slotikyHeaderEl.textContent = formatNumber(userData.slotiky||0);
  const badge = document.getElementById('profileVipBadge');
  if(badge) badge.innerHTML = `<span class="vip-badge vip-${vip.class}">${vip.icon} ${vip.name}</span>`;

  // VIP екран
  const card = document.getElementById('vipCurrentCard');
  if(!card) return;
  card.className = `vip-card ${vip.class}`;
  document.getElementById('vipLevelName').textContent = `${vip.icon} ${vip.name}`;
  animateNumberText(document.getElementById('vipWagered'), wagered, '', ' ₴');

  const fill = document.getElementById('vipProgressFill');
  if(vip.index < VIP_LEVELS.length - 1) {
    const pct = Math.min(100, ((wagered - vip.min) / (nextVip.min - vip.min)) * 100);
    fill.style.width = pct + '%';
    fill.style.background = vip.cssVar;
    document.getElementById('vipProgLeft').textContent = formatNumber(wagered - vip.min) + ' ₴';
    document.getElementById('vipProgRight').textContent = `до ${nextVip.icon} ${nextVip.name}: ${formatNumber(nextVip.min)} ₴`;
  } else {
    fill.style.width = '100%';
    fill.style.background = 'var(--plat)';
    document.getElementById('vipProgRight').textContent = 'Максимальний рівень! 🏆';
  }

  // Список усіх рівнів будується з VIP_LEVELS — того самого масиву, за яким
  // реально нараховується кешбек і погодинний бонус. Раніше це були чотири
  // захардкоджені картки (Bronze 0% / Silver 1% / Gold 2% / Platinum 5%),
  // яких движок ніколи не платив.
  const allEl = document.getElementById('vipAllLevels');
  if(allEl) {
    allEl.innerHTML = VIP_LEVELS.map((lv, i) => {
      const titleColor = lv.cssVar.indexOf('gradient') >= 0 ? 'var(--accent)' : lv.cssVar;
      return `
      <div class="vip-card ${lv.class}" style="margin-bottom:8px;${i === vip.index ? 'outline:1px solid var(--accent);' : ''}">
        <div style="font-size:14px; font-weight:bold; color:${titleColor}; margin-bottom:8px;">
          ${lv.icon} ${lv.name} — ${lv.min === 0 ? 'старт' : 'від ' + formatNumber(lv.min) + ' ₴ ставок'}
        </div>
        <div class="vip-perk"><span class="vip-perk-icon">🎁</span><span>Щоденний бонус ×${lv.dailyMult}</span></div>
        <div class="vip-perk"><span class="vip-perk-icon">⏰</span><span>Погодинний бонус: ${lv.hourly} ₴</span></div>
        <div class="vip-perk"><span class="vip-perk-icon">💰</span><span>Кешбек: ${+(lv.cashback * 100).toFixed(2)}% з кожної ставки</span></div>
      </div>`;
    }).join('');
  }

  // Плитки погодинного бонусу — з того ж VIP_LEVELS. Раніше це були чотири
  // захардкоджені суми (25/50/100/200 ₴), які вже розійшлися з движком, а
  // підсвітка по індексу працювала лише для перших чотирьох із 14 рівнів.
  const hourlyEl = document.getElementById('hourlyVipTiers');
  if(hourlyEl) {
    hourlyEl.innerHTML = VIP_LEVELS.map((lv, i) => {
      const c = lv.cssVar.indexOf('gradient') >= 0 ? 'var(--accent)' : lv.cssVar;
      return `<div class="hourly-vip-tier${i === vip.index ? ' active' : ''}">
        <div class="hourly-vip-amount" style="color:${c};">${lv.hourly}₴</div>
        <div style="color:${c};">${lv.icon} ${lv.name}</div>
      </div>`;
    }).join('');
    const active = hourlyEl.querySelector('.hourly-vip-tier.active');
    if(active) active.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
  }
}

// ============================================
// ===== ПОГОДИННИЙ БОНУС =====
// ============================================
let hourlyTimerInterval = null;

function initHourlyBonus() {
  updateVipUI();
  const vip = getVipLevel(userData.totalWagered || 0);
  document.getElementById('hourlyBonusAmount').textContent = vip.hourly;
  updateHourlyTimer();
  if(hourlyTimerInterval) clearInterval(hourlyTimerInterval);
  hourlyTimerInterval = setInterval(updateHourlyTimer, 1000);
  loadHourlyHistory();
}

function updateHourlyTimer() {
  const last = userData.lastHourlyBonus || 0;
  const now = Date.now();
  const hourMs = 3600000;
  const diff = now - last;
  const ring = document.getElementById('hourlyRing');
  const timerText = document.getElementById('hourlyTimerText');
  const statusText = document.getElementById('hourlyStatusText');
  const claimBtn = document.getElementById('hourlyClaimBtn');
  if(!ring) return;

  if(diff >= hourMs) {
    ring.classList.add('ready');
    ring.textContent = '🎁';
    timerText.textContent = 'Готово!';
    timerText.style.color = 'var(--green)';
    statusText.textContent = 'Натисни щоб забрати бонус';
    claimBtn.classList.remove('hidden');
  } else {
    ring.classList.remove('ready');
    ring.textContent = '⏰';
    const left = hourMs - diff;
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    timerText.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    timerText.style.color = 'var(--accent)';
    statusText.textContent = 'Наступний бонус через';
    claimBtn.classList.add('hidden');
  }
}

async function claimHourlyBonus() {
  const last = userData.lastHourlyBonus || 0;
  if(Date.now() - last < HOURLY_BONUS_MS) return notify('Ще не час! Зачекай годину.', 'error');
  const srv = await serverReward('hourly');
  if(srv.mode === 'error') return;
  if(srv.mode === 'server') {
    const r = srv.r;
    addToHistory(`Hourly Bonus +${r.amount}₴ (${r.vip.name})`);
    playSound('win');
    notify(`⏰ Погодинний бонус: +${r.amount} ₴ (${r.vip.icon} ${r.vip.name})`, 'success');
    setTimeout(loadHourlyHistory, 300);
    return;
  }
  const vip = getVipLevel(userData.totalWagered || 0);
  const amount = vip.hourly;
  db.ref('users/' + currentUser).update({
    balance: (userData.balance || 0) + amount,
    lastHourlyBonus: Date.now()
  });
  db.ref('users/' + currentUser + '/hourlyHistory').push({ amount, time: Date.now(), vip: vip.name });
  addToHistory(`Hourly Bonus +${amount}₴ (${vip.name})`);
  playSound('win');
  notify(`⏰ Погодинний бонус: +${amount} ₴ (${vip.icon} ${vip.name})`, 'success');
  loadHourlyHistory();
}

function loadHourlyHistory() {
  db.ref('users/' + currentUser + '/hourlyHistory').limitToLast(5).once('value', snap => {
    const el = document.getElementById('hourlyHistory');
    if(!el) return;
    const data = snap.val();
    if(!data) { el.innerHTML = '<div style="color:var(--fg-3);font-size:13px;text-align:center;padding:10px 0;">Немає записів</div>'; return; }
    el.innerHTML = '';
    Object.values(data).reverse().forEach(h => {
      const t = new Date(h.time).toLocaleString('uk-UA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
      el.innerHTML += `<div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--surface-1);border-radius:var(--r-md);margin-bottom:5px;font-size:13px;">
        <span style="color:var(--fg-3);">${t}</span>
        <span style="color:var(--green);font-weight:bold;">+${h.amount} ₴</span>
      </div>`;
    });
  });
}

// ============================================
// ===== ЛУТ-БОКСИ =====
// ============================================
// Weights are tuned so every tier pays out BELOW 100% of its price on
// average (~89% common / ~92% rare / ~96% epic) — RTP that still leaves
// real upside variance on a lucky pull, but can't be farmed for guaranteed
// profit by opening boxes in bulk. (Previously every tier averaged >100%
// of price back, which is a straight money-printing exploit at scale.)
const LOOTBOX_CONFIGS = {
  common: {
    name: 'Звичайний ящик', icon: '📦', price: 150, color: '#aaa',
    prizes: [
      { weight: 70, mult: 0.5, label: 'Втішний приз' },
      { weight: 20, mult: 1.0, label: 'Повернення' },
      { weight: 6,  mult: 2.0, label: 'Подвоєння!' },
      { weight: 3,  mult: 4.0, label: '🔥 Гарячий приз!' },
      { weight: 1,  mult: 10.0, label: '💥 ДЖЕКПОТ!' },
    ]
  },
  rare: {
    name: 'Rare Box', icon: '💠', price: 500, color: '#4a9eff',
    prizes: [
      { weight: 75, mult: 0.5, label: 'Втішний приз' },
      { weight: 17, mult: 1.2, label: 'Повернення' },
      { weight: 5,  mult: 2.5, label: 'Подвоєння!' },
      { weight: 2,  mult: 5.0, label: '🔥 Гарячий приз!' },
      { weight: 1,  mult: 12.0, label: '💥 ДЖЕКПОТ!' },
    ]
  },
  epic: {
    name: 'Epic Box', icon: '💜', price: 2000, color: '#b57bee',
    prizes: [
      { weight: 85, mult: 0.6, label: 'Втішний приз' },
      { weight: 10, mult: 1.5, label: 'Повернення' },
      { weight: 3,  mult: 3.0, label: 'Потрійний приз!' },
      { weight: 1,  mult: 6.0, label: '🔥 Великий приз!' },
      { weight: 1,  mult: 15.0, label: '💥 ЕПІЧНИЙ ДЖЕКПОТ!' },
    ]
  }
};

function rollLootbox(config) {
  const total = config.prizes.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for(const p of config.prizes) { r -= p.weight; if(r <= 0) return p; }
  return config.prizes[config.prizes.length - 1];
}

let _lootboxOpening = false;

// Admin-tunable house edge on top of the base weights (Адмінка → Фінанси →
// "Лут-бокси"): 1.0 = the tuned baseline above, lower values shave payouts
// further. Clamped to [0.5, 1.0] so a typo/mistake in the admin panel can
// never push a box back into guaranteed-profit territory.
function getLootboxEdgeMultiplier() {
  return db.ref('admin_settings/lootboxEdge').once('value').then(snap => {
    const v = snap.val();
    return (typeof v === 'number') ? Math.min(1, Math.max(0.5, v)) : 1;
  }).catch(() => 1);
}

function openLootbox(type) {
  const cfg = LOOTBOX_CONFIGS[type];
  if(_lootboxOpening) return;
  if(userData.balance < cfg.price) return notify(`Недостатньо коштів! Потрібно ${cfg.price} ₴`, 'error');
  _lootboxOpening = true;

  // Atomic check-and-deduct — a plain increment() after only a client-side
  // balance check lets someone spam-click past the check before the local
  // balance re-syncs and buy boxes they can't afford, pushing the real
  // balance negative. A transaction re-reads the live server value on every
  // attempt, so it can never deduct more than what's actually there.
  db.ref('users/' + currentUser + '/balance').transaction(bal => {
    if(bal == null || bal < cfg.price) return; // abort — refuses the write
    return bal - cfg.price;
  }, (err, committed) => {
    if(err || !committed) {
      _lootboxOpening = false;
      if(!err) notify(`Недостатньо коштів! Потрібно ${cfg.price} ₴`, 'error');
      return;
    }

    addWager(cfg.price);
    trackQuest('openLootbox', 1);

    const prize = rollLootbox(cfg);

    getLootboxEdgeMultiplier().then(edge => {
      const win = Math.floor(cfg.price * prize.mult * edge);

      const resultScreen = document.getElementById('lootboxResultScreen');
      // Reparent to <body> so position:fixed is relative to the viewport, not
      // the .screen ancestor — .screen-enter's transform animation otherwise
      // turns it into a containing block and traps the fixed overlay in-flow.
      if (resultScreen.parentElement !== document.body) document.body.appendChild(resultScreen);
      resultScreen.classList.remove('hidden');
      document.getElementById('lbOpenEmoji').textContent = cfg.icon;
      ['lbWinAmount', 'lbWinType', 'lbClaimBtn'].forEach(id => document.getElementById(id).classList.add('hidden'));

      const reveal = () => {
        const amtEl = document.getElementById('lbWinAmount');
        amtEl.textContent = '+' + win + ' ₴';
        amtEl.style.color = prize.mult >= 5 ? 'var(--green)' : 'var(--accent)';
        document.getElementById('lbWinType').textContent = `${cfg.name} • ${prize.label}`;
        ['lbWinAmount', 'lbWinType', 'lbClaimBtn'].forEach(id => document.getElementById(id).classList.remove('hidden'));
        playSound(prize.mult >= 2 ? 'win' : 'click');
        _lootboxOpening = false;
      };
      playCaseOpen3D(cfg.color, reveal, type);

      // Нараховуємо виграш (не чекає на візуальну анімацію)
      db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(win));
      db.ref('users/' + currentUser + '/lootboxHistory').push({ type, win, price: cfg.price, time: Date.now() });
      addToHistory(`LootBox ${cfg.name}: +${win} ₴`);
      loadLootboxHistory();
    });
  });
}

let _threeLoadPromise = null;
function loadThreeJS() {
  if (window.THREE) return Promise.resolve();
  if (_threeLoadPromise) return _threeLoadPromise;
  _threeLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/three@0.160.0/build/three.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('three.js failed to load'));
    document.head.appendChild(s);
  });
  return _threeLoadPromise;
}

function supports3DCaseOpen() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch(e) { return false; }
}

// Spins a rotating 3D case in the reveal overlay (color-matched to the box
// rarity, shape-matched too — see GEOMETRY_BY_TIER below), then bursts and
// hands off to reveal(). Falls straight through to reveal() on
// reduced-motion, no WebGL, or if the three.js CDN fails to load — the
// prize/balance logic in openLootbox never depends on this running.
function playCaseOpen3D(color, reveal, tier) {
  if (!supports3DCaseOpen()) { reveal(); return; }
  const canvas = document.getElementById('lbCaseCanvas');
  const emoji = document.getElementById('lbOpenEmoji');
  loadThreeJS().then(() => {
    const THREE = window.THREE;
    canvas.classList.remove('hidden');
    emoji.classList.add('hidden');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(220, 220, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 4.2);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 3, 4);
    scene.add(key);
    const rim = new THREE.PointLight(color, 1.5, 10);
    rim.position.set(-2, -1, 2);
    scene.add(rim);

    // Кожна рідкість — своя форма, не лише колір: Common — простий куб,
    // Rare — октаедр (грань діаманта, як іконка 💠), Epic — ікосаедр
    // (найбільш "коштовна" багатогранна форма, під іконку 💜).
    const GEOMETRY_BY_TIER = {
      common: () => new THREE.BoxGeometry(1.6, 1.6, 1.6),
      rare:   () => new THREE.OctahedronGeometry(1.15, 0),
      epic:   () => new THREE.IcosahedronGeometry(1.05, 0),
    };
    const geometry = (GEOMETRY_BY_TIER[tier] || GEOMETRY_BY_TIER.common)();
    const material = new THREE.MeshStandardMaterial({ color, metalness: .6, roughness: .25, emissive: color, emissiveIntensity: .15 });
    const shape = new THREE.Mesh(geometry, material);
    scene.add(shape);

    // Мерехтливі частинки навколо форми — густіші для вищої рідкості,
    // щоб epic-відкриття відчувалось помітно "більшим", ніж common.
    const sparkleCount = tier === 'epic' ? 70 : tier === 'rare' ? 40 : 18;
    const positions = new Float32Array(sparkleCount * 3);
    for (let i = 0; i < sparkleCount; i++) {
      const r = 1.6 + Math.random() * 0.9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const sparkleGeo = new THREE.BufferGeometry();
    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const sparkleMat = new THREE.PointsMaterial({ color, size: 0.05, transparent: true, opacity: .85 });
    const sparkles = new THREE.Points(sparkleGeo, sparkleMat);
    scene.add(sparkles);

    // Дорожчі ящики крутяться довше — більше передчуття перед розкриттям.
    const spinMs = tier === 'epic' ? 2200 : tier === 'rare' ? 1850 : 1500;
    const t0 = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - t0) / spinMs);
      const eased = 1 - Math.pow(1 - t, 3);
      shape.rotation.y = eased * Math.PI * 2 * 4;
      shape.rotation.x = Math.sin(t * Math.PI) * 0.4;
      sparkles.rotation.y = -eased * Math.PI * 2 * 1.5;
      const s = 1 + Math.sin(t * Math.PI) * .08;
      shape.scale.set(s, s, s);
      renderer.render(scene, camera);
      if (t < 1) requestAnimationFrame(tick); else burst();
    }
    function burst() {
      const tb0 = performance.now(), burstMs = 300;
      material.transparent = true;
      sparkleMat.transparent = true;
      (function step(now) {
        const t = Math.min(1, (now - tb0) / burstMs);
        const s = 1 + t * 1.6;
        shape.scale.set(s, s, s);
        material.opacity = 1 - t;
        sparkles.scale.setScalar(1 + t * 2.2);
        sparkleMat.opacity = .85 * (1 - t);
        renderer.render(scene, camera);
        if (t < 1) requestAnimationFrame(step); else finish();
      })(tb0);
    }
    function finish() {
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      sparkleGeo.dispose();
      sparkleMat.dispose();
      canvas.classList.add('hidden');
      emoji.classList.remove('hidden');
      reveal();
    }
    requestAnimationFrame(tick);
  }).catch(() => reveal());
}

function closeLootboxResult() {
  document.getElementById('lootboxResultScreen').classList.add('hidden');
}

function loadLootboxHistory() {
  db.ref('users/' + currentUser + '/lootboxHistory').limitToLast(5).once('value', snap => {
    const el = document.getElementById('lootboxHistory');
    if(!el) return;
    const data = snap.val();
    if(!data) return;
    el.innerHTML = '';
    Object.values(data).reverse().forEach(h => {
      const cfg = LOOTBOX_CONFIGS[h.type];
      const t = new Date(h.time).toLocaleString('uk-UA', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'});
      const profit = h.win - h.price;
      const color = profit >= 0 ? 'var(--green)' : 'var(--red)';
      el.innerHTML += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface-1);border-radius:var(--r-md);margin-bottom:5px;font-size:13px;">
        <span>${cfg ? cfg.icon : '📦'} ${cfg ? cfg.name : h.type}</span>
        <span style="color:var(--fg-3);">${t}</span>
        <span style="color:${color};font-weight:bold;">${profit >= 0 ? '+' : ''}${profit} ₴</span>
      </div>`;
    });
  });
}

// ============================================
// ===== КВЕСТИ =====
// ============================================
const DAILY_QUESTS = [
  { id: 'playSlots5',    icon: '🎰', title: 'Зіграй у слоти 5 разів',      reward: 150, goal: 5,  key: 'slotsPlayed' },
  { id: 'winBJ',         icon: '🃏', title: 'Виграй у блекджек 2 рази',    reward: 200, goal: 2,  key: 'bjWins' },
  { id: 'roulette3',     icon: '🎡', title: 'Зроби 3 ставки в рулетці',    reward: 100, goal: 3,  key: 'rouletteBets' },
  { id: 'crashCashout',  icon: '🚀', title: 'Зроби кешаут у Краші',        reward: 300, goal: 1,  key: 'crashCashouts' },
  { id: 'openLootbox',   icon: '📦', title: 'Відкрий лут-бокс',            reward: 100, goal: 1,  key: 'lootboxOpened' },
];

const WEEKLY_QUESTS = [
  { id: 'play50games',   icon: '🎮', title: 'Зіграй 50 ігор',              reward: 1000, goal: 50, key: 'totalGames' },
  { id: 'wager10k',      icon: '💰', title: 'Постав 10 000 ₴ сумарно',    reward: 500,  goal: 10000, key: 'weekWager', isAmount: true },
  { id: 'openBox3',      icon: '📦', title: 'Відкрий 3 лут-бокси',         reward: 800,  goal: 3,  key: 'lootboxOpened' },
];

function getTodayStr() { return new Date().toISOString().split('T')[0]; }
function getWeekStr()  {
  const d = new Date(); const day = d.getDay();
  d.setDate(d.getDate() - day); return d.toISOString().split('T')[0];
}

function trackQuest(key, amount = 1) {
  const today = getTodayStr();
  const week  = getWeekStr();
  const dqPath = `users/${currentUser}/quests/daily/${today}`;
  const wqPath = `users/${currentUser}/quests/weekly/${week}`;

  db.ref(dqPath + '/' + key).transaction(v => (v || 0) + amount);
  db.ref(wqPath + '/' + key).transaction(v => (v || 0) + amount);

  // Перевіряємо завершені квести і показуємо значок
  db.ref(`users/${currentUser}/quests/daily/${today}`).once('value', snap => {
    const prog = snap.val() || {};
    const readyCount = DAILY_QUESTS.filter(q => {
      const claimed = userData.quests?.daily?.[today]?.['claimed_' + q.id];
      return !claimed && (prog[q.key] || 0) >= q.goal;
    }).length;
    const badge = document.getElementById('questsBadge');
    if(badge) badge.classList.toggle('hidden', readyCount === 0);
  });
}

function renderQuestCard(q, progress, claimed, onClaim) {
  const done = progress >= q.goal;
  const pct = Math.min(100, (progress / q.goal) * 100);
  const statusClass = claimed ? 'claimed' : done ? 'done' : '';
  return `<div class="quest-card ${statusClass}">
    <div class="quest-header">
      <span class="quest-icon">${q.icon}</span>
      <span class="quest-title">${q.title}</span>
      <span class="quest-reward">+${q.reward} ₴</span>
    </div>
    <div class="quest-prog-bar"><div class="quest-prog-fill" style="width:${pct}%"></div></div>
    <div class="quest-prog-text">${q.isAmount ? formatNumber(progress) + ' / ' + formatNumber(q.goal) + ' ₴' : progress + ' / ' + q.goal}</div>
    ${done && !claimed ? `<button class="quest-claim-btn" onclick="claimQuest('${q.id}','${onClaim}',${q.reward})">🎁 ЗАБРАТИ ${q.reward} ₴</button>` : ''}
    ${claimed ? '<div style="color:var(--green);font-size:12px;margin-top:6px;text-align:center;">✅ Виконано і отримано</div>' : ''}
  </div>`;
}

function loadQuests() {
  const today = getTodayStr();
  const week  = getWeekStr();

  db.ref(`users/${currentUser}/quests/daily/${today}`).once('value', snap => {
    const prog = snap.val() || {};
    const list = document.getElementById('questsList');
    if(!list) return;
    list.innerHTML = DAILY_QUESTS.map(q => {
      const claimed = prog['claimed_' + q.id];
      const progress = prog[q.key] || 0;
      return renderQuestCard(q, progress, claimed, 'daily/' + today);
    }).join('');
    // Оновлюємо значок
    const readyCount = DAILY_QUESTS.filter(q => !prog['claimed_' + q.id] && (prog[q.key] || 0) >= q.goal).length;
    const badge = document.getElementById('questsBadge');
    if(badge) badge.classList.toggle('hidden', readyCount === 0);
  });

  db.ref(`users/${currentUser}/quests/weekly/${week}`).once('value', snap => {
    const prog = snap.val() || {};
    const list = document.getElementById('weeklyQuestsList');
    if(!list) return;
    list.innerHTML = WEEKLY_QUESTS.map(q => {
      const claimed = prog['claimed_' + q.id];
      const progress = prog[q.key] || 0;
      return renderQuestCard(q, progress, claimed, 'weekly/' + week);
    }).join('');
  });

  // Таймер до скидання
  const timerEl = document.getElementById('questTimerDisplay');
  if(timerEl) {
    const now = new Date();
    const midnight = new Date(); midnight.setHours(24,0,0,0);
    const left = midnight - now;
    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    timerEl.textContent = `Скидання через ${h}год ${m}хв`;
  }
}

function claimQuest(questId, pathSuffix, reward) {
  db.ref(`users/${currentUser}/quests/${pathSuffix}/claimed_${questId}`).set(true);
  db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(reward));
  addToHistory(`Quest "${questId}": +${reward}₴`);
  playSound('win');
  notify(`📋 Завдання виконано! +${reward} ₴`, 'success');
  setTimeout(loadQuests, 300);
}

// ============================================
// ОНОВЛЕННЯ switchTab + ІНТЕГРАЦІЯ КВЕСТІВ
// ============================================
const _origSwitchTab = switchTab;
// Яка nav-кнопка відповідає якому табу
const NAV_TAB_MAP = {
  home:0, lobby:1, cashier:2, notifications:3, profile:4, settings:5, more:5,
  slots:1, roulette:1, crash:1, mines:1, fortune:1, poker:1, blackjack:1,
  scratch:1, chests:1, plinko:1, keno:1, dice:1, hilo:1, tower:1,
  cardgame:1, monopoly:1, 'monopoly-mp':1, sports:1, esports:1,
  tournaments:5, referrals:5, vip:5, quests:5, lootboxes:5,
  hourly:5, clans:5, leaderboard:5, slotiky:5,
  achievements:5, battlepass:5, stats:5, bank:5, admin:4,
  baccarat:1, videpoker:1,
  pm:5, themes:5,
  coinflip:1, rps:1, predict:1,
  limbo:1, dragon:1, penalty:1, bowling:1, archery:1, sicbo:1, cardwar:1, duckshoot:1,
  balloon:1, russianroulette:1, quiz:5, horseracing:1, colorbet:1, chat:5,
  autobet:5, insurance:5, copytrade:5,
  lottery:5, investpool:5,
};

// Кеш вимкнених ігор — оновлюється в реальному часі, дозволяє
// синхронну перевірку прямо всередині switchTab без await
let _disabledGamesCache = {};
function startDisabledGamesWatcher() {
  if(!db) return;
  db.ref('site_config/disabledGames').on('value', snap => {
    _disabledGamesCache = snap.val() || {};
    updateDisabledGameCardsUI();
  });
}

// Знаходить ВСІ картки ігор по всьому DOM (лобі, каруселі, "Ще") через
// їхній власний onclick="openGame('id')"/"switchTab('id')" — без потреби
// вручну редагувати кожну з 30+ карток руками
function updateDisabledGameCardsUI() {
  const amAdmin = isAdminUser();
  const selectors = document.querySelectorAll('[onclick*="openGame("], [onclick*="switchTab("]');
  selectors.forEach(el => {
    const match = el.getAttribute('onclick').match(/(?:openGame|switchTab)\('(\w+)'\)/);
    if(!match) return;
    const gameId = match[1];
    if(!ADMIN_TOGGLEABLE_GAMES.some(g => g.id === gameId)) return; // не гра — пропускаємо
    const isOff = !!_disabledGamesCache[gameId];
    // Гравцям — повністю заблокована і затемнена картка.
    // Адміну — тільки позначка "вимкнено", клік лишається робочим (щоб міг зайти й перевірити/увімкнути).
    el.classList.toggle('game-card-disabled', isOff && !amAdmin);
    el.classList.toggle('game-card-disabled-admin', isOff && amAdmin);
    let badge = el.querySelector('.game-disabled-badge');
    if(isOff && !badge) {
      badge = document.createElement('div');
      badge.className = 'game-disabled-badge';
      badge.textContent = amAdmin ? '🔒 Вимкнено (тільки ти бачиш)' : '🔒 Вимкнено';
      el.style.position = el.style.position || 'relative';
      el.appendChild(badge);
    } else if(!isOff && badge) {
      badge.remove();
    }
  });
}

// Додає сердечко "Улюблене" на кожну картку гри в лобі — знаходить картки так само,
// як updateDisabledGameCardsUI(), щоб не залежати від того, скільки їх намальовано в HTML
function renderFavoriteHearts() {
  document.querySelectorAll('.casino-game-card').forEach(el => {
    const match = (el.getAttribute('onclick') || '').match(/(?:openGame|switchTab)\('(\w+)'\)/);
    if(!match) return;
    const gameId = match[1];
    let heart = el.querySelector('.fav-heart-btn');
    if(!heart) {
      heart = document.createElement('div');
      heart.className = 'fav-heart-btn';
      heart.style.cssText = 'position:absolute;top:4px;left:4px;font-size:14px;z-index:2;line-height:1;filter:drop-shadow(0 1px 2px rgb(var(--shade-rgb) / 0.6));';
      heart.setAttribute('onclick', `toggleFavorite('${gameId}', this); this.textContent = this.classList.contains('active') ? '❤️' : '🤍';`);
      el.style.position = el.style.position || 'relative';
      el.appendChild(heart);
    }
    const isFav = favoriteGames.includes(gameId);
    heart.classList.toggle('active', isFav);
    heart.textContent = isFav ? '❤️' : '🤍';
  });
}

function showAdminBypassBanner(gameId) {
  const existing = document.getElementById('adminBypassBanner');
  if(existing) existing.remove();
  const gameName = (ADMIN_TOGGLEABLE_GAMES.find(g => g.id === gameId) || {}).name || gameId;
  const banner = document.createElement('div');
  banner.id = 'adminBypassBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,color-mix(in srgb, var(--neg) 13%, var(--surface-1)),color-mix(in srgb, var(--neg) 22%, var(--surface-1)));border-bottom:2px solid var(--neg);padding:10px 16px;z-index:9997;display:flex;justify-content:space-between;align-items:center;gap:10px;';
  banner.innerHTML = `
    <div style="font-size:12px;color:var(--neg);flex:1;">🛠 <b>${gameName}</b> вимкнена для гравців — ти бачиш її, бо ти адмін</div>
    <button onclick="toggleGameEnabled('${gameId}');document.getElementById('adminBypassBanner').remove();switchTab('lobby')" style="background:var(--pos);border:none;border-radius:var(--r-md);padding:6px 12px;color:var(--on-pos);font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap;">✅ Увімкнути</button>
    <button onclick="document.getElementById('adminBypassBanner').remove()" style="background:none;border:1px solid var(--line-strong);border-radius:var(--r-md);padding:6px 10px;color:var(--fg-2);font-size:11px;cursor:pointer;">✕</button>
  `;
  document.body.appendChild(banner);
}

// 3D-нахили й паралакс карток прибрано в редизайні «Нічна друкарня»:
// пласка мова друку замість «скла» й об'єму (DESIGN_SYSTEM.md).

function switchTab(id, el) {
  // Kill-switch: якщо гру вимкнено адміном — не пускаємо звичайних гравців
  if(_disabledGamesCache[id]) {
    if(!isAdminUser()) {
      notify('🛠 Ця гра тимчасово недоступна (технічні роботи)', 'error');
      return;
    } else {
      // Адмін навмисно пропускається (щоб міг сам перевірити/увімкнути назад),
      // але це має бути ОЧЕВИДНО, а не тихо — інакше здається що вимкнення не працює
      setTimeout(() => showAdminBypassBanner(id), 50);
    }
  }
  try {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const tab = document.getElementById('tab-' + id);
    const shown = tab || document.getElementById('tab-home');
    if(tab) {
      tab.classList.remove('hidden');
    } else {
      // Tab not found — go home
      console.warn('switchTab: tab-' + id + ' not found');
      if(shown) shown.classList.remove('hidden');
    }
    // Плавна поява екрана (той самий cascadeIn, що й у карток) —
    // retrigger вимагає видалити клас і форсувати reflow перед повторним додаванням
    if(shown) {
      shown.classList.remove('screen-enter');
      void shown.offsetWidth;
      shown.classList.add('screen-enter');
    }
  } catch(e) { console.error('switchTab hide error:', e); }

  try {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
    let activeNav = null;
    if(el && el.classList && el.classList.contains('nav-item')) {
      activeNav = el;
    } else {
      const navIdx = NAV_TAB_MAP[id];
      if(navIdx !== undefined && navItems[navIdx]) activeNav = navItems[navIdx];
    }
    if(activeNav) { activeNav.classList.add('active'); activeNav.setAttribute('aria-current', 'page'); }
  } catch(e) { console.error('switchTab nav error:', e); }

  // Stop crash if leaving
  try {
    if(id !== 'crash' && isCrashPlaying) {
      clearInterval(crashInt); isCrashPlaying = false; crashActiveBet = 0;
      document.getElementById('crashBtn')?.classList.remove('hidden');
      document.getElementById('crashCashoutBtn')?.classList.add('hidden');
    }
  } catch(e) { console.warn(e); }

  // Reset slot bonus if leaving
  try {
    if(id !== 'slots' && slotBonusRound > 0) {
      slotBonusRound = 0; slotBonusBet = 0;
      document.getElementById('bonusRoundBanner')?.classList.add('hidden');
    }
  } catch(e) { console.warn(e); }

  // Tab-specific init — each wrapped in try/catch
  const safe = (fn) => { try { fn(); } catch(e) { console.error('switchTab init error [' + id + ']:', e); } };

  if(id==='chat')         safe(() => { initLobbyChat(); initChat(); });
  if(id==='keno')         safe(() => initKeno());
  if(id==='fortune')      safe(() => setTimeout(() => drawFortuneWheel(0), 50));
  if(id==='tournaments')  safe(() => { loadTournaments(); loadTourneyStatsBar(); });
  if(id==='scratch')      safe(() => { const g = document.getElementById('scratchGrid'); if(g && !g.children.length) scratchReset(); });
  if(id==='vip')          safe(() => updateVipUI());
  if(id==='quests')       safe(() => loadQuests());
  if(id==='lootboxes')    safe(() => loadLootboxHistory());
  if(id==='hourly')       safe(() => initHourlyBonus());
  if(id==='clans')        safe(() => loadClanTab());
  if(id==='leaderboard')  safe(() => initLeaderboard());
  if(id==='monopoly')     safe(() => { const s = document.getElementById('monoStartScreen'); if(s) s.classList.remove('hidden'); });
  if(id==='cardgame')     safe(() => {
    document.getElementById('cgStartScreen')?.classList.remove('hidden');
    document.getElementById('cgGameScreen')?.classList.add('hidden');
    document.getElementById('cgOnlineLobby')?.classList.add('hidden');
  });
  if(id==='tower')        safe(() => { towerReset(); setTimeout(() => { document.getElementById('towerStartArea')?.classList.remove('hidden'); }, 50); });
  if(id==='hilo')         safe(() => { hiloState = null; document.getElementById('hiloGameArea')?.classList.add('hidden'); });
  if(id==='dice')         safe(() => updateDiceUI());
  if(id==='slotiky')      safe(() => initSlotiky());
  if(id==='achievements') safe(() => { initAchievementsTab(); checkAchievements('tab', null); });
  if(id==='affiliate')    safe(() => initAffiliate());
  if(id==='battlepass')   safe(() => initBattlePass());
  if(id==='stats')        safe(() => initStatsTab());
  if(id==='sports')       safe(() => { loadRealSportMatches(sportsCurrentSport||'soccer', document.querySelector('.sport-tab-btn.active')||document.querySelector('.sport-tab-btn')); loadSportMyBets(); checkPendingBetsOnStartup(); });
  if(id==='colorbet')     safe(() => renderColorHistory());
  if(id==='russianroulette') safe(() => updateRRDisplay());
  if(id==='cashier')      safe(() => { setTimeout(initDepositPackages, 100); switchCashierTab('card', document.getElementById('ctb-card')); setTimeout(() => { updateCashierCashbackUI(); renderCardPanel(); }, 300); });
  if(id==='monopoly-mp')  safe(() => loadMpRooms());
  if(id==='notifications') safe(() => renderNotifs());
  if(id==='settings')     safe(() => { loadSettings(); updateRGLossWarnUI(); updateRakebackUI(); });
  if(id==='home')         safe(() => { initHomeTab(); updateHomeStats(); renderHomeProgressBars(); renderHomeAxiomWidget(); updateDisabledGameCardsUI(); renderFavoriteHearts(); });
  if(id==='lobby')        safe(() => { updateDisabledGameCardsUI(); renderFavoriteHearts(); });
  if(id==='baccarat')     safe(() => initBaccarat());
  if(id==='videpoker')    safe(() => initVideoPoker());
  if(id==='pm')           safe(() => {
    // Про всяк випадок скидаємо на інбокс — якщо хтось лишив відкритою переписку
    // і вийшов не через кнопку "назад" всередині чату
    document.getElementById('pmThreadView')?.classList.add('hidden');
    document.getElementById('pmInboxView')?.classList.remove('hidden');
    renderPmInbox();
    db.ref('users/'+currentUser+'/pmUnread').set(0);
  });
  if(id==='themes')       safe(() => renderThemeGrid());
  if(id==='coinflip')     safe(() => loadCfRooms());
  if(id==='rps')          safe(() => loadRpsRooms());
  if(id==='predict')      safe(() => loadPdRooms());
  if(id==='limbo')        safe(() => updateLimboChance());
  if(id==='mines')        safe(() => updateMinesInfo());
  if(id==='roulette')     safe(() => { initGlobalRoulette(); grListenForResults(); grScheduleNextSpin(); });
  if(id==='admin')        safe(() => initAdminPanel());
  if(id==='dragon')       safe(() => initDragonTower());
  if(id==='penalty')      safe(() => initPenalty());
  if(id==='bowling')      safe(() => initBowling());
  if(id==='archery')      safe(() => initArchery());
  if(id==='sicbo')        safe(() => initSicBo());
  if(id==='cardwar')      safe(() => initCardWar());
  if(id==='duckshoot')    safe(() => initDuckShoot());
  if(id==='chess')        safe(() => {
    // Скидаємо на екран налаштувань щоразу коли заходимо в шахи ззовні
    if(!chessGame) {
      document.getElementById('chessSetupPanel')?.classList.remove('hidden');
      document.getElementById('chessGameArea')?.classList.add('hidden');
      chessSwitchMode(chessSelectedMode || 'ai');
    }
  });
  if(id==='lottery')      safe(() => loadLottery());
  if(id==='investpool')   safe(() => loadInvestPool());
  if(id==='horseracing')  safe(() => { /* ready */ });
  if(id==='balloon')      safe(() => { /* ready */ });
  if(id==='quiz')         safe(() => { /* ready */ });
  if(id==='profile')      safe(() => updateUI());
}

function scratchReset() {
  document.getElementById('scratchGrid').innerHTML = '<div style="text-align:center;color:var(--fg-3);grid-column:1/-1;padding:20px;">Купи картку щоб грати</div>';
  document.getElementById('scratchBuyBtn').classList.remove('hidden');
}


