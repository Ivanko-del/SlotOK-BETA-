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
