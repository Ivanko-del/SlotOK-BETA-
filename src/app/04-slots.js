// ============================================
// ІГРИ
// ============================================

// --- Слоти ---
let _spinBtn = null; // global ref so finishSlots can re-enable it

// Безкоштовний спін грається на ставку не більше 100 ₴ (раніше — на будь-яку з
// поля вводу: 75 фріспінів з Battle Pass на ставці 1 000 000 давали мільйони).
const SLOTS_FREE_SPIN_MAX_BET = 100;
async function spinSlots() { 
    if(_spinBtn && _spinBtn.disabled) return;
    // Free spins check
    const freeSp = userData.freeSlots || 0;
    let b;
    _spinBtn = document.getElementById('slotsSpinBtn');
    if(_spinBtn) _spinBtn.disabled = true;
    const mode = slotBonusRound > 0 ? 'bonus' : freeSp > 0 ? 'free' : 'paid';
    let srv = { mode: 'legacy' };
    try {
    if(mode !== 'bonus') {
      b = mode === 'free'
        ? Math.min(parseInt(document.getElementById('betAmountSlots').value) || 100, SLOTS_FREE_SPIN_MAX_BET)
        : validateBet(document.getElementById('betAmountSlots').value);
      if(!b) { if(_spinBtn) _spinBtn.disabled = false; return; }
    } else b = slotBonusBet;
    // Результат спіну (і фріспіни, і бонус-раунд) рахує сервер, якщо він є.
    srv = await serverPlay('slots', b, { mode });
    if(srv.mode === 'error') {
      if(_spinBtn) _spinBtn.disabled = false;
      // Сервер каже, що фріспінів / бонус-раунду вже немає — синхронізуємо UI.
      if(mode === 'bonus') { slotBonusRound = 0; document.getElementById('bonusRoundBanner')?.classList.add('hidden'); }
      return;
    }
    if(srv.mode === 'server') {
      if(srv.r.freeSlots !== undefined) { userData.freeSlots = srv.r.freeSlots; setTimeout(updateFreeSlotsUI, 50); }
      if(mode === 'free') notify('🎟️ Використано 1 безкоштовний спін! Залишилось: ' + (srv.r.freeSlots || 0), 'info');
      if(mode === 'paid') { addWager(b); trackLbStat('wager', b); trackLbStat('games', 1); publishLiveBet('Slots','🎰', b, ''); if(userData.clanId) trackClanWager(b); }
    } else if(mode === 'free') {
      // Fix: update locally immediately so next spin reads correct value
      userData.freeSlots = freeSp - 1;
      db.ref('users/'+currentUser+'/freeSlots').set(freeSp - 1);
      setTimeout(updateFreeSlotsUI, 50);
      notify('🎟️ Використано 1 безкоштовний спін! Залишилось: ' + (freeSp-1), 'info');
    } else if(mode === 'paid') {
      db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
      addWager(b);
      trackLbStat('wager', b); trackLbStat('games', 1);
      publishLiveBet('Slots','🎰', b, '');
      if(userData.clanId) trackClanWager(b);
    }
    trackQuest('slotsPlayed', 1);
    trackQuest('totalGames', 1);
    if(b) trackQuest('weekWager', b);
    document.getElementById('slotsSpinBtn').disabled = true;
    playSound('click');
    const reels = [document.getElementById('r1'), document.getElementById('r2'), document.getElementById('r3')];
    const sym = ["🍒", "🍋", "7️", "💎", "🔔", "🎰", "⭐", "🃏"];
    reels.forEach(r => { if(r) r.classList.remove('landed'); if(r) r.classList.add('spinning'); });
    let count = 0;
    let spinInterval = setInterval(() => {
        reels.forEach((r,i) => {
          setTimeout(() => {
            if(!r) return;
            r.textContent = sym[Math.floor(Math.random()*sym.length)];
            r.classList.remove('flip-tick'); void r.offsetWidth; r.classList.add('flip-tick');
          }, i * 60);
        });
        count++;
        if(count > 18) { clearInterval(spinInterval); finishSlots(b, srv.mode === 'server' ? srv.r : null); }
    }, 75);
    } catch(e) { console.error('spinSlots error:', e); if(_spinBtn) _spinBtn.disabled = false; }
} // end spinSlots

let slotBonusRound = 0;   // remaining bonus spins
let slotBonusBet   = 0;
let slotBonusMult  = 1;
let slotBonusWins  = 0;

function updateFreeSlotsUI() {
  const free = userData.freeSlots || 0;
  const bar = document.getElementById('freeSlotsBar');
  const cnt = document.getElementById('freeSlotsCount');
  const hint = document.getElementById('slotsHint');
  if(bar)  bar.classList.toggle('hidden', free === 0);
  if(cnt)  cnt.textContent = free;
  if(hint) hint.textContent = free > 0 ? `У вас ${free} безкоштовних спінів` : (slotBonusRound > 0 ? '' : '');
}

// Таблиця Classic 777 — та сама, що slots у lib/games.js (RTP ≈96% разом з
// бонус-раундом і фріспінами; раніше ≈158%).
function finishSlots(bet, srvR) {
    const r = Math.random();
    const luck = getNewPlayerLuck();
    const isBonusRound = slotBonusRound > 0;
    const mult = isBonusRound ? slotBonusMult : 1;
    // Adjust odds in bonus round — better chances
    let adj;
    if(isBonusRound) adj = r * 0.8;       // bonus: better odds
    else if(luck)    adj = r * 0.35;       // new player luck
    else             adj = r;
    let win = 0; let res = ["🍒","🍋","🔔"];
    if(srvR) { res = srvR.reels; win = srvR.payout; }
    else if(adj < 0.005)  { res = ["7️","7️","7️"];   win = Math.floor(bet*50*mult); }
    else if(adj < 0.015)  { res = ["💎","💎","💎"]; win = Math.floor(bet*15*mult); }
    else if(adj < 0.06)   { res = ["🍒","🍒","🍒"]; win = Math.floor(bet*3*mult);  }
    else if(adj < 0.13)   { res = ["🔔","🔔","🍋"]; win = Math.floor(bet*1.5*mult);}
    // BONUS ROUND trigger (only outside bonus round)
    else if(adj < 0.14 && !isBonusRound)  { res = ["🎰","🎰","🎰"]; win = 0; /* handled below */ }
    // FREE SPINS trigger
    else if(adj < 0.165 && !isBonusRound) { res = ["⭐","⭐","⭐"]; win = 0; /* free spins */ }
    
    const r1 = document.getElementById('r1');
    const r2 = document.getElementById('r2');
    const r3 = document.getElementById('r3');
    const winLine = document.getElementById('slotsWinLine');
    const resultEl = document.getElementById('slotsResult');

    // Staggered reveal — кожен барабан "приземляється" окремо (зупинка спіну + відскок)
    const landReel = (el, symbol) => {
      if(!el) return;
      el.classList.remove('spinning');
      el.textContent = symbol;
      el.classList.remove('landed'); void el.offsetWidth; el.classList.add('landed');
    };
    setTimeout(()=>{ landReel(r1, res[0]); }, 0);
    setTimeout(()=>{ landReel(r2, res[1]); }, 150);
    setTimeout(()=>{
      landReel(r3, res[2]);

      // Win line animation
      if(win > 0) {
        if(winLine) { winLine.style.background = 'linear-gradient(90deg,transparent,var(--accent),transparent)'; setTimeout(()=>{ if(winLine) winLine.style.background=''; }, 1000); }
      }

      // BONUS ROUND trigger
      if(res[0]==='🎰' && res[1]==='🎰' && res[2]==='🎰' && slotBonusRound===0) {
        slotBonusRound = srvR ? srvR.bonusSpinsLeft : 10;
        slotBonusBet   = bet;
        slotBonusMult  = srvR ? srvR.bonusMult : 2 + Math.floor(Math.random()*2); // x2–x3
        slotBonusWins  = 0;
        const banner = document.getElementById('bonusRoundBanner');
        const spinsEl = document.getElementById('bonusSpinsLeft');
        const multEl  = document.getElementById('bonusMult');
        if(banner) banner.classList.remove('hidden');
        if(spinsEl) spinsEl.textContent = slotBonusRound;
        if(multEl)  multEl.textContent  = 'x'+slotBonusMult;
        if(resultEl) resultEl.innerHTML = '<span style="color:#c9a0ff;font-size:16px;">🎰 БОНУС РАУНД! 10 спінів × '+slotBonusMult+'!</span>';
        playSound('bonus');
        notify('🎰 БОНУС РАУНД! Отримано 10 безкоштовних спінів × '+slotBonusMult+'!', 'success');
        if(_spinBtn) _spinBtn.disabled = false;
        return;
      }

      // FREE SPINS trigger
      if(res[0]==='⭐' && res[1]==='⭐' && res[2]==='⭐' && slotBonusRound===0) {
        if(srvR) userData.freeSlots = srvR.freeSlots;
        else db.ref('users/'+currentUser+'/freeSlots').set(firebase.database.ServerValue.increment(5));
        if(resultEl) resultEl.innerHTML = '<span style="color:var(--green);">⭐ +5 БЕЗКОШТОВНИХ СПІНІВ!</span>';
        playSound('win');
        notify('⭐ Ви виграли 5 безкоштовних спінів!', 'success');
        setTimeout(updateFreeSlotsUI, 300);
        if(_spinBtn) _spinBtn.disabled = false;
        return;
      }

      // Normal win / loss
      if(win > 0) {
        consumeLuckyGame();
        if(!srvR) db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
        if (win >= bet * 20) {
          notifyBot('player-ping', null, { to: currentUser, kind: 'bigwin', ref: { amount: win, game: 'Slots' } });
        }
        playSound(win > bet*10 ? 'bonus' : 'win');
        if(resultEl) resultEl.innerHTML = `<span style="color:var(--green);">🎰 +${formatNumber(win)} ₴${slotBonusRound>0?' (×'+slotBonusMult+')':''}</span>`;
        notify(`🎰 WIN: +${formatNumber(win)} ₴`, 'success');
        addToHistory(`Slots: +${win}`);
        addToWinFeed('Slots', win, win/bet);
        checkAchievements('win', win);
        slotBonusWins += win;
        spawnWinCoins(win);
        if(res.every(s=>s==='7️')) {
          spawnWinCoins(win); // джекпот — подвійний дощ монет
          const flash = document.createElement('div');
          flash.className = 'jackpot-flash';
          document.body.appendChild(flash);
          setTimeout(()=>flash.remove(), 900);
        }
        // Premium reel winner glow
        ['r1','r2','r3'].forEach(id=>{ const r=document.getElementById(id); if(r){r.classList.add('winner'); setTimeout(()=>r.classList.remove('winner'),1500);} });
        if(res.every(s=>s==='7️')) db.ref('users/'+currentUser+'/slots777').set((userData.slots777||0)+1);
        if(res.every(s=>s==='💎')) db.ref('users/'+currentUser+'/slotsDiamond').set((userData.slotsDiamond||0)+1);
        const maxW = Math.max(win, userData.slotsMaxWin||0);
        if(win > (userData.slotsMaxWin||0)) db.ref('users/'+currentUser+'/slotsMaxWin').set(win);
      } else {
        if(resultEl) resultEl.innerHTML = `<span style="color:#444;">Немає комбінації</span>`;
        checkAchievements('lose', bet);
      }

      if(slotBonusRound > 0) {
        slotBonusRound = srvR && srvR.bonusSpinsLeft !== undefined ? srvR.bonusSpinsLeft : slotBonusRound - 1;
        const spinsEl = document.getElementById('bonusSpinsLeft');
        if(spinsEl) spinsEl.textContent = slotBonusRound;
        if(slotBonusRound === 0) {
          const banner = document.getElementById('bonusRoundBanner');
          if(banner) banner.classList.add('hidden');
          notify(`🎰 Бонус раунд завершено! Виграш: +${formatNumber(slotBonusWins)} ₴`, 'success');
          if(resultEl) resultEl.innerHTML = `<span style="color:#c9a0ff;">🎰 Бонус: +${formatNumber(slotBonusWins)} ₴!</span>`;
        }
      }

      if(_spinBtn) _spinBtn.disabled = false;
      // Track slotsPlayed for achievements
      db.ref('users/'+currentUser+'/slotsPlayed').set((userData.slotsPlayed||0)+1);
    }, 300);
}

function togglePaytable() {
  const el = document.getElementById('slotsPaytable');
  if(el) el.classList.toggle('hidden');
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  💎 DIAMOND RUSH — другий слот: своя тема й таблиця виплат,  ║
// ║  без бонус-раунду/фріспінів (простіший рушій, той самий      ║
// ║  цикл ставка → спін → виплата, що й у Classic 777)           ║
// ╚══════════════════════════════════════════════════════════════╝
let _diamondSpinBtn = null;

async function spinDiamondSlots() {
  _diamondSpinBtn = document.getElementById('diamondSpinBtn');
  if(_diamondSpinBtn && _diamondSpinBtn.disabled) return;
  if(_diamondSpinBtn) _diamondSpinBtn.disabled = true;
  try {
    const b = validateBet(document.getElementById('betAmountDiamond').value);
    if(!b) { if(_diamondSpinBtn) _diamondSpinBtn.disabled = false; return; }
    const srv = await serverPlay('diamond', b, {});
    if(srv.mode === 'error') { if(_diamondSpinBtn) _diamondSpinBtn.disabled = false; return; }
    if(srv.mode !== 'server') db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
    addWager(b);
    trackLbStat('wager', b); trackLbStat('games', 1);
    publishLiveBet('Diamond Rush','💎', b, '');
    if(userData.clanId) trackClanWager(b);
    trackQuest('slotsPlayed', 1);
    trackQuest('totalGames', 1);
    trackQuest('weekWager', b);
    playSound('click');
    const reels = [document.getElementById('dr1'), document.getElementById('dr2'), document.getElementById('dr3')];
    const sym = ["👑","💍","🔷","✨","🥂","🎩"];
    reels.forEach(r => { if(r) { r.classList.remove('landed'); r.classList.add('spinning'); } });
    let count = 0;
    const spinInterval = setInterval(() => {
      reels.forEach((r,i) => {
        setTimeout(() => {
          if(!r) return;
          r.textContent = sym[Math.floor(Math.random()*sym.length)];
          r.classList.remove('flip-tick'); void r.offsetWidth; r.classList.add('flip-tick');
        }, i * 60);
      });
      count++;
      if(count > 18) { clearInterval(spinInterval); finishDiamondSlots(b, srv.mode === 'server' ? srv.r : null); }
    }, 75);
  } catch(e) { console.error('spinDiamondSlots error:', e); if(_diamondSpinBtn) _diamondSpinBtn.disabled = false; }
}

function finishDiamondSlots(bet, srvR) {
  const r = Math.random();
  const luck = getNewPlayerLuck();
  const adj = luck ? r * 0.6 : r; // новачкам трохи кращі шанси, як і в Classic 777

  let win = 0; let res = ["🔷","✨","🥂"];
  if(srvR) { res = srvR.reels; win = srvR.payout; }
  else if(adj < 0.004)      { res = ["🎩","🎩","🎩"]; win = bet*45; }
  else if(adj < 0.016) { res = ["👑","👑","👑"]; win = bet*15; }
  else if(adj < 0.046) { res = ["💍","💍","💍"]; win = bet*6;  }
  else if(adj < 0.126) { res = ["🔷","🔷","🔷"]; win = bet*2.5;}
  else if(adj < 0.276) { res = ["✨","✨","🥂"]; win = bet*1.3;}

  const r1 = document.getElementById('dr1');
  const r2 = document.getElementById('dr2');
  const r3 = document.getElementById('dr3');
  const winLine = document.getElementById('diamondWinLine');
  const resultEl = document.getElementById('diamondResult');

  const landReel = (el, symbol) => {
    if(!el) return;
    el.classList.remove('spinning');
    el.textContent = symbol;
    el.classList.remove('landed'); void el.offsetWidth; el.classList.add('landed');
  };
  setTimeout(()=>{ landReel(r1, res[0]); }, 0);
  setTimeout(()=>{ landReel(r2, res[1]); }, 150);
  setTimeout(()=>{
    landReel(r3, res[2]);
    if(win > 0 && winLine) { winLine.style.background = 'linear-gradient(90deg,transparent,#c9a0ff,transparent)'; setTimeout(()=>{ if(winLine) winLine.style.background=''; }, 1000); }

    if(win > 0) {
      consumeLuckyGame();
      if(!srvR) db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
      if(win >= bet * 20) {
        notifyBot('player-ping', null, { to: currentUser, kind: 'bigwin', ref: { amount: win, game: 'Diamond Rush' } });
      }
      playSound(win > bet*10 ? 'bonus' : 'win');
      if(resultEl) resultEl.innerHTML = `<span style="color:var(--green);">💎 +${formatNumber(win)} ₴</span>`;
      notify(`💎 WIN: +${formatNumber(win)} ₴`, 'success');
      addToHistory(`Diamond Rush: +${win}`);
      addToWinFeed('Diamond Rush', win, win/bet);
      checkAchievements('win', win);
      spawnWinCoins(win);
      if(res.every(s=>s==='🎩')) {
        spawnWinCoins(win);
        const flash = document.createElement('div');
        flash.className = 'jackpot-flash';
        document.body.appendChild(flash);
        setTimeout(()=>flash.remove(), 900);
      }
      ['dr1','dr2','dr3'].forEach(id=>{ const el=document.getElementById(id); if(el){el.classList.add('winner'); setTimeout(()=>el.classList.remove('winner'),1500);} });
    } else {
      if(resultEl) resultEl.innerHTML = `<span style="color:#444;">Немає комбінації</span>`;
      checkAchievements('lose', bet);
    }

    if(_diamondSpinBtn) _diamondSpinBtn.disabled = false;
    db.ref('users/'+currentUser+'/slotsPlayed').set((userData.slotsPlayed||0)+1);
  }, 300);
}

