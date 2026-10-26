// ============================================================
// ===== ФОНОВА МУЗИКА — Web Audio API ambient casino =====
// ============================================================
let bgMusicNodes   = [];
let bgMusicRunning = false;
let bgMusicCtx     = null;

function startBgMusic() {
  if(bgMusicRunning) return;
  try {
    if(!bgMusicCtx) bgMusicCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(bgMusicCtx.state === 'suspended') bgMusicCtx.resume();
    bgMusicRunning = true;
    bgMusicNodes = [];
    playAmbientLayer();
  } catch(e) { console.warn('BG music error', e); }
}

function stopBgMusic() {
  bgMusicRunning = false;
  bgMusicNodes.forEach(n => { try { n.stop(); } catch(e) { console.warn(e); } });
  bgMusicNodes = [];
}

function playAmbientLayer() {
  if(!bgMusicRunning || !bgMusicCtx) return;

  // ── Slow jazzy bass ──
  const bassNotes = [65.41, 82.41, 87.31, 73.42]; // C2 E2 F2 D2
  bassNotes.forEach((freq, i) => {
    const osc = bgMusicCtx.createOscillator();
    const gain = bgMusicCtx.createGain();
    const filter = bgMusicCtx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 200;
    osc.connect(filter); filter.connect(gain); gain.connect(bgMusicCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, bgMusicCtx.currentTime);
    gain.gain.setValueAtTime(0, bgMusicCtx.currentTime + i * 1.6);
    gain.gain.linearRampToValueAtTime(0.04, bgMusicCtx.currentTime + i * 1.6 + 0.3);
    gain.gain.linearRampToValueAtTime(0.04, bgMusicCtx.currentTime + i * 1.6 + 1.2);
    gain.gain.linearRampToValueAtTime(0,    bgMusicCtx.currentTime + i * 1.6 + 1.6);
    osc.start(bgMusicCtx.currentTime + i * 1.6);
    osc.stop(bgMusicCtx.currentTime + i * 1.6 + 1.8);
    bgMusicNodes.push(osc);
  });

  // ── Soft piano melody ──
  const melody = [261.63,329.63,392.00,329.63,261.63,220.00,246.94,261.63]; // C4 E4 G4...
  melody.forEach((freq, i) => {
    const osc = bgMusicCtx.createOscillator();
    const gain = bgMusicCtx.createGain();
    osc.connect(gain); gain.connect(bgMusicCtx.destination);
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = bgMusicCtx.currentTime + i * 0.55;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.025, t + 0.08);
    gain.gain.linearRampToValueAtTime(0.015, t + 0.3);
    gain.gain.linearRampToValueAtTime(0, t + 0.55);
    osc.start(t);
    osc.stop(t + 0.6);
    bgMusicNodes.push(osc);
  });

  // ── Soft hi-hat rhythm ──
  for(let i = 0; i < 16; i++) {
    const bufferSize = bgMusicCtx.sampleRate * 0.05;
    const buffer = bgMusicCtx.createBuffer(1, bufferSize, bgMusicCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let j=0; j<bufferSize; j++) data[j] = (Math.random()*2-1) * 0.3;
    const source = bgMusicCtx.createBufferSource();
    const gain   = bgMusicCtx.createGain();
    const hpf    = bgMusicCtx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 8000;
    source.buffer = buffer;
    source.connect(hpf); hpf.connect(gain); gain.connect(bgMusicCtx.destination);
    const t = bgMusicCtx.currentTime + i * 0.275;
    gain.gain.setValueAtTime(i%4===0 ? 0.025 : 0.012, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.05);
    source.start(t);
    bgMusicNodes.push(source);
  }

  // Loop after 8 seconds
  if(bgMusicRunning) {
    setTimeout(() => { if(bgMusicRunning) playAmbientLayer(); }, 8000);
  }
}

// Auto-start music if setting is on after login
let _bgMusicInitialized = false;
function initBgMusicFromSettings() {
  if(_bgMusicInitialized) return;
  _bgMusicInitialized = true;
  try {
    const s = JSON.parse(localStorage.getItem('slotok_settings')||'{}');
    if(s.music === true) setTimeout(startBgMusic, 1500);
  } catch(e) { console.warn(e); }
}


// ============================================================
// ===== BATTLE PASS SYSTEM =====
// ============================================================
function formatBpTimeLeft(ms) {
  if(ms <= 0) return 'закінчується...';
  const days  = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return days > 0 ? `${days}д ${hours}г` : `${hours}г ${Math.floor((ms%3600000)/60000)}хв`;
}

function bpBonusInfo(bp) {
  const extra = Math.max(0, bp.xp - BP_MAX_LEVEL * BP_XP_PER_LEVEL);
  const earned = bp.level >= BP_MAX_LEVEL ? Math.floor(extra / BP_BONUS_XP) : 0;
  return { earned, available: Math.max(0, earned - bp.bonusClaimed), progress: extra % BP_BONUS_XP };
}

function getBpData() {
  const season = getBpSeasonInfo();
  // undefined bpSeason = pre-season data from before this feature existed —
  // grandfathered into the current season instead of being wiped on sight.
  const stale = userData.bpSeason != null && userData.bpSeason !== season.num;
  return {
    season:   season.num,
    seasonEndsAt: season.endsAt,
    seasonName:  season.name,
    seasonIcon:  season.icon,
    seasonColor: season.color,
    stale,
    xp:       stale ? 0     : (userData.bpXP      || 0),
    level:    stale ? 0     : (userData.bpLevel    || 0),
    isVip:    stale ? false : (userData.bpVip      || false),
    claimed:  stale ? {}    : (userData.bpClaimed  || {}),
    bonusClaimed: stale ? 0 : (userData.bpBonusClaimed || 0),
  };
}

let _bpTimerInterval = null;
function initBattlePass() {
  if(!userData || !currentUser) return;  // userData ще не завантажено
  const bp = getBpData();
  const level  = bp.level;
  const xp     = bp.xp;
  const xpNext = BP_XP_PER_LEVEL;
  const pct    = Math.min(100, Math.round((xp % xpNext) / xpNext * 100));

  // На 50-му рівні показуємо MAX і прогрес до наступної бонусної скрині.
  const maxed = level >= BP_MAX_LEVEL;
  const bonus = bpBonusInfo(bp);
  document.getElementById('bpLevel').textContent  = maxed ? 'MAX' : level + 1;
  document.getElementById('bpXP').textContent     = maxed ? bonus.progress : xp % xpNext;
  document.getElementById('bpXPNext').textContent = maxed ? BP_BONUS_XP : xpNext;
  document.getElementById('bpProgressBar').style.width = (maxed ? Math.round(bonus.progress / BP_BONUS_XP * 100) : pct) + '%';

  const seasonNumEl = document.getElementById('bpSeasonNum');
  if(seasonNumEl) seasonNumEl.textContent = bp.season;
  const seasonNameEl = document.getElementById('bpSeasonName');
  if(seasonNameEl) {
    seasonNameEl.textContent = bp.seasonName ? `· ${bp.seasonIcon} ${bp.seasonName}` : '';
    seasonNameEl.style.color = bp.seasonColor;
  }
  const timerEl = document.getElementById('bpSeasonTimer');
  if(timerEl) {
    timerEl.textContent = formatBpTimeLeft(bp.seasonEndsAt - Date.now());
    clearInterval(_bpTimerInterval);
    _bpTimerInterval = setInterval(() => {
      if(!document.getElementById('bpSeasonTimer')) return clearInterval(_bpTimerInterval);
      timerEl.textContent = formatBpTimeLeft(bp.seasonEndsAt - Date.now());
    }, 60000);
  }

  const badge = document.getElementById('bpVipBadge');
  if(badge) {
    badge.textContent = bp.isVip ? '👑 VIP' : '⬛ FREE';
    badge.style.background = bp.isVip ? 'var(--accent)' : 'linear-gradient(135deg,var(--surface-3),var(--line-strong))';
  }

  const vipBox = document.getElementById('bpVipBuyBox');
  if(vipBox) vipBox.style.display = bp.isVip ? 'none' : '';

  renderBattlePassTrack(bp);
}

function renderBattlePassTrack(bp) {
  const el = document.getElementById('battlePassTrack'); if(!el) return;
  const level   = bp.level;  // levels unlocked (0-based index: completed levels)
  const claimed = bp.claimed || {};

  el.innerHTML = `<div style="display:flex;gap:8px;padding:4px 2px;min-width:max-content;">` +
    BP_REWARDS.map(row => {
      const unlocked  = level >= row.lv;
      const claimedF  = claimed['f'+row.lv];
      const claimedV  = claimed['v'+row.lv];
      const isVip     = bp.isVip;
      const isCurrent = level + 1 === row.lv;
      const cardClass = isCurrent ? 'bp-node-current' : row.milestone ? 'bp-node-milestone' : '';

      return `<div class="${cardClass}" style="position:relative;flex-shrink:0;width:110px;border-radius:var(--r-lg);overflow:hidden;border:2px solid ${isCurrent?'var(--accent)':row.milestone?'var(--special)':unlocked?'var(--line)':'var(--line)'};">
        ${row.milestone ? `<div style="position:absolute;top:-1px;right:-1px;background:var(--special);color:var(--on-special);font-size:9px;font-weight:900;padding:2px 5px;border-radius:0 var(--r-md) 0 var(--r-md);z-index:1;">🏅</div>` : ''}
        <!-- Level label -->
        <div style="background:${isCurrent?'rgb(var(--accent-rgb) / 0.2)':'var(--bg)'};padding:4px 0;text-align:center;font-size:10px;font-weight:bold;color:${isCurrent?'var(--accent)':'var(--fg-4)'};">
          Рівень ${row.lv}
        </div>
        <!-- VIP reward -->
        <div style="padding:8px;background:linear-gradient(135deg,var(--surface-1),color-mix(in srgb, var(--special) 16%, var(--surface-1)));border-bottom:1px solid var(--line);min-height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;${!isVip?'opacity:0.4;':''}">
          <div style="font-size:22px;">${row.vip.icon}</div>
          <div style="font-size:9px;color:var(--special);text-align:center;line-height:1.3;">${row.vip.label}</div>
          ${unlocked && isVip ? (claimedV
            ? `<div style="font-size:9px;color:var(--green);font-weight:bold;">✓ Отримано</div>`
            : `<button class="bp-claim-pulse" onclick="claimBpReward(${row.lv},'v')" style="background:var(--special);border:none;border-radius:var(--r-sm);padding:3px 8px;color:var(--on-special);font-size:9px;font-weight:bold;cursor:pointer;margin-top:2px;">Забрати</button>`)
            : (isVip ? `<div style="font-size:9px;color:var(--fg-4);">🔒</div>` : `<div style="font-size:9px;color:var(--special);">👑 VIP</div>`)}
        </div>
        <!-- Free reward -->
        <div style="padding:8px;background:var(--bg);min-height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
          <div style="font-size:22px;">${row.free.icon}</div>
          <div style="font-size:9px;color:var(--fg-2);text-align:center;line-height:1.3;">${row.free.label}</div>
          ${unlocked ? (claimedF
            ? `<div style="font-size:9px;color:var(--green);font-weight:bold;">✓ Отримано</div>`
            : `<button class="bp-claim-pulse" onclick="claimBpReward(${row.lv},'f')" style="background:linear-gradient(135deg,color-mix(in srgb, var(--pos) 25%, var(--surface-1)),var(--pos));border:none;border-radius:var(--r-sm);padding:3px 8px;color:var(--fg);font-size:9px;font-weight:bold;cursor:pointer;margin-top:2px;">Забрати</button>`)
            : `<div style="font-size:9px;color:var(--fg-4);">🔒</div>`}
        </div>
      </div>`;
    }).join('') + bpBonusCard(bp) + `</div>`;

  // Scroll to current level
  setTimeout(() => {
    const cur = el.querySelector('div[style*="accent"]');
    if(cur) cur.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
  }, 100);
}

function bpBonusCard(bp) {
  const b = bpBonusInfo(bp);
  const maxed = bp.level >= BP_MAX_LEVEL;
  return `<div style="flex-shrink:0;width:130px;border-radius:var(--r-lg);border:2px dashed ${maxed ? bp.seasonColor || 'var(--special)' : 'var(--line)'};padding:10px 8px;text-align:center;display:flex;flex-direction:column;justify-content:center;gap:6px;background:var(--bg);">
      <div style="font-size:10px;font-weight:bold;color:var(--special);">Після 50 рівня</div>
      <div style="font-size:30px;">🎁</div>
      <div style="font-size:10px;color:var(--fg-2);line-height:1.35;">Бонусна скриня кожні ${formatNumber(BP_BONUS_XP)} XP${bp.isVip ? '<br>👑 + 2 Слотіки' : ''}</div>
      ${!maxed ? `<div style="font-size:9px;color:var(--fg-4);">🔒 Дійди до 50 рівня</div>`
        : b.available > 0
          ? `<button class="bp-claim-pulse" onclick="claimBpBonus()" style="background:var(--special);border:none;border-radius:var(--r-sm);padding:5px 8px;color:var(--on-special);font-size:10px;font-weight:bold;cursor:pointer;">Відкрити (${b.available})</button>`
          : `<div style="font-size:9px;color:var(--fg-3);">Наступна: ${formatNumber(b.progress)} / ${formatNumber(BP_BONUS_XP)} XP</div>`}
    </div>`;
}

let _bpBonusLock = false;
async function claimBpBonus() {
  if(_bpBonusLock) return;
  const bp = getBpData();
  if(bpBonusInfo(bp).available < 1) return notify('Поки немає бонусних скринь', 'info');
  _bpBonusLock = true;
  const srv = await serverReward('bpBonus');
  if(srv.mode !== 'legacy') {
    _bpBonusLock = false;
    if(srv.mode === 'server') { playSound('bonus'); notify('🎁 Бонусна скриня: 📦 лут-бокс' + (srv.r.slotiky ? ` + 🪙 ${srv.r.slotiky} Слотіки` : '') + '!', 'success'); }
    setTimeout(initBattlePass, 400);
    return;
  }
  const inc = firebase.database.ServerValue.increment;
  const updates = { bpBonusClaimed: bp.bonusClaimed + 1, lootboxes: inc(1) };
  if(bp.isVip) updates.slotiky = inc(2);
  db.ref('users/'+currentUser).update(updates).then(() => {
    playSound('bonus');
    notify('🎁 Бонусна скриня: 📦 лут-бокс' + (bp.isVip ? ' + 🪙 2 Слотіки' : '') + '!', 'success');
  }).catch(() => notify('Не вдалося відкрити скриню', 'error'))
    .finally(() => { _bpBonusLock = false; setTimeout(initBattlePass, 400); });
}

let _bpClaimLock = false;
async function claimBpReward(lv, track) {
  if(_bpClaimLock) return;  // запобігаємо подвійному кліку
  _bpClaimLock = true;
  setTimeout(() => { _bpClaimLock = false; }, 2000);
  const bp      = getBpData();
  const claimed = bp.claimed || {};
  const key     = track + lv;
  if(claimed[key]) { _bpClaimLock = false; return notify('Вже отримано!', 'info'); }

  const row    = BP_REWARDS.find(r => r.lv === lv);
  if(!row) return;
  const reward = track === 'f' ? row.free : row.vip;
  if(track === 'v' && !bp.isVip) return notify('❌ Потрібен VIP Battle Pass!', 'error');
  if(lv > bp.level) return notify('❌ Рівень ще не досягнуто!', 'error');

  const srv = await serverReward('bp', { lv, track });
  if(srv.mode !== 'legacy') {
    if(srv.mode === 'server') { playSound('bonus'); notify(`🎫 ${reward.icon} ${reward.label} отримано!`, 'success'); }
    setTimeout(initBattlePass, 400);
    return;
  }

  claimed[key] = true;
  const updates = { bpClaimed: claimed };

  // Apply reward. Атомарні increment: раніше баланс перезаписувався числом з
  // локальної копії, і ставка, що встигла пройти між читанням і записом, губилась.
  const inc = firebase.database.ServerValue.increment;
  if(reward.type === 'balance')       updates.balance   = inc(reward.val);
  if(reward.type === 'slotiky')       updates.slotiky   = inc(reward.val);
  if(reward.type === 'freeSlots')     updates.freeSlots = inc(reward.val);
  if(reward.type === 'freeFortune')   updates.freeFortune = inc(reward.val);
  if(reward.type === 'minesHints')    updates.minesHints = inc(reward.val);
  if(reward.type === 'crashInsurance')updates.crashInsurance = true;
  if(reward.type === 'vipBoost') {
    const days = reward.val;
    const expiry = Date.now() + days * 86400000;
    const items = userData.slotikyItems || {};
    items['vip_boost_7d'] = { boughtAt: Date.now(), expires: expiry };
    updates.slotikyItems = items;
  }
  if(reward.type === 'lootbox') {
    updates.lootboxes = inc(reward.val);
  }
  if(reward.type === 'cosmetic') {
    const items = userData.slotikyItems || {};
    items[reward.val] = { boughtAt: Date.now(), expires: null };
    updates.slotikyItems = items;
  }

  db.ref('users/'+currentUser).update(updates);
  playSound('bonus');
  notify(`🎫 ${reward.icon} ${reward.label} отримано!`, 'success');
  setTimeout(initBattlePass, 400);
}

function addBpXP(amount) {
  if(!currentUser || amount <= 0) return;  // не пишемо при 0 XP
  const bp = getBpData();
  const isVip = bp.isVip;
  const earnedXP = isVip ? amount * 2 : amount; // VIP = double XP
  const newXP    = bp.xp + earnedXP;
  const newLevel = bpLevelFromXp(newXP);
  // increment, а не перезапис: XP від серверних ігор, що ще не дійшов до
  // локальної копії, інакше губився б.
  const updates  = { bpXP: bp.stale ? newXP : firebase.database.ServerValue.increment(earnedXP) };

  // Roll into the new season: bp.xp/level/claimed/isVip already read as 0/empty/false
  // above when stale, so this just persists that reset instead of leaving last
  // season's claimed rewards and VIP pass sitting in the DB under the new season number.
  if(bp.stale) { updates.bpSeason = bp.season; updates.bpClaimed = {}; updates.bpVip = false; updates.bpBonusClaimed = 0; }

  if(newLevel > bp.level) {
    updates.bpLevel = newLevel;
    showBpLevelUp(newLevel);
  }

  db.ref('users/'+currentUser).update(updates);
}

function showBpLevelUp(newLevel) {
    setTimeout(() => {
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:7500;background:linear-gradient(135deg,var(--surface-1),color-mix(in srgb, var(--special) 24%, var(--surface-1)));border:2px solid var(--special);border-radius:var(--r-lg);padding:14px 24px;text-align:center;box-shadow:none;animation:slideIn 0.4s ease;';
      t.innerHTML = `<div style="font-size:28px;">🎫</div><div style="font-size:11px;color:var(--special);font-weight:bold;text-transform:uppercase;margin-top:4px;">Battle Pass</div><div style="font-size:18px;font-weight:900;color:var(--fg);margin-top:2px;">${newLevel >= BP_MAX_LEVEL ? '🏆 Сезон пройдено! Далі — бонусні скрині' : `Рівень ${newLevel + 1}!`}</div>`;
      document.body.appendChild(t);
      playSound('bonus');
      setTimeout(()=>{ t.style.opacity='0'; t.style.transition='0.5s'; setTimeout(()=>t.remove(),500); }, 3000);
    }, 500);
    notifyBot('player-ping', null, { to: currentUser, kind: 'bplevel', ref: { level: newLevel + 1 } });
}

async function buyVipBattlePass() {
  const cost = BP_VIP_PRICE_SLOTIKY;
  if(isActiveCardFrozen()) return notify('🔒 Активна картка заблокована — розблокуй її в Касі', 'error');
  if((userData.slotiky||0) < cost) {
    notify(`❌ Потрібно ${cost} 🪙 Слотіків. У вас: ${userData.slotiky||0}`, 'error');
    return;
  }
  const srv = await serverReward('bpVip');
  if(srv.mode === 'error') return;
  if(srv.mode === 'legacy') db.ref('users/'+currentUser).update({
    slotiky: (userData.slotiky||0) - cost,
    bpVip:   true,
    bpVipBoughtAt: Date.now(),
    bpVipMethod:   'slotiky',
    bpSeason: getBpSeasonInfo().num, // VIP pass only lasts the current season
  });
  playSound('bonus');
  notify('👑 VIP Battle Pass активовано! Тепер ви отримуєте подвійний XP!', 'success');
  setTimeout(initBattlePass, 400);
}

// Admin can grant VIP BP in cashier
function adminGrantVipBp(username) {
  db.ref('users/'+username).update({ bpVip: true, bpVipBoughtAt: Date.now(), bpVipMethod: 'admin', bpSeason: getBpSeasonInfo().num });
  notify(`✅ VIP Battle Pass видано гравцю ${username}`, 'success');
}


// ============================================================
// ===== ОСОБИСТА СТАТИСТИКА =====
// ============================================================
function initStatsTab() {
  const el = document.getElementById('statsContent');
  if(!el || !userData) return;
  const d = userData;
  const totalBets    = d.totalBets     || 0;
  const totalWins    = d.totalWins     || 0;
  const totalLosses  = d.totalLosses   || 0;
  const totalWagered = d.totalWagered  || 0;
  const biggestWin   = d.biggestWin    || 0;
  const slotsPlayed  = d.slotsPlayed   || 0;
  const crashGames   = d.crashGames    || 0;
  const sportBets    = d.sportBets     || 0;
  const rouletteBets = d.rouletteBets  || 0;
  const minesGames   = d.minesGames    || 0;
  const winRate      = totalBets > 0 ? Math.round(totalWins/totalBets*100) : 0;
  const roi          = totalWagered > 0
    ? ((d.balance||0) - 1000) / Math.max(totalWagered, 1) * 100 : 0;
  const bpLevel      = d.bpLevel || 0;
  const achievements = Object.keys(d.achievements||{}).length;
  const dailyStreak  = d.dailyStreak || 0;
  const cashbackTotal= d.cashbackTotalClaimed || 0;
  const referrals    = d.referrals || 0;

  const favGame = (() => {
    const games = {
      '🎰 Слоти': slotsPlayed,
      '🚀 Краш': crashGames,
      '⚽ Спорт': sportBets,
      '🎡 Рулетка': rouletteBets,
      '💣 Майнер': minesGames,
    };
    const sorted = Object.entries(games).sort((a,b)=>b[1]-a[1]);
    return sorted[0][1] > 0 ? sorted[0][0] : '—';
  })();

  // Win rate color
  const wrColor = winRate >= 50 ? '#4cd964' : winRate >= 35 ? '#f4a261' : '#ff3b30';

  el.innerHTML = `
    <!-- Main balance stat -->
    <div style="background:var(--surface-1);border:1px solid rgb(var(--pos-rgb) / .35);border-radius:var(--r-lg);padding:16px;margin-bottom:14px;text-align:center;">
      <div style="font-size:11px;color:var(--fg-4);margin-bottom:4px;">ПОТОЧНИЙ БАЛАНС</div>
      <div style="font-size:32px;font-weight:900;color:var(--green);">${formatNumber(d.balance||0)} ₴</div>
      <div style="font-size:11px;color:${roi>=0?'var(--green)':'var(--red)'};margin-top:4px;">
        ROI: ${roi>=0?'+':''}${roi.toFixed(1)}% від усіх ставок
      </div>
    </div>

    <!-- 3-col quick stats -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
      <div style="background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:12px;text-align:center;">
        <div style="font-size:20px;font-weight:900;color:${wrColor};">${winRate}%</div>
        <div style="font-size:9px;color:var(--fg-4);">Win Rate</div>
      </div>
      <div style="background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:12px;text-align:center;">
        <div style="font-size:20px;font-weight:900;color:var(--accent);">${totalBets}</div>
        <div style="font-size:9px;color:var(--fg-4);">Всього ставок</div>
      </div>
      <div style="background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:12px;text-align:center;">
        <div style="font-size:20px;font-weight:900;color:var(--special);">${bpLevel + 1}</div>
        <div style="font-size:9px;color:var(--fg-4);">Рівень BP</div>
      </div>
    </div>

    <!-- Win/Loss bar -->
    <div style="background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--fg-4);margin-bottom:8px;">
        <span>🏆 Виграші: <b style="color:var(--green);">${totalWins}</b></span>
        <span>💸 Програші: <b style="color:var(--red);">${totalLosses}</b></span>
      </div>
      <div style="background:var(--surface-2);border-radius:var(--r-sm);height:12px;overflow:hidden;">
        <div style="height:100%;width:${winRate}%;background:linear-gradient(90deg,var(--green),var(--pos));border-radius:var(--r-sm);"></div>
      </div>
    </div>

    <!-- Financial stats -->
    <div style="background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px;margin-bottom:14px;">
      <div style="font-size:12px;font-weight:bold;color:var(--accent);margin-bottom:10px;">💰 Фінанси</div>
      ${[
        ['Загальний вагер', formatNumber(totalWagered)+' ₴'],
        ['Найбільший виграш', formatNumber(biggestWin)+' ₴'],
        ['Отримано кешбеку', formatNumber(cashbackTotal)+' ₴'],
        ['Щоденна серія', dailyStreak+' днів 🔥'],
        ['Рефералів', referrals+' осіб'],
        ['Слотіків куплено', (d.slotikySpent||0)+' 🪙'],
      ].map(([l,v])=>`
        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:12px;">
          <span style="color:var(--fg-3);">${l}</span>
          <span style="color:var(--fg-2);font-weight:bold;">${v}</span>
        </div>`).join('')}
    </div>

    <!-- Games breakdown -->
    <div style="background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px;margin-bottom:14px;">
      <div style="font-size:12px;font-weight:bold;color:var(--accent);margin-bottom:10px;">🎮 Ігри</div>
      <div style="font-size:11px;color:var(--fg-4);margin-bottom:10px;">Улюблена гра: <b style="color:var(--fg);">${favGame}</b></div>
      ${[
        ['🎰 Слоти',    slotsPlayed],
        ['🚀 Краш',     crashGames],
        ['⚽ Спорт',    sportBets],
        ['🎡 Рулетка',  rouletteBets],
        ['💣 Майнер',   minesGames],
      ].map(([label, count])=>{
        const maxCount = Math.max(slotsPlayed, crashGames, sportBets, rouletteBets, minesGames, 1);
        const pct = Math.round(count/maxCount*100);
        return `<div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
            <span style="color:var(--fg-2);">${label}</span>
            <span style="color:var(--fg-4);">${count}</span>
          </div>
          <div style="background:var(--surface-1);border-radius:var(--r-xs);height:6px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--info),var(--primary));border-radius:var(--r-xs);"></div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- Achievements summary -->
    <div style="background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:12px;font-weight:bold;color:var(--accent);">🏆 Досягнення</div>
        <button onclick="switchTab('achievements')" style="background:none;border:1px solid var(--line);border-radius:var(--r-sm);padding:4px 10px;color:var(--fg-4);font-size:10px;cursor:pointer;">Всі →</button>
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:12px;">
        <div style="font-size:28px;font-weight:900;color:var(--accent);">${achievements}</div>
        <div>
          <div style="font-size:11px;color:var(--fg-2);">з 50 досягнень</div>
          <div style="font-size:11px;color:var(--fg-4);">${d.achievementXP||0} XP зароблено</div>
        </div>
      </div>
      <div style="background:var(--surface-1);border-radius:var(--r-sm);height:8px;overflow:hidden;margin-top:8px;">
        <div style="height:100%;width:${Math.round(achievements/50*100)}%;background:var(--accent);border-radius:var(--r-sm);"></div>
      </div>
    </div>

    <div style="text-align:center;padding:8px 0;">
      <button onclick="initStatsTab()" style="background:none;border:1px solid var(--line);border-radius:var(--r-md);padding:8px 20px;color:var(--fg-4);font-size:11px;cursor:pointer;">🔄 Оновити</button>
    </div>
  `;
}


