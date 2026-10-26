// ============================================
// ===== ГРА В КАРТИ: ДУРЕНЬ =====
// ============================================
const SUITS = ['♠','♣','♥','♦'];
const RANKS = ['6','7','8','9','10','J','Q','K','A'];

let cgState = null; // { deck, playerHand, aiHand, table, trump, trumpSuit, isPlayerAttacking, selectedCard, aiMode, gameOver }
let cgRoomId = null;
let cgIsHost = null;       // онлайн-режим: я хост (p1) чи гість (p2) цієї кімнати
let cgOpponentName = null; // онлайн-режим: нік реального суперника
let cgListener = null;
let cgSelectedCards = [];

function makeCardDeck() {
  // Дурень грається 36-карточною колодою (6..A) — на відміну від решти
  // ігор тут ще й потрібен стабільний id для синхронізації PvP-кімнат.
  return shuffleDeck(createStandardDeck(RANKS, SUITS)).map(c => ({ ...c, id: c.rank + c.suit }));
}

function cardValue(rank) { return RANKS.indexOf(rank); }
function beats(attacker, defender, trumpSuit) {
  if(defender.suit === attacker.suit) return cardValue(defender.rank) > cardValue(attacker.rank);
  if(defender.suit === trumpSuit && attacker.suit !== trumpSuit) return true;
  return false;
}
function cardHtml(card, small, selected) {
  const isRed = isRedSuit(card.suit);
  return '<div class="card' + (small?' small':'') + (selected?' selected':'') + (isRed?' red':'') +
    '" data-id="' + card.id + '">' +
    '<span>' + card.rank + '</span><span>' + card.suit + '</span></div>';
}
function tableCardHtml(card, isCover) {
  if(!card) return '<div class="cg-table-card covered" style="border:2px dashed var(--pos);background:transparent;width:44px;height:62px;border-radius:var(--r-sm);"></div>';
  const isRed = isRedSuit(card.suit);
  return '<div class="cg-table-card' + (isRed?' red':'') + '"><span>' + card.rank + '</span><span>' + card.suit + '</span></div>';
}

function startCardGame(mode) {
  const bet = parseInt(document.getElementById('cgBet').value) || 200;
  if(bet < 10) return notify('Мінімум 10₴', 'error');
  if((userData.balance||0) < bet) return notify('Недостатньо коштів', 'error');

  // На випадок, якщо гравець щойно вийшов з онлайн-матчу — без цього скидання
  // нова гра проти AI помилково трактувалась би як онлайн (cgRoomId лишався б старим).
  cgRoomId = null; cgIsHost = null; cgOpponentName = null;

  db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(-bet));
  addWager(bet);

  const deck = makeCardDeck();
  const playerHand = deck.splice(0, 6);
  const aiHand = deck.splice(0, 6);
  const trumpCard = deck[deck.length - 1];
  const trumpSuit = trumpCard.suit;

  cgState = {
    bet, deck, playerHand, aiHand, table: [], trump: trumpCard, trumpSuit,
    isPlayerAttacking: true, // player attacks first
    gameOver: false, aiMode: mode === 'ai'
  };
  cgSelectedCards = [];

  document.getElementById('cgStartScreen').classList.add('hidden');
  document.getElementById('cgGameScreen').classList.remove('hidden');
  document.getElementById('cgPhaseInfo').textContent = '⚔️ Ваш хід — атакуйте!';
  renderCgBoard();
  cgLog('🃏 Гра почалась! Козир: ' + trumpCard.rank + trumpCard.suit);
}

function renderCgBoard() {
  if(!cgState) return;
  const { playerHand, aiHand, table, trump, trumpSuit, isPlayerAttacking } = cgState;

  const tc = document.getElementById('cgTrumpCard');
  if(tc) { const isRed = isRedSuit(trump.suit); tc.innerHTML = '<span style="color:' + (isRed?'var(--neg)':'var(--on-accent)') + ';font-size:18px;">' + trump.rank + trump.suit + '</span>'; }

  const dc = document.getElementById('cgDeckCount');
  if(dc) dc.textContent = cgState.deck.length;

  const opp = document.getElementById('cgOpponentHand');
  if(opp) {
    opp.innerHTML = '';
    for(let i = 0; i < aiHand.length; i++) {
      opp.innerHTML += '<div class="card face-down small">🂠</div>';
    }
  }
  const oppCnt = document.getElementById('cgOpponentCards');
  if(oppCnt) oppCnt.textContent = aiHand.length + ' карт';

  const ph = document.getElementById('cgPlayerHand');
  if(ph) {
    ph.innerHTML = playerHand.map(c => cardHtml(c, false, cgSelectedCards.includes(c.id))).join('');
    ph.querySelectorAll('.card').forEach((el, i) => {
      el.onclick = () => { cgSelectCard(playerHand[i]); };
    });
  }
  const pcc = document.getElementById('cgPlayerCardsCount');
  if(pcc) pcc.textContent = playerHand.length;

  const bf = document.getElementById('cgBattleField');
  if(bf) {
    if(!table.length) { bf.innerHTML = '<div style="color:var(--fg-4);font-size:12px;font-style:italic;width:100%;text-align:center;">Поле порожнє</div>'; }
    else {
      bf.innerHTML = '';
      table.forEach(pair => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;align-items:center;';
        wrap.innerHTML = tableCardHtml(pair.attack) + (pair.defend ? tableCardHtml(pair.defend) : '<div class="cg-table-card" style="border:2px dashed var(--line-strong);background:transparent;"></div>');
        bf.appendChild(wrap);
      });
    }
  }

  const pi = document.getElementById('cgPhaseInfo');
  if(pi) pi.textContent = isPlayerAttacking ? '⚔️ Атакуйте!' : '🛡️ Відбийтесь!';

  const attackBtn = document.getElementById('cgAttackBtn');
  const passBtn   = document.getElementById('cgPassBtn');
  if(attackBtn) attackBtn.textContent = isPlayerAttacking ? '⚔️ Атакувати' : '🛡️ Відбити';
  if(passBtn)   passBtn.textContent   = isPlayerAttacking ? '⏭ Завершити атаку' : '😩 Взяти карти';
}

function cgSelectCard(card) {
  if(cgState && cgState.gameOver) return;
  const idx = cgSelectedCards.indexOf(card.id);
  if(idx >= 0) cgSelectedCards.splice(idx, 1); else cgSelectedCards.push(card.id);
  renderCgBoard();
}

function cgAttack() {
  if(!cgState || cgState.gameOver) return;
  const { isPlayerAttacking, playerHand, aiHand, table, trumpSuit } = cgState;

  if(isPlayerAttacking) {
    // Player attacks
    const cards = playerHand.filter(c => cgSelectedCards.includes(c.id));
    if(!cards.length) return notify('Оберіть карту для атаки', 'error');
    const card = cards[0];

    // Validate: must match rank of table cards if table not empty
    if(table.length && !table.some(p => p.attack.rank === card.rank || (p.defend && p.defend.rank === card.rank))) {
      return notify('Можна підкидати лише карти такого ж номіналу!', 'error');
    }

    cgState.playerHand = playerHand.filter(c => c.id !== card.id);
    table.push({ attack: card, defend: null });
    cgSelectedCards = [];
    cgLog('⚔️ Ви атакуєте: ' + card.rank + card.suit);
    renderCgBoard();
    cgHandoffToOpponent(cgAiDefend, 700);

  } else {
    // Player defends
    if(!cgSelectedCards.length) return notify('Оберіть карту для захисту', 'error');
    const openAttack = table.find(p => !p.defend);
    if(!openAttack) return notify('Немає відкритих атак', 'error');
    const card = playerHand.find(c => c.id === cgSelectedCards[0]);
    if(!card) return;
    if(!beats(openAttack.attack, card, trumpSuit)) return notify('Ця карта не може відбити ' + openAttack.attack.rank + openAttack.attack.suit, 'error');
    openAttack.defend = card;
    cgState.playerHand = playerHand.filter(c => c.id !== card.id);
    cgSelectedCards = [];
    cgLog('🛡️ Ви відбили: ' + card.rank + card.suit);
    renderCgBoard();
    // Check if all attacks defended
    if(!table.some(p => !p.defend)) {
      cgLog('✅ Всі атаки відбиті!');
      if(cgRoomId) cgSyncRoomState(); // покажи супернику завершений захист одразу, ще до розрахунку раунду
      setTimeout(() => cgEndRound(false), 800);
    } else if(cgRoomId) {
      cgSyncRoomState(); // ще лишились відкриті атаки — синхронізуємось, щоб суперник побачив захищену карту
    }
  }
}

function cgPass() {
  if(!cgState || cgState.gameOver) return;
  if(cgState.isPlayerAttacking) {
    // End attack
    if(!cgState.table.some(p => p.defend === null)) {
      cgLog('⏭ Атаку завершено');
      cgEndRound(false);
    } else notify(cgRoomId ? 'Суперник ще не відбив всі карти!' : 'AI ще не відбив всі карти!', 'error');
  } else {
    // Player takes all table cards
    const allCards = cgState.table.flatMap(p => [p.attack, p.defend].filter(Boolean));
    cgState.playerHand.push(...allCards);
    cgState.table = [];
    cgLog('😩 Ви взяли ' + allCards.length + ' карт');
    cgRefill();
    cgState.isPlayerAttacking = false; // суперник атакує знову
    renderCgBoard();
    cgHandoffToOpponent(cgAiAttack, 1000);
  }
}

function cgAiDefend() {
  if(!cgState) return;
  const openAttack = cgState.table.find(p => !p.defend);
  if(!openAttack) { cgEndRound(false); return; }

  // Find best defending card
  const defenders = cgState.aiHand.filter(c => beats(openAttack.attack, c, cgState.trumpSuit));
  if(!defenders.length) {
    // AI takes
    cgLog('🤖 AI не може відбити, бере карти!');
    const allCards = cgState.table.flatMap(p => [p.attack, p.defend].filter(Boolean));
    cgState.aiHand.push(...allCards);
    cgState.table = [];
    cgRefill();
    cgState.isPlayerAttacking = true;
    renderCgBoard();
    cgCheckWin();
    return;
  }
  const defCard = defenders.sort((a,b) => cardValue(a.rank)-cardValue(b.rank))[0];
  cgState.aiHand = cgState.aiHand.filter(c => c.id !== defCard.id);
  openAttack.defend = defCard;
  cgLog('🤖 AI відбиває: ' + defCard.rank + defCard.suit);
  renderCgBoard();
  // All attacks defended?
  if(!cgState.table.some(p => !p.defend)) {
    setTimeout(() => cgEndRound(false), 600);
  }
}

function cgAiAttack() {
  if(!cgState || cgState.gameOver) return;
  const { aiHand, playerHand, table, trumpSuit } = cgState;
  if(!aiHand.length) { cgEndRound(false); return; }

  // Play lowest non-trump or trump if must
  const nonTrump = aiHand.filter(c => c.suit !== trumpSuit).sort((a,b) => cardValue(a.rank)-cardValue(b.rank));
  const attack = nonTrump.length ? nonTrump[0] : aiHand.sort((a,b) => cardValue(a.rank)-cardValue(b.rank))[0];
  cgState.aiHand = aiHand.filter(c => c.id !== attack.id);
  table.push({ attack, defend: null });
  cgLog('🤖 AI атакує: ' + attack.rank + attack.suit);
  cgState.isPlayerAttacking = false;
  renderCgBoard();
}

function cgEndRound(playerTook) {
  if(!cgState) return;
  cgState.table = [];
  cgRefill();
  cgState.isPlayerAttacking = !playerTook;
  renderCgBoard();
  cgCheckWin();
  if(!cgState.gameOver) {
    if(cgRoomId) {
      cgSyncRoomState();
      if(cgState.isPlayerAttacking) cgLog('⚔️ Ваш хід!');
    } else if(!cgState.isPlayerAttacking) {
      setTimeout(cgAiAttack, 800);
    } else {
      cgLog('⚔️ Ваш хід!');
    }
  }
}

function cgRefill() {
  if(!cgState) return;
  // Refill to 6 cards each
  while(cgState.playerHand.length < 6 && cgState.deck.length) cgState.playerHand.push(cgState.deck.pop());
  while(cgState.aiHand.length < 6 && cgState.deck.length) cgState.aiHand.push(cgState.deck.pop());
}

function cgCheckWin() {
  if(!cgState) return;
  if(!cgState.playerHand.length && !cgState.deck.length) {
    cgState.gameOver = true;
    if(cgRoomId) { cgResolvePvpGame(currentUser); return; }
    const prize = Math.floor(cgState.bet * 1.85);
    db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(prize));
    playSound('win');
    notify('🃏 Ви перемогли! +' + prize + '₴', 'success');
    cgLog('🏆 ВИ ВИГРАЛИ! +' + prize + '₴');
    addToHistory('Карти: +' + prize);
    addToWinFeed('Карти', prize, (prize/cgState.bet).toFixed(1));
    renderCgBoard();
    setTimeout(cgReset, 3000);
  } else if(!cgState.aiHand.length && !cgState.deck.length) {
    cgState.gameOver = true;
    if(cgRoomId) { cgResolvePvpGame(cgOpponentName); return; }
    cgLog('😔 AI виграв — ви "Дурень"!');
    notify('😔 Програш у Дурня', 'error');
    addToHistory('Карти: -' + cgState.bet);
    renderCgBoard();
    setTimeout(cgReset, 3000);
  }
}

function cgReset() {
  cgState = null; cgSelectedCards = [];
  cgRoomId = null; cgIsHost = null; cgOpponentName = null;
  document.getElementById('cgGameScreen').classList.add('hidden');
  document.getElementById('cgStartScreen').classList.remove('hidden');
}

function cgLog(text) {
  const log = document.getElementById('cgLog'); if(!log) return;
  const item = document.createElement('div');
  item.className = 'mono-log-item info';
  item.textContent = text;
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}

function cgAllCardsById() {
  const map = {};
  for(const s of SUITS) for(const r of RANKS) { const id = r + s; map[id] = { suit: s, rank: r, id }; }
  return map;
}

// Повністю перебудовує локальний cgState зі знімка Firebase — card_rooms є
// єдиним джерелом правди для онлайн-гри, тому клієнти ніколи не розходяться.
function cgApplyRoomSnapshot(r) {
  const allCards = cgAllCardsById();
  const myIds  = cgIsHost ? r.p1HandIds : r.p2HandIds;
  const oppIds = cgIsHost ? r.p2HandIds : r.p1HandIds;
  cgState = {
    bet: r.bet,
    deck: (r.deckIds || []).map(id => allCards[id]).filter(Boolean),
    playerHand: (myIds || []).map(id => allCards[id]).filter(Boolean),
    aiHand: (oppIds || []).map(id => allCards[id]).filter(Boolean),
    table: (r.table || []).map(p => ({ attack: allCards[p.attackId], defend: p.defendId ? allCards[p.defendId] : null })),
    trump: allCards[r.trumpId], trumpSuit: r.trumpSuit,
    isPlayerAttacking: r.attacker === currentUser,
    gameOver: r.status === 'finished',
    aiMode: false,
  };
}

// Пише повний стан гри назад у card_rooms/<id> після МОЄЇ дії — реальний
// суперник підхоплює його через свій listenCardRoom і продовжує з того ж місця.
function cgSyncRoomState() {
  if(!cgRoomId || !cgState) return;
  const attackerUser = cgState.isPlayerAttacking ? currentUser : cgOpponentName;
  const update = {
    deckIds: cgState.deck.map(c => c.id),
    table: cgState.table.map(p => ({ attackId: p.attack.id, defendId: p.defend ? p.defend.id : null })),
    attacker: attackerUser,
    lastActionBy: currentUser,
  };
  update[cgIsHost ? 'p1HandIds' : 'p2HandIds'] = cgState.playerHand.map(c => c.id);
  update[cgIsHost ? 'p2HandIds' : 'p1HandIds'] = cgState.aiHand.map(c => c.id);
  db.ref('card_rooms/' + cgRoomId).update(update);
}

// Єдина точка розгалуження "хто ходить далі": онлайн — синхронізуємось і чекаємо
// реального суперника; проти AI — як і раніше, симулюємо його хід локально.
function cgHandoffToOpponent(aiFn, delay) {
  if(cgRoomId) { cgSyncRoomState(); return; }
  setTimeout(aiFn, delay);
}

// Той самий безпечний "хто перший встиг" транзакційний патерн, що й у
// Coinflip/RPS/Prediction Duel/Шахах PvP — гарантує одноразову виплату.
function cgResolvePvpGame(winnerUsername) {
  if(!cgRoomId) return;
  db.ref('card_rooms/' + cgRoomId + '/resolved').transaction(current => {
    if(current) return;
    return true;
  }, (err, committed) => {
    if(!committed) return;
    db.ref('card_rooms/' + cgRoomId).once('value').then(snap => {
      const r = snap.val(); if(!r) return;
      const prize = Math.floor(r.bet * 1.85);
      db.ref('users/' + winnerUsername + '/balance').set(firebase.database.ServerValue.increment(prize));
      db.ref('card_rooms/' + cgRoomId).update({ status: 'finished', winner: winnerUsername });
    });
  });
}

// Онлайн лобі для карт
function openCardLobby() {
  document.getElementById('cgStartScreen').classList.add('hidden');
  document.getElementById('cgOnlineLobby').classList.remove('hidden');
  loadCardRooms();
}

function createCardRoom() {
  const bet = parseInt(document.getElementById('cgBet').value) || 200;
  if(bet < 10) return notify('Мінімум 10₴', 'error');
  if((userData.balance||0) < bet) return notify('Недостатньо коштів: потрібно ' + bet + '₴', 'error');
  db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(-bet));
  addWager(bet);
  const roomId = 'cg_' + currentUser + '_' + Date.now();
  cgRoomId = roomId;
  // Generate deck and hands on creation
  const deck = makeCardDeck();
  const p1Hand = deck.splice(0,6), p2Hand = deck.splice(0,6);
  const trumpCard = deck[deck.length-1];
  db.ref('card_rooms/' + roomId).set({
    host: currentUser, guest: null, bet, status: 'waiting', created: Date.now(),
    deckIds: deck.map(c=>c.id),
    p1HandIds: p1Hand.map(c=>c.id),
    p2HandIds: p2Hand.map(c=>c.id),
    trumpId: trumpCard.id, trumpSuit: trumpCard.suit,
    table: [], turn: currentUser, attacker: currentUser
  }).then(() => {
    notify('🃏 Кімнату створено! Код: ' + roomId.slice(-6), 'success');
    // Якщо хост зникне поки кімната ще чекає суперника — не має зависнути.
    db.ref('card_rooms/' + roomId).onDisconnect().update({ status: 'cancelled' });
    db.ref('users/' + currentUser + '/balance').onDisconnect().set(firebase.database.ServerValue.increment(bet));
    // Show waiting screen in online lobby
    const roomsList = document.getElementById('cgRoomsList');
    if(roomsList) roomsList.innerHTML = '<div style="background:linear-gradient(135deg,var(--surface-2),var(--surface-1));border:1px solid var(--green);border-radius:var(--r-md);padding:15px;text-align:center;">' +
      '<div style="font-size:28px;margin-bottom:8px;">⏳</div>' +
      '<div style="color:var(--green);font-weight:bold;margin-bottom:4px;">Кімната створена!</div>' +
      '<div style="color:var(--fg-3);font-size:12px;margin-bottom:12px;">Ставка: ' + bet + '₴ • Чекаємо суперника...</div>' +
      '<button class="btn-red" onclick="cancelCardRoom(\'' + roomId + '\',' + bet + ')" style="padding:10px;">❌ Скасувати</button>' +
      '</div>';
    listenCardRoom(roomId);
  }).catch(e => { notify('Помилка: ' + e.message, 'error'); });
}

function cancelCardRoom(roomId, bet) {
  db.ref('card_rooms/' + roomId).onDisconnect().cancel();
  db.ref('users/' + currentUser + '/balance').onDisconnect().cancel();
  db.ref('card_rooms/' + roomId).update({ status: 'cancelled' });
  db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(bet));
  if(cgListener) { try { db.ref('card_rooms/'+roomId).off('value', cgListener); } catch(e) { console.warn(e); } cgListener = null; }
  cgRoomId = null;
  notify('❌ Кімнату скасовано, ставку повернено', 'info');
  loadCardRooms();
}

function loadCardRooms() {
  db.ref('card_rooms').orderByChild('status').equalTo('waiting').limitToLast(10).once('value', snap => {
    const list = document.getElementById('cgRoomsList'); if(!list) return;
    const data = snap.val();
    if(!data) { list.innerHTML = '<div style="color:var(--fg-4);font-size:12px;padding:10px 0;">Немає кімнат</div>'; return; }
    list.innerHTML = '';
    Object.entries(data).forEach(([id, r]) => {
      if(r.host === currentUser) return;
      list.innerHTML += '<div class="cg-room-card waiting"><div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-weight:bold;">🧑 ' + r.host + '</span><span style="color:var(--accent);font-weight:bold;">' + r.bet + '₴</span>' +
        '</div><button class="btn-gold" style="margin-top:8px;" onclick="joinCardRoom(\'' + id + '\',' + r.bet + ')">➕ ПРИЄДНАТИСЬ</button></div>';
    });
    if(!list.innerHTML) list.innerHTML = '<div style="color:var(--fg-4);font-size:12px;padding:10px 0;">Немає кімнат</div>';
  });
}

function joinCardRoom(roomId, bet) {
  if((userData.balance||0) < bet) return notify('Недостатньо коштів', 'error');
  db.ref('card_rooms/'+roomId+'/status').transaction(current => {
    // current===null — кеш ще не прогрітий (loadCardRooms читає once()),
    // а не факт що кімнату зайнято. Дозволяємо спробу, SDK звірить з сервером.
    if(current === 'waiting' || current === null) return 'joining';
    return;
  }, (err, committed) => {
    if(!committed) { notify('Кімнату вже зайнято', 'error'); loadCardRooms(); return; }
    db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(-bet));
    cgRoomId = roomId;
    db.ref('card_rooms/' + roomId).update({ guest: currentUser, status: 'playing' });
    // Якщо я зникну під час гри — суперник (єдиний, хто лишиться онлайн)
    // побачить статус 'abandoned' і поверне ставки обом (див. listenCardRoom).
    db.ref('card_rooms/' + roomId).onDisconnect().update({ status: 'abandoned', abandonedBy: currentUser });
    listenCardRoom(roomId);
    document.getElementById('cgOnlineLobby').classList.add('hidden');
    document.getElementById('cgGameScreen').classList.remove('hidden');
  });
}

function listenCardRoom(roomId) {
  if(cgListener) { try { db.ref('card_rooms/'+roomId).off('value', cgListener); } catch(e) { console.warn(e); } cgListener = null; }
  cgListener = db.ref('card_rooms/'+roomId).on('value', snap => {
    const r = snap.val(); if(!r) return;
    if(r.status === 'cancelled') {
      notify('❌ Кімнату скасовано', 'error');
      if(cgListener) { db.ref('card_rooms/'+roomId).off('value',cgListener); cgListener=null; }
      cgReset(); return;
    }
    if(r.status === 'playing' && r.guest) {
      document.getElementById('cgOnlineLobby')?.classList.add('hidden');
      document.getElementById('cgStartScreen')?.classList.add('hidden');
      document.getElementById('cgGameScreen')?.classList.remove('hidden');
      const isFirstSync = !cgState;
      cgIsHost = r.host === currentUser;
      cgOpponentName = cgIsHost ? r.guest : r.host;
      cgApplyRoomSnapshot(r);
      cgSelectedCards = [];
      if(isFirstSync) {
        cgLog('🃏 Гра з ' + cgOpponentName + ' почалась!');
        // Старт гри — попередній onDisconnect хоста ("скасувати кімнату")
        // вже не актуальний: тепер обидві ставки в грі, і зникнення будь-
        // кого з гравців має повертати ставки обом, а не забирати кімнату.
        db.ref('users/' + currentUser + '/balance').onDisconnect().cancel();
        db.ref('card_rooms/' + roomId).onDisconnect().update({ status: 'abandoned', abandonedBy: currentUser });
      }
      renderCgBoard();
    }
    if(r.status === 'abandoned') {
      db.ref('card_rooms/' + roomId + '/status').transaction(cur => cur === 'abandoned' ? 'finished' : undefined, (err, committed) => {
        if(err || !committed) return;
        db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(r.bet));
        if(r.abandonedBy && r.abandonedBy !== currentUser) db.ref('users/' + r.abandonedBy + '/balance').set(firebase.database.ServerValue.increment(r.bet));
        notify('Суперник відключився. Ставку повернено.', 'info');
        cgLog('🔌 Суперник вийшов з гри — ставки повернено.');
      });
      if(cgListener) { db.ref('card_rooms/'+roomId).off('value',cgListener); cgListener=null; }
      setTimeout(cgReset, 2500);
    }
    if(r.status === 'finished') {
      db.ref('card_rooms/' + roomId).onDisconnect().cancel();
      const isWin = r.winner === currentUser;
      const prize = Math.floor(r.bet * 1.85);
      if(isWin) {
        playSound('bonus');
        notify('🃏 Ви виграли! +'+formatNumber(prize)+'₴','success');
        cgLog('🏆 ВИ ВИГРАЛИ! +'+formatNumber(prize)+'₴');
        addToHistory('Карти PvP: +' + prize);
        addToWinFeed('Дурень PvP', prize - r.bet, (prize/r.bet).toFixed(1));
        trackLbStat('wins', prize);
      } else {
        playSound('loss');
        notify('😔 Програш у Дурня','error');
        cgLog('😔 Суперник переміг...');
        addToHistory('Карти PvP: -' + r.bet);
      }
      if(cgListener) { db.ref('card_rooms/'+roomId).off('value',cgListener); cgListener=null; }
      setTimeout(cgReset, 3000);
    }
  });
}




// ============================================================
// ===== СИСТЕМА ВАЛЮТ — РЕАЛЬНИЙ КУРС =====
// ============================================================

const CURRENCIES = {
  UAH: { code:'UAH', symbol:'₴',   flag:'🇺🇦', name:'Гривня',      decimals:0,    isCrypto:false },
  USD: { code:'USD', symbol:'$',   flag:'🇺🇸', name:'Долар США',   decimals:2,    isCrypto:false },
  EUR: { code:'EUR', symbol:'€',   flag:'🇪🇺', name:'Євро',         decimals:2,    isCrypto:false },
  PLN: { code:'PLN', symbol:'zł',  flag:'🇵🇱', name:'Злотий',       decimals:2,    isCrypto:false },
  GBP: { code:'GBP', symbol:'£',   flag:'🇬🇧', name:'Фунт стерл.', decimals:2,    isCrypto:false },
  BTC: { code:'BTC', symbol:'₿',   flag:'🟠', name:'Bitcoin',       decimals:8,    isCrypto:true  },
  ETH: { code:'ETH', symbol:'Ξ',   flag:'🔷', name:'Ethereum',      decimals:6,    isCrypto:true  },
  USDT:{ code:'USDT',symbol:'₮',   flag:'💚', name:'Tether USDT',   decimals:2,    isCrypto:true  },
  BNB: { code:'BNB', symbol:'BNB', flag:'🟡', name:'BNB',           decimals:4,    isCrypto:true  },
  SOL: { code:'SOL', symbol:'◎',   flag:'🟣', name:'Solana',        decimals:4,    isCrypto:true  },
};

// Rates: UAH → other currency (1 UAH = X currency)
// Populated by fetchRates()
let currencyRates   = { UAH:1 };
let currentCurrency = 'UAH';
let ratesLastFetch  = 0;
let ratesFetching   = false;

async function fetchRates() {
  if(ratesFetching) return;
  ratesFetching = true;
  try {
    // ---- Фіатні валюти (exchangerate-api, безкоштовний) ----
    const fiatRes = await fetch(
      'https://api.exchangerate-api.com/v4/latest/UAH',
      { signal: AbortSignal.timeout(8000) }
    );
    if(fiatRes.ok) {
      const fiatData = await fiatRes.json();
      const r = fiatData.rates;
      currencyRates.USD = r.USD || currencyRates.USD;
      currencyRates.EUR = r.EUR || currencyRates.EUR;
      currencyRates.PLN = r.PLN || currencyRates.PLN;
      currencyRates.GBP = r.GBP || currencyRates.GBP;
    }
  } catch(e) {
    // Fallback rates (approximate)
    currencyRates.USD = 0.024;
    currencyRates.EUR = 0.022;
    currencyRates.PLN = 0.098;
    currencyRates.GBP = 0.019;
    console.log('[Currency] Fiat API failed, using fallback rates');
  }

  try {
    // ---- Криптовалюти (CoinGecko, безкоштовний) ----
    const cryptoRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,binancecoin,solana&vs_currencies=uah',
      { signal: AbortSignal.timeout(8000) }
    );
    if(cryptoRes.ok) {
      const cd = await cryptoRes.json();
      // 1 UAH = 1/price BTC
      if(cd.bitcoin?.uah)    currencyRates.BTC  = 1 / cd.bitcoin.uah;
      if(cd.ethereum?.uah)   currencyRates.ETH  = 1 / cd.ethereum.uah;
      if(cd.tether?.uah)     currencyRates.USDT = 1 / cd.tether.uah;
      if(cd.binancecoin?.uah) currencyRates.BNB = 1 / cd.binancecoin.uah;
      if(cd.solana?.uah)     currencyRates.SOL  = 1 / cd.solana.uah;
    }
  } catch(e) {
    // Fallback crypto rates
    currencyRates.BTC  = 0.0000006;
    currencyRates.ETH  = 0.0000092;
    currencyRates.USDT = 0.024;
    currencyRates.BNB  = 0.000033;
    currencyRates.SOL  = 0.00026;
    console.log('[Currency] Crypto API failed, using fallback rates');
  }

  ratesLastFetch = Date.now();
  ratesFetching  = false;
  updateCurrencyDisplay();

  // Save rates to localStorage as cache
  try { localStorage.setItem('slotok_rates', JSON.stringify({ rates: currencyRates, ts: ratesLastFetch })); } catch(e) { console.warn(e); }
}

function loadCachedRates() {
  try {
    const cached = JSON.parse(localStorage.getItem('slotok_rates') || '{}');
    if(cached.rates && Date.now() - (cached.ts||0) < 3600000) {
      Object.assign(currencyRates, cached.rates);
      return true;
    }
  } catch(e) { console.warn(e); }
  return false;
}

function initCurrencySystem() {
  // Load saved currency preference
  currentCurrency = localStorage.getItem('slotok_currency') || 'UAH';
  // Load cached rates instantly
  loadCachedRates();
  // Then fetch fresh rates
  fetchRates();
  // Refresh every 5 min
  setInterval(() => { if(Date.now() - ratesLastFetch > 300000) fetchRates(); }, 60000);
}

// Convert UAH amount to display currency
function toDisplayCurrency(uahAmount) {
  const rate = currencyRates[currentCurrency] || 1;
  return uahAmount * rate;
}

// Format number in selected currency
function formatCurrency(uahAmount) {
  const cur = CURRENCIES[currentCurrency] || CURRENCIES.UAH;
  const val = toDisplayCurrency(uahAmount);
  let formatted;
  if(cur.isCrypto) {
    if(val >= 1)          formatted = val.toFixed(2);
    else if(val >= 0.001) formatted = val.toFixed(4);
    else if(val >= 0.000001) formatted = val.toFixed(6);
    else formatted = val.toExponential(3);
  } else {
    if(val >= 1e9)       formatted = (val/1e9).toFixed(2) + 'B';
    else if(val >= 1e6)  formatted = (val/1e6).toFixed(2) + 'M';
    else if(val >= 1000) formatted = val.toLocaleString('uk-UA', {minimumFractionDigits:0, maximumFractionDigits:cur.decimals});
    else                 formatted = val.toFixed(cur.decimals);
  }
  return cur.symbol + ' ' + formatted;
}

// Update all balance displays on the page
function updateCurrencyDisplay() {
  if(!userData || userData.balance === undefined) return;
  const balVal = formatCurrency(userData.balance);
  document.querySelectorAll('.bal').forEach(el => { el.textContent = balVal; });
  const curEl = document.getElementById('headerCurrencyCode');
  if(curEl) {
    const cur = CURRENCIES[currentCurrency] || CURRENCIES.UAH;
    curEl.textContent = cur.flag + ' ' + currentCurrency;
  }
  updateRateTicker();
  buildMiniRatesList();
  // Update settings currency name too
  const flagEl = document.getElementById('settingCurrencyFlag');
  const nameEl = document.getElementById('settingCurrencyName');
  if(flagEl) flagEl.textContent = (CURRENCIES[currentCurrency]||CURRENCIES.UAH).flag;
  if(nameEl) nameEl.textContent = (CURRENCIES[currentCurrency]||CURRENCIES.UAH).name + ' (' + currentCurrency + ')';
}

function updateRateTicker() {
  const headerLine = document.getElementById('currencyRateLine');
  const tickerInner = document.getElementById('rateTickerInner');

  const allCodes = ['USD','EUR','PLN','GBP','BTC','ETH','USDT','BNB','SOL'];
  const items = allCodes.map(code => {
    const cur = CURRENCIES[code]; if(!cur) return null;
    const rate = currencyRates[code]; if(!rate) return null;
    const uahPer1 = 1/rate;
    let rateStr;
    if(uahPer1 >= 10000)     rateStr = uahPer1.toLocaleString('uk-UA',{maximumFractionDigits:0});
    else if(uahPer1 >= 1)    rateStr = uahPer1.toLocaleString('uk-UA',{maximumFractionDigits:2});
    else                     rateStr = uahPer1.toFixed(6);
    return { flag:cur.flag, code, rateStr };
  }).filter(Boolean);

  if(headerLine) {
    headerLine.textContent = items.slice(0,4).map(i=>`${i.flag} ${i.code} = ${i.rateStr}₴`).join('  •  ');
  }

  if(tickerInner) {
    tickerInner.innerHTML = '<span style="color:var(--fg-4);font-size:10px;margin-right:8px;">📊</span>' +
      items.map(i =>
        `<span style="font-size:10px;color:#${i.code==='BTC'?'f7931a':i.code==='ETH'?'627eea':i.code.match(/USD|USDT/)?'26a17b':'aaa'};">` +
        `${i.flag} <b>${i.code}</b> = ${i.rateStr}₴</span>`
      ).join('<span style="color:var(--on-accent);margin:0 8px;">│</span>') +
      // Duplicate for seamless loop
      '<span style="color:var(--on-accent);margin:0 24px;">│</span>' +
      items.map(i =>
        `<span style="font-size:10px;color:#${i.code==='BTC'?'f7931a':i.code==='ETH'?'627eea':i.code.match(/USD|USDT/)?'26a17b':'aaa'};">` +
        `${i.flag} <b>${i.code}</b> = ${i.rateStr}₴</span>`
      ).join('<span style="color:var(--on-accent);margin:0 8px;">│</span>');
  }
}

function setCurrency(code) {
  if(!CURRENCIES[code]) return;
  currentCurrency = code;
  localStorage.setItem('slotok_currency', code);
  // Update selector UI
  document.querySelectorAll('.currency-btn').forEach(b => b.classList.toggle('active', b.dataset.code === code));
  updateCurrencyDisplay();
  notify(CURRENCIES[code].flag + ' Валюта: ' + CURRENCIES[code].name, 'info');
  // Close picker
  const picker = document.getElementById('currencyPickerModal');
  if(picker) picker.classList.add('hidden');
}

function openCurrencyPicker() {
  let modal = document.getElementById('currencyPickerModal');
  if(!modal) {
    modal = document.createElement('div');
    modal.id = 'currencyPickerModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgb(var(--recess-rgb) / calc(0.88 * var(--recess-k)));z-index:9000;display:flex;align-items:flex-end;';
    modal.innerHTML = `
      <div style="width:100%;background:var(--box);border-radius:var(--r-xl) var(--r-xl) 0 0;padding:0;max-height:90vh;overflow:hidden;box-shadow:0 -8px 40px rgb(var(--shade-rgb) / 0.8);box-sizing:border-box;">
        <!-- Header -->
        <div style="padding:20px 20px 0;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:20px;font-weight:900;color:var(--accent);">💱 Валюта</div>
            <div style="font-size:11px;color:var(--fg-4);margin-top:2px;">Баланс відображається у вибраній валюті</div>
          </div>
          <button onclick="document.getElementById('currencyPickerModal').classList.add('hidden')"
            style="width:36px;height:36px;border-radius:50%;background:var(--surface-2);border:1px solid var(--line);font-size:16px;color:var(--fg-3);cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>
        <!-- Content (scrollable) -->
        <div style="overflow-y:auto;max-height:calc(90vh - 80px);padding:16px 20px 30px;">
          <div style="font-size:10px;color:var(--fg-4);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;font-weight:bold;">💵 Фіатні валюти</div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;" id="fiatCurrencyGrid"></div>

          <div style="font-size:10px;color:var(--fg-4);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;font-weight:bold;">🪙 Криптовалюти</div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;" id="cryptoCurrencyGrid"></div>

          <!-- Live rates table -->
          <div style="background:var(--bg);border-radius:var(--r-lg);border:1px solid var(--line);overflow:hidden;">
            <div style="padding:12px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;">
              <div style="font-size:13px;font-weight:bold;">📊 Курс до гривні</div>
              <button onclick="fetchRates().then(()=>{buildRatesList();buildCurrencyGrid();})" style="background:var(--surface-2);border:1px solid var(--line);color:var(--fg-2);border-radius:var(--r-md);padding:4px 10px;font-size:11px;cursor:pointer;">🔄 Оновити</button>
            </div>
            <div id="ratesList" style="padding:4px 0;"></div>
            <div id="ratesTimestamp" style="font-size:10px;color:var(--fg-4);padding:6px 16px 10px;text-align:right;"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if(e.target===modal) modal.classList.add('hidden'); });
  }
  modal.classList.remove('hidden');
  buildCurrencyGrid();
  buildRatesList();
}

function buildCurrencyGrid() {
  const fiatGrid   = document.getElementById('fiatCurrencyGrid');
  const cryptoGrid = document.getElementById('cryptoCurrencyGrid');
  if(!fiatGrid || !cryptoGrid) return;
  fiatGrid.innerHTML = '';
  cryptoGrid.innerHTML = '';
  Object.values(CURRENCIES).forEach(cur => {
    const rate = currencyRates[cur.code];
    const uahRate = rate ? (1/rate) : null;
    let rateStr = '';
    if(uahRate && cur.code !== 'UAH') {
      if(uahRate >= 1) rateStr = (uahRate).toLocaleString('uk-UA',{maximumFractionDigits:2}) + '₴';
      else rateStr = uahRate.toFixed(4) + '₴';
    } else if(cur.code === 'UAH') rateStr = '1 ₴';
    const btn = document.createElement('div');
    btn.className = 'currency-btn' + (cur.code === currentCurrency ? ' active' : '');
    btn.dataset.code = cur.code;
    btn.style.cssText = 'padding:12px;background:var(--input);border:2px solid var(--border);border-radius:var(--r-lg);cursor:pointer;transition:all 0.15s;text-align:center;';
    btn.innerHTML =
      '<div style="font-size:22px;margin-bottom:4px;">' + cur.flag + '</div>' +
      '<div style="font-size:13px;font-weight:bold;">' + cur.symbol + ' ' + cur.code + '</div>' +
      '<div style="font-size:10px;color:var(--fg-3);margin-top:2px;">' + rateStr + '</div>';
    if(cur.code === currentCurrency) { btn.style.borderColor='var(--accent)'; btn.style.background='rgb(var(--accent-rgb) / 0.12)'; }
    btn.onclick = () => setCurrency(cur.code);
    (cur.isCrypto ? cryptoGrid : fiatGrid).appendChild(btn);
  });
}

function buildRatesList() {
  const list = document.getElementById('ratesList'); if(!list) return;
  const ts   = document.getElementById('ratesTimestamp');
  list.innerHTML = '';
  const cryptoColors = {BTC:'#f7931a',ETH:'#627eea',USDT:'#26a17b',BNB:'#f3ba2f',SOL:'#9945ff'};
  Object.values(CURRENCIES).filter(c=>c.code!=='UAH').forEach((cur, i) => {
    const rate = currencyRates[cur.code];
    if(!rate) return;
    const uahPer1 = 1/rate;
    let fmt;
    if(uahPer1 >= 10000)     fmt = uahPer1.toLocaleString('uk-UA',{maximumFractionDigits:0});
    else if(uahPer1 >= 1)    fmt = uahPer1.toLocaleString('uk-UA',{maximumFractionDigits:2});
    else                     fmt = uahPer1.toFixed(8);

    const accentColor = cryptoColors[cur.code] || 'var(--accent)';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 16px;' +
      (i%2===0 ? 'background:#0a0a0a;' : 'background:#080808;');
    row.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<span style="font-size:20px;">' + cur.flag + '</span>' +
        '<div><div style="font-size:13px;font-weight:bold;color:var(--fg-2);">1 ' + cur.code + '</div>' +
          '<div style="font-size:10px;color:var(--fg-4);">' + cur.name + '</div></div>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<div style="font-size:15px;font-weight:900;color:' + accentColor + ';">' + fmt + ' ₴</div>' +
        (cur.isCrypto ? '<div style="font-size:10px;color:var(--fg-4);">≈ ' + (uahPer1/42).toFixed(2) + ' $</div>' : '') +
      '</div>';
    list.appendChild(row);
  });
  if(ts && ratesLastFetch) ts.textContent = '🕒 Оновлено: ' + new Date(ratesLastFetch).toLocaleTimeString('uk-UA');
  else if(ts) ts.textContent = '⚠️ Використовуються приблизні курси';
}

// Override formatNumber to use currency system
window.formatNumber = function(num) {
  if(currentCurrency === 'UAH' || !currencyRates[currentCurrency]) {
    // Original formatting for UAH
    if(num >= 1e9) return (num/1e9).toFixed(1) + 'B';
    if(num >= 1e6) return (num/1e6).toFixed(1) + 'M';
    if(num >= 1000) return (num/1000).toFixed(1) + 'k';
    return Math.floor(num).toLocaleString();
  }
  return formatCurrency(num);
};



// ============================================================
// ===== CASHIER SUB-TABS =====
// ============================================================
function switchCashierTab(tab, el) {
  const rail = document.getElementById('cashierTabsRail');
  const btns = rail ? Array.from(rail.querySelectorAll('.ks-seg-btn')) : [];
  btns.forEach(b => b.classList.remove('is-active'));
  const activeBtn = el || btns.find(b => b.id === 'ctb-' + tab);
  if(activeBtn) {
    activeBtn.classList.add('is-active');
    // На вузьких екранах рейл скролиться — підтягуємо активний розділ у видиму
    // частину, інакше «Курси» лишаються за краєм і здаються недоступними
    if(activeBtn.scrollIntoView) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }
  ['card','deposit','cashback','markets'].forEach(t => {
    const p = document.getElementById('cashier-panel-' + t);
    if(p) p.classList.toggle('hidden', t !== tab);
  });
  if(tab === 'cashback') updateCashierCashbackUI();
  if(tab === 'markets')  buildMarketsPage();
  if(tab === 'card')     renderCardPanel();
  if(tab === 'deposit')  { loadMyDeposits(); selectDepMethod('mono', document.getElementById('depm-mono')); renderSourceBars(); }
}

function buildMarketsPage() {
  const fiatGrid   = document.getElementById('marketsMiniFiatGrid');
  const cryptoGrid = document.getElementById('marketsMinicryptoGrid');
  [fiatGrid, cryptoGrid].forEach(g => { if(g) g.innerHTML = ''; });

  Object.values(CURRENCIES).forEach(cur => {
    const rate = currencyRates[cur.code];
    const uahRate = rate ? (1/rate) : null;
    let rStr = cur.code === 'UAH' ? '₴1.00' : uahRate
      ? (uahRate >= 1 ? uahRate.toFixed(2)+'₴' : uahRate.toFixed(6)+'₴') : '...';
    const isActive = cur.code === currentCurrency;
    const btn = document.createElement('div');
    btn.className = 'currency-btn' + (isActive ? ' active' : '');
    btn.innerHTML = '<div style="font-size:17px;line-height:1.1;">' + cur.flag + '</div>' +
      '<div style="font-size:11px;font-weight:650;margin-top:3px;color:' + (isActive ? 'var(--ks-acc)' : 'var(--ks-fg-2)') + ';">' + cur.code + '</div>' +
      '<div class="ks-num" style="font-size:10px;color:var(--ks-fg-3);">' + rStr + '</div>';
    btn.onclick = () => { setCurrency(cur.code); buildMarketsPage(); };
    (cur.isCrypto ? cryptoGrid : fiatGrid)?.appendChild(btn);
  });

  buildMarketsRateTable();

  buildChartSelector();

  // Load default chart (BTC)
  if(!window._chartCurrency) window._chartCurrency = 'BTC';
  loadCurrencyChart(window._chartCurrency, window._chartPeriod || '7D');
}

function buildMarketsRateTable() {
  const tbl = document.getElementById('marketsRateTable');
  const ts  = document.getElementById('marketsRateTs');
  if(!tbl) return;
  tbl.innerHTML = '';
  const cryptoColors = {BTC:'#f7931a',ETH:'#627eea',USDT:'#26a17b',BNB:'#f3ba2f',SOL:'#9945ff'};
  Object.values(CURRENCIES).filter(c=>c.code!=='UAH').forEach((cur, i) => {
    const rate = currencyRates[cur.code]; if(!rate) return;
    const uahPer1 = 1/rate;
    const fmt = uahPer1 >= 10000 ? Math.round(uahPer1).toLocaleString('uk-UA')
      : uahPer1 >= 1 ? uahPer1.toFixed(2)
      : uahPer1.toFixed(6);
    const color = cryptoColors[cur.code] || 'var(--accent)';
    // Mock 24h change (in real life you'd store prev price)
    const change = ((Math.random()-0.48)*6).toFixed(2);
    const isUp = parseFloat(change) >= 0;
    const changeColor = isUp ? 'var(--green)' : 'var(--red)';
    const row = document.createElement('div');
    row.className = 'ks-row';
    row.innerHTML =
      '<div class="ks-icn" style="font-size:18px;">' + cur.flag + '</div>' +
      '<div class="ks-row-main">' +
        '<div class="ks-row-title">' + cur.code + '</div>' +
        '<div class="ks-row-sub">' + cur.name + '</div>' +
      '</div>' +
      '<div class="ks-row-value" style="color:' + color + ';">' + fmt + ' ₴' +
        '<small style="color:' + changeColor + ';">' + (isUp ? '+' : '−') + Math.abs(change) + '%</small>' +
      '</div>';
    tbl.appendChild(row);
  });
  if(ts && ratesLastFetch) ts.textContent = 'Оновлено ' + new Date(ratesLastFetch).toLocaleTimeString('uk-UA');
}

function buildChartSelector() {
  const el = document.getElementById('chartCurrencySelector'); if(!el) return;
  el.innerHTML = '';
  ['BTC','ETH','SOL','BNB','USD','EUR'].forEach(code => {
    const cur = CURRENCIES[code]; if(!cur) return;
    const active = (window._chartCurrency || 'BTC') === code;
    const btn = document.createElement('button');
    btn.className = 'ks-btn is-sm' + (active ? ' is-primary' : ' is-quiet');
    btn.textContent = cur.flag + ' ' + code;
    btn.onclick = () => {
      window._chartCurrency = code;
      buildChartSelector();
      loadCurrencyChart(code, window._chartPeriod || '7D');
    };
    el.appendChild(btn);
  });
}

function setChartPeriod(period, el) {
  window._chartPeriod = period;
  document.querySelectorAll('.chart-period-btn').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active');
  loadCurrencyChart(window._chartCurrency || 'BTC', period);
}

async function loadCurrencyChart(code, period='7D') {
  const canvas = document.getElementById('currencyChartCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const symbolEl = document.getElementById('chartSymbol');
  if(symbolEl) symbolEl.textContent = code + '/UAH';

  // Show loading
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#191c24'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#5e6675'; ctx.font = '13px -apple-system, Segoe UI, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Завантаження…', canvas.width/2, canvas.height/2);

  try {
    const coinIds = {BTC:'bitcoin',ETH:'ethereum',SOL:'solana',BNB:'binancecoin',USDT:'tether'};
    const days = {['1D']:1,['7D']:7,['30D']:30}[period] || 7;
    const isFiat = !coinIds[code];

    let pricesUAH = [];

    if(!isFiat && coinIds[code]) {
      const url = `https://api.coingecko.com/api/v3/coins/${coinIds[code]}/market_chart?vs_currency=uah&days=${days}`;
      const res = await fetch(url, {signal: AbortSignal.timeout(8000)});
      if(res.ok) {
        const data = await res.json();
        pricesUAH = (data.prices || []).map(([ts,p]) => ({ts, p}));
      }
    }

    // Fallback: generate realistic-looking synthetic data
    if(!pricesUAH.length) {
      const rate = currencyRates[code] ? (1/currencyRates[code]) : 1;
      const pts = 48;
      let p = rate;
      for(let i=0;i<pts;i++) {
        p *= 1 + (Math.random()-0.48)*0.03;
        pricesUAH.push({ts: Date.now() - (pts-i)*3600000*24/pts*days, p});
      }
    }

    drawCurrencyChart(ctx, canvas, pricesUAH, code);
  } catch(e) {
    console.warn('Chart load failed:', e);
    // Draw synthetic chart
    const rate = currencyRates[code] ? (1/currencyRates[code]) : 1;
    const pts = []; let p = rate;
    for(let i=0;i<50;i++) { p *= 1+(Math.random()-0.47)*0.025; pts.push({ts:i, p}); }
    drawCurrencyChart(ctx, canvas, pts, code);
  }
}

function drawCurrencyChart(ctx, canvas, data, code) {
  if(!data.length) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  ctx.fillStyle = '#191c24'; ctx.fillRect(0,0,W,H);

  const prices = data.map(d=>d.p);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const pad = {top:20, right:10, bottom:30, left:10};
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const toX = i => pad.left + (i/(data.length-1))*chartW;
  const toY = p => pad.top + chartH - ((p-minP)/range)*chartH;

  const cryptoColors = {BTC:'#f7931a',ETH:'#627eea',SOL:'#9945ff',BNB:'#f3ba2f',USDT:'#26a17b',USD:'#4a90e2',EUR:'#2ecc71'};
  const lineColor = cryptoColors[code] || '#7c8cff';

  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1;
  for(let i=0;i<=4;i++) {
    const y = pad.top + (i/4)*chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W-pad.right, y); ctx.stroke();
  }

  const grad = ctx.createLinearGradient(0, pad.top, 0, H-pad.bottom);
  grad.addColorStop(0, lineColor + '44');
  grad.addColorStop(1, lineColor + '00');
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(prices[0]));
  prices.forEach((p,i) => ctx.lineTo(toX(i), toY(p)));
  ctx.lineTo(toX(prices.length-1), H-pad.bottom);
  ctx.lineTo(toX(0), H-pad.bottom);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.strokeStyle = lineColor; ctx.lineWidth = 2.5;
  prices.forEach((p,i) => i===0 ? ctx.moveTo(toX(i),toY(p)) : ctx.lineTo(toX(i),toY(p)));
  ctx.stroke();

  const lastX = toX(prices.length-1), lastY = toY(prices[prices.length-1]);
  ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI*2);
  ctx.fillStyle = lineColor; ctx.fill();

  const fmt = p => p >= 1000 ? Math.round(p).toLocaleString('uk-UA') : p >= 1 ? p.toFixed(2) : p.toFixed(6);
  ctx.fillStyle = '#555'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText(fmt(maxP)+'₴', W-pad.right, pad.top+10);
  ctx.fillText(fmt(minP)+'₴', W-pad.right, H-pad.bottom-4);

  const lowEl = document.getElementById('chartLow');
  const highEl = document.getElementById('chartHigh');
  if(lowEl)  lowEl.textContent  = 'Min: '+fmt(minP)+'₴';
  if(highEl) highEl.textContent = 'Max: '+fmt(maxP)+'₴';
}

