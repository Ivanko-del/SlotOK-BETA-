function initDragonTower() { renderDragonGrid(); }
function setDragonDiff(cols, dragons, el) {
  dragonState.cols = cols; dragonState.dragons = dragons;
  document.querySelectorAll('.dragon-diff').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}
function renderDragonGrid() {
  const g = document.getElementById('dragonTowerGrid');
  if(!g) return;
  const totalRows = 8;
  g.innerHTML = '';
  for(let r=totalRows-1; r>=0; r--) {
    const row = document.createElement('div');
    row.id = 'dr-row-'+r;
    row.style.cssText = 'display:flex;gap:6px;';
    for(let c=0; c<dragonState.cols; c++) {
      const cell = document.createElement('div');
      cell.id = `dr-${r}-${c}`;
      cell.style.cssText = 'flex:1;height:48px;background:rgb(var(--tint-rgb) / 0.05);border:1px solid rgb(var(--tint-rgb) / 0.1);border-radius:var(--r-md);display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;transition:.3s;';
      cell.textContent = r < dragonState.level ? '' : '🥚';
      if(dragonState.active && r === dragonState.level) {
        cell.style.borderColor = 'rgb(var(--accent-rgb) / 0.5)';
        cell.style.background = 'rgb(var(--accent-rgb) / 0.1)';
        cell.onclick = () => pickDragonCell(r, c);
      }
      row.appendChild(cell);
    }
    g.appendChild(row);
  }
}
let dragonBusy = false;
async function startDragonTower() {
  if(dragonBusy || dragonState.active) return;
  const bet = validateBet(document.getElementById('dragonBet').value);
  if(!bet) return;
  dragonBusy = true;
  let srv;
  try { srv = await serverRound('start', 'dragon', { bet, params: { cols: dragonState.cols, dragons: dragonState.dragons } }); } finally { dragonBusy = false; }
  if(srv.mode === 'error') return;
  // ставка раніше НЕ списувалась з балансу тут — гравець міг натиснути
  // "Старт", одразу забрати (mult=1, рівень=0) і отримати гроші нізвідки,
  // навіть не вибравши жодного яйця. Списуємо баланс так само, як інші ігри.
  if(srv.mode !== 'server') db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  dragonState = { active:true, level:0, bet, dragons:dragonState.dragons, cols:dragonState.cols, mult:1, server: srv.mode === 'server' };
  addWager(bet);
  document.getElementById('dragonSetup').classList.add('hidden');
  // Кешаут доступний лише після першого безпечного вибору (як у Tower Climb) —
  // без цього кешаут одразу після старту повертав би ставку без жодного ризику.
  document.getElementById('dragonCashoutBtn').classList.add('hidden');
  document.getElementById('dragonLevel').textContent = '0';
  document.getElementById('dragonMult').textContent = 'x1.00';
  document.getElementById('dragonCashout').textContent = '₴'+formatNumber(bet);
  renderDragonGrid();
  notify('🐉 Вибери безпечне яйце!', 'info');
}
async function pickDragonCell(row, col) {
  if(!dragonState.active || row !== dragonState.level || dragonBusy) return;
  const cells = document.querySelectorAll(`[id^="dr-${row}-"]`);
  let dragonCols = [];
  let serverDone = null;
  if(dragonState.server) {
    // Де дракони в цьому рядку, вирішує сервер у момент вибору.
    dragonBusy = true;
    let srv;
    try { srv = await serverRound('move', 'dragon', { move: { col } }); } finally { dragonBusy = false; }
    if(srv.mode !== 'server') {
      if(srv.status === 409) { dragonState.active = false; document.getElementById('dragonSetup').classList.remove('hidden'); document.getElementById('dragonCashoutBtn').classList.add('hidden'); }
      return;
    }
    dragonCols = srv.r.view.rows[srv.r.view.rows.length - 1].dragons;
    if(srv.r.status === 'done') serverDone = srv.r;
  } else {
    // Reveal all cells
    while(dragonCols.length < dragonState.dragons) {
      const r = Math.floor(Math.random()*dragonState.cols);
      if(!dragonCols.includes(r)) dragonCols.push(r);
    }
  }
  cells.forEach((c, i) => {
    c.onclick = null;
    c.style.cursor = 'default';
    c.style.transition = '.4s';
    if(dragonCols.includes(i)) {
      c.textContent = '🐉';
      c.style.background = 'rgb(var(--neg-rgb) / 0.3)';
      c.style.borderColor = 'var(--neg)';
    } else {
      c.textContent = '💎';
      c.style.background = 'rgb(var(--pos-rgb) / 0.2)';
      c.style.borderColor = 'var(--pos)';
    }
  });
  if(dragonCols.includes(col)) {
    // Hit dragon
    dragonState.active = false;
    document.getElementById('dragonCashoutBtn').classList.add('hidden');
    document.getElementById('dragonSetup').classList.remove('hidden');
    notify('🐉 Дракон! Програш!', 'error');
    checkAchievements('game', null);
  } else {
    // Safe
    dragonState.level++;
    const multStep = 1 + (dragonState.dragons / dragonState.cols) * 0.8;
    dragonState.mult = parseFloat((dragonState.mult * multStep).toFixed(2));
    const cashout = Math.floor(dragonState.bet * dragonState.mult);
    document.getElementById('dragonLevel').textContent = dragonState.level;
    document.getElementById('dragonMult').textContent = 'x'+dragonState.mult;
    document.getElementById('dragonCashout').textContent = '₴'+formatNumber(cashout);
    document.getElementById('dragonCashoutBtn').classList.remove('hidden');
    if(serverDone) { dragonFinishUI(serverDone.payout); return; }
    if(dragonState.level >= 8) { cashoutDragon(); return; }
    renderDragonGrid();
    notify(`✅ Безпечно! Рівень ${dragonState.level} | x${dragonState.mult}`, 'success');
  }
}
async function cashoutDragon() {
  // level 0 = жодного яйця ще не вибрано — виводити нічого, це б лише
  // повертало ставку без ризику (кнопка кешауту й так прихована до цього моменту)
  if(!dragonState.active || dragonState.level <= 0 || dragonBusy) return;
  if(dragonState.server) {
    dragonBusy = true;
    let srv;
    try { srv = await serverRound('cashout', 'dragon'); } finally { dragonBusy = false; }
    if(srv.mode !== 'server') return;
    return dragonFinishUI(srv.r.payout);
  }
  const payout = Math.floor(dragonState.bet * dragonState.mult);
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
  userData.balance = (userData.balance||0) + payout;
  updateUI();
  dragonFinishUI(payout);
}
// Спільний фінал кешауту (баланс уже змінено — сервером або вище).
function dragonFinishUI(payout) {
  dragonState.active = false;
  addToHistory('🐉 Dragon Tower: +₴'+formatNumber(payout)+' (x'+dragonState.mult+')');
  triggerWinReaction(payout, 'Dragon Tower');
  document.getElementById('dragonCashoutBtn').classList.add('hidden');
  document.getElementById('dragonSetup').classList.remove('hidden');
  notify('💰 Забрав ₴'+formatNumber(payout)+'!', 'success');
}

// ══════════════════════════════════════════════════════
// ⚽ PENALTY KICK
// ══════════════════════════════════════════════════════
const PENALTY_ZONES = ['tl','tc','tr','bl','bc','br'];
function initPenalty() { document.getElementById('penaltyResult').textContent=''; }
// ×1.16 при шансі 5/6 = RTP 96,7%. Було ×3 (RTP 250%) — гра друкувала гроші.
const PENALTY_MULT = 1.16;
let penaltyBusy = false;
async function shootPenalty(zone) {
  if(penaltyBusy) return;
  const bet = parseInt(document.getElementById('penaltyBet').value)||0;
  if(!validateBet(bet)) return;
  penaltyBusy = true;
  let srv;
  try { srv = await serverPlay('penalty', bet, { zone }); } finally { penaltyBusy = false; }
  if(srv.mode === 'error') return;
  if(srv.mode !== 'server') {
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
    userData.balance = (userData.balance||0) - bet; updateUI();
  }
  addWager(bet);
  const gkZone = srv.mode === 'server' ? srv.r.keeper : PENALTY_ZONES[Math.floor(Math.random()*PENALTY_ZONES.length)];
  const win = zone !== gkZone;
  const payout = srv.mode === 'server' ? srv.r.payout : (win ? Math.floor(bet*PENALTY_MULT) : 0);
  // Animate GK
  document.getElementById('penaltyGoalkeeper').textContent = gkZone.startsWith('t') ? '🦵' : '🧤';
  setTimeout(() => document.getElementById('penaltyGoalkeeper').textContent = '🧤', 800);
  // Flash chosen zone
  const el = document.getElementById('pz-'+zone);
  if(el) { el.style.background=win?'rgb(var(--pos-rgb) / 0.5)':'rgb(var(--neg-rgb) / 0.4)'; setTimeout(()=>el.style.background='rgb(var(--pos-rgb) / 0.1)',700); }
  document.getElementById('penaltyResult').textContent = win ? '⚽ ГОЛ! +₴'+formatNumber(payout) : '🧤 Воротар схопив!';
  document.getElementById('penaltyResult').style.color = win ? 'var(--pos)' : 'var(--neg)';
  if(win) {
    if(srv.mode !== 'server') {
      db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
      userData.balance = (userData.balance||0) + payout;
      updateUI();
    }
    triggerWinReaction(payout,'Penalty Kick');
  }
  addToHistory(`⚽ Penalty: ${win?'+₴'+formatNumber(payout):'Промах'}`);
  const log = document.getElementById('penaltyLog');
  if(log) log.innerHTML = `<div class="mono-log-item ${win?'success':'error'}">${win?'⚽ ГОЛ! +₴'+formatNumber(payout):'🧤 Заблоковано — ₴'+formatNumber(bet)}</div>` + log.innerHTML;
}

// ══════════════════════════════════════════════════════
// 🎳 BOWLING
// ══════════════════════════════════════════════════════
function initBowling() { document.getElementById('bowlingResult').textContent = ''; }
// Було: страйк ×10, спейр ×3 … — на силі 100% гра повертала 524% ставки.
// Тепер ті самі правила кеглів + ризик жолоба на сильному кидку, RTP ≤ 97%.
const BOWL_MULT = { strike: 3.5, spare: 1.25, mid: 0.7, low: 0.2 };
async function throwBowl() {
  const bet = parseInt(document.getElementById('bowlingBet').value)||0;
  if(!validateBet(bet)) return;
  const power = parseInt(document.getElementById('bowlingPower').value);
  const btn = document.getElementById('bowlingBtn');
  btn.disabled = true;
  const srv = await serverPlay('bowling', bet, { power });
  if(srv.mode === 'error') { btn.disabled = false; return; }
  if(srv.mode !== 'server') {
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
    userData.balance = (userData.balance||0) - bet; updateUI();
  }
  addWager(bet);
  let knocked, gutter;
  if(srv.mode === 'server') {
    ({ knocked, gutter } = srv.r);
  } else {
    const gutterChance = power > 60 ? Math.pow((power - 60) / 40, 2) * 0.75 : 0;
    gutter = Math.random() < gutterChance;
    knocked = gutter ? 0 : Math.min(10, Math.floor((power / 100) * 10 * (0.5 + Math.random()*0.8)));
  }
  const strike = knocked === 10;
  const spare = knocked >= 7 && !strike;
  let mult = knocked === 0 ? 0 : strike ? BOWL_MULT.strike : spare ? BOWL_MULT.spare : knocked >= 4 ? BOWL_MULT.mid : BOWL_MULT.low;
  const payout = srv.mode === 'server' ? srv.r.payout : Math.floor(bet * mult);
  // Animate pins
  const pinsDiv = document.getElementById('bowlingPins');
  pinsDiv.innerHTML = `<div style="font-size:36px;animation:spin 0.5s;">🎳</div>`;
  setTimeout(() => {
    const remain = 10 - knocked;
    let pinsHtml = '';
    const row4 = Math.min(remain, 4); const row3 = Math.min(remain-row4, 3);
    const row2 = Math.min(remain-row4-row3, 2); const row1 = remain-row4-row3-row2>0?1:0;
    const mkRow = (n,total) => Array(total).fill(0).map((_,i)=>i<n?'🎳':'<span style="opacity:.1">🎳</span>').join(' ');
    pinsHtml = `<div>${mkRow(row4,4)}</div><div style="margin-left:12px;">${mkRow(row3,3)}</div><div style="margin-left:24px;">${mkRow(row2,2)}</div><div style="margin-left:36px;">${mkRow(row1,1)}</div>`;
    pinsDiv.innerHTML = pinsHtml;
    const label = strike ? '🎳 СТРАЙК! x' + BOWL_MULT.strike : spare ? '🎳 Спейр! x' + BOWL_MULT.spare : knocked>0 ? `${knocked}/10 кеглів x${mult}` : gutter ? 'У жолоб! Надто сильно x0' : 'Мімо! x0';
    document.getElementById('bowlingResult').textContent = label;
    document.getElementById('bowlingResult').style.color = strike?'var(--accent)':spare?'var(--info)':knocked>0?'var(--pos)':'var(--neg)';
    if(payout > 0) {
      if(srv.mode !== 'server') {
        db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
        userData.balance=(userData.balance||0)+payout; updateUI();
      }
      if(strike) triggerWinReaction(payout,'Bowling');
    }
    addToHistory(`🎳 Bowling: ${knocked}/10 кеглів → ${payout>0?'+₴'+formatNumber(payout):'-₴'+formatNumber(bet)}`);
    const log = document.getElementById('bowlingLog');
    if(log) log.innerHTML = `<div class="mono-log-item ${payout>0?'success':'error'}">${label} → ${payout>0?'+₴'+formatNumber(payout):'-₴'+formatNumber(bet)}</div>` + log.innerHTML;
    btn.disabled = false;
  }, 600);
}

// ══════════════════════════════════════════════════════
// 🎯 ARCHERY
// ══════════════════════════════════════════════════════
// Коефіцієнти — RTP ≈ 96–97% (було 193–250%). Сервер рахує за рівнем (level).
let archRisk = { chance:0.55, mult:1.75, level:'low' };
function setArchRisk(chance, mult, el) {
  archRisk = { chance, mult, level: chance >= 0.5 ? 'low' : chance >= 0.2 ? 'mid' : 'high' };
  document.querySelectorAll('.arch-risk').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}
function initArchery() { document.getElementById('archeryResult').textContent=''; }
async function shootArchery() {
  const bet = parseInt(document.getElementById('archeryBet').value)||0;
  if(!validateBet(bet)) return;
  const btn = document.getElementById('archeryBtn');
  btn.disabled = true;
  const srv = await serverPlay('archery', bet, { level: archRisk.level });
  if(srv.mode === 'error') { btn.disabled = false; return; }
  if(srv.mode !== 'server') {
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
    userData.balance = (userData.balance||0) - bet; updateUI();
  }
  addWager(bet);
  const win = srv.mode === 'server' ? srv.r.win : Math.random() < archRisk.chance;
  const arrow = document.getElementById('archeryArrow');
  const target = document.querySelector('#tab-archery div[style*="radial-gradient"]');
  if(arrow && target) {
    const rect = target.getBoundingClientRect();
    arrow.style.display = 'block';
    arrow.style.left = (20 + Math.random()*60)+'%';
    arrow.style.top = (20 + Math.random()*60)+'%';
  }
  setTimeout(() => {
    const payout = srv.mode === 'server' ? srv.r.payout : (win ? Math.floor(bet * archRisk.mult) : 0);
    document.getElementById('archeryResult').textContent = win ? `🎯 Попадання! +₴${formatNumber(payout)}` : '💨 Промах!';
    document.getElementById('archeryResult').style.color = win ? 'var(--pos)' : 'var(--neg)';
    if(win) {
      if(srv.mode !== 'server') {
        db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
        userData.balance=(userData.balance||0)+payout; updateUI();
      }
      triggerWinReaction(payout,'Archery');
    }
    addToHistory(`🎯 Archery: ${win?'+₴'+formatNumber(payout):'Промах'}`);
    const log = document.getElementById('archeryLog');
    if(log) log.innerHTML = `<div class="mono-log-item ${win?'success':'error'}">${win?'🎯 +₴'+formatNumber(payout):'💨 Промах -₴'+formatNumber(bet)}</div>` + log.innerHTML;
    btn.disabled = false;
    if(arrow) setTimeout(()=>arrow.style.display='none', 1500);
  }, 700);
}

// ══════════════════════════════════════════════════════
// 🎲 SIC BO
// ══════════════════════════════════════════════════════
let sicboType = 'big';
const DICE_FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];
function setSicBoType(t, el) {
  sicboType = t;
  document.querySelectorAll('.sicbo-type').forEach(b=>b.classList.remove('active')); el.classList.add('active');
  document.getElementById('sicboSumPicker').classList.toggle('hidden', t!=='sum');
}
function initSicBo() {}
async function rollSicBo() {
  const bet = parseInt(document.getElementById('sicboBet').value)||0;
  if(!validateBet(bet)) return;
  const btn = document.getElementById('sicboBtn'); btn.disabled=true;
  const sbParams = sicboType === 'sum'
    ? { type: 'sum', sum: parseInt(document.getElementById('sicboSumValue').value) }
    : { type: sicboType };
  const srv = await serverPlay('sicbo', bet, sbParams);
  if(srv.mode === 'error') { btn.disabled = false; return; }
  if(srv.mode !== 'server') {
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
    userData.balance = (userData.balance||0) - bet; updateUI();
  }
  addWager(bet);
  // Roll dice
  let anim = 0;
  const animInterval = setInterval(() => {
    ['sbc1','sbc2','sbc3'].forEach(id => document.getElementById(id).textContent = DICE_FACES[Math.floor(Math.random()*6)]);
    if(++anim > 10) clearInterval(animInterval);
  }, 80);
  setTimeout(() => {
    const [d1, d2, d3] = srv.mode === 'server'
      ? srv.r.dice
      : [Math.ceil(Math.random()*6), Math.ceil(Math.random()*6), Math.ceil(Math.random()*6)];
    ['sbc1','sbc2','sbc3'].forEach((id,i)=>document.getElementById(id).textContent=DICE_FACES[[d1,d2,d3][i]-1]);
    const sum = d1+d2+d3;
    const triple = d1===d2 && d2===d3;
    document.getElementById('sicboSum').textContent = `Сума: ${sum} (${d1}+${d2}+${d3})`;
    let win=false, mult=0, label='';
    if(sicboType==='big')    { win=sum>=11&&!triple; mult=2; label='Велике'; }
    if(sicboType==='small')  { win=sum<=10&&!triple; mult=2; label='Мале'; }
    if(sicboType==='triple') { win=triple; mult=24; label='Трипл'; }
    if(sicboType==='sum')    {
      const target=parseInt(document.getElementById('sicboSumValue').value);
      const multMap={4:60,5:30,6:17,7:12,8:8,9:6,10:6,11:6,12:6,13:8,14:12,15:17,16:30,17:60};
      win=sum===target; mult=multMap[target]||6; label='Сума '+target;
    }
    if(srv.mode === 'server') win = srv.r.win;
    const payout = srv.mode === 'server' ? srv.r.payout : (win ? Math.floor(bet*mult) : 0);
    document.getElementById('sicboResult').textContent = win?`✅ ${label}! +₴${formatNumber(payout)}`:`❌ Програш`;
    document.getElementById('sicboResult').style.color = win?'var(--pos)':'var(--neg)';
    if(win) {
      if(srv.mode !== 'server') {
        db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
        userData.balance=(userData.balance||0)+payout; updateUI();
      }
      triggerWinReaction(payout,'Sic Bo');
    }
    addToHistory(`🎲 Sic Bo: ${win?'+₴'+formatNumber(payout):'−₴'+formatNumber(bet)}`);
    const log=document.getElementById('sicboLog');
    if(log) log.innerHTML=`<div class="mono-log-item ${win?'success':'error'}">${label} → ${win?'+₴'+formatNumber(payout):'-₴'+formatNumber(bet)}</div>`+log.innerHTML;
    btn.disabled=false;
  }, 900);
}

// ══════════════════════════════════════════════════════
// ⚔️ CARD WAR
// ══════════════════════════════════════════════════════
const CW_RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const CW_SUITS = ['♠','♥','♦','♣'];
function initCardWar() { document.getElementById('cwResult').textContent=''; }
function randCard() { return { rank:Math.floor(Math.random()*13), suit:CW_SUITS[Math.floor(Math.random()*4)] }; }
function cardStr(c) { return CW_RANKS[c.rank]+c.suit; }
async function playCardWar() {
  const bet = parseInt(document.getElementById('cwBet').value)||0;
  if(!validateBet(bet)) return;
  const btn=document.getElementById('cwBtn'); btn.disabled=true;
  const srv = await serverPlay('cardwar', bet, {});
  if(srv.mode === 'error') { btn.disabled = false; return; }
  if(srv.mode !== 'server') {
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
    userData.balance = (userData.balance||0) - bet; updateUI();
  }
  addWager(bet);
  document.getElementById('cwPlayerCard').textContent='🂠';
  document.getElementById('cwDealerCard').textContent='🂠';
  document.getElementById('cwResult').textContent='';
  setTimeout(()=>{
    const toCard = c => ({ rank: c.rank, suit: CW_SUITS[c.suit] });
    const p = srv.mode === 'server' ? toCard(srv.r.player) : randCard();
    const d = srv.mode === 'server' ? toCard(srv.r.dealer) : randCard();
    const pEl=document.getElementById('cwPlayerCard'), dEl=document.getElementById('cwDealerCard');
    pEl.textContent=cardStr(p); pEl.style.color=p.suit.includes('♥')||p.suit.includes('♦')?'var(--neg)':'var(--fg)';
    dEl.textContent=cardStr(d); dEl.style.color=d.suit.includes('♥')||d.suit.includes('♦')?'var(--neg)':'var(--fg)';
    let win=false,payout=0,label='';
    if(p.rank>d.rank) { win=true; payout=Math.floor(bet*2); label='⚔️ Перемога! Твоя карта вища!'; }
    else if(p.rank<d.rank) { payout=0; label='💀 Дилер переміг!'; }
    else { win=true; payout=bet; label='🤝 Нічия — повернення!'; }
    document.getElementById('cwResult').textContent=label;
    document.getElementById('cwResult').style.color=p.rank>d.rank?'var(--pos)':p.rank<d.rank?'var(--neg)':'var(--accent)';
    if(payout>0) {
      if(srv.mode !== 'server') {
        db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
        userData.balance=(userData.balance||0)+payout; updateUI();
      }
      if(p.rank>d.rank) triggerWinReaction(payout,'Card War');
    }
    addToHistory(`⚔️ Card War: ${cardStr(p)} vs ${cardStr(d)} → ${payout>0?'+₴'+formatNumber(payout):'-₴'+formatNumber(bet)}`);
    const log=document.getElementById('cwLog');
    if(log) log.innerHTML=`<div class="mono-log-item ${p.rank>=d.rank?'success':'error'}">${cardStr(p)} vs ${cardStr(d)} — ${label}</div>`+log.innerHTML;
    btn.disabled=false;
  },600);
}

// ══════════════════════════════════════════════════════
// 🦆 DUCK SHOOT
// ══════════════════════════════════════════════════════
let duckState = { active:false, mult:1, duckIndex:0, totalDucks:10, hit:0 };
function initDuckShoot() { duckState={active:false,mult:1,duckIndex:0,totalDucks:10,hit:0}; }
function startDuckShoot() {
  if(duckState.active) return;
  const bet = parseInt(document.getElementById('duckBet').value)||0;
  if(!validateBet(bet)) return;
  // ставка ніколи не списувалась — той самий баг, що й у Penalty/Bowling/Archery/SicBo/Card War
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  userData.balance = (userData.balance||0) - bet; updateUI();
  addWager(bet);
  duckState={active:true,bet,mult:1,duckIndex:0,totalDucks:10,hit:0};
  document.getElementById('duckBtn').textContent='🦆 Стріляй!';
  document.getElementById('duckBtn').onclick=shootDuck;
  document.getElementById('duckResult').textContent='';
  spawnDuck();
}
function spawnDuck() {
  if(!duckState.active) return;
  const area=document.getElementById('duckArea');
  if(!area) return;
  const duck=document.createElement('div');
  duck.id='active-duck';
  duck.textContent='🦆';
  duck.style.cssText='font-size:36px;cursor:pointer;animation:duckFly 1.5s linear;';
  duck.onclick=()=>shootDuck();
  area.innerHTML='';
  area.appendChild(duck);
  document.getElementById('duckProgress').textContent=`Качка ${duckState.duckIndex+1}/${duckState.totalDucks} • Множник: x${duckState.mult.toFixed(2)}`;
  const spawnedIndex=duckState.duckIndex;
  const flyTimer=setTimeout(()=>{ if(duckState.active && duckState.duckIndex===spawnedIndex) missedDuck(); },1800);
  duck._timer=flyTimer;
}
function shootDuck() {
  if(!duckState.active) return;
  const duck=document.getElementById('active-duck');
  if(duck) { clearTimeout(duck._timer); duck.textContent='💥'; duck.style.animation='none'; }
  duckState.hit++; duckState.mult=parseFloat((duckState.mult*1.2).toFixed(2));
  duckState.duckIndex++;
  document.getElementById('duckProgress').textContent=`Качка ${duckState.duckIndex}/${duckState.totalDucks} збита! • x${duckState.mult.toFixed(2)}`;
  if(duckState.duckIndex>=duckState.totalDucks) finishDuckShoot(true);
  else setTimeout(spawnDuck,500);
}
function missedDuck() {
  if(!duckState.active) return;
  duckState.active=false;
  document.getElementById('duckArea').innerHTML='<div style="font-size:48px;text-align:center;width:100%;">🦆💨</div>';
  document.getElementById('duckResult').textContent='Пропустив! Гра закінчена!';
  document.getElementById('duckResult').style.color='var(--neg)';
  addToHistory(`🦆 Duck Shoot: Програш на ${duckState.duckIndex}/${duckState.totalDucks}`);
  document.getElementById('duckBtn').textContent='🦆 ПОЧАТИ ЗНОВУ';
  document.getElementById('duckBtn').onclick=startDuckShoot;
}
function finishDuckShoot(allHit) {
  duckState.active=false;
  const payout=Math.floor(duckState.bet*duckState.mult);
  document.getElementById('duckArea').innerHTML='<div style="font-size:48px;text-align:center;width:100%;">🏆</div>';
  document.getElementById('duckResult').textContent=`🏆 Всіх збив! +₴${formatNumber(payout)}`;
  document.getElementById('duckResult').style.color='var(--accent)';
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
  userData.balance=(userData.balance||0)+payout; updateUI(); triggerWinReaction(payout,'Duck Shoot');
  addToHistory(`🦆 Duck Shoot: +₴${formatNumber(payout)} (x${duckState.mult.toFixed(2)})`);
  document.getElementById('duckBtn').textContent='🦆 ГРАТИ ЗНОВУ';
  document.getElementById('duckBtn').onclick=startDuckShoot;
}
// CSS for duck animation
(()=>{const s=document.createElement('style');s.textContent='@keyframes duckFly{from{transform:translateX(-40px) scaleX(-1)}to{transform:translateX(200px) scaleX(-1)}}';document.head.appendChild(s);})();

