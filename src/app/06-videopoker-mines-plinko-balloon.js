// ============================================
// СПІЛЬНА КОЛОДА КАРТ — create/shuffle/isRed для покеру, блекджеку,
// карт (Дурень), відеопокеру й бакари. Раніше кожна гра мала свою копію
// цієї логіки під різними назвами (cardHTML/cardHtml/bjCardHTML/bacCardHTML,
// {rank,suit} vs {r,s}), і половина з них тасувала колоду через
// `deck.sort(() => Math.random()-0.5)` — цей метод дає зміщений
// (нерівномірний) розподіл, на відміну від Fisher-Yates нижче.
// ============================================
const STANDARD_SUITS = ['♠', '♥', '♦', '♣'];
const STANDARD_RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

function createStandardDeck(ranks = STANDARD_RANKS, suits = STANDARD_SUITS) {
  const deck = [];
  for(const suit of suits) for(const rank of ranks) deck.push({ rank, suit });
  return deck;
}

function shuffleDeck(deck) {
  for(let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function isRedSuit(suit) { return suit === '♥' || suit === '♦'; }

// ============================================
// ВІДЕОПОКЕР
// ============================================
const POKER_SUITS = STANDARD_SUITS;
const POKER_RANKS = STANDARD_RANKS;
const RANK_VALUES = {2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13,A:14};

let pokerHand = [];
let pokerSelectedCards = [];
let pokerBet = 0;
let pokerPhase = 'deal'; // 'deal' або 'draw'

function createDeck() {
    return shuffleDeck(createStandardDeck(POKER_RANKS, POKER_SUITS));
}

function cardHTML(card, index, selectable=false) {
    const isRed = isRedSuit(card.suit);
    const colorClass = isRed ? 'red-card' : '';
    const selectedClass = pokerSelectedCards.includes(index) ? 'selected' : '';
    const onclick = selectable ? `onclick="togglePokerCard(${index})"` : '';
    return `<div class="card ${colorClass} ${selectedClass}" ${onclick} data-idx="${index}">
        <span style="font-size:11px;">${card.rank}</span>
        <span style="font-size:16px;">${card.suit}</span>
    </div>`;
}

function togglePokerCard(idx) {
    if(pokerPhase !== 'draw') return;
    const pos = pokerSelectedCards.indexOf(idx);
    if(pos === -1) pokerSelectedCards.push(idx);
    else pokerSelectedCards.splice(pos, 1);
    renderPokerHand(true);
}

function renderPokerHand(selectable=false) {
    const container = document.getElementById('pokerCards');
    container.innerHTML = pokerHand.map((c, i) => cardHTML(c, i, selectable)).join('');
}

function dealPoker() {
    const b = validateBet(document.getElementById('betAmountPoker').value);
    if(!b) return;
    pokerBet = b;
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
    addWager(b);
  trackLbStat('wager', b); trackLbStat('games', 1);
  publishLiveBet('Відеопокер','🎴', b, '');
    trackQuest('totalGames', 1);
    trackQuest('weekWager', b);

    const deck = createDeck();
    pokerHand = deck.slice(0, 5);
    pokerSelectedCards = [];
    pokerPhase = 'draw';
    db.ref('users/'+currentUser+'/pokerPhase').set('draw');

    renderPokerHand(true);
    document.getElementById('pokerInfo').textContent = '🔄 Оберіть карти для ЗАМІНИ (або не обирайте)';
    document.getElementById('pokerDealBtn').classList.add('hidden');
    document.getElementById('pokerDrawBtn').classList.remove('hidden');
    playSound('click');
}

function drawPoker() {
    // Локальна перевірка — лише для чуйності UI (блокує подвійний клік по
    // кнопці). Реальний захист від задвоєної виплати — транзакція нижче:
    // фаза 'draw' -> 'deal' у Firebase атомарно переходить рівно один раз,
    // тож повторний виклик drawPoker() (напр. з консолі) програє транзакцію
    // і не дійде до нарахування виграшу.
    if(pokerPhase !== 'draw') return;
    pokerPhase = 'deal';
    document.getElementById('pokerDealBtn').classList.remove('hidden');
    document.getElementById('pokerDrawBtn').classList.add('hidden');

    db.ref('users/'+currentUser+'/pokerPhase').transaction(cur => {
        if(cur !== 'draw') return; // undefined -> абортує транзакцію
        return 'deal';
    }).then(result => {
        if(!result.committed || result.snapshot.val() !== 'deal') return; // виплату вже видано іншим викликом

        // Замінюємо виділені карти
        const deck = createDeck().filter(c => !pokerHand.find(h => h.rank===c.rank && h.suit===c.suit));
        let di = 0;
        pokerSelectedCards.forEach(idx => { pokerHand[idx] = deck[di++]; });
        pokerSelectedCards = [];

        renderPokerHand(false);

        const result2 = evaluatePokerHand(pokerHand);
        const win = Math.floor(pokerBet * result2.multiplier);

        if(win > 0) {
            db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
            playSound('win');
            notify(`🃏 ${result2.name}! +${win} ₴`, 'success');
            addToHistory(`Poker ${result2.name}: +${win}`);
            document.getElementById('pokerInfo').innerHTML = `<span style="color:var(--green); font-weight:bold;">🏆 ${result2.name}! Виграш: +${win} ₴</span>`;
        } else {
            notify('😔 Нічого немає', 'error');
            document.getElementById('pokerInfo').textContent = result2.name + ' — програш';
        }
    });
}

function evaluatePokerHand(hand) {
    const ranks = hand.map(c => RANK_VALUES[c.rank]).sort((a,b) => a-b);
    const suits = hand.map(c => c.suit);
    const rankStr = hand.map(c => c.rank);
    
    const isFlush = suits.every(s => s === suits[0]);
    const isStraight = ranks[4]-ranks[0]===4 && new Set(ranks).size===5 || 
                      (ranks.join(',') === '2,3,4,5,14'); // Wheel
    
    const rankCount = {};
    rankStr.forEach(r => rankCount[r] = (rankCount[r]||0)+1);
    const counts = Object.values(rankCount).sort((a,b) => b-a);
    
    if(isFlush && isStraight && ranks[0]===10) return {name:'Роял-флеш 👑', multiplier:800};
    if(isFlush && isStraight) return {name:'Стрейт-флеш', multiplier:50};
    if(counts[0]===4) return {name:'Каре', multiplier:25};
    if(counts[0]===3 && counts[1]===2) return {name:'Фул-хаус', multiplier:9};
    if(isFlush) return {name:'Флеш', multiplier:6};
    if(isStraight) return {name:'Стрейт', multiplier:4};
    if(counts[0]===3) return {name:'Три однакових', multiplier:3};
    if(counts[0]===2 && counts[1]===2) return {name:'Дві пари', multiplier:2};
    
    if(counts[0]===2) {
        const pairRank = Object.keys(rankCount).find(r => rankCount[r]===2);
        if(['J','Q','K','A'].includes(pairRank)) return {name:`Пара ${pairRank}`, multiplier:1};
    }
    
    return {name:'Нічого', multiplier:0};
}

// --- Сапер ---
let minesGrid = []; let isMinesPlaying = false; let currentMinesProfit = 0; let movesMade = 0; let minesBet = 0; let minesCount = 5;

function getMinesMult(safe, opened, total) {
  // Точна формула: mult = product of (total-mines-i)/(total-i) для i=0..opened-1, інверсна
  const mines = total - safe;
  let prob = 1;
  for(let i = 0; i < opened; i++) {
    prob *= (safe - i) / (total - i);
  }
  return parseFloat((0.97 / prob).toFixed(2));
}

function updateMinesInfo() {
  const sel = document.getElementById('minesCount');
  if(!sel) return;
  const m = parseInt(sel.value);
  const safe = 25 - m;
  const m1 = getMinesMult(safe, 1, 25);
  const m5 = getMinesMult(safe, Math.min(5, safe), 25);
  const el = document.getElementById('minesInfo');
  if(el) el.textContent = `Безпечних: ${safe} · 1-й хід: ×${m1} · ${Math.min(5,safe)}-й хід: ×${m5}`;
}

let minesServer = false, minesBusy = false;
async function startMines() {
    const bet = validateBet(document.getElementById('betAmountMines').value);
    if(!bet) return;
    if(isMinesPlaying || minesBusy) return notify('Гра вже йде!', 'error');
    minesCount = parseInt((document.getElementById('minesCount')||{value:'5'}).value) || 5;
    minesBet = bet;
    // Де міни, знає лише сервер (api/round.js); у браузер вони приходять у кінці раунду.
    minesBusy = true;
    let srv;
    try { srv = await serverRound('start', 'mines', { bet, params: { mines: minesCount } }); } finally { minesBusy = false; }
    if(srv.mode === 'error') return;
    minesServer = srv.mode === 'server';
    if(!minesServer) db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
    addWager(bet); trackQuest('totalGames', 1); trackQuest('weekWager', bet);
    trackLbStat('wager', bet); trackLbStat('games', 1);
    publishLiveBet('Mines','💣', bet, minesCount+'мін');
    isMinesPlaying = true; currentMinesProfit = 0; movesMade = 0;
    document.getElementById('minesSetupArea').classList.add('hidden');
    document.getElementById('minesCashoutBtn').classList.remove('hidden');
    document.getElementById('minesOpenCount').textContent = '0';
    document.getElementById('minesCashoutAmount').textContent = '₴0';
    document.getElementById('minesMultDisplay').textContent = '×1.00';
    minesGrid = new Array(25).fill(0);
    let placed = 0;
    if(!minesServer) while(placed < minesCount) { let idx = Math.floor(Math.random()*25); if(!minesGrid[idx]){ minesGrid[idx]=1; placed++; } }
    const container = document.getElementById('minesGrid');
    container.innerHTML = '';
    for(let i=0; i<25; i++){
        const cell = document.createElement('div');
        cell.className = 'mine-cell';
        cell.innerHTML = '<span style="font-size:20px;">❓</span>';
        cell.onclick = () => clickMineCell(i, cell);
        container.appendChild(cell);
    }
    playSound('click');
}

function minesRevealFromServer(mines, exceptIdx) {
    const cells = document.getElementById('minesGrid').children;
    (mines || []).forEach(i => {
        minesGrid[i] = 1;
        if(i === exceptIdx || !cells[i] || cells[i].classList.contains('revealed')) return;
        cells[i].innerHTML = '<span style="font-size:20px;opacity:.5;">💣</span>';
        cells[i].style.background = 'rgba(240,64,96,.12)';
    });
}
async function clickMineCellServer(idx, el) {
    if(minesBusy) return;
    minesBusy = true;
    let srv;
    try { srv = await serverRound('move', 'mines', { move: { cell: idx } }); } finally { minesBusy = false; }
    if(srv.mode !== 'server') {
        if(srv.status === 409) { isMinesPlaying = false; document.getElementById('minesSetupArea').classList.remove('hidden'); document.getElementById('minesCashoutBtn').classList.add('hidden'); }
        return;
    }
    const r = srv.r;
    el.classList.add('revealed');
    if(r.status === 'lost') {
        minesGrid[idx] = 1;
        el.innerHTML = '<span style="font-size:20px;">💣</span>';
        el.style.background = 'rgba(240,64,96,.3)';
        el.style.border = '2px solid rgba(240,64,96,.6)';
        playSound('loss');
        notify('💣 Бум! Програш', 'error');
        isMinesPlaying = false;
        minesRevealFromServer(r.view.mines, idx);
        addToHistory('Mines: -'+minesBet);
        setTimeout(() => {
            document.getElementById('minesSetupArea').classList.remove('hidden');
            document.getElementById('minesCashoutBtn').classList.add('hidden');
        }, 2000);
        return;
    }
    el.innerHTML = '<span style="font-size:20px;">💎</span>';
    el.style.background = 'rgba(61,214,140,.15)';
    el.style.border = '2px solid rgba(61,214,140,.4)';
    playSound('click');
    movesMade = r.view.opened.length;
    currentMinesProfit = Math.floor(minesBet * r.mult);
    document.getElementById('minesOpenCount').textContent = movesMade;
    document.getElementById('minesCashoutAmount').textContent = '₴'+formatNumber(currentMinesProfit);
    document.getElementById('minesMultDisplay').textContent = '×'+r.mult;
    if(r.status === 'done') {
        // Усі безпечні відкрито — сервер уже виплатив.
        notify('🏆 Всі клітинки відкриті! Автокешаут!','success');
        minesFinishCashoutUI(r.payout, r.view.mines);
    }
}
function minesFinishCashoutUI(payout, mines) {
    playSound('win');
    const profit = payout - minesBet;
    notify(`💎 +₴${formatNumber(profit)}`, 'success');
    addToHistory(`Mines x${movesMade}: +${profit}`);
    trackLbStat('wins', payout); trackLbStat('profit', profit);
    if(profit >= 500) addToWinFeed('Mines', profit, payout/minesBet);
    isMinesPlaying = false;
    minesRevealFromServer(mines, -1);
    const cells = document.getElementById('minesGrid').children;
    for(let i=0;i<25;i++){
        if(!minesGrid[i] && !cells[i].classList.contains('revealed')){
            cells[i].innerHTML = '<span style="font-size:20px;opacity:.3;">💎</span>';
        }
        cells[i].onclick = null;
    }
    setTimeout(() => {
        document.getElementById('minesSetupArea').classList.remove('hidden');
        document.getElementById('minesCashoutBtn').classList.add('hidden');
    }, 1800);
}

function clickMineCell(idx, el) {
    if(!isMinesPlaying || el.classList.contains('revealed')) return;
    if(minesServer) return clickMineCellServer(idx, el);
    el.classList.add('revealed');
    if(minesGrid[idx]===1){
        el.innerHTML = '<span style="font-size:20px;">💣</span>';
        el.style.background = 'rgba(240,64,96,.3)';
        el.style.border = '2px solid rgba(240,64,96,.6)';
        playSound('loss');
        notify('💣 Бум! Програш', 'error');
        isMinesPlaying = false;
        const cells = document.getElementById('minesGrid').children;
        for(let i=0;i<25;i++){
            if(minesGrid[i]===1 && i!==idx){
                cells[i].innerHTML = '<span style="font-size:20px;opacity:.5;">💣</span>';
                cells[i].style.background = 'rgba(240,64,96,.12)';
            }
        }
        addToHistory('Mines: -'+minesBet);
        setTimeout(() => {
            document.getElementById('minesSetupArea').classList.remove('hidden');
            document.getElementById('minesCashoutBtn').classList.add('hidden');
        }, 2000);
    } else {
        el.innerHTML = '<span style="font-size:20px;">💎</span>';
        el.style.background = 'rgba(61,214,140,.15)';
        el.style.border = '2px solid rgba(61,214,140,.4)';
        playSound('click');
        movesMade++;
        const safe = 25 - minesCount;
        const mult = getMinesMult(safe, movesMade, 25);
        currentMinesProfit = Math.floor(minesBet * mult);
        document.getElementById('minesOpenCount').textContent = movesMade;
        document.getElementById('minesCashoutAmount').textContent = '₴'+formatNumber(currentMinesProfit);
        document.getElementById('minesMultDisplay').textContent = '×'+mult;
        // All safe opened = auto cashout
        if(movesMade === safe) {
            notify('🏆 Всі клітинки відкриті! Автокешаут!','success');
            cashoutMines();
        }
    }
}

async function cashoutMines() {
    if(!isMinesPlaying || movesMade===0) return;
    if(minesServer) {
        if(minesBusy) return;
        minesBusy = true;
        let srv;
        try { srv = await serverRound('cashout', 'mines'); } finally { minesBusy = false; }
        if(srv.mode !== 'server') return;
        return minesFinishCashoutUI(srv.r.payout, srv.r.view.mines);
    }
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(currentMinesProfit));
    playSound('win');
    const profit = currentMinesProfit - minesBet;
    notify(`💎 +₴${formatNumber(profit)}`, 'success');
    addToHistory(`Mines x${movesMade}: +${profit}`);
    trackLbStat('wins', currentMinesProfit); trackLbStat('profit', profit);
    if(profit >= 500) addToWinFeed('Mines', profit, currentMinesProfit/minesBet);
    isMinesPlaying = false;
    // Reveal remaining safe cells
    const cells = document.getElementById('minesGrid').children;
    for(let i=0;i<25;i++){
        if(!minesGrid[i] && !cells[i].classList.contains('revealed')){
            cells[i].innerHTML = '<span style="font-size:20px;opacity:.3;">💎</span>';
            cells[i].onclick = null;
        }
    }
    setTimeout(() => {
        document.getElementById('minesSetupArea').classList.remove('hidden');
        document.getElementById('minesCashoutBtn').classList.add('hidden');
    }, 1800);
}

// --- Плінко ---
let plinkoRisk = 'med';
// Одна таблиця на всі варіанти Plinko; така сама — у lib/games.js (сервер).
// Було RTP понад 100% на всіх рівнях (а ваги low/med в сумі давали 1,2 і 1,05,
// тож крайні кошики не випадали взагалі); тепер ваги = 1 і RTP ≈ 96–97%.
const PLINKO_TABLE = {
  low:  { weights: [0.04, 0.12, 0.20, 0.28, 0.20, 0.12, 0.04],   mults: [1.4, 1.2, 1.0, 0.6, 1.0, 1.2, 1.4] },
  med:  { weights: [0.07, 0.11, 0.19, 0.26, 0.19, 0.11, 0.07],   mults: [3, 1.3, 0.6, 0.1, 0.6, 1.3, 3] },
  high: { weights: [0.008, 0.03, 0.115, 0.694, 0.115, 0.03, 0.008], mults: [20, 5, 1.5, 0, 1.5, 5, 20] },
};
function plinkoBucketFor(r, risk) {
  const w = PLINKO_TABLE[risk].weights;
  let acc = 0;
  for(let i = 0; i < w.length; i++) { acc += w[i]; if(r < acc) return i; }
  return w.length - 1;
}
function setPlinkoRisk(r, el) {
  plinkoRisk = r;
  document.querySelectorAll('.plinko-risk').forEach(b=>{
    b.style.opacity='0.5'; b.classList.remove('active');
  });
  if(el){el.style.opacity='1'; el.classList.add('active');}
  const bkts = document.querySelectorAll('.plinko-buckets .bucket');
  if(bkts.length) {
    PLINKO_TABLE[r].mults.forEach((m,i)=>{ if(bkts[i]) bkts[i].textContent='x'+m; });
  }
}

function dropPlinko() {
  const bet = validateBet(document.getElementById('betAmountPlinko').value);
  if(!bet) return;
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  addWager(bet); trackQuest('totalGames',1); trackQuest('weekWager',bet);
  trackLbStat('wager',bet); trackLbStat('games',1); publishLiveBet('Plinko','🔻',bet,'');
  playSound('click');
  const ball = document.getElementById('plinkoBall');
  ball.style.display = 'block';
  const bucketIndex = plinkoBucketFor(Math.random(), plinkoRisk);
  const targetLeft=(bucketIndex*14)+7;
  ball.animate([{top:'0',left:'50%'},{top:'100%',left:targetLeft+'%'}],{duration:1200,fill:'forwards',easing:'ease-in'});
  setTimeout(()=>{
    const mult = PLINKO_TABLE[plinkoRisk].mults[bucketIndex];
    const win = Math.floor(bet*mult);
    if(mult>0){ db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win)); }
    if(win>bet){ playSound('win'); notify('🔻 +'+win+'₴ (×'+mult+')', 'success'); addToHistory('Plinko: +'+win); trackLbStat('wins',win); }
    else { notify('🔻 ×'+mult+'  ₴'+win, mult>0?'info':'error'); addToHistory('Plinko: '+win); }
    updateStreak(win>=bet);
    recordBalanceHistory();
    ball.style.display='none';
    trackSession(win>=bet, bet);
  }, 1200);
}


// ═══════════════════════════════════════════
// 🎈 BALLOON POP
// ═══════════════════════════════════════════
let balloonActive = false, balloonMult = 1.0, balloonBet = 0;
let balloonInterval = null, balloonPopTimeout = null;
let balloonEl = null;

// Balloon на сервері: коли лопне — знає лише сервер (як у Crash).
let balloonServer = false, balloonPollInt = null, balloonStarting = false, balloonPolling = false, balloonCashing = false;
async function balloonPollServer() {
  if(!balloonActive || balloonPolling || balloonCashing) return;
  balloonPolling = true;
  let srv;
  try { srv = await serverRound('move', 'balloon', { move: { poll: true } }); } finally { balloonPolling = false; }
  if(!balloonActive || balloonCashing) return;
  if(srv.mode === 'server' && srv.r.status === 'lost') burstBalloon();
  else if(srv.mode !== 'server' && srv.status === 409) burstBalloon();
}
function startBalloon() {
  // Без цього гварда повторний виклик під час активного раунду губив
  // попередні balloonInterval/balloonPopTimeout (перезаписуючи ці глобальні
  // змінні) — старий interval лишався жити й далі крутив balloonMult, тепер
  // уже разом із новим — множник ріс у 2+ рази швидше за задумане, і кешаут
  // читав це роздуте число. Той самий клас багу, що й був у Краші.
  if(balloonActive || balloonStarting) return;
  const b = validateBet(document.getElementById('betAmountBalloon').value);
  if(!b) return;
  return startBalloonRound(b);
}
async function startBalloonRound(b) {
  balloonStarting = true;
  let srv;
  try { srv = await serverRound('start', 'balloon', { bet: b, params: {} }); } finally { balloonStarting = false; }
  if(srv.mode === 'error') return;
  balloonServer = srv.mode === 'server';
  balloonBet = b;
  balloonMult = 1.0;
  balloonActive = true;
  if(!balloonServer) db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
  addWager(b); trackQuest('totalGames',1); trackLbStat('wager',b); trackLbStat('games',1);
  document.getElementById('balloonStartBtn').classList.add('hidden');
  document.getElementById('balloonCashBtn').classList.remove('hidden');
  document.getElementById('balloonStartMsg').style.display = 'none';
  document.getElementById('balloonBetDisplay').textContent = '₴'+formatNumber(b);
  spawnBalloons();
  // Раніше кулька лопалась через 4–16 с, а множник росте на 0.12 кожні 0.5 с —
  // кешаут на 3.5 с давав гарантовані ×1.84. Тепер точка вибуху — як у Crash:
  // P(дожити до ×x) = 0.97 / x, тобто RTP 97% за будь-якої стратегії.
  const popMult = 0.97 / (1 - Math.random());               // (0.97, ∞)
  const popTicks = Math.max(0, Math.ceil((popMult - 1) / 0.12));
  // За 250 мс до тіку, на якому множник досяг би точки вибуху (перший тік — 500 мс).
  const popIn = popTicks === 0 ? 300 : Math.min(popTicks * 500 - 250, 120000);
  if(balloonServer) balloonPollInt = setInterval(balloonPollServer, 700);
  else balloonPopTimeout = setTimeout(() => { if(balloonActive) burstBalloon(); }, popIn);
  balloonInterval = setInterval(updateBalloonMult, 500);
}

function spawnBalloons() {
  const arena = document.getElementById('balloonArena');
  arena.querySelectorAll('.balloon').forEach(b => b.remove());
  const emojis = ['🎈','🎈','🎈','🎈','💣'];
  for(let i=0;i<4;i++) {
    const el = document.createElement('div');
    el.className = 'balloon';
    el.textContent = '🎈';
    el.style.left = (10 + Math.random()*75)+'%';
    el.style.bottom = (5 + Math.random()*60)+'%';
    el.style.animationDuration = (8+Math.random()*12)+'s';
    el.onclick = () => { if(balloonActive) cashBalloon(); };
    arena.appendChild(el);
  }
}

function updateBalloonMult() {
  if(!balloonActive) return;
  balloonMult = parseFloat((balloonMult + 0.12).toFixed(2));
  const win = Math.floor(balloonBet * balloonMult);
  document.getElementById('balloonMult').textContent = '×'+balloonMult.toFixed(2);
  document.getElementById('balloonCashout').textContent = '₴'+formatNumber(win);
}

async function cashBalloon() {
  if(!balloonActive || balloonCashing) return;
  let win;
  if(balloonServer) {
    balloonCashing = true;
    let srv;
    try { srv = await serverRound('cashout', 'balloon', { claim: balloonMult }); } finally { balloonCashing = false; }
    if(srv.mode !== 'server') { if(srv.status === 409) burstBalloon(); return; }
    if(srv.r.status === 'lost') return burstBalloon();
    clearInterval(balloonPollInt); balloonPollInt = null;
    balloonMult = srv.r.mult;
    win = srv.r.payout;
  }
  balloonActive = false;
  clearInterval(balloonInterval);
  clearTimeout(balloonPopTimeout);
  if(!balloonServer) {
    win = Math.floor(balloonBet * balloonMult);
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
  }
  trackLbStat('wins', win); trackLbStat('profit', win - balloonBet);
  notify('🎈 +'+formatNumber(win)+'₴ (×'+balloonMult.toFixed(2)+')', 'success');
  addToHistory('Balloon: +'+win+' (×'+balloonMult.toFixed(2)+')');
  recordBalanceHistory();
  triggerWinReaction(win, 'Balloon');
  resetBalloon();
}

function burstBalloon() {
  if(!balloonActive) return;
  balloonActive = false;
  clearInterval(balloonInterval);
  if(balloonPollInt) { clearInterval(balloonPollInt); balloonPollInt = null; }
  const arena = document.getElementById('balloonArena');
  arena.querySelectorAll('.balloon').forEach(b => { b.textContent='💥'; b.style.transform='scale(2)'; });
  notify('💥 БАХ! Балон лопнув! Ставка загублена.', 'error');
  addToHistory('Balloon: -'+balloonBet);
  setTimeout(resetBalloon, 1500);
}

function resetBalloon() {
  document.getElementById('balloonStartBtn').classList.remove('hidden');
  document.getElementById('balloonCashBtn').classList.add('hidden');
  document.getElementById('balloonMult').textContent = '×1.00';
  document.getElementById('balloonCashout').textContent = '₴0';
  document.getElementById('balloonStartMsg').style.display = 'flex';
  document.getElementById('balloonArena').querySelectorAll('.balloon').forEach(b=>b.remove());
}

// ═══════════════════════════════════════════
// 🔫 RUSSIAN ROULETTE
// ═══════════════════════════════════════════
let rrSurvived = 0, rrBet = 0, rrActive = false;
const RR_CHAMBERS = 6;

