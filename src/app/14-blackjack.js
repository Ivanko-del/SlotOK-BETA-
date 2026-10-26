// ============================================
// БЛЕКДЖЕК
// ============================================
const BJ_DECK = [];
let bjPlayerHand = [], bjDealerHand = [], bjBet = 0, bjActive = false;

function bjCreateDeck() {
  return shuffleDeck(createStandardDeck());
}

function bjValue(hand) {
  let v = 0, aces = 0;
  for(const c of hand) {
    if(c.rank === 'A') { aces++; v += 11; }
    else if(['J','Q','K'].includes(c.rank)) v += 10;
    else v += parseInt(c.rank);
  }
  while(v > 21 && aces > 0) { v -= 10; aces--; }
  return v;
}

function bjCardHTML(c, hidden=false) {
  if(hidden) return `<div class="bj-card" style="background:#1a3a6b;color:transparent;">🂠</div>`;
  const red = isRedSuit(c.suit);
  return `<div class="bj-card ${red?'red':''}">${c.rank}<br>${c.suit}</div>`;
}

function bjRender(hideDealer=true) {
  document.getElementById('bjPlayerCards').innerHTML = bjPlayerHand.map(c=>bjCardHTML(c)).join('');
  document.getElementById('bjDealerCards').innerHTML = bjDealerHand.map((c,i)=>bjCardHTML(c, hideDealer && i===1)).join('');
  document.getElementById('bjPlayerScore').textContent = bjValue(bjPlayerHand);
  document.getElementById('bjDealerScore').textContent = hideDealer ? '?' : bjValue(bjDealerHand);
  if(bjSplitActive) {
    const sc = document.getElementById('bjSplitCards');
    const ss = document.getElementById('bjSplitScore');
    if(sc) sc.innerHTML = bjSplitHand.map(c=>bjCardHTML(c)).join('');
    if(ss) ss.textContent = bjSplitHand.length ? bjValue(bjSplitHand) : '—';
    // Підсвітити яка рука зараз активна
    const mainArea = document.getElementById('bjPlayerCards') ? document.getElementById('bjPlayerCards').closest('.bj-area') : null;
    const splitArea = document.getElementById('bjSplitArea');
    if(mainArea)  mainArea.style.opacity  = bjPlayingHand2 ? '.45' : '1';
    if(splitArea) splitArea.style.opacity = bjPlayingHand2 ? '1'   : '.45';
  }
}

let bjSplitHand = [], bjSplitBet = 0, bjSplitActive = false, bjInsurancePaid = false, bjInsuranceBet = 0;
let bjPlayingHand2 = false, bjHand1Outcome = null, bjHand1Profit = 0;

function bjCurrentHand() { return bjPlayingHand2 ? bjSplitHand : bjPlayerHand; }

// ── Blackjack на сервері (api/round.js + lib/blackjack.js) ──
// Колода, друга карта дилера й добір живуть на сервері; клієнт лише малює
// стан, який повернув сервер, і шле дії (hit/stand/double/split/...).
let bjServer = false, bjBusy = false;
function bjToggleButtons(can) {
  const show = (id, on) => { const el = document.getElementById(id); if(el) el.classList.toggle('hidden', !on); };
  show('bjSplitBtn', can.split);
  show('bjInsuranceBtn', can.insurance);
  const dbl = document.getElementById('bjDoubleBtn'); if(dbl) dbl.disabled = !can.double;
  const sur = document.getElementById('bjSurrenderBtn'); if(sur) { sur.disabled = !can.surrender; sur.classList.toggle('hidden', !can.surrender); }
}
function bjApplyServer(r) {
  const v = r.view;
  bjSplitActive = !!v.split;
  bjPlayerHand = v.hands[0].cards.slice();
  bjSplitHand = v.hands[1] ? v.hands[1].cards.slice() : [];
  bjPlayingHand2 = bjSplitActive && v.active === 1;
  bjBet = v.hands[0].bet; bjSplitBet = v.hands[1] ? v.hands[1].bet : 0;
  bjInsuranceBet = v.insurance || 0; bjInsurancePaid = !!v.insurance;
  // Закрита карта дилера — заглушка (bjRender її однаково не показує).
  bjDealerHand = v.dealer.length === 1 ? [v.dealer[0], { rank: '2', suit: '♠' }] : v.dealer.slice();
  const sa = document.getElementById('bjSplitArea'); if(sa) sa.classList.toggle('hidden', !bjSplitActive);
  const betEl = document.getElementById('bjBetDisplay'); if(betEl) betEl.textContent = '₴' + formatNumber(bjBet + bjSplitBet);
  if(v.over || r.status === 'done' || r.status === 'lost') return bjServerEnd(r);
  bjToggleButtons(v.can || {});
  bjRender(true);
}
function bjServerEnd(r) {
  const v = r.view;
  bjActive = false;
  document.getElementById('bjDealArea').classList.remove('hidden');
  document.getElementById('bjActions').classList.add('hidden');
  bjRender(false);
  const staked = v.hands.reduce((s, h) => s + h.bet, 0) + (v.insurance || 0);
  const payout = r.payout || v.payout || 0;
  const profit = payout - staked;
  const natural = !v.split && v.hands[0].cards.length === 2 && v.hands[0].value === 21 && payout > staked;
  const text = natural ? `🎉 BLACKJACK! +₴${formatNumber(profit)}`
    : v.surrendered ? `🏳️ Здався — повернуто ₴${formatNumber(payout)}`
    : profit > 0 ? `🏆 Виграш! +₴${formatNumber(profit)}`
    : profit === 0 ? '🤝 Нічия — ставку повернуто'
    : v.hands.every(h => h.value > 21) ? `💥 Перебір! (${v.hands[0].value})` : `😔 Дилер виграв (−₴${formatNumber(-profit)})`;
  const color = profit > 0 ? (natural ? '#ffd700' : 'var(--green)') : profit === 0 ? 'var(--accent)' : 'var(--red)';
  document.getElementById('bjResult').innerHTML = `<span style="color:${color}">${text}</span>`;
  if(v.insurance && v.dealerValue === 21 && v.dealer.length === 2) notify('🛡️ Страховка спрацювала!', 'success');
  playSound(profit > 0 ? (natural ? 'bonus' : 'win') : profit < 0 ? 'loss' : 'click');
  if(profit > 0) {
    trackLbStat('wins', payout); trackLbStat('profit', profit); trackQuest('bjWins', 1);
    notify(`🃏 +₴${formatNumber(profit)}`, 'success');
    if(profit >= 1000) addToWinFeed('Blackjack', profit, payout / staked);
  }
  addToHistory('Blackjack: ' + (profit >= 0 ? '+' : '') + profit);
  updateStreak(profit >= 0); recordBalanceHistory();
  bjSplitActive = false; bjPlayingHand2 = false;
}
async function bjServerMove(action) {
  if(!bjActive || bjBusy) return;
  bjBusy = true;
  let srv;
  try { srv = await serverRound('move', 'blackjack', { move: { action } }); } finally { bjBusy = false; }
  if(srv.mode !== 'server') {
    if(srv.status === 409 && srv.r && srv.r.error === 'no_round') { bjActive = false; document.getElementById('bjDealArea').classList.remove('hidden'); document.getElementById('bjActions').classList.add('hidden'); }
    return;
  }
  if(action === 'double' || action === 'split') {
    const extra = srv.r.view.hands.reduce((s, h) => s + h.bet, 0) - (bjBet + bjSplitBet);
    if(extra > 0) addWager(extra);
  }
  if(action === 'insurance') notify(`🛡️ Страховка куплена за ₴${formatNumber(srv.r.view.insurance)}`, 'info');
  if(action === 'split') notify('✂️ Split! Спочатку грай Руку 1 (підсвічена).', 'info');
  bjApplyServer(srv.r);
}

async function bjDeal() {
  if(bjBusy || bjActive) return;
  const b = validateBet(document.getElementById('betAmountBJ').value);
  if(!b) return;
  bjBusy = true;
  let srv;
  try { srv = await serverRound('start', 'blackjack', { bet: b, params: {} }); } finally { bjBusy = false; }
  if(srv.mode === 'error') return;
  bjServer = srv.mode === 'server';
  if(bjServer) {
    bjActive = true;
    addWager(b); trackQuest('totalGames', 1); trackQuest('weekWager', b);
    trackLbStat('wager', b); trackLbStat('games', 1);
    publishLiveBet('Blackjack','🃏', b, '');
    document.getElementById('bjDealArea').classList.add('hidden');
    document.getElementById('bjActions').classList.remove('hidden');
    document.getElementById('bjResult').textContent = '';
    playSound('click');
    return bjApplyServer(srv.r);
  }
  bjBet = b; bjSplitBet = 0; bjSplitHand = []; bjSplitActive = false; bjInsurancePaid = false; bjInsuranceBet = 0;
  bjPlayingHand2 = false; bjHand1Outcome = null; bjHand1Profit = 0;
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
  addWager(b); trackQuest('totalGames', 1); trackQuest('weekWager', b);
  trackLbStat('wager', b); trackLbStat('games', 1);
  publishLiveBet('Blackjack','🃏', b, '');
  const deck = bjCreateDeck();
  bjPlayerHand = [deck[0], deck[2]];
  bjDealerHand = [deck[1], deck[3]];
  bjActive = true;
  document.getElementById('bjDealArea').classList.add('hidden');
  document.getElementById('bjActions').classList.remove('hidden');
  document.getElementById('bjSplitArea') && document.getElementById('bjSplitArea').classList.add('hidden');
  document.getElementById('bjResult').textContent = '';
  const balEl = document.getElementById('bjBalanceDisplay');
  if(balEl) balEl.textContent = '₴' + formatNumber((userData.balance||0) - b);
  const betEl = document.getElementById('bjBetDisplay');
  if(betEl) betEl.textContent = '₴' + formatNumber(b);
  const canSplit = bjPlayerHand.length===2 && bjCardVal(bjPlayerHand[0])===bjCardVal(bjPlayerHand[1]) && (userData.balance||0) >= b*2;
  const splitBtn = document.getElementById('bjSplitBtn');
  if(splitBtn) splitBtn.classList.toggle('hidden', !canSplit);
  const insBtn = document.getElementById('bjInsuranceBtn');
  if(insBtn) insBtn.classList.toggle('hidden', bjDealerHand[0].rank !== 'A');
  const dblBtn = document.getElementById('bjDoubleBtn');
  if(dblBtn) dblBtn.disabled = false;
  const surrBtn = document.getElementById('bjSurrenderBtn');
  if(surrBtn) { surrBtn.disabled = false; surrBtn.classList.remove('hidden'); }
  bjRender(true);
  playSound('click');
  if(bjValue(bjPlayerHand) === 21) {
    if(bjValue(bjDealerHand) === 21) { bjEnd('push'); } else { bjEnd('blackjack'); }
  }
}

function bjHit() {
  if(!bjActive) return;
  if(bjServer) return bjServerMove('hit');
  const deck = bjCreateDeck();
  const hand = bjCurrentHand();
  hand.push(deck[0]);
  const dblBtn = document.getElementById('bjDoubleBtn'); if(dblBtn) dblBtn.disabled = true;
  const surrBtn = document.getElementById('bjSurrenderBtn'); if(surrBtn) surrBtn.disabled = true;
  const splitBtn = document.getElementById('bjSplitBtn'); if(splitBtn) splitBtn.classList.add('hidden');
  const insBtn = document.getElementById('bjInsuranceBtn'); if(insBtn) insBtn.classList.add('hidden');
  bjRender(true);
  const v = bjValue(hand);
  if(v > 21) { bjHandBust(); }
  else if(v === 21) { bjStand(); }
}

// Виклик коли ПОТОЧНА рука перебрала 21
function bjHandBust() {
  if(bjSplitActive && !bjPlayingHand2) {
    // Рука 1 перебрала — фіксуємо результат і переходимо до Руки 2
    bjHand1Outcome = 'bust'; bjHand1Profit = -bjBet;
    bjPlayingHand2 = true;
    const dblBtn = document.getElementById('bjDoubleBtn'); if(dblBtn) dblBtn.disabled = (bjSplitHand.length !== 2);
    notify('💥 Рука 1: перебір! Тепер грай Руку 2.', 'error');
    bjRender(true);
  } else {
    bjEnd('bust');
  }
}

function bjStand() {
  if(!bjActive) return;
  if(bjServer) return bjServerMove('stand');
  if(bjSplitActive && !bjPlayingHand2) {
    // Рука 1 зафіксована — переходимо до Руки 2, дилер ще не грає
    bjHand1Outcome = 'stand';
    bjPlayingHand2 = true;
    const dblBtn = document.getElementById('bjDoubleBtn'); if(dblBtn) dblBtn.disabled = (bjSplitHand.length !== 2);
    notify('✅ Рука 1 зафіксована. Тепер грай Руку 2.', 'info');
    bjRender(true);
    return;
  }
  // Або граємо Руку 2, або спліту немає взагалі — тепер хід дилера
  const deck = bjCreateDeck();
  let di = 0;
  while(bjValue(bjDealerHand) < 17) { bjDealerHand.push(deck[di++]); }
  bjRender(false);
  bjFinish();
}

function bjDouble() {
  if(!bjActive) return;
  if(bjServer) return bjServerMove('double');
  const hand = bjCurrentHand();
  if(hand.length !== 2) return;
  const curBet = bjPlayingHand2 ? bjSplitBet : bjBet;
  if((userData.balance||0) < curBet) return notify('Недостатньо коштів для Double', 'error');
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-curBet));
  addWager(curBet);
  if(bjPlayingHand2) { bjSplitBet *= 2; } else { bjBet *= 2; }
  const betEl = document.getElementById('bjBetDisplay'); if(betEl) betEl.textContent = '₴'+formatNumber(bjPlayingHand2 ? bjSplitBet : bjBet);
  const deck = bjCreateDeck();
  hand.push(deck[0]);
  bjRender(true);
  const v = bjValue(hand);
  if(v > 21) { bjHandBust(); } else { bjStand(); }
}

function bjSplit() {
  if(bjServer && bjActive) return bjServerMove('split');
  if(!bjActive || bjPlayerHand.length !== 2 || bjSplitActive) return;
  if(bjCardVal(bjPlayerHand[0]) !== bjCardVal(bjPlayerHand[1])) return;
  if((userData.balance||0) < bjBet) return notify('Недостатньо коштів для Split', 'error');
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bjBet));
  addWager(bjBet); bjSplitBet = bjBet;
  bjSplitHand = [bjPlayerHand.pop()];
  bjSplitActive = true;
  bjPlayingHand2 = false; bjHand1Outcome = null; bjHand1Profit = 0;
  const sa = document.getElementById('bjSplitArea'); if(sa) sa.classList.remove('hidden');
  const deck = bjCreateDeck();
  bjPlayerHand.push(deck[0]);
  bjSplitHand.push(deck[1]);
  // Після спліту: більше не можна спліт/страховку/здатись на цій роздачі
  const splitBtn = document.getElementById('bjSplitBtn'); if(splitBtn) splitBtn.classList.add('hidden');
  const insBtn = document.getElementById('bjInsuranceBtn'); if(insBtn) insBtn.classList.add('hidden');
  const surrBtn = document.getElementById('bjSurrenderBtn'); if(surrBtn) surrBtn.classList.add('hidden');
  bjRender(true);
  notify('✂️ Split! Спочатку грай Руку 1 (підсвічена).', 'info');
  if(bjValue(bjPlayerHand) === 21) { bjStand(); } // авто-перехід якщо одразу 21
}

// Після того як ОБИДВІ руки завершили гру (стенд/перебір) — хід дилера і фінальний розрахунок
function bjFinish() {
  const d = bjValue(bjDealerHand);
  if(bjSplitActive) {
    let profit1 = bjHand1Profit;
    if(bjHand1Outcome === 'stand') {
      const p1 = bjValue(bjPlayerHand);
      if(d > 21 || p1 > d) profit1 = bjBet;
      else if(p1 === d) profit1 = 0;
      else profit1 = -bjBet;
    }
    const p2 = bjValue(bjSplitHand);
    let profit2;
    if(p2 > 21) profit2 = -bjSplitBet;
    else if(d > 21 || p2 > d) profit2 = bjSplitBet;
    else if(p2 === d) profit2 = 0;
    else profit2 = -bjSplitBet;
    bjSettleSplitRound(profit1, profit2);
  } else {
    const p = bjValue(bjPlayerHand);
    if(p > 21) bjEnd('bust');
    else if(d > 21 || p > d) bjEnd('win');
    else if(p === d) bjEnd('push');
    else bjEnd('lose');
  }
}

// Фінальний розрахунок раунду зі спітом — виплачує обидві руки одразу
function bjSettleSplitRound(profit1, profit2) {
  bjActive = false;
  document.getElementById('bjDealArea').classList.remove('hidden');
  document.getElementById('bjActions').classList.add('hidden');
  bjRender(false);
  const totalProfit = profit1 + profit2;
  let totalPay = 0;
  if(profit1 > 0) totalPay += bjBet + profit1; else if(profit1 === 0) totalPay += bjBet;
  if(profit2 > 0) totalPay += bjSplitBet + profit2; else if(profit2 === 0) totalPay += bjSplitBet;
  if(totalPay > 0) db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(totalPay));
  const fmt = p => p > 0 ? ('+₴'+formatNumber(p)) : p < 0 ? ('−₴'+formatNumber(Math.abs(p))) : '₴0';
  const resEl = document.getElementById('bjResult');
  if(resEl) resEl.innerHTML =
    '<div style="font-size:13px;">Рука 1: <span style="color:'+(profit1>0?'var(--green)':profit1<0?'var(--red)':'#aaa')+'">'+fmt(profit1)+'</span></div>' +
    '<div style="font-size:13px;margin-top:3px;">Рука 2: <span style="color:'+(profit2>0?'var(--green)':profit2<0?'var(--red)':'#aaa')+'">'+fmt(profit2)+'</span></div>' +
    '<div style="font-size:17px;margin-top:6px;color:'+(totalProfit>=0?'var(--green)':'var(--red)')+'">Разом: '+fmt(totalProfit)+'</div>';
  playSound(totalProfit > 0 ? 'win' : totalProfit < 0 ? 'loss' : 'click');
  vibrateOnWin(Math.max(0,totalProfit));
  if(totalProfit > 0) {
    trackLbStat('wins', bjBet + bjSplitBet + totalProfit);
    if(totalProfit >= 1000) addToWinFeed('Blackjack', totalProfit, totalProfit/(bjBet+bjSplitBet));
  }
  addToHistory('Blackjack Split: ' + (totalProfit>=0?'+':'') + totalProfit);
  updateStreak(totalProfit >= 0); recordBalanceHistory();
  bjSplitActive = false; bjPlayingHand2 = false;
  const sa = document.getElementById('bjSplitArea'); if(sa) sa.classList.add('hidden');
}

function bjSurrender() {
  if(bjServer && bjActive) return bjServerMove('surrender');
  if(!bjActive || bjPlayerHand.length !== 2 || bjSplitActive) return;
  const ret = Math.floor(bjBet / 2);
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(ret));
  bjActive = false;
  document.getElementById('bjDealArea').classList.remove('hidden');
  document.getElementById('bjActions').classList.add('hidden');
  bjRender(false);
  document.getElementById('bjResult').innerHTML = `<span style="color:#888">🏳️ Здався — повернуто ₴${formatNumber(ret)}</span>`;
  notify(`🏳️ Здався, повернуто ₴${formatNumber(ret)}`,'info');
  addToHistory(`Blackjack Surrender: -${bjBet - ret}`);
}

function bjInsurance() {
  if(bjServer && bjActive) return bjServerMove('insurance');
  if(!bjActive || bjInsurancePaid || bjSplitActive) return;
  const insCost = Math.floor(bjBet / 2);
  if((userData.balance||0) < insCost) return notify('Недостатньо коштів', 'error');
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-insCost));
  bjInsurancePaid = true; bjInsuranceBet = insCost;
  const insBtn = document.getElementById('bjInsuranceBtn'); if(insBtn) insBtn.classList.add('hidden');
  notify(`🛡️ Страховка куплена за ₴${formatNumber(insCost)}`,'info');
}

function bjEnd(result) {
  bjActive = false;
  document.getElementById('bjDealArea').classList.remove('hidden');
  document.getElementById('bjActions').classList.add('hidden');
  bjRender(false);
  const profit = result==='blackjack' ? Math.floor(bjBet*1.5) : result==='win'?bjBet : result==='push'?0 : -bjBet;
  const msgs = {
    blackjack: `🎉 BLACKJACK! +₴${formatNumber(Math.floor(bjBet*1.5))}`,
    win:  `🏆 Виграш! +₴${formatNumber(bjBet)}`,
    lose: '😔 Дилер виграв',
    bust: `💥 Перебір! (${bjValue(bjPlayerHand)})`,
    push: '🤝 Нічия — ставку повернуто'
  };
  const colors = { blackjack:'#ffd700', win:'var(--green)', lose:'var(--red)', bust:'var(--red)', push:'var(--accent)' };
  document.getElementById('bjResult').innerHTML = `<span style="color:${colors[result]}">${msgs[result]}</span>`;
  let win = 0;
  if(result==='blackjack') win = bjBet + Math.floor(bjBet*1.5);
  else if(result==='win')  win = bjBet * 2;
  else if(result==='push') win = bjBet;
  if(bjInsurancePaid && bjValue(bjDealerHand)===21) { win += bjInsuranceBet*2; notify('🛡️ Страховка спрацювала!','success'); }
  if(win > 0) {
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
    if(result !== 'push') {
      playSound(result==='blackjack'?'bonus':'win');
      trackLbStat('wins', win); trackLbStat('profit', win-bjBet);
      addToHistory(`Blackjack ${result}: +${win-bjBet}`);
      trackQuest('bjWins',1);
      notify(`🃏 +₴${formatNumber(win - bjBet)}`, 'success');
      if(win-bjBet >= 1000) addToWinFeed('Blackjack', win-bjBet, win/bjBet);
    }
  } else {
    playSound('loss');
    addToHistory(`Blackjack: -${bjBet}`);
  }
}

function bjCardVal(card) {
  return Math.min(10, STANDARD_RANKS.indexOf(card.rank)+2);
}

