// ╔══════════════════════════════════════════════════════╗
// ║           🪙 COINFLIP PvP                           ║
// ╚══════════════════════════════════════════════════════╝
let cfSelectedSide = 'heads';
let cfCurrentRoom = null;

function switchCfTab(tab) {
  document.getElementById('cftab-create').style.background = tab==='create' ? 'rgb(var(--accent-rgb) / 0.15)' : 'transparent';
  document.getElementById('cftab-create').style.color = tab==='create' ? 'var(--accent)' : 'var(--sub)';
  document.getElementById('cftab-join').style.background = tab==='join' ? 'rgb(var(--accent-rgb) / 0.15)' : 'transparent';
  document.getElementById('cftab-join').style.color = tab==='join' ? 'var(--accent)' : 'var(--sub)';
  document.getElementById('cf-panel-create').classList.toggle('hidden', tab!=='create');
  document.getElementById('cf-panel-join').classList.toggle('hidden', tab!=='join');
  if(tab==='join') loadCfRooms();
}

function setCfBet(n) {
  document.querySelectorAll('.cf-bet-btn').forEach(b => b.style.borderColor='var(--border)');
  event.target.style.borderColor = 'var(--accent)';
  document.getElementById('cfBetInput').value = n;
}

function selectCfSide(side) {
  cfSelectedSide = side;
  const heads = document.getElementById('cf-side-heads');
  const tails = document.getElementById('cf-side-tails');
  if(side==='heads') {
    heads.style.border='2px solid var(--accent)'; heads.style.background='linear-gradient(135deg,var(--surface-1),color-mix(in srgb, var(--accent) 10%, var(--surface-1)))';
    tails.style.border='2px solid var(--border)'; tails.style.background='var(--box)';
  } else {
    tails.style.border='2px solid var(--accent)'; tails.style.background='linear-gradient(135deg,color-mix(in srgb, var(--info) 10%, var(--surface-1)),var(--bg))';
    heads.style.border='2px solid var(--border)'; heads.style.background='var(--box)';
  }
}

function createCfRoom() {
  const bet = parseInt(document.getElementById('cfBetInput').value);
  if(!bet || bet < 10) return notify('Мінімум ₴10', 'error');
  if((userData.balance||0) < bet) return notify('Недостатньо коштів', 'error');
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  const room = { creator: currentUser, bet, side: cfSelectedSide, status: 'waiting', createdAt: Date.now() };
  db.ref('pvp_coinflip').push(room).then(ref => {
    cfCurrentRoom = ref.key;
    notify('🪙 Кімнату створено! Чекаємо суперника...', 'success');
    // Хост зникне до того, як хтось приєднається — кімната не має висіти
    // в лобі вічно, а ставка не має пропасти.
    db.ref('pvp_coinflip/' + ref.key).onDisconnect().update({ status: 'cancelled' });
    db.ref('users/' + currentUser + '/balance').onDisconnect().set(firebase.database.ServerValue.increment(bet));
    switchCfTab('join');
    listenCfRoom(ref.key, bet);
  });
}

function loadCfRooms() {
  const el = document.getElementById('cfRoomsList'); if(!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--sub);padding:20px;font-size:13px;">⏳ Завантаження...</div>';
  db.ref('pvp_coinflip').orderByChild('status').equalTo('waiting').once('value', snap => {
    const rooms = snap.val();
    if(!rooms) { el.innerHTML = '<div style="text-align:center;color:var(--sub);padding:30px;font-size:13px;">Немає відкритих кімнат.<br>Створи свою!</div>'; return; }
    const list = Object.entries(rooms).filter(([id, r]) => r.creator !== currentUser);
    if(!list.length) { el.innerHTML = '<div style="text-align:center;color:var(--sub);padding:30px;font-size:13px;">Немає кімнат. Перевір пізніше!</div>'; return; }
    el.innerHTML = list.map(([id, r]) => `
      <div style="background:var(--box);border:1px solid var(--border);border-radius:var(--r-lg);padding:14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:14px;font-weight:700;">${r.creator} 🆚 ?</div>
          <div style="font-size:11px;color:var(--sub);margin-top:3px;">Ставка: <b style="color:var(--accent);">₴${formatNumber(r.bet)}</b> · ${r.side==='heads'?'🌕 Орел':'🌑 Решка'}</div>
        </div>
        <button onclick="joinCfRoom('${id}',${r.bet},'${r.creator}','${r.side}')" style="background:linear-gradient(135deg,var(--accent),var(--accent2));color:var(--on-accent);border:none;border-radius:var(--r-md);padding:10px 16px;font-weight:800;font-size:13px;cursor:pointer;margin:0;">Прийняти</button>
      </div>`).join('');
  });
}

function joinCfRoom(roomId, bet, creator, creatorSide) {
  if((userData.balance||0) < bet) return notify('Недостатньо коштів', 'error');
  // Атомарний claim кімнати — якщо два гравці клікнуть "Прийняти" одночасно,
  // тільки ОДИН з них реально приєднається; другий отримає помилку замість
  // подвійного списання і плутанини з переможцем.
  db.ref('pvp_coinflip/'+roomId+'/status').transaction(current => {
    // current===null — кеш ще не прогрітий (loadCfRooms читає once()),
    // а не факт що кімнату зайнято. Дозволяємо спробу, SDK звірить з сервером.
    if(current === 'waiting' || current === null) return 'joining';
    return; // хтось вже забрав цю кімнату
  }, (err, committed) => {
    if(!committed) { notify('Цю кімнату вже зайняв інший гравець', 'error'); loadCfRooms(); return; }
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const creatorWon = creatorSide === result;
    const winnerUser = creatorWon ? creator : currentUser;
    const payout = Math.floor(bet * 2 * 0.95); // 5% комісія
    db.ref('pvp_coinflip/'+roomId).update({ status:'finished', joiner: currentUser, result, winner: winnerUser, payout, finishedAt: Date.now() });
    // Виплата
    db.ref('users/'+winnerUser+'/balance').set(firebase.database.ServerValue.increment(payout));
    const myWon = winnerUser === currentUser;
    showCfResult(myWon, result, creatorSide, bet, payout, creator);
    if(myWon) addToWinFeed('Coinflip', payout, 2);
  });
}

function listenCfRoom(roomId, bet) {
  db.ref('pvp_coinflip/'+roomId).on('value', snap => {
    const r = snap.val(); if(!r) return;
    if(r.status === 'finished') {
      db.ref('pvp_coinflip/'+roomId).off();
      db.ref('pvp_coinflip/'+roomId).onDisconnect().cancel();
      db.ref('users/'+currentUser+'/balance').onDisconnect().cancel();
      const myWon = r.winner === currentUser;
      showCfResult(myWon, r.result, r.side, bet, r.payout, r.joiner||'???');
    }
  });
}

function showCfResult(won, result, creatorSide, bet, payout, opponent) {
  const box = document.getElementById('cfResultBox');
  box.classList.remove('hidden');
  box.innerHTML = `
    <div style="font-size:70px;margin-bottom:8px;animation:lbPop .5s ease;">${result==='heads'?'🌕':'🌑'}</div>
    <div style="font-size:22px;font-weight:900;color:${won?'var(--green)':'var(--red)'};margin-bottom:6px;">${won?'🏆 ВИГРАШ!':'😞 ПРОГРАШ'}</div>
    <div style="font-size:16px;color:var(--accent);font-weight:800;">${won?'+₴'+formatNumber(payout):'-₴'+formatNumber(bet)}</div>
    <div style="font-size:11px;color:var(--sub);margin-top:8px;">Монета: ${result==='heads'?'🌕 Орел':'🌑 Решка'} · Суперник: ${opponent}</div>
    <button class="btn-gold" onclick="document.getElementById('cfResultBox').classList.add('hidden');loadCfRooms();" style="margin-top:14px;">🔄 Грати ще</button>`;
  if(won) { playSound('bonus'); triggerWinReaction(payout, 'Coinflip'); }
  else playSound('loss');
}

// ╔══════════════════════════════════════════════════════╗
// ║           ✊ ROCK-PAPER-SCISSORS PvP                ║
// ╚══════════════════════════════════════════════════════╝
let rpsCurrentRoom = null;
let rpsRole = null; // 'creator' | 'joiner'
const RPS_BEATS = { rock:'scissors', scissors:'paper', paper:'rock' };
const RPS_EMOJI = { rock:'✊', scissors:'✌️', paper:'🖐️' };

function switchRpsTab(tab) {
  document.getElementById('rpstab-create').style.background = tab==='create' ? 'rgb(var(--accent-rgb) / 0.15)' : 'transparent';
  document.getElementById('rpstab-create').style.color = tab==='create' ? 'var(--accent)' : 'var(--sub)';
  document.getElementById('rpstab-join').style.background = tab==='join' ? 'rgb(var(--accent-rgb) / 0.15)' : 'transparent';
  document.getElementById('rpstab-join').style.color = tab==='join' ? 'var(--accent)' : 'var(--sub)';
  document.getElementById('rps-panel-create').classList.toggle('hidden', tab!=='create');
  document.getElementById('rps-panel-join').classList.toggle('hidden', tab!=='join');
  if(tab==='join') loadRpsRooms();
}

function setRpsBet(n) { document.getElementById('rpsBetInput').value = n; }

function createRpsRoom() {
  const bet = parseInt(document.getElementById('rpsBetInput').value);
  if(!bet || bet < 10) return notify('Мінімум ₴10', 'error');
  if((userData.balance||0) < bet) return notify('Недостатньо коштів', 'error');
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  const room = { creator: currentUser, bet, status:'waiting', createdAt: Date.now() };
  db.ref('pvp_rps').push(room).then(ref => {
    rpsCurrentRoom = ref.key; rpsRole = 'creator';
    document.getElementById('rps-panel-create').classList.add('hidden');
    document.getElementById('rps-panel-join').classList.add('hidden');
    document.getElementById('rpsGameArea').classList.remove('hidden');
    document.getElementById('rpsStatus').textContent = '⏳ Чекаємо суперника...';
    // Хост зникне до того, як хтось приєднається — кімната не має висіти
    // в лобі вічно, а ставка не має пропасти.
    db.ref('pvp_rps/' + ref.key).onDisconnect().update({ status: 'cancelled' });
    db.ref('users/' + currentUser + '/balance').onDisconnect().set(firebase.database.ServerValue.increment(bet));
    listenRpsRoom(ref.key, bet, 'creator');
  });
}

function loadRpsRooms() {
  const el = document.getElementById('rpsRoomsList'); if(!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--sub);padding:20px;font-size:13px;">⏳</div>';
  db.ref('pvp_rps').orderByChild('status').equalTo('waiting').once('value', snap => {
    const rooms = snap.val();
    if(!rooms) { el.innerHTML = '<div style="text-align:center;color:var(--sub);padding:30px;font-size:13px;">Немає кімнат.</div>'; return; }
    const list = Object.entries(rooms).filter(([,r]) => r.creator !== currentUser);
    if(!list.length) { el.innerHTML = '<div style="text-align:center;color:var(--sub);padding:30px;font-size:13px;">Немає кімнат!</div>'; return; }
    el.innerHTML = list.map(([id, r]) => `
      <div style="background:var(--box);border:1px solid var(--border);border-radius:var(--r-lg);padding:14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
        <div><div style="font-size:14px;font-weight:700;">${r.creator} ✊ ?</div>
        <div style="font-size:11px;color:var(--sub);margin-top:3px;">Ставка: <b style="color:var(--accent);">₴${formatNumber(r.bet)}</b></div></div>
        <button onclick="joinRpsRoom('${id}',${r.bet},'${r.creator}')" style="background:var(--special);color:var(--on-special);border:none;border-radius:var(--r-md);padding:10px 16px;font-weight:800;font-size:13px;cursor:pointer;margin:0;">Прийняти</button>
      </div>`).join('');
  });
}

function joinRpsRoom(roomId, bet, creator) {
  if((userData.balance||0) < bet) return notify('Недостатньо коштів', 'error');
  db.ref('pvp_rps/'+roomId+'/status').transaction(current => {
    // current===null — кеш ще не прогрітий (loadRpsRooms читає once()),
    // а не факт що кімнату зайнято. Дозволяємо спробу, SDK звірить з сервером.
    if(current === 'waiting' || current === null) return 'joining';
    return;
  }, (err, committed) => {
    if(!committed) { notify('Кімната вже зайнята', 'error'); loadRpsRooms(); return; }
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
    db.ref('pvp_rps/'+roomId).update({ joiner: currentUser, status:'active' });
    rpsCurrentRoom = roomId; rpsRole = 'joiner';
    document.getElementById('rps-panel-join').classList.add('hidden');
    document.getElementById('rpsGameArea').classList.remove('hidden');
    document.getElementById('rpsStatus').textContent = '🎮 Роби хід!';
    listenRpsRoom(roomId, bet, 'joiner');
  });
}

function playRps(choice) {
  if(!rpsCurrentRoom) return;
  const field = rpsRole === 'creator' ? 'creatorMove' : 'joinerMove';
  db.ref('pvp_rps/'+rpsCurrentRoom).update({ [field]: choice, status: 'active' });
  document.getElementById('rpsStatus').textContent = '⏳ Чекаємо ходу суперника...';
  ['rock','scissors','paper'].forEach(c => {
    const el = document.getElementById('rps-'+c);
    if(el) el.style.opacity = c===choice ? '1' : '0.3';
  });
}

function listenRpsRoom(roomId, bet, role) {
  let disconnectArmed = false;
  db.ref('pvp_rps/'+roomId).on('value', snap => {
    const r = snap.val(); if(!r) return;
    // Щойно суперник приєднався — обидві ставки в грі, і зникнення будь-
    // кого з гравців (не встиг зробити хід) має повертати ставки обом,
    // а не забирати кімнату (як поки що чекали на суперника).
    if(!disconnectArmed && r.joiner && r.status !== 'waiting') {
      disconnectArmed = true;
      db.ref('pvp_rps/'+roomId).onDisconnect().cancel();
      db.ref('users/'+currentUser+'/balance').onDisconnect().cancel();
      if(r.status !== 'finished') db.ref('pvp_rps/'+roomId).onDisconnect().update({ status: 'abandoned', abandonedBy: currentUser });
    }
    if(r.status === 'abandoned') {
      db.ref('pvp_rps/'+roomId+'/status').transaction(cur => cur === 'abandoned' ? 'finished' : undefined, (err, committed) => {
        if(err || !committed) return;
        db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(bet));
        if(r.abandonedBy && r.abandonedBy !== currentUser) db.ref('users/'+r.abandonedBy+'/balance').set(firebase.database.ServerValue.increment(bet));
        notify('Суперник відключився. Ставку повернено.', 'info');
      });
      db.ref('pvp_rps/'+roomId).off();
      return;
    }
    const cm = r.creatorMove, jm = r.joinerMove;
    if(cm && jm && r.status === 'active') {
      // Атомарний claim — тільки ОДИН з двох клієнтів виграє цю "гонку"
      // і фактично нарахує виплату. Без цього обидва клієнти рахують
      // переможця самостійно і виплата подвоюється щоразу.
      db.ref('pvp_rps/'+roomId+'/status').transaction(current => {
        if(current === 'active') return 'resolving';
        return; // undefined = абортувати, вже хтось забрав
      }, (err, committed) => {
        if(!committed) return; // програли гонку — інший клієнт вже рахує
        let winner;
        if(cm === jm) winner = 'draw';
        else if(RPS_BEATS[cm] === jm) winner = r.creator;
        else winner = r.joiner;
        const payout = Math.floor(bet * 2 * 0.95);
        db.ref('pvp_rps/'+roomId).update({ status:'finished', winner, payout });
        if(winner !== 'draw') db.ref('users/'+winner+'/balance').set(firebase.database.ServerValue.increment(payout));
        else {
          db.ref('users/'+r.creator+'/balance').set(firebase.database.ServerValue.increment(bet));
          db.ref('users/'+r.joiner+'/balance').set(firebase.database.ServerValue.increment(bet));
        }
      });
    } else if(r.status === 'finished' && r.winner !== undefined) {
      // Обидва клієнти реагують на фінальний стан — тільки показ, без повторного нарахування
      db.ref('pvp_rps/'+roomId).off();
      db.ref('pvp_rps/'+roomId).onDisconnect().cancel();
      const myMove = role === 'creator' ? cm : jm;
      const oppMove = role === 'creator' ? jm : cm;
      const myWon = r.winner === currentUser;
      const isDraw = r.winner === 'draw';
      const oppEl = document.getElementById('rpsOpponentMove');
      if(oppEl) oppEl.textContent = RPS_EMOJI[oppMove]||'❓';
      showRpsResult(myWon, isDraw, myMove, oppMove, bet, r.payout);
      if(myWon) addToWinFeed('RPS', r.payout, 2);
    } else if(r.status === 'active' && !cm && !jm) {
      const statusEl = document.getElementById('rpsStatus');
      if(statusEl) statusEl.textContent = '🎮 Роби хід!';
    }
  });
}

function showRpsResult(won, draw, myMove, oppMove, bet, payout) {
  const box = document.getElementById('rpsResultBox');
  box.classList.remove('hidden');
  const label = draw ? '🤝 НІЧИЯ!' : won ? '🏆 ВИГРАШ!' : '😞 ПРОГРАШ';
  const color = draw ? 'var(--accent)' : won ? 'var(--green)' : 'var(--red)';
  const amtStr = draw ? '±₴0 (повернуто)' : won ? '+₴'+formatNumber(payout) : '-₴'+formatNumber(bet);
  box.innerHTML = `
    <div style="display:flex;justify-content:center;gap:16px;margin-bottom:12px;">
      <div style="text-align:center;"><div style="font-size:50px;">${RPS_EMOJI[myMove]}</div><div style="font-size:11px;color:var(--sub);">Ти</div></div>
      <div style="font-size:28px;font-weight:900;color:${color};align-self:center;">vs</div>
      <div style="text-align:center;"><div style="font-size:50px;">${RPS_EMOJI[oppMove]}</div><div style="font-size:11px;color:var(--sub);">Суперник</div></div>
    </div>
    <div style="font-size:22px;font-weight:900;color:${color};margin-bottom:6px;">${label}</div>
    <div style="font-size:16px;color:var(--accent);font-weight:800;">${amtStr}</div>
    <button class="btn-gold" onclick="document.getElementById('rpsResultBox').classList.add('hidden');document.getElementById('rpsGameArea').classList.add('hidden');switchRpsTab('create');rpsCurrentRoom=null;rpsRole=null;" style="margin-top:14px;">🔄 Грати ще</button>`;
  if(won) { playSound('bonus'); triggerWinReaction(payout,'RPS'); }
  else if(!draw) playSound('loss');
}

// ╔══════════════════════════════════════════════════════╗
// ║           🔮 PREDICTION DUEL PvP                   ║
// ╚══════════════════════════════════════════════════════╝
let pdCurrentRoom = null;
let pdRole = null;

function switchPdTab(tab) {
  document.getElementById('pdtab-create').style.background = tab==='create' ? 'rgb(var(--accent-rgb) / 0.15)' : 'transparent';
  document.getElementById('pdtab-create').style.color = tab==='create' ? 'var(--accent)' : 'var(--sub)';
  document.getElementById('pdtab-join').style.background = tab==='join' ? 'rgb(var(--accent-rgb) / 0.15)' : 'transparent';
  document.getElementById('pdtab-join').style.color = tab==='join' ? 'var(--accent)' : 'var(--sub)';
  document.getElementById('pd-panel-create').classList.toggle('hidden', tab!=='create');
  document.getElementById('pd-panel-join').classList.toggle('hidden', tab!=='join');
  if(tab==='join') loadPdRooms();
}

function setPdBet(n) { document.getElementById('pdBetInput').value = n; }

function createPdRoom() {
  const bet  = parseInt(document.getElementById('pdBetInput').value);
  const guess= parseInt(document.getElementById('pdGuessInput').value);
  if(!bet || bet < 10) return notify('Мінімум ₴10', 'error');
  if(!guess || guess<1 || guess>100) return notify('Число від 1 до 100', 'error');
  if((userData.balance||0) < bet) return notify('Недостатньо коштів', 'error');
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  const secret = 1 + Math.floor(Math.random() * 100); // Секретне число
  db.ref('pvp_predict').push({ creator:currentUser, bet, creatorGuess:guess, secret, status:'waiting', createdAt:Date.now() }).then(ref => {
    pdCurrentRoom = ref.key; pdRole = 'creator';
    notify('🔮 Кімнату створено!', 'success');
    // Хост зникне до того, як хтось приєднається — кімната не має висіти
    // в лобі вічно, а ставка не має пропасти.
    db.ref('pvp_predict/' + ref.key).onDisconnect().update({ status: 'cancelled' });
    db.ref('users/' + currentUser + '/balance').onDisconnect().set(firebase.database.ServerValue.increment(bet));
    switchPdTab('join');
    listenPdRoom(ref.key, bet, guess, 'creator');
  });
}

function loadPdRooms() {
  const el = document.getElementById('pdRoomsList'); if(!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--sub);padding:20px;">⏳</div>';
  db.ref('pvp_predict').orderByChild('status').equalTo('waiting').once('value', snap => {
    const rooms = snap.val();
    if(!rooms) { el.innerHTML = '<div style="text-align:center;color:var(--sub);padding:30px;font-size:13px;">Немає кімнат.</div>'; return; }
    const list = Object.entries(rooms).filter(([,r])=>r.creator!==currentUser);
    if(!list.length) { el.innerHTML = '<div style="text-align:center;color:var(--sub);padding:30px;font-size:13px;">Немає кімнат!</div>'; return; }
    el.innerHTML = list.map(([id,r])=>`
      <div style="background:var(--box);border:1px solid var(--border);border-radius:var(--r-lg);padding:14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
        <div><div style="font-size:14px;font-weight:700;">${r.creator} 🔮 ?</div>
        <div style="font-size:11px;color:var(--sub);margin-top:3px;">Ставка: <b style="color:var(--accent);">₴${formatNumber(r.bet)}</b></div></div>
        <button onclick="joinPdRoom('${id}',${r.bet},'${r.creator}')" style="background:linear-gradient(135deg,var(--info),var(--primary));color:var(--fg);border:none;border-radius:var(--r-md);padding:10px 16px;font-weight:800;font-size:13px;cursor:pointer;margin:0;">Прийняти</button>
      </div>`).join('');
  });
}

function joinPdRoom(roomId, bet, creator) {
  if((userData.balance||0) < bet) return notify('Недостатньо коштів', 'error');
  db.ref('pvp_predict/'+roomId+'/status').transaction(current => {
    // current===null — кеш ще не прогрітий (loadPdRooms читає once()),
    // а не факт що кімнату зайнято. Дозволяємо спробу, SDK звірить з сервером.
    if(current === 'waiting' || current === null) return 'joining';
    return;
  }, (err, committed) => {
    if(!committed) { notify('Зайнята', 'error'); loadPdRooms(); return; }
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
    db.ref('pvp_predict/'+roomId).update({ joiner:currentUser, status:'active' });
    pdCurrentRoom = roomId; pdRole = 'joiner';
    document.getElementById('pd-panel-join').classList.add('hidden');
    document.getElementById('pdJoinGuessArea').classList.remove('hidden');
    document.getElementById('pdJoinStatus').textContent = '🔮 Вгадай число від 1 до 100!';
    listenPdRoom(roomId, bet, null, 'joiner');
  });
}

function submitPdGuess() {
  const g = parseInt(document.getElementById('pdJoinGuessInput').value);
  if(!g || g<1 || g>100) return notify('Число від 1 до 100', 'error');
  db.ref('pvp_predict/'+pdCurrentRoom).update({ joinerGuess: g });
  document.getElementById('pdJoinStatus').textContent = '⏳ Чекаємо результату...';
}

function listenPdRoom(roomId, bet, myGuessIfCreator, role) {
  let disconnectArmed = false;
  db.ref('pvp_predict/'+roomId).on('value', snap => {
    const r = snap.val(); if(!r) return;
    // Щойно суперник приєднався — обидві ставки в грі, і зникнення будь-
    // кого з гравців (не встиг вгадати) має повертати ставки обом, а не
    // забирати кімнату (як поки що чекали на суперника).
    if(!disconnectArmed && r.joiner && r.status !== 'waiting') {
      disconnectArmed = true;
      db.ref('pvp_predict/'+roomId).onDisconnect().cancel();
      db.ref('users/'+currentUser+'/balance').onDisconnect().cancel();
      if(r.status !== 'finished') db.ref('pvp_predict/'+roomId).onDisconnect().update({ status: 'abandoned', abandonedBy: currentUser });
    }
    if(r.status === 'abandoned') {
      db.ref('pvp_predict/'+roomId+'/status').transaction(cur => cur === 'abandoned' ? 'finished' : undefined, (err, committed) => {
        if(err || !committed) return;
        db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(bet));
        if(r.abandonedBy && r.abandonedBy !== currentUser) db.ref('users/'+r.abandonedBy+'/balance').set(firebase.database.ServerValue.increment(bet));
        notify('Суперник відключився. Ставку повернено.', 'info');
      });
      db.ref('pvp_predict/'+roomId).off();
      return;
    }
    if(r.joinerGuess && r.creatorGuess && r.secret && r.status === 'active') {
      // Атомарний claim — тільки ОДИН клієнт фактично рахує і платить
      db.ref('pvp_predict/'+roomId+'/status').transaction(current => {
        if(current === 'active') return 'resolving';
        return;
      }, (err, committed) => {
        if(!committed) return;
        const secret = r.secret;
        const cDist = Math.abs(r.creatorGuess - secret);
        const jDist = Math.abs(r.joinerGuess - secret);
        let winner;
        if(cDist < jDist)      winner = r.creator;
        else if(jDist < cDist) winner = r.joiner;
        else                   winner = 'draw';
        const payout = Math.floor(bet * 2 * 0.95);
        db.ref('pvp_predict/'+roomId).update({ status:'finished', winner, payout, secret });
        if(winner !== 'draw') db.ref('users/'+winner+'/balance').set(firebase.database.ServerValue.increment(payout));
        else {
          db.ref('users/'+r.creator+'/balance').set(firebase.database.ServerValue.increment(bet));
          db.ref('users/'+r.joiner+'/balance').set(firebase.database.ServerValue.increment(bet));
        }
      });
    } else if(r.status === 'finished' && r.winner !== undefined) {
      db.ref('pvp_predict/'+roomId).off();
      db.ref('pvp_predict/'+roomId).onDisconnect().cancel();
      const secret = r.secret;
      const myGuess = role==='creator' ? r.creatorGuess : r.joinerGuess;
      const oppGuess= role==='creator' ? r.joinerGuess  : r.creatorGuess;
      const myDist  = Math.abs(myGuess - secret);
      const oppDist = Math.abs(oppGuess - secret);
      const myWon   = r.winner === currentUser;
      const isDraw  = r.winner === 'draw';
      showPdResult(myWon, isDraw, secret, myGuess, oppGuess, myDist, oppDist, bet, r.payout, r.creator===currentUser ? r.joiner : r.creator);
      if(myWon) addToWinFeed('Predict', r.payout, 2);
    }
  });
}

function showPdResult(won, draw, secret, myGuess, oppGuess, myDist, oppDist, bet, payout, opponent) {
  document.getElementById('pdJoinGuessArea').classList.add('hidden');
  const box = document.getElementById('pdResultBox');
  box.classList.remove('hidden');
  const color = draw ? 'var(--accent)' : won ? 'var(--green)' : 'var(--red)';
  const label = draw ? '🤝 НІЧИЯ!' : won ? '🏆 ВИГРАШ!' : '😞 ПРОГРАШ';
  const amtStr = draw ? '±₴0' : won ? '+₴'+formatNumber(payout) : '-₴'+formatNumber(bet);
  box.innerHTML = `
    <div style="font-size:50px;font-weight:900;color:var(--accent);font-family:var(--font-display);margin-bottom:6px;">${secret}</div>
    <div style="font-size:12px;color:var(--sub);margin-bottom:16px;">Загадане число</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      <div style="background:rgba(${won?'61,214,140':'240,64,96'},.1);border:1px solid rgba(${won?'61,214,140':'240,64,96'},.3);border-radius:var(--r-lg);padding:12px;text-align:center;">
        <div style="font-size:22px;font-weight:900;color:${won&&!draw?'var(--green)':draw?'var(--accent)':'var(--red)'};">${myGuess}</div>
        <div style="font-size:10px;color:var(--sub);">Твоє число</div>
        <div style="font-size:11px;color:var(--sub);">відстань: ${myDist}</div>
      </div>
      <div style="background:rgb(var(--tint-rgb) / 0.08);border:1px solid var(--border);border-radius:var(--r-lg);padding:12px;text-align:center;">
        <div style="font-size:22px;font-weight:900;">${oppGuess}</div>
        <div style="font-size:10px;color:var(--sub);">${opponent}</div>
        <div style="font-size:11px;color:var(--sub);">відстань: ${oppDist}</div>
      </div>
    </div>
    <div style="font-size:22px;font-weight:900;color:${color};margin-bottom:6px;">${label}</div>
    <div style="font-size:16px;color:var(--accent);font-weight:800;">${amtStr}</div>
    <button class="btn-gold" onclick="document.getElementById('pdResultBox').classList.add('hidden');pdCurrentRoom=null;pdRole=null;switchPdTab('create');" style="margin-top:14px;">🔄 Грати ще</button>`;
  if(won) { playSound('bonus'); triggerWinReaction(payout,'Predict'); }
  else if(!draw) playSound('loss');
}

// ╔══════════════════════════════════════════════════════════════╗
// ║          🏆  ЛІДЕРБОРД — День / Тиждень / Місяць            ║
// ╚══════════════════════════════════════════════════════════════╝
let lbCurrentMetric = 'wager';
let lbCurrentPeriod = 'day';
let lbResetIv   = null;  // тікер зворотного відліку до скидання
let lbLoadToken = 0;     // відкидає відповідь застарілого запиту при швидкому перемиканні
let lbWired     = false;

const LB_PRIZES        = { day:[5000,2500,1000], week:[50000,25000,10000], month:[200000,100000,50000], all:null };
const LB_PERIOD_WORD   = { day:'за добу', week:'за тиждень', month:'за місяць', all:'за весь час' };
const LB_METRIC_WORD   = { wager:'Найбільші ставки', wins:'Найбільші виграші', profit:'Найбільший прибуток', games:'Найбільше ігор', bigwin:'Рекордний виграш' };
const LB_METRIC_SUFFIX = { wager:'₴', wins:'₴', profit:'₴', games:' ігор', bigwin:'₴' };

function getLbPeriodKey(period) {
  const now = new Date();
  if(period === 'day')   return `day_${now.getFullYear()}_${now.getMonth()+1}_${now.getDate()}`;
  if(period === 'week')  { const d=new Date(now); d.setDate(d.getDate()-d.getDay()); return `week_${d.getFullYear()}_${d.getMonth()+1}_${d.getDate()}`; }
  if(period === 'month') return `month_${now.getFullYear()}_${now.getMonth()+1}`;
  return 'alltime';
}

function getLbResetTime(period) {
  const now = new Date();
  if(period === 'day') { const t = new Date(now); t.setDate(t.getDate()+1); t.setHours(0,0,0,0); return t; }
  if(period === 'week') { const t = new Date(now); t.setDate(t.getDate()+(7-t.getDay())); t.setHours(23,59,59,0); return t; }
  if(period === 'month') { return new Date(now.getFullYear(), now.getMonth()+1, 1); }
  return null;
}

// ── Вхід у вкладку: синхронізуємо перемикачі, призи, таймер і вантажимо дані ──
function initLeaderboard() {
  if(!lbWired) {
    lbWired = true;
    document.getElementById('lbPeriods')?.addEventListener('click', e => {
      const btn = e.target.closest('.lb-seg-btn');
      if(btn && btn.dataset.period !== lbCurrentPeriod) setLbPeriod(btn.dataset.period);
    });
    document.getElementById('lbMetrics')?.addEventListener('click', e => {
      const chip = e.target.closest('.lb-chip');
      if(chip && chip.dataset.metric !== lbCurrentMetric) setLbMetric(chip.dataset.metric);
    });
    // Тап по будь-якому гравцю (подіум, список, моя картка) → публічний профіль
    ['lbPodium','leaderboardList','lbMyPosition'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', e => {
        const el = e.target.closest('[data-nick]');
        if(el) openPublicProfile(el.dataset.nick);
      });
    });
  }
  lbSyncHeader();
  lbStartResetTimer();
  loadLeaderboardNew();
}

function setLbPeriod(period) {
  lbCurrentPeriod = period;
  document.querySelectorAll('#lbPeriods .lb-seg-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
  lbSyncHeader();
  lbStartResetTimer();
  loadLeaderboardNew();
}

function setLbMetric(metric) {
  lbCurrentMetric = metric;
  document.querySelectorAll('#lbMetrics .lb-chip').forEach(c => c.classList.toggle('active', c.dataset.metric === metric));
  lbSyncHeader();
  loadLeaderboardNew();
}

// Підзаголовок + призи поточного періоду
function lbSyncHeader() {
  const sub = document.getElementById('lbSubtitle');
  if(sub) sub.textContent = `${LB_METRIC_WORD[lbCurrentMetric]||''} · ${LB_PERIOD_WORD[lbCurrentPeriod]||''}`;

  const prizes = LB_PRIZES[lbCurrentPeriod];
  const box = document.getElementById('lbPrizes');
  if(box) box.classList.toggle('no-prize', !prizes);
  [1,2,3].forEach(i => {
    const el = document.getElementById('lbPrize'+i);
    if(el) el.textContent = prizes ? '₴'+formatNumber(prizes[i-1]) : '—';
  });
}

// Живий зворотний відлік: тікає щосекунди, сам зупиняється при виході з вкладки
function lbStartResetTimer() {
  clearInterval(lbResetIv);
  lbResetIv = null;
  lbTickResetTimer();
  if(lbCurrentPeriod !== 'all') lbResetIv = setInterval(lbTickResetTimer, 1000);
}

function lbTickResetTimer() {
  const screen = document.getElementById('tab-leaderboard');
  if(!screen || screen.classList.contains('hidden')) { clearInterval(lbResetIv); lbResetIv = null; return; }

  const chip = document.getElementById('lbTimer');
  const val  = document.getElementById('lbResetTimer');
  const reset = getLbResetTime(lbCurrentPeriod);
  if(!reset) { if(chip) chip.style.display = 'none'; return; }
  if(chip) chip.style.display = '';

  const diff = Math.max(0, reset - Date.now());
  const d = Math.floor(diff/86400000);
  const h = Math.floor(diff%86400000/3600000);
  const m = Math.floor(diff%3600000/60000);
  const s = Math.floor(diff%60000/1000);
  const pad = n => String(n).padStart(2,'0');
  if(val) val.textContent = d > 0 ? `${d}д ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ── Завантаження даних ──
function loadLeaderboardNew() {
  const list = document.getElementById('leaderboardList');
  const podium = document.getElementById('lbPodium');
  if(podium) podium.innerHTML = '';
  if(list) list.innerHTML = '<div class="lb-skel"></div><div class="lb-skel"></div><div class="lb-skel"></div>';

  const token = ++lbLoadToken;
  const suffix = LB_METRIC_SUFFIX[lbCurrentMetric] || '₴';

  if(lbCurrentPeriod === 'all') {
    const fieldMap = { wager:'totalWagered', wins:'totalWins', profit:'totalProfit', games:'stats.gamesPlayed', bigwin:'stats.biggestWin' };
    const field = fieldMap[lbCurrentMetric] || 'totalWagered';
    // Топ-100 за індексом (.indexOn у database.rules.json), а не весь вузол users.
    db.ref('users').orderByChild(field.replace('.', '/')).limitToLast(LB_TOP_N).once('value', snap => {
      if(token !== lbLoadToken) return;   // гравець уже перемкнув вкладку
      const data = snap.val() || {};
      const pick = d => (field.includes('.') ? field.split('.').reduce((o,k)=>(o||{})[k], d) : d[field]) || 0;
      const rows = Object.entries(data).map(([name, d]) => ({ name, val: pick(d), avatar: d.avatar }));
      const truncated = rows.length >= LB_TOP_N;
      if(truncated && currentUser && !data[currentUser] && userData) {
        rows.push({ name: currentUser, val: pick(userData), avatar: userData.avatar, outsideTop: true });
      }
      lbRender(rows, suffix);
    });
  } else {
    db.ref(`leaderboards/${getLbPeriodKey(lbCurrentPeriod)}`).once('value', snap => {
      if(token !== lbLoadToken) return;
      const data = snap.val() || {};
      // Порожньо — так і кажемо. Раніше тут підставлявся рейтинг за весь час,
      // і гравець бачив чужі всечасні суми під вкладкою «День».
      lbRender(Object.entries(data).map(([name, d]) => ({ name, val: d[lbCurrentMetric] || 0 })), suffix);
    });
  }
}

// ── Рендер ──
function lbFmtVal(val, suffix) {
  const n = formatNumber(Math.floor(val));
  return suffix === '₴' ? '₴'+n : n+suffix;
}

function lbAvatar(name, avatar, cls) {
  const url = typeof avatar === 'string' && avatar.length > 20 ? avatar.replace(/'/g, '%27') : null;
  const emoji = !url && typeof avatar === 'string' && avatar.length > 0 && avatar.length <= 4 ? avatar : null;
  const inner = url ? '' : (emoji || (name[0] || '?').toUpperCase());
  const style = url ? ` style="background-image:url('${escapeHtml(url)}');background-size:cover;background-position:center;"` : '';
  return `<div class="${cls}"${style} data-av-for="${escapeHtml(name)}">${escapeHtml(inner)}</div>`;
}

const LB_TOP_N = 100;
function lbRender(rows, suffix) {
  const podium = document.getElementById('lbPodium');
  const list   = document.getElementById('leaderboardList');
  const myBox  = document.getElementById('lbMyPosition');

  const arr = rows.filter(u => u.val > 0).sort((a,b) => b.val - a.val);

  if(!arr.length) {
    if(podium) podium.innerHTML = '';
    if(myBox)  myBox.innerHTML = '';
    if(list) list.innerHTML = `<div class="lb-empty">
      <div class="lb-empty-icon">🏆</div>
      Тут поки порожньо ${escapeHtml(LB_PERIOD_WORD[lbCurrentPeriod]||'')}.<br>Зіграй — і перше місце твоє.</div>`;
    return;
  }

  const leaderVal = arr[0].val;

  // Подіум: у розмітці порядок 2 · 1 · 3, тож лідер стоїть у центрі
  if(podium) {
    podium.innerHTML = [arr[1], arr[0], arr[2]].map((u, i) => {
      if(!u) return '<div></div>';
      const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
      const isMe = u.name === currentUser;
      return `<div class="lb-pod r${rank}${isMe ? ' me' : ''}" data-nick="${escapeHtml(u.name)}">
        ${rank === 1 ? '<div class="lb-crown">👑</div>' : ''}
        ${lbAvatar(u.name, u.avatar, 'lb-pod-av')}
        <div class="lb-pod-name">${escapeHtml(u.name)}</div>
        <div class="lb-pod-val">${lbFmtVal(u.val, suffix)}</div>
        <div class="lb-pod-base">${rank}</div>
      </div>`;
    }).join('');
  }

  // Місця 4–20 зі смужкою «скільки це від лідера»
  if(list) {
    const rest = arr.slice(3, 20);
    list.innerHTML = rest.length ? rest.map((u, i) => {
      const isMe = u.name === currentUser;
      const pct = leaderVal > 0 ? Math.max(3, Math.round(u.val / leaderVal * 100)) : 0;
      return `<div class="lb-row${isMe ? ' me' : ''}" data-nick="${escapeHtml(u.name)}" style="animation-delay:${Math.min(i*30, 300)}ms;">
        <div class="lb-rank">${i+4}</div>
        ${lbAvatar(u.name, u.avatar, 'lb-av')}
        <div class="lb-row-main">
          <div class="lb-row-name">${escapeHtml(u.name)}${isMe ? '<span class="lb-row-tag">ТИ</span>' : ''}</div>
          <div class="lb-bar"><div class="lb-bar-fill" style="width:${pct}%;"></div></div>
        </div>
        <div class="lb-row-val">${lbFmtVal(u.val, suffix)}</div>
      </div>`;
    }).join('') : '';
  }

  // Моя позиція — прилипає внизу, показує відрив від гравця вище
  if(myBox) {
    const myRank = arr.findIndex(u => u.name === currentUser);
    if(myRank === -1) {
      myBox.innerHTML = `<div class="lb-me-card"><div style="flex:1;text-align:center;">
        <div class="lb-me-lbl">Тебе ще немає в рейтингу</div>
        <div class="lb-me-gap">Зіграй, щоб потрапити в топ ${escapeHtml(LB_PERIOD_WORD[lbCurrentPeriod]||'')}</div>
      </div></div>`;
    } else {
      const me = arr[myRank];
      const above = arr[myRank-1];
      const gap = above ? above.val - me.val : 0;
      myBox.innerHTML = `<div class="lb-me-card" data-nick="${escapeHtml(currentUser)}">
        <div class="lb-me-rank">#${me.outsideTop ? LB_TOP_N + '+' : myRank+1}</div>
        ${lbAvatar(me.name, me.avatar, 'lb-av')}
        <div style="flex:1;min-width:0;">
          <div class="lb-me-lbl">Твоя позиція</div>
          <div class="lb-me-gap">${me.outsideTop
            ? `до топ-${LB_TOP_N} — ${lbFmtVal(gap, suffix)}`
            : above
            ? `до <b>#${myRank}</b> — ${lbFmtVal(gap, suffix)}`
            : '👑 Ти лідер — тримай перше місце'}</div>
        </div>
        <div class="lb-me-val">${lbFmtVal(me.val, suffix)}</div>
      </div>`;
    }
  }

  // Аватарки за період не зберігаються в лідерборді — підтягуємо їх окремо,
  // уже після рендеру, щоб список не чекав на ці запити
  if(lbCurrentPeriod !== 'all') lbHydrateAvatars();
}

const lbAvatarCache = {};   // нік → аватар, щоб перемикання метрик не перечитувало те саме

function lbApplyAvatar(el, av) {
  if(typeof av !== 'string' || !av) return;
  if(av.length > 20) {
    el.style.backgroundImage = `url('${av.replace(/'/g, '%27')}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else if(av.length <= 4) {
    el.textContent = av;
  }
}

function lbHydrateAvatars() {
  const slots = new Map();
  document.querySelectorAll('#tab-leaderboard [data-av-for]').forEach(el => {
    const nick = el.getAttribute('data-av-for');
    if(!slots.has(nick)) slots.set(nick, []);
    slots.get(nick).push(el);
  });
  const token = lbLoadToken;
  slots.forEach((els, nick) => {
    if(nick in lbAvatarCache) { els.forEach(el => lbApplyAvatar(el, lbAvatarCache[nick])); return; }
    db.ref('users/'+nick+'/avatar').once('value').then(snap => {
      lbAvatarCache[nick] = snap.val();
      if(token !== lbLoadToken) return;
      els.forEach(el => lbApplyAvatar(el, lbAvatarCache[nick]));
    }).catch(() => {});
  });
}

// Записуємо статистику у лідерборд при кожній грі
function trackLbStat(type, amount) {
  if(!currentUser) return;
  const periodKey = getLbPeriodKey('day');
  const weekKey   = getLbPeriodKey('week');
  const monthKey  = getLbPeriodKey('month');
  [periodKey, weekKey, monthKey].forEach(key => {
    db.ref(`leaderboards/${key}/${currentUser}/${type}`).set(firebase.database.ServerValue.increment(amount));
  });
  // Профіт додатково пишемо в постійний запис гравця — інакше "Профіт"
  // за весь час немає з чого рахувати (all-time рейтинг читає саме звідси)
  if(type === 'profit') {
    db.ref(`users/${currentUser}/totalProfit`).set(firebase.database.ServerValue.increment(amount));
  }
}

// "Найбільший виграш" — це MAX, не SUM, тому окрема функція з transaction()
function trackLbBigWin(amount) {
  if(!currentUser || !(amount > 0)) return;
  const periodKey = getLbPeriodKey('day');
  const weekKey   = getLbPeriodKey('week');
  const monthKey  = getLbPeriodKey('month');
  [periodKey, weekKey, monthKey].forEach(key => {
    db.ref(`leaderboards/${key}/${currentUser}/bigwin`).transaction(current => Math.max(current||0, amount));
  });
  // Постійний рекорд гравця — це ж значення читає профіль ("Найбільший виграш")
  db.ref(`users/${currentUser}/stats/biggestWin`).transaction(current => Math.max(current||0, amount));
}

// Публікуємо ставки в live_bets для Copy Trade
function publishLiveBet(game, emoji, amount, detail) {
  if(!currentUser) return;
  db.ref('live_bets').push({ user:currentUser, game, gameEmoji:emoji, amount, detail, ts:Date.now() });
}

// ╔══════════════════════════════════════════════╗
// ║           🌀  LIMBO                          ║
// ╚══════════════════════════════════════════════╝
let limboRunning = false;

function updateLimboChance() {
  const target = parseFloat(document.getElementById('limboTarget')?.value) || 2;
  const bet = parseFloat(document.getElementById('limboAmount')?.value) || 0;
  const chance = target > 0 ? Math.min(99.99, (97 / target)) : 0;
  const payout = Math.floor(bet * target);
  const chEl = document.getElementById('limboChanceDisplay');
  const pyEl = document.getElementById('limboPayoutDisplay');
  if(chEl) chEl.textContent = chance.toFixed(2) + '%';
  if(pyEl) pyEl.textContent = '₴' + formatNumber(payout);
}

async function playLimbo() {
  if(limboRunning) return;
  const bet = validateBet(document.getElementById('limboAmount').value);
  if(!bet) return;
  const target = parseFloat(document.getElementById('limboTarget').value) || 2;
  if(target < 1.01) return notify('Мінімальна ціль ×1.01','error');
  if(target > 1000000) return notify('Максимальна ціль ×1,000,000','error');

  limboRunning = true;
  const btn = document.getElementById('limboBtn');
  if(btn) btn.disabled = true;

  const srv = await serverPlay('limbo', bet, { target });
  if(srv.mode === 'error') { limboRunning = false; if(btn) btn.disabled = false; return; }
  if(srv.mode !== 'server') db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  addWager(bet); trackQuest('totalGames',1); trackQuest('weekWager',bet);
  trackLbStat('wager',bet); trackLbStat('games',1);
  publishLiveBet('Limbo','🌀', bet, '×'+target);

  const resEl = document.getElementById('limboResultDisplay');
  const msgEl = document.getElementById('limboResultMsg');
  if(resEl) { resEl.style.color = 'var(--special)'; resEl.textContent = '...'; }
  if(msgEl) msgEl.textContent = '';

  // Генерація результату (розподіл як у Crash) — на сервері, якщо він налаштований
  const result = srv.mode === 'server'
    ? srv.r.result
    : parseFloat(Math.max(1.00, (97 / (Math.random() * 100))).toFixed(2));

  setTimeout(() => {
    const win = srv.mode === 'server' ? srv.r.win : result >= target;
    const payout = srv.mode === 'server' ? srv.r.payout : (win ? Math.floor(bet * target) : 0);

    // Анімація числа
    let counter = 1.0;
    const finalVal = result;
    const steps = 20;
    const inc = (finalVal - 1) / steps;
    let step = 0;
    const anim = setInterval(() => {
      step++;
      counter = Math.min(finalVal, 1 + inc * step);
      if(resEl) resEl.textContent = '×' + counter.toFixed(2);
      if(step >= steps) {
        clearInterval(anim);
        if(resEl) {
          resEl.textContent = '×' + finalVal.toFixed(2);
          resEl.style.color = win ? 'var(--green)' : 'var(--red)';
          resEl.style.textShadow = win ? 'none' : 'none';
        }
        if(win) {
          if(srv.mode !== 'server') db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
          playSound('win');
          if(msgEl) msgEl.innerHTML = `<span style="color:var(--green);font-weight:700;">✅ ВИГРАШ! +₴${formatNumber(payout - bet)} (ціль ×${target} ✓)</span>`;
          notify(`🌀 +₴${formatNumber(payout - bet)}`,'success');
          addToHistory(`Limbo ×${target}: +${payout-bet}`);
          trackLbStat('wins',payout); trackLbStat('profit',payout-bet);
          if(payout-bet >= 500) addToWinFeed('Limbo', payout-bet, target);
        } else {
          playSound('loss');
          if(msgEl) msgEl.innerHTML = `<span style="color:var(--red);">❌ Результат ×${finalVal} < ціль ×${target} · -₴${formatNumber(bet)}</span>`;
          addToHistory(`Limbo ×${target}: -${bet}`);
        }
        // Add to history strip
        const hist = document.getElementById('limboHistory');
        if(hist) {
          const pill = document.createElement('div');
          pill.style.cssText = `padding:4px 10px;border-radius:var(--r-xl);font-size:12px;font-weight:700;background:${win?'rgb(var(--pos-rgb) / 0.15)':'rgb(var(--neg-rgb) / 0.15)'};border:1px solid ${win?'rgb(var(--pos-rgb) / 0.4)':'rgb(var(--neg-rgb) / 0.3)'};color:${win?'var(--green)':'var(--red)'};`;
          pill.textContent = '×' + finalVal.toFixed(2);
          hist.insertBefore(pill, hist.firstChild);
          if(hist.children.length > 20) hist.removeChild(hist.lastChild);
        }
        limboRunning = false;
        if(btn) btn.disabled = false;
        setTimeout(() => {
          if(resEl) { resEl.style.color = 'var(--special)'; resEl.style.textShadow = ''; }
        }, 1500);
      }
    }, 30);
  }, 300);
}

// PvP CSS animation
const pvpStyle = document.createElement('style');
pvpStyle.textContent = `
  #rps-rock:active, #rps-scissors:active, #rps-paper:active { transform:scale(.88); }
  .cf-bet-btn:active { transform:scale(.92); }
`;
document.head.appendChild(pvpStyle);


