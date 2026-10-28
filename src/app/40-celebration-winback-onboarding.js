// ╔══════════════════════════════════════════════════════════════╗
// ║  WIN CELEBRATION v2 — BIG WIN / MEGA WIN + звук + тряска     ║
// ╚══════════════════════════════════════════════════════════════╝

const WIN_TIER_BIG_MIN  = 5000;
const WIN_TIER_MEGA_MIN = 25000;

function getWinTier(amount, mult) {
  if(amount >= WIN_TIER_MEGA_MIN || (mult && mult >= 25)) return 'mega';
  if(amount >= WIN_TIER_BIG_MIN  || (mult && mult >= 10)) return 'big';
  return null;
}

function celebrateTieredWin(amount, mult, game) {
  const tier = getWinTier(amount, mult);
  if(!tier) return;

  document.body.classList.add('screen-shake');
  setTimeout(() => document.body.classList.remove('screen-shake'), 520);

  const flash = document.createElement('div');
  flash.className = 'bigwin-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1150);

  const banner = document.createElement('div');
  banner.className = 'bigwin-banner';
  banner.innerHTML = `
    <div class="bigwin-banner-title tier-${tier}">${tier === 'mega' ? '🌟 MEGA WIN 🌟' : '🔥 BIG WIN 🔥'}</div>
    <div class="bigwin-banner-amount">+₴<span id="bigWinCountEl">0</span></div>
  `;
  document.body.appendChild(banner);
  animateNumberCountUp(document.getElementById('bigWinCountEl'), 0, amount, tier === 'mega' ? 1400 : 900);

  const duration = tier === 'mega' ? 3200 : 2200;
  setTimeout(() => {
    banner.classList.add('out');
    setTimeout(() => banner.remove(), 400);
  }, duration);

  spawnConfettiRain(tier === 'mega' ? 70 : 40, tier);

  playWinSting(tier);

  spawnWinCoins(amount);

  if(navigator.vibrate) navigator.vibrate(tier === 'mega' ? [80,40,80,40,160] : [60,30,120]);
}

function spawnConfettiRain(count, tier) {
  const colors = tier === 'mega'
    ? ['#ff5fd4','#7ef9ff','#ffd94d','#c77dff','#5fffb0']
    : ['#d4af37','#ffdb4d','#ff9f43','#3dd68c','#4a9eff'];
  for(let i = 0; i < count; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'confetti-rain-piece';
      const size = 6 + Math.random()*8;
      const isCircle = Math.random() > 0.5;
      p.style.cssText = `
        left:${Math.random()*100}%;
        width:${size}px;height:${size*(isCircle?1:1.6)}px;
        background:${colors[Math.floor(Math.random()*colors.length)]};
        border-radius:${isCircle ? '50%' : '2px'};
        animation-duration:${1.8 + Math.random()*1.4}s;
        --spin:${(Math.random()>0.5?1:-1) * (360+Math.random()*540)}deg;
      `;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 3500);
    }, i * 18);
  }
}

// Число що "накручується" від 0 до фінального значення — використовується
// і для банера виграшу, і можна перевикористати будь-де на сайті
function animateNumberCountUp(el, from, to, duration) {
  if(!el) return;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const val = Math.floor(from + (to - from) * eased);
    el.textContent = formatNumber(val);
    if(progress < 1) requestAnimationFrame(tick);
    else el.textContent = formatNumber(to);
  }
  requestAnimationFrame(tick);
}

// Музичний акцент на великому виграші — той самий Web Audio патерн що й bgMusic
function playWinSting(tier) {
  try {
    const ctx = bgMusicCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = tier === 'mega'
      ? [523.25, 659.25, 783.99, 1046.50, 1318.51] // C5 E5 G5 C6 E6 — тріумфальний
      : [523.25, 659.25, 783.99, 1046.50];          // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.02);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.25);
      gain.gain.linearRampToValueAtTime(0,    t + 0.5);
      osc.start(t); osc.stop(t + 0.55);
    });
  } catch(e) { /* тихо ігноруємо якщо звук недоступний */ }
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  "МИ СКУЧИЛИ" — win-back для гравців що не заходили 14+ днів ║
// ╚══════════════════════════════════════════════════════════════╝

async function checkWelcomeBack() {
  if(!currentUser) return;
  // З сервером відлік — від останньої ставки на сервері (lastPlayedAt), і
  // бонус дається раз за відсутність (welcomeBackAt); без нього — як раніше.
  let last = _capturedLastSeen;
  if(await serverAuthEnabled()) {
    last = userData && userData.lastPlayedAt;
    if(last && (userData.welcomeBackAt || 0) > last) return;
  }
  if(last === undefined || last === null) return;
  const daysSince = Math.floor((Date.now() - last) / 86400000);
  if(daysSince < WELCOME_BACK_MIN_DAYS) return;
  // Не показуємо частіше разу на день навіть при повторних вхід-виходах того ж дня
  const todayKey = new Date().toDateString();
  if(localStorage.getItem('welcomeBackShown') === todayKey) return;
  localStorage.setItem('welcomeBackShown', todayKey);

  const bonus = welcomeBackBonus(daysSince); // росте з кількістю днів, кап 5000
  setTimeout(() => showWelcomeBackModal(daysSince, bonus), 1600);
}

function showWelcomeBackModal(days, bonus) {
  const html = `
    <div style="text-align:center;padding-right:0;">
      <div style="font-size:52px;margin-bottom:10px;animation:float 2.5s ease-in-out infinite;">🥺</div>
      <div style="font-family:var(--font-display);font-size:19px;font-weight:900;color:var(--info);margin-bottom:8px;">Ми скучили за тобою!</div>
      <div style="font-size:13px;color:var(--fg-3);margin-bottom:18px;line-height:1.5;">Тебе не було ${days} ${days===1?'день':days<5?'дні':'днів'}.<br>Ось бонус щоб повернутись у гру:</div>
      <div class="welcome-back-card" style="background:linear-gradient(135deg,color-mix(in srgb, var(--info) 11%, var(--surface-1)),color-mix(in srgb, var(--info) 21%, var(--surface-1)));border:2px solid rgb(var(--info-rgb) / 0.4);border-radius:var(--r-xl);padding:18px;margin-bottom:16px;">
        <div style="font-size:11px;color:var(--info);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Бонус повернення</div>
        <div style="font-family:var(--font-display);font-size:30px;font-weight:900;color:var(--fg);">+₴${formatNumber(bonus)}</div>
      </div>
      <button onclick="claimWelcomeBackBonus(${bonus})" style="width:100%;background:var(--info);border:none;border-radius:var(--r-lg);padding:15px;color:var(--on-info);font-weight:900;cursor:pointer;font-size:15px;">🎁 Забрати бонус</button>
    </div>`;
  openModal('welcomeBack', html);
}

async function claimWelcomeBackBonus(bonus) {
  const srv = await serverReward('welcomeBack');
  if(srv.mode === 'error') { closeModal('welcomeBack'); return; }
  if(srv.mode === 'server') bonus = srv.r.amount;
  else db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(bonus));
  pushCardTx(currentUser, {dir:'in', amount:bonus, title:'Бонус повернення', subtitle:'Ми скучили!', icon:'🥺'}, getActiveCardId());
  notify('🎁 +₴'+formatNumber(bonus)+' — з поверненням!', 'success');
  spawnWinCoins(bonus);
  closeModal('welcomeBack');
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  ОНБОРДИНГ — 4-кроковий тур для нових гравців                ║
// ╚══════════════════════════════════════════════════════════════╝

const ONBOARDING_STEPS = [
  { selector: '.nav-item[onclick*="lobby"]', title: '🎰 Тут всі ігри', text: 'Понад 40 ігор — від слотів до шахів. Обирай будь-яку і починай грати!' },
  { selector: '.nav-item[onclick*="cashier"]', title: '<span class="ic i-wallet" aria-hidden="true"></span> Гаманець', text: 'Тут ігровий баланс, донат на підтримку проєкту, кешбек і твоя картка — її вигляд можна змінити, скінів понад сотню.' },
  { selector: '#homeJackpot', title: '💎 VIP та бонуси', text: 'Щоденний бонус росте з кожним днем поспіль. Не пропускай візити!' },
  { selector: '.nav-item[onclick*="profile"]', title: '👤 Твій профіль', text: 'Статистика в реальному часі, досягнення і налаштування — все тут.' },
];
let _onboardStepIdx = 0;

function checkOnboarding() {
  if(!currentUser || !userData) return;
  if(userData.onboardingSeen) return;
  // Тільки для дійсно нових акаунтів (зареєстровані щойно)
  const age = Date.now() - (userData.registeredAt || 0);
  if(age > 3600000) { // якщо акаунту більше години — просто гасимо прапор без туру
    db.ref('users/'+currentUser+'/onboardingSeen').set(true);
    return;
  }
  setTimeout(() => startOnboardingTour(), 1200);
}

function startOnboardingTour() {
  _onboardStepIdx = 0;
  const overlay = document.createElement('div');
  overlay.id = 'onboardOverlay';
  overlay.className = 'onboard-overlay';
  document.body.appendChild(overlay);
  showOnboardStep();
}

function showOnboardStep() {
  document.getElementById('onboardSpotlight')?.remove();
  document.getElementById('onboardTooltip')?.remove();
  const step = ONBOARDING_STEPS[_onboardStepIdx];
  if(!step) { finishOnboarding(); return; }
  const target = document.querySelector(step.selector);
  if(!target) { _onboardStepIdx++; showOnboardStep(); return; }

  const rect = target.getBoundingClientRect();
  const spotlight = document.createElement('div');
  spotlight.id = 'onboardSpotlight';
  spotlight.className = 'onboard-spotlight';
  spotlight.style.cssText = `top:${rect.top-6}px;left:${rect.left-6}px;width:${rect.width+12}px;height:${rect.height+12}px;`;
  document.body.appendChild(spotlight);

  const tooltip = document.createElement('div');
  tooltip.id = 'onboardTooltip';
  tooltip.className = 'onboard-tooltip';
  const tooltipTop = rect.top > window.innerHeight/2 ? rect.top - 150 : rect.bottom + 12;
  tooltip.style.cssText = `top:${Math.max(12,tooltipTop)}px;left:${Math.min(Math.max(12,rect.left-40),window.innerWidth-292)}px;`;
  tooltip.innerHTML = `
    <div style="font-weight:900;color:var(--accent);font-size:15px;margin-bottom:6px;">${step.title}</div>
    <div style="font-size:13px;color:var(--fg-2);line-height:1.5;margin-bottom:14px;">${step.text}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:11px;color:var(--fg-4);">${_onboardStepIdx+1}/${ONBOARDING_STEPS.length}</div>
      <div style="display:flex;gap:8px;">
        <button onclick="skipOnboarding()" style="background:none;border:1px solid var(--line);border-radius:var(--r-md);color:var(--fg-3);font-size:12px;padding:7px 12px;cursor:pointer;">Пропустити</button>
        <button onclick="nextOnboardStep()" style="background:var(--accent);border:none;border-radius:var(--r-md);color:var(--on-accent);font-weight:800;font-size:12px;padding:7px 14px;cursor:pointer;">${_onboardStepIdx===ONBOARDING_STEPS.length-1?'Готово':'Далі →'}</button>
      </div>
    </div>`;
  document.body.appendChild(tooltip);
}

function nextOnboardStep() { _onboardStepIdx++; showOnboardStep(); }
function skipOnboarding() { finishOnboarding(); }
function finishOnboarding() {
  document.getElementById('onboardOverlay')?.remove();
  document.getElementById('onboardSpotlight')?.remove();
  document.getElementById('onboardTooltip')?.remove();
  if(currentUser) db.ref('users/'+currentUser+'/onboardingSeen').set(true);
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  MYSTERY BOX — одноразова коробка в перші 24 години          ║
// ╚══════════════════════════════════════════════════════════════╝

function canClaimMysteryBox() {
  if(!userData) return false;
  if(userData.mysteryBoxClaimed) return false;
  const age = Date.now() - (userData.registeredAt || 0);
  return age <= 86400000; // перші 24 години
}

function renderMysteryBoxWidget() {
  const el = document.getElementById('mysteryBoxWidget');
  if(!el) return;
  if(!canClaimMysteryBox()) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="mystery-box-card anim-press" onclick="openMysteryBox()">
      <div class="mystery-box-icon">🎁</div>
      <div style="font-family:var(--font-display);font-weight:900;color:var(--special);font-size:15px;margin-top:8px;">MYSTERY BOX</div>
      <div style="font-size:11px;color:var(--fg-3);margin-top:4px;">Ексклюзивно для нових гравців · 24 години</div>
      <div style="font-size:10px;color:var(--fg-3);margin-top:6px;">Натисни щоб відкрити 🔓</div>
    </div>`;
}

function openMysteryBox() {
  if(!canClaimMysteryBox()) return;
  const rewards = [
    { label: '500₴ бонус', type: 'cash', amount: 500, weight: 35 },
    { label: '1500₴ бонус', type: 'cash', amount: 1500, weight: 20 },
    { label: '3000₴ ДЖЕКПОТ', type: 'cash', amount: 3000, weight: 8 },
    { label: '20 фріспінів', type: 'spins', amount: 20, weight: 25 },
    { label: 'VIP на 3 дні', type: 'vip', amount: 3, weight: 12 },
  ];
  const totalWeight = rewards.reduce((s,r) => s+r.weight, 0);
  let r = Math.random() * totalWeight, chosen = rewards[0];
  for(const rw of rewards) { if(r < rw.weight) { chosen = rw; break; } r -= rw.weight; }

  db.ref('users/'+currentUser+'/mysteryBoxClaimed').set(true);
  if(chosen.type === 'cash') {
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(chosen.amount));
    pushCardTx(currentUser, {dir:'in', amount:chosen.amount, title:'Mystery Box', subtitle:'Нагорода новачка', icon:'🎁'}, getActiveCardId());
  } else if(chosen.type === 'spins') {
    db.ref('users/'+currentUser+'/freeSlots').set(firebase.database.ServerValue.increment(chosen.amount));
  } else if(chosen.type === 'vip') {
    db.ref('users/'+currentUser+'/vipGiftUntil').set(Date.now() + chosen.amount * 86400000);
  }

  const html = `
    <div style="text-align:center;">
      <div style="font-size:60px;margin-bottom:10px;animation:popIn .5s cubic-bezier(.34,1.56,.64,1);">🎉</div>
      <div style="font-family:var(--font-display);font-size:17px;font-weight:900;color:var(--special);margin-bottom:8px;">Вітаємо!</div>
      <div style="font-size:20px;font-weight:900;color:var(--fg);margin-bottom:16px;">${chosen.label}</div>
      <button onclick="closeModal('mysteryBox')" style="width:100%;background:var(--special);border:none;border-radius:var(--r-lg);padding:14px;color:var(--on-special);font-weight:900;cursor:pointer;font-size:14px;">✅ Забрати</button>
    </div>`;
  openModal('mysteryBox', html);
  spawnConfettiRain(35, 'mega');
  playWinSting('big');
  renderMysteryBoxWidget();
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  СТРІЧКА ДРУЗІВ — виграші гравців за якими стежиш            ║
// ╚══════════════════════════════════════════════════════════════╝

function renderFriendsFeed() {
  const el = document.getElementById('friendsFeedWidget');
  if(!el || !currentUser) return;
  db.ref('users/'+currentUser+'/following').once('value').then(snap => {
    const following = Object.keys(snap.val() || {});
    if(!following.length) { el.classList.add('hidden'); return; }
    db.ref('win_feed').orderByChild('time').limitToLast(40).once('value').then(feedSnap => {
      const all = Object.values(feedSnap.val() || {});
      const relevant = all.filter(w => following.includes(w.user)).sort((a,b) => b.time - a.time).slice(0, 5);
      if(!relevant.length) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      el.innerHTML = `
        <div style="font-size:11px;color:var(--info);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:8px;">👥 Твої друзі</div>
        ${relevant.map(w => `
          <div class="friend-feed-item" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgb(var(--tint-rgb) / 0.05);">
            <div style="width:32px;height:32px;border-radius:50%;background:rgb(var(--info-rgb) / 0.15);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:var(--info);flex-shrink:0;">${w.user[0].toUpperCase()}</div>
            <div style="flex:1;min-width:0;font-size:12px;">
              <b>${escapeHtml(w.user)}</b> виграв <b style="color:var(--pos);">₴${formatNumber(w.amount)}</b> в ${escapeHtml(w.game||'')}
            </div>
            <div style="font-size:10px;color:var(--fg-4);flex-shrink:0;">${timeAgoShort(w.time)}</div>
          </div>`).join('')}
      `;
    });
  });
}

function timeAgoShort(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if(mins < 1) return 'щойно';
  if(mins < 60) return mins + 'хв';
  const hrs = Math.floor(mins / 60);
  if(hrs < 24) return hrs + 'г';
  return Math.floor(hrs/24) + 'д';
}
