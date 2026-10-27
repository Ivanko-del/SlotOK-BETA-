// Сундуки й Краш (соло). Колишня Global Roulette, що крутилась у браузері,
// замінена спільними колесами на сервері — див. 48-live-wheels.js.

// --- Сундуки ---
async function startChests(){ 
    const b = validateBet(document.getElementById('betAmountChests').value); 
    if(!b) return; 
    // Із сервером ставка списується при відкритті скрині (api/play «chests»).
    const serverMode = await serverAuthEnabled();
    if(!serverMode) db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
    const g = document.getElementById('chestsGrid'); 
    g.innerHTML = ""; 
    for(let i=0; i<3; i++){ 
        const d = document.createElement('div'); 
        d.className = "chest-item"; 
        d.textContent = "📦"; 
        d.onclick = async () => { 
            if(g.dataset.busy) return;
            let w;
            if(serverMode) {
                g.dataset.busy = '1';
                let srv;
                try { srv = await serverPlay('chests', b, {}); } finally { delete g.dataset.busy; }
                if(srv.mode === 'error') return;
                w = srv.mode === 'server' ? srv.r.payout : 0;
                Array.from(g.children).forEach(c => c.onclick = null);
                d.textContent = w ? "💰" : "💨";
                if(w){ playSound('win'); notify(`+${w} ₴`, "success"); addToHistory(`Chests: +${w}`); } else { playSound('click'); }
                return;
            }
            // 40% × 2.4 = 96% (було × 2.5 = рівно 100%, без переваги закладу)
            w = Math.random() > 0.6 ? Math.floor(b*2.4) : 0; 
            d.textContent = w ? "💰" : "💨"; 
            if(w){ db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(w)); playSound('win'); notify(`+${w} ₴`, "success"); addToHistory(`Chests: +${w}`); } 
            else { playSound('click'); }
            Array.from(g.children).forEach(c => c.onclick = null);
        }; 
        g.appendChild(d); 
    }
}

// --- Краш ---
let crashInt; let isCrashPlaying = false; let crashActiveBet = 0;
// ── Crash на сервері (api/round.js) ──
// Точку вибуху знає лише сервер; множник він рахує за своїм годинником.
// Клієнт анімує той самий ріст (100 мс на тік) і раз на ~0.7 с питає «ще летить?».
// Окремі прапорці: клік «Забрати» не має губитись, поки йде фоновий poll.
let crashServer = false, crashPollInt = null, crashBusy = false, crashPolling = false, crashCashing = false;
function crashStopTimers() {
    if(crashInt) { clearInterval(crashInt); crashInt = null; }
    if(crashPollInt) { clearInterval(crashPollInt); crashPollInt = null; }
}
function crashLostUI(point) {
    crashStopTimers();
    isCrashPlaying = false;
    const shown = point ? Number(point).toFixed(2) : document.getElementById('crashDisplay').textContent.replace('x','');
    document.getElementById('crashDisplay').textContent = shown + 'x';
    notify("💥 КРАШ на " + shown + "x!", "error");
    updateStreak(false); trackSession(false, crashActiveBet);
    document.getElementById('crashDisplay').style.color = "var(--neg)";
    setTimeout(()=> { document.getElementById('crashDisplay').style.color = "var(--fg)"; document.getElementById('crashDisplay').textContent = "1.00x"; }, 2000);
    document.getElementById('crashBtn').classList.remove('hidden');
    document.getElementById('crashCashoutBtn').classList.add('hidden');
}
function crashWonUI(w, mult) {
    crashStopTimers();
    isCrashPlaying = false;
    const b = crashActiveBet;
    document.getElementById('crashDisplay').textContent = Number(mult).toFixed(2) + 'x';
    trackQuest('crashCashouts', 1);
    trackLbStat('wins', w); trackLbStat('profit', w - b);
    notify(`🚀 Виведено: +${w} ₴`, "success");
    addToHistory(`Crash: +${w} (x${mult})`);
    updateStreak(true); trackSession(true, b); recordBalanceHistory();
    document.getElementById('crashBtn').classList.remove('hidden');
    document.getElementById('crashCashoutBtn').classList.add('hidden');
}
function crashHandleServer(r) {
    if(r.status === 'lost') return crashLostUI(r.view && r.view.point);
    if(r.status === 'done') return crashWonUI(r.payout, r.mult);
}
async function crashPollServer() {
    if(!isCrashPlaying || crashPolling || crashCashing) return;
    crashPolling = true;
    let srv;
    try { srv = await serverRound('move', 'crash', { move: { poll: true } }); } finally { crashPolling = false; }
    // Поки йде кешаут, відповідь poll ігноруємо — результат покаже сам кешаут.
    if(!isCrashPlaying || crashCashing) return;
    if(srv.mode === 'server') crashHandleServer(srv.r);
    else if(srv.status === 409) crashLostUI();
}
async function startCrashServer(b) {
    const autoCashoutTarget = parseFloat(document.getElementById('crashAutoCashout')?.value)||0;
    crashBusy = true;
    let srv;
    try { srv = await serverRound('start', 'crash', { bet: b, params: { auto: autoCashoutTarget > 1 ? autoCashoutTarget : 0 } }); } finally { crashBusy = false; }
    if(srv.mode !== 'server') return;
    crashServer = true;
    crashActiveBet = b;
    addWager(b);
    trackQuest('totalGames', 1);
    trackQuest('weekWager', b);
    trackLbStat('wager', b); trackLbStat('games', 1);
    publishLiveBet('Краш','🚀', b, '');
    document.getElementById('crashBtn').classList.add('hidden');
    document.getElementById('crashCashoutBtn').classList.remove('hidden');
    if(autoCashoutTarget > 1) document.getElementById('crashAutoLabel').textContent = autoCashoutTarget+'x';
    isCrashPlaying = true;
    let m = 1.00;
    crashInt = setInterval(() => {
        m += 0.03 + (m * 0.002);
        document.getElementById('crashDisplay').textContent = m.toFixed(2) + 'x';
        // Автокешаут рахує сервер; тут лише одразу питаємо, щоб показати результат.
        if(autoCashoutTarget > 1 && m >= autoCashoutTarget) crashPollServer();
    }, 100);
    crashPollInt = setInterval(crashPollServer, 700);
}

async function startCrash() {
    if(isCrashPlaying || crashBusy) return;
    if(await serverAuthEnabled()) {
        const b = validateBet(document.getElementById('betAmountCrash').value);
        if(!b) return;
        return startCrashServer(b);
    }
    crashServer = false;
    return startCrashLegacy();
}
function startCrashLegacy() {
    // Без цього захисту швидкий повторний клік по "Старт" міг запустити ще один
    // setInterval поверх активного раунду: старий крашInt губився (перезаписувався
    // цим глобальним "crashInt"), лишався жити вічно й нескінченно накручував
    // множник у DOM — наступний "Забрати" читав це шалене число й нараховував
    // величезну виплату. Простий guard на вхід прибирає весь клас багу.
    if(isCrashPlaying) return;
    const b = validateBet(document.getElementById('betAmountCrash').value);
    if(!b) return;
    if(crashInt) { clearInterval(crashInt); crashInt = null; }
    crashActiveBet = b;  // зберігаємо ставку — не читаємо input під час гри
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-b));
    addWager(b);
    trackQuest('totalGames', 1);
    trackQuest('weekWager', b);
    trackLbStat('wager', b); trackLbStat('games', 1);
    publishLiveBet('Краш','🚀', b, '');
    document.getElementById('crashBtn').classList.add('hidden'); 
    document.getElementById('crashCashoutBtn').classList.remove('hidden'); 
    let m = 1.00; 
    // crashPoint: переважно 1.0–2.5x, зрідка вище
    // 3% раундів — миттєвий краш на 1.00x (як у звичайних краш-іграх). Без
    // нього автокешаут на ~1.05x давав RTP трохи понад 100% — гарантований плюс.
    const instantCrash = Math.random() < 0.03;
    const crashRng = Math.random();
    const newPLuck = getNewPlayerLuck();
    let crashPoint;
    if(instantCrash && !newPLuck) { crashPoint = 1.0; }
    else if(newPLuck) { crashPoint = 1.3 + Math.random() * 5; }        // нові гравці: 1.3–6.3x
    else if(crashRng < 0.45) { crashPoint = 1 + Math.random() * 0.5; }  // 45%: краш 1.0–1.5x
    else if(crashRng < 0.75) { crashPoint = 1.5 + Math.random() * 1.5; }// 30%: 1.5–3.0x
    else if(crashRng < 0.92) { crashPoint = 3 + Math.random() * 4; }    // 17%: 3–7x
    else { crashPoint = 7 + Math.random() * 15; }                        // 8%: 7–22x
    isCrashPlaying = true; 
    const autoCashoutTarget = parseFloat(document.getElementById('crashAutoCashout')?.value)||0;
    if(autoCashoutTarget > 1) document.getElementById('crashAutoLabel').textContent = autoCashoutTarget+'x';
    crashInt = setInterval(() => { 
        m += 0.03 + (m * 0.002); 
        document.getElementById('crashDisplay').textContent = m.toFixed(2) + 'x'; 
        // Auto cashout
        if(autoCashoutTarget > 1 && m >= autoCashoutTarget && isCrashPlaying) {
          cashoutCrash(); return;
        }
        if(m >= crashPoint){
            clearInterval(crashInt); crashInt = null;
            isCrashPlaying = false;
            notify("💥 КРАШ на " + m.toFixed(2) + "x!", "error");
            updateStreak(false); trackSession(false, crashActiveBet);
            document.getElementById('crashDisplay').style.color = "var(--neg)";
            setTimeout(()=> { document.getElementById('crashDisplay').style.color = "var(--fg)"; document.getElementById('crashDisplay').textContent = "1.00x"; }, 2000);
            document.getElementById('crashBtn').classList.remove('hidden'); 
            document.getElementById('crashCashoutBtn').classList.add('hidden'); 
        } 
    }, 100); 
}

async function cashoutCrash() { 
    if(!isCrashPlaying) return;
    if(crashServer) {
        if(crashCashing) return;
        const claim = parseFloat(document.getElementById('crashDisplay').textContent);
        crashCashing = true;
        let srv;
        try { srv = await serverRound('cashout', 'crash', { claim }); } finally { crashCashing = false; }
        if(srv.mode === 'server') crashHandleServer(srv.r);
        else if(srv.status === 409) crashLostUI();
        return;
    }
    isCrashPlaying = false;  // скидаємо ОДРАЗУ щоб запобігти подвійному кліку
    clearInterval(crashInt); crashInt = null;
    const b = crashActiveBet;  // читаємо збережену ставку, не input
    const mult = parseFloat(document.getElementById('crashDisplay').textContent);
    const w = Math.floor(b * mult); 
    // ServerValue.increment — безпечно від race condition
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(w));
    trackQuest('crashCashouts', 1);
    trackLbStat('wins', w); trackLbStat('profit', w - b);
    notify(`🚀 Виведено: +${w} ₴`, "success"); 
    addToHistory(`Crash: +${w} (x${mult})`);
    updateStreak(true); trackSession(true, b); recordBalanceHistory();
    document.getElementById('crashBtn').classList.remove('hidden'); 
    document.getElementById('crashCashoutBtn').classList.add('hidden'); 
}

