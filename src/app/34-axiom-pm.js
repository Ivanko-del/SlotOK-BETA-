// ============================================================
// ===== SLOTOK ↔ AXIOM BANK INTEGRATION =====
// ============================================================

// Аксіома — окремий банк зі своєю базою й акаунтами (axioma-sdk.js).
// Гравець входить у свій акаунт Аксіоми прямо тут; після цього SlotOK
// бачить його основну картку (номер, баланс, скін) і може поповнювати гру
// з неї та виводити на неї. Картка Аксіоми більше не є карткою гаманця SlotOK.
function renderAxiomLinkCardBlock() { renderLinkedCards(); }

let _axAcc = null;  // стан картки Аксіоми з SDK; null — гравець не увійшов в Аксіому
function initAxioma() {
  if(typeof AxiomaSDK === 'undefined') return;
  try {
    const emu = location.hostname === 'localhost' && /[?&]emulator=1\b/.test(location.search);
    AxiomaSDK.init(emu ? { emulatorHost: '127.0.0.1' } : undefined);
    AxiomaSDK.onChange(acc => {
      _axAcc = acc;
      renderAxiomLinkContent();
      renderHomeAxiomWidget();
      updateAxiomTransferModal();
    });
  } catch(e) { console.error('AxiomaSDK:', e); }
}
function axLinked() { return !!(_axAcc && _axAcc.partners && _axAcc.partners.slotok); }

// Фон картки Аксіоми тим самим каталогом скінів, що й картки SlotOK.
function axCardBg(card) {
  if(card && card.skin === 'custom-photo' && /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(card.customPhotoUrl || ''))
    return 'linear-gradient(rgba(0,0,0,.3),rgba(0,0,0,.5)), center/cover no-repeat url("' + card.customPhotoUrl + '")';
  const s = card && CARD_SKINS.find(x => x.id === card.skin);
  return s ? s.prev : 'linear-gradient(135deg,#1b1650,#5b3aa8 55%,#c06bff)';
}

function renderAxiomLinkContent() {
  const el = document.getElementById('axiomLinkContent');
  if(!el) return;
  if(_axAcc && axLinked()) {
    const c = _axAcc.card;
    el.innerHTML =
      '<div style="border-radius:16px;padding:18px;margin-bottom:14px;color:#fff;background:' + escapeHtml(axCardBg(c)) + ';background-size:cover;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);aspect-ratio:1.586/1;display:flex;flex-direction:column;justify-content:space-between;text-shadow:0 1px 3px rgba(0,0,0,.6);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;"><b style="font-size:15px;">Аксіома</b><span style="font-size:11px;opacity:.8;">' + (c.frozen ? '🔒 Заблокована' : 'debit') + '</span></div>' +
        '<div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:18px;letter-spacing:2px;">•••• •••• •••• ' + escapeHtml(c.last4) + '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;"><span>' + escapeHtml(c.holder || _axAcc.nick) + '</span><span>' + escapeHtml(c.expiry) + '</span></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;">' +
        '<span style="font-size:12px;color:#777;">Баланс картки · @' + escapeHtml(_axAcc.nick) + '</span>' +
        '<b style="font-size:22px;color:#7c8eff;">₴' + formatNumber(c.balance) + '</b>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">' +
        '<button class="ks-btn is-primary" onclick="openAxiomTransfer(\'toCasino\')">🎰 Поповнити гру</button>' +
        '<button class="ks-btn" onclick="openAxiomTransfer(\'toAxiom\')">🏦 Вивести на картку</button>' +
      '</div>' +
      '<button class="ks-btn is-quiet is-block" onclick="axiomUnlink()">Відключити Аксіому</button>' +
      '<p style="font-size:11px;color:#5e6675;margin:12px 0 0;line-height:1.6;text-align:center;">Скін, блокування й денний ліміт картки налаштовуються в Аксіомі.</p>';
    return;
  }
  if(_axAcc) {
    el.innerHTML =
      '<p style="font-size:13px;color:#98a0af;line-height:1.6;margin:0 0 14px;">Ти увійшов в Аксіому як <b style="color:#eceff5;">@' + escapeHtml(_axAcc.nick) + '</b>, але SlotOK ще не підключено.</p>' +
      '<button class="ks-btn is-primary is-block" style="margin-bottom:8px;" onclick="axiomLinkNow()">Підключити до SlotOK</button>' +
      '<button class="ks-btn is-quiet is-block" onclick="axiomUnlink()">Вийти з Аксіоми</button>';
    return;
  }
  el.innerHTML =
    '<label class="ks-label" for="axLoginNick">Нік в Аксіомі</label>' +
    '<input id="axLoginNick" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + escapeHtml(currentUser || '') + '" style="margin-bottom:10px;">' +
    '<label class="ks-label" for="axLoginPass">Пароль Аксіоми</label>' +
    '<input id="axLoginPass" type="password" autocomplete="off" placeholder="••••••••" style="margin-bottom:6px;" onkeydown="if(event.key===\'Enter\')axiomLogin()">' +
    '<div id="axLoginErr" style="min-height:18px;font-size:12px;color:#f0556b;margin:4px 0 10px;"></div>' +
    '<button class="ks-btn is-primary is-block" id="axLoginBtn" onclick="axiomLogin()">🏦 Увійти й підключити</button>' +
    '<p style="font-size:11px;color:#5e6675;margin:14px 0 0;line-height:1.6;text-align:center;">Ще не заходив в Аксіому? Відкрий Аксіома Банк і увійди там ніком і паролем від SlotOK — рахунок створиться сам.</p>';
}

async function axiomLogin() {
  const nick = (document.getElementById('axLoginNick')?.value || '').trim();
  const pass = document.getElementById('axLoginPass')?.value || '';
  const err = document.getElementById('axLoginErr');
  const btn = document.getElementById('axLoginBtn');
  if(err) err.textContent = '';
  if(typeof AxiomaSDK === 'undefined') { if(err) err.textContent = 'Аксіома недоступна. Перезавантаж сторінку'; return; }
  if(btn) { btn.disabled = true; btn.textContent = 'Входимо…'; }
  try {
    await AxiomaSDK.login(nick, pass);
    await AxiomaSDK.link('slotok', currentUser);
    playSound('bonus');
    notify('🏦 Аксіома Банк підключено', 'success');
  } catch(e) {
    if(err) err.textContent = e.axioma ? e.message : 'Не вдалося увійти. Спробуй ще раз';
  } finally {
    if(btn && btn.isConnected) { btn.disabled = false; btn.textContent = '🏦 Увійти й підключити'; }
  }
}
async function axiomLinkNow() {
  try { await AxiomaSDK.link('slotok', currentUser); notify('🏦 Аксіома Банк підключено', 'success'); }
  catch(e) { notify('❌ ' + (e.axioma ? e.message : 'Не вдалося підключити'), 'error'); }
}
async function axiomUnlink() {
  try {
    if(axLinked()) await AxiomaSDK.unlink('slotok');
    await AxiomaSDK.logout();
    notify('Аксіому відключено від SlotOK', 'info');
  } catch(e) { notify('❌ Не вдалося відключити. Спробуй ще раз', 'error'); }
}

// Гравець переніс рахунок у нову Аксіому (вона прибрала за собою дані в нашій
// базі й поставила virtualCard.migratedToAxioma). Стару картку Аксіоми один раз
// прибираємо з гаманця SlotOK: її гроші зливаються в іншу картку, як при
// відключенні будь-якої картки, а коли інших нема — лишаються на балансі.
function retireMigratedAxiomCard() {
  const vc = userData && userData.virtualCard;
  if(!db || !currentUser || !vc || !vc.axiomLinked || !vc.migratedToAxioma) return;
  const activeId = getActiveCardId();
  const others = _rawCardIds().filter(x => x !== 'axiom');
  const remBal = activeId === 'axiom' ? 0 : (Number(vc.balance) || 0); // живий баланс активної вже в userData.balance
  const updates = { 'virtualCard/axiomLinked': false, 'virtualCard/balance': 0, 'virtualCard/frozen': false };
  if(activeId === 'axiom' && others.length) {
    updates['balance'] = _storedBalOf(others[0]) + (userData.balance || 0);
    updates['activeCardId'] = others[0];
  } else if(activeId === 'axiom') {
    updates['activeCardId'] = null;
  } else if(remBal) {
    updates['balance'] = (userData.balance || 0) + remBal;
  }
  userData.virtualCard.axiomLinked = false;
  db.ref('users/' + currentUser).update(updates);
}

// Перевірка реферала при старті
// Stub aliases for old cashier sub-tabs (backwards compat)
['ctab-deposit','ctab-rates','ctab-withdraw'].forEach(id => {
  if(!document.getElementById(id)) {
    const el = document.createElement('div');
    el.id = id; el.style.display = 'none';
    document.body.appendChild(el);
  }
});

// Seed changelog on first run (admin only)
function seedChangelogIfAdmin() {
  if(!isAdminUser()) return;
  db.ref('changelog').orderByChild('version').equalTo(CURRENT_VERSION).once('value', snap => {
    if(!snap.val()) {
      db.ref('changelog').push(BUILTIN_CHANGELOG[0]);
    }
  });
}

checkRefParam();
initTelegramLinkStatus();


  
// ═══════════════════════════════════════════════════════════
// ══════ CASINO v55: НОВІ ФУНКЦІЇ ══════
// ═══════════════════════════════════════════════════════════

// ── WIN EFFECTS ──
function triggerWinEffect(amount) {
  const overlay = document.getElementById('winEffectOverlay') ||
    (() => { const d=document.createElement('div'); d.id='winEffectOverlay'; document.body.appendChild(d); return d; })();
  overlay.innerHTML = '';
  const colors = ['#d4af37','#ffdb4d','#ff5050','#4cd964','#4a9eff','#ff69b4'];
  const count = amount >= 5000 ? 80 : amount >= 1000 ? 50 : 25;
  for(let i=0; i<count; i++){
    const p = document.createElement('div');
    p.className='confetti-piece';
    p.style.cssText = `left:${Math.random()*100}%;top:-10px;width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;background:${colors[Math.floor(Math.random()*colors.length)]};animation-delay:${Math.random()*1}s;animation-duration:${2+Math.random()}s;`;
    overlay.appendChild(p);
  }
  for(let i=0; i<6; i++){
    const coin = document.createElement('div');
    coin.className='coin-fly';
    coin.textContent='🪙';
    coin.style.cssText=`left:${20+Math.random()*60}%;bottom:80px;animation-delay:${i*0.15}s;`;
    overlay.appendChild(coin);
  }
  if(amount >= 2000) {
    const glow = document.createElement('div');
    glow.className='big-win-glow';
    document.body.appendChild(glow);
    setTimeout(()=>glow.remove(), 900);
  }
  setTimeout(()=>{ overlay.innerHTML=''; }, 4000);
}

function triggerWinReaction(amount, gameName) {
  if(amount < 500) return;
  triggerWinEffect(amount);
  if(amount > 0) db.ref('jackpot/amount').set(firebase.database.ServerValue.increment(Math.floor(amount*0.001)));
  if(amount >= 5000) {
    setTimeout(()=>{
      const shareBtn = document.createElement('button');
      shareBtn.textContent = '📣 Поділитись виграшем';
      shareBtn.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#d4af37,#b8941c);color:#000;border:none;border-radius:25px;padding:12px 24px;font-size:14px;font-weight:bold;cursor:pointer;z-index:8000;animation:fadeIn .3s;';
      shareBtn.onclick = () => { openShareWin(amount, gameName||'Гра', ''); shareBtn.remove(); };
      document.body.appendChild(shareBtn);
      setTimeout(()=>shareBtn.remove(), 6000);
    }, 1000);
  }
  const emoji = amount >= 5000 ? '🤑' : amount >= 2000 ? '💰' : '🔥';
  for(let i=0; i<3; i++){
    setTimeout(()=>{
      const el = document.createElement('div');
      el.className='win-reaction';
      el.textContent = emoji;
      el.style.cssText = `left:${30+Math.random()*40}%;bottom:${80+Math.random()*100}px;animation-delay:${i*0.2}s;`;
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), 2500);
    }, i*200);
  }
}

// ── BACCARAT ──
const BAC_DECK_VALS = {
  'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':0,'J':0,'Q':0,'K':0
};
const BAC_SUITS = ['♠','♥','♦','♣'];
const BAC_FACES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
let bacHistory = [];

function initBaccarat() {
  const bal = document.getElementById('bacBalance');
  if(bal && userData) bal.textContent = formatNumber(userData.balance||0) + ' ₴';
}

function bacDraw(deck) {
  return deck.splice(Math.floor(Math.random()*deck.length), 1)[0];
}
function bacScore(hand) {
  return hand.reduce((s,c) => (s + BAC_DECK_VALS[c.rank]) % 10, 0);
}
function bacCardHTML(c) {
  const isRed = isRedSuit(c.suit);
  return `<div class="bac-card${isRed?' red':''}">${c.rank}${c.suit}</div>`;
}

function playBaccarat(bet) {
  if(!currentUser || !userData) return notify('Увійди в акаунт', 'error');
  const betAmt = parseInt(document.getElementById('bacBet')?.value || 0);
  if(!betAmt || betAmt < 10) return notify('Мінімальна ставка 10₴', 'error');
  if(betAmt > (userData.balance||0)) return notify('Недостатньо коштів', 'error');

  let deck = shuffleDeck(createStandardDeck(BAC_FACES, BAC_SUITS));

  const player = [bacDraw(deck), bacDraw(deck)];
  const banker = [bacDraw(deck), bacDraw(deck)];

  let ps = bacScore(player), bs = bacScore(banker);

  const pNatural = ps >= 8, bNatural = bs >= 8;
  if(!pNatural && !bNatural) {
    if(ps <= 5) {
      const pc3 = bacDraw(deck); player.push(pc3);
      ps = bacScore(player);
      const pc3v = BAC_DECK_VALS[pc3.rank];
      if(bs <= 2) { banker.push(bacDraw(deck)); bs = bacScore(banker); }
      else if(bs === 3 && pc3v !== 8) { banker.push(bacDraw(deck)); bs = bacScore(banker); }
      else if(bs === 4 && [2,3,4,5,6,7].includes(pc3v)) { banker.push(bacDraw(deck)); bs = bacScore(banker); }
      else if(bs === 5 && [4,5,6,7].includes(pc3v)) { banker.push(bacDraw(deck)); bs = bacScore(banker); }
      else if(bs === 6 && [6,7].includes(pc3v)) { banker.push(bacDraw(deck)); bs = bacScore(banker); }
    } else if(bs <= 5) {
      banker.push(bacDraw(deck)); bs = bacScore(banker);
    }
  }

  const winner = ps > bs ? 'player' : bs > ps ? 'banker' : 'tie';
  const multipliers = {player:2, banker:1.95, tie:8};
  const won = bet === winner;
  const payout = won ? Math.floor(betAmt * multipliers[bet]) : 0;
  const net = payout - betAmt;

  document.getElementById('bacPlayerCards').innerHTML = player.map(bacCardHTML).join('');
  document.getElementById('bacBankerCards').innerHTML = banker.map(bacCardHTML).join('');
  document.getElementById('bacPlayerScore').textContent = ps;
  document.getElementById('bacBankerScore').textContent = bs;

  const labels = {player:'Гравець', banker:'Банкір', tie:'Нічия'};
  const resultEl = document.getElementById('bacResult');
  if(won) {
    resultEl.style.color = 'var(--green)';
    resultEl.textContent = `✅ ${labels[winner]} перемагає! +${formatNumber(net)}₴`;
    triggerWinReaction(payout, 'Бакара');
  } else {
    resultEl.style.color = 'var(--red)';
    resultEl.textContent = `❌ ${labels[winner]} перемагає. -${formatNumber(betAmt)}₴`;
  }

  const balChange = won ? net : -betAmt;
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(balChange));
  if(won) addToWinFeed('Бакара', payout, multipliers[bet]);
  addToHistory(won ? `Бакара: +${net}₴` : `Бакара: -${betAmt}₴`);

  bacHistory.unshift(winner);
  if(bacHistory.length > 12) bacHistory = bacHistory.slice(0,12);
  const colors3 = {player:'#4a9eff', banker:'#e74c3c', tie:'#4cd964'};
  document.getElementById('bacHistory').innerHTML =
    '<div style="display:flex;gap:5px;flex-wrap:wrap;">' +
    bacHistory.map(w=>`<div style="width:22px;height:22px;border-radius:50%;background:${colors3[w]};font-size:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;">${w[0].toUpperCase()}</div>`).join('') +
    '</div>';
}

// ── VIDEO POKER ──
const VP_SUITS = ['♠','♥','♦','♣'];
const VP_RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
let vpHand = [], vpHeld = [], vpDealt = false;

function initVideoPoker() {
  const bal = document.getElementById('vpBalance');
  if(bal && userData) bal.textContent = formatNumber(userData.balance||0) + ' ₴';
  vpHand = []; vpHeld = []; vpDealt = false;
  document.getElementById('vpHand').innerHTML = '';
  document.getElementById('vpResult').textContent = '';
  document.getElementById('vpDealArea').classList.remove('hidden');
  document.getElementById('vpDrawArea').classList.add('hidden');
}

function vpBuildDeck() {
  return shuffleDeck(createStandardDeck(VP_RANKS, VP_SUITS));
}

function vpRenderHand() {
  const el = document.getElementById('vpHand');
  el.innerHTML = vpHand.map((card,i) => {
    const isRed = isRedSuit(card.suit);
    const held = vpHeld[i];
    return `<div class="vp-card${isRed?' red':''}${held?' held':''}" onclick="vpToggleHold(${i})">${card.rank}<br>${card.suit}</div>`;
  }).join('');
}

function vpToggleHold(i) {
  if(!vpDealt) return;
  vpHeld[i] = !vpHeld[i];
  vpRenderHand();
}

function vpDeal() {
  if(!currentUser || !userData) return notify('Увійди в акаунт', 'error');
  const bet = parseInt(document.getElementById('vpBet')?.value||0);
  if(!bet || bet < 10) return notify('Мінімальна ставка 10₴', 'error');
  if(bet > (userData.balance||0)) return notify('Недостатньо коштів', 'error');
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  const deck = vpBuildDeck();
  vpHand = deck.splice(0,5);
  vpHeld = [false,false,false,false,false];
  vpDealt = true;
  vpRenderHand();
  document.getElementById('vpResult').textContent = 'Вибери карти для утримання';
  document.getElementById('vpDealArea').classList.add('hidden');
  document.getElementById('vpDrawArea').classList.remove('hidden');
  window._vpBet = bet;
  window._vpDeck = deck;
}

function vpDraw() {
  const deck = window._vpDeck;
  const bet = window._vpBet;
  for(let i=0;i<5;i++){
    if(!vpHeld[i]) vpHand[i] = deck.pop();
  }
  vpDealt = false;
  vpRenderHand();
  const result = vpEvaluate(vpHand);
  const multipliers = { 'Роял Флеш':800,'Стрейт Флеш':50,'Каре':25,'Фул Хаус':9,'Флеш':6,'Стрейт':4,'Сет':3,'Дві пари':2,'Пара Валетів+':1 };
  const mult = multipliers[result] || 0;
  const win = mult ? Math.floor(bet * mult) : 0;
  const el = document.getElementById('vpResult');
  if(win) {
    el.textContent = `✅ ${result}! +${formatNumber(win)}₴`;
    el.style.color = 'var(--green)';
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
    triggerWinReaction(win, 'Відео Покер');
    addToWinFeed('Відео Покер', win, mult);
  } else {
    el.textContent = result ? result : '❌ Немає комбінації';
    el.style.color = 'var(--red)';
  }
  addToHistory(win ? `Відео Покер: +${win}₴` : `Відео Покер: -${bet}₴`);
  document.getElementById('vpDrawArea').classList.add('hidden');
  document.getElementById('vpDealArea').classList.remove('hidden');
  const balEl = document.getElementById('vpBalance');
  if(balEl && userData) setTimeout(()=>{ balEl.textContent = formatNumber(userData.balance||0)+' ₴'; }, 400);
}

function vpEvaluate(hand) {
  const ranks = hand.map(c=>VP_RANKS.indexOf(c.rank)).sort((a,b)=>a-b);
  const suits = hand.map(c=>c.suit);
  const counts = {};
  ranks.forEach(r=>counts[r]=(counts[r]||0)+1);
  const vals = Object.values(counts).sort((a,b)=>b-a);
  const isFlush = suits.every(s=>s===suits[0]);
  const isStraight = ranks[4]-ranks[0]===4 && new Set(ranks).size===5;
  const isRoyalStraight = JSON.stringify(ranks)==='[8,9,10,11,12]';
  if(isFlush && isRoyalStraight) return 'Роял Флеш';
  if(isFlush && isStraight) return 'Стрейт Флеш';
  if(vals[0]===4) return 'Каре';
  if(vals[0]===3 && vals[1]===2) return 'Фул Хаус';
  if(isFlush) return 'Флеш';
  if(isStraight) return 'Стрейт';
  if(vals[0]===3) return 'Сет';
  if(vals[0]===2 && vals[1]===2) return 'Дві пари';
  if(vals[0]===2) {
    const pairRank = parseInt(Object.keys(counts).find(k=>counts[k]===2));
    if(pairRank >= VP_RANKS.indexOf('J')) return 'Пара Валетів+';
  }
  return '';
}

// ── PRIVATE MESSAGES ──
function renderPmInbox() {
  const el = document.getElementById('pmInbox');
  if(!el || !currentUser) return;
  el.innerHTML = '<div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-weight:700;">Вхідні</div>';
  // Wider window than the original 20 — with only 20, a busy conversation
  // could push an entire OTHER conversation's last message out of the
  // fetched set, making that thread silently vanish from the inbox even
  // though real unread history still exists for it. 150 fixed that but
  // noticeably slowed the inbox down to load — 60 is the middle ground.
  Promise.all([
    db.ref('pm/'+currentUser).limitToLast(60).once('value'),
    db.ref('users/'+currentUser+'/pmLastRead').once('value'),
  ]).then(([snap, lastReadSnap]) => {
    const data = snap.val() || {};
    const lastRead = lastReadSnap.val() || {};
    const threads = {};
    Object.values(data).forEach(m => {
      const other = m.from === currentUser ? m.to : m.from;
      if(!threads[other] || threads[other].ts < m.ts) threads[other] = m;
    });
    const list = Object.entries(threads).sort((a,b)=>b[1].ts-a[1].ts);
    if(!list.length) { el.innerHTML += '<div style="color:#555;font-size:13px;padding:10px;">Немає повідомлень. Напиши першим!</div>'; return; }
    list.forEach(([name, msg]) => {
      const div = document.createElement('div');
      div.className = 'pm-thread';
      div.setAttribute('data-nick', name.toLowerCase());
      const previewText = msg.imgUrl ? '📷 Фото' : escapeHtml(msg.text || '');
      const isUnread = msg.from !== currentUser && msg.ts > (lastRead[name] || 0);
      div.innerHTML = `<div class="pm-avatar" onclick="event.stopPropagation();openPublicProfile('${name}')" title="Профіль ${escapeHtml(name)}">${escapeHtml(name[0].toUpperCase())}</div>
        <div style="flex:1;min-width:0;"><div style="font-weight:bold;font-size:13px;${isUnread?'color:#4a9eff;':''}">${escapeHtml(name)}${isUnread?' <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#4a9eff;margin-left:4px;"></span>':''}</div>
          <div style="font-size:11px;color:${isUnread?'#aaa':'#555'};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;${isUnread?'font-weight:600;':''}">${previewText}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
          <div style="font-size:10px;color:#444;">${new Date(msg.ts).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'})}</div>
          <button onclick="event.stopPropagation();deletePmThread('${name}')" style="background:none;border:none;color:#333;font-size:13px;cursor:pointer;padding:2px;line-height:1;" title="Видалити переписку">🗑</button>
        </div>`;
      div.onclick = () => openPmThread(name);
      el.appendChild(div);
    });
  });
}

// "Видалення" тут — прибирає переписку тільки з ВЛАСНОГО інбоксу (як у
// більшості месенджерів): чистить лише вузли під pm/<currentUser>, тому
// співрозмовник і далі бачить свою копію листування.
function deletePmThread(otherUser) {
  if(!currentUser) return;
  if(!confirm('Видалити переписку з '+otherUser+'? Це приховає її лише у тебе.')) return;
  db.ref('pm/'+currentUser).orderByChild('ts').once('value', snap => {
    const updates = {};
    snap.forEach(child => {
      const m = child.val();
      if((m.from===currentUser&&m.to===otherUser)||(m.from===otherUser&&m.to===currentUser)) {
        updates[child.key] = null;
      }
    });
    db.ref('pm/'+currentUser).update(updates).then(() => {
      notify('🗑 Переписку видалено', 'info');
      renderPmInbox();
    });
  });
}

// ── Пошук отримувача при наборі (нік або ID) ──────────────────
let _pmSearchDebounce = null;
function pmSearchRecipient(query) {
  clearTimeout(_pmSearchDebounce);
  const box = document.getElementById('pmRecipientSuggestions');
  if(!box) return;
  query = (query || '').trim();
  if(query.length < 2) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:#555;">\ud83d\udd0d \u041f\u043e\u0448\u0443\u043a...</div>';
  _pmSearchDebounce = setTimeout(() => {
    const isNumeric = /^\d+$/.test(query);
    const render = (results) => {
      if(!results.length) {
        box.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:#555;">\u041d\u0456\u043a\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e</div>';
        return;
      }
      box.innerHTML = results.slice(0, 8).map(nick => `
        <div onclick="document.getElementById('pmToInput').value='${nick}';document.getElementById('pmRecipientSuggestions').classList.add('hidden');document.getElementById('pmMsgInput').focus();" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px;display:flex;align-items:center;gap:8px;">
          <span style="width:26px;height:26px;border-radius:50%;background:rgba(74,158,255,.15);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#4a9eff;">${nick[0].toUpperCase()}</span>
          ${nick}
        </div>`).join('');
    };
    if(isNumeric) {
      db.ref('users').orderByChild('id').equalTo(parseInt(query)).limitToFirst(5).once('value').then(snap => {
        const results = [];
        Object.keys(snap.val() || {}).forEach(n => { if(n !== currentUser) results.push(n); });
        render(results);
      });
    } else {
      // Firebase key search is case-SENSITIVE (plain byte-range), but
      // nicknames keep whatever case the player registered with \u2014 so a
      // single lowercased query used to miss every correctly-typed,
      // capitalized name entirely. Run both the as-typed and the
      // lowercased prefix range in parallel and merge \u2014 covers an exact
      // case-correct guess as well as the common all-lowercase nick.
      const qLower = query.toLowerCase();
      const variants = qLower === query ? [query] : [query, qLower];
      Promise.all(variants.map(v =>
        db.ref('users').orderByKey().startAt(v).endAt(v + '\uf8ff').limitToFirst(8).once('value')
      )).then(snaps => {
        const seen = new Set();
        const results = [];
        snaps.forEach(snap => {
          Object.keys(snap.val() || {}).forEach(n => {
            if(n !== currentUser && !seen.has(n)) { seen.add(n); results.push(n); }
          });
        });
        render(results);
      });
    }
  }, 200);
}

// ── Фільтр списку вхідних за ніком або ID ──────────────────────
let _pmInboxIdCache = {};
function filterPmInbox(query) {
  query = (query || '').trim().toLowerCase();
  const threads = document.querySelectorAll('#pmInbox .pm-thread');
  if(!query) { threads.forEach(t => t.style.display = 'flex'); return; }

  if(/^\d+$/.test(query)) {
    // Пошук за ID — резолвимо в нік через Firebase, потім фільтруємо
    db.ref('users').orderByChild('id').equalTo(parseInt(query)).limitToFirst(1).once('value').then(snap => {
      const matchNick = Object.keys(snap.val() || {})[0];
      threads.forEach(t => {
        t.style.display = (matchNick && t.getAttribute('data-nick') === matchNick.toLowerCase()) ? 'flex' : 'none';
      });
    });
    return;
  }
  threads.forEach(t => {
    const nick = t.getAttribute('data-nick') || '';
    t.style.display = nick.includes(query) ? 'flex' : 'none';
  });
}

function pmSend() {
  const to = document.getElementById('pmToInput')?.value?.trim();
  const msgEl = document.getElementById('pmMsgInput');
  const text = msgEl?.value?.trim();
  if(!to || !text) return notify('Заповни отримувача і текст', 'error');
  if(to === currentUser) return notify('Не можна писати собі', 'error');
  db.ref('users/'+to).once('value', snap => {
    if(!snap.exists()) return notify('Гравця не знайдено', 'error');
    const msg = { from:currentUser, to, text, ts:Date.now() };
    db.ref('pm/'+currentUser).push(msg);
    const toRef = db.ref('pm/'+to).push(msg);
    db.ref('users/'+to+'/pmUnread').set(firebase.database.ServerValue.increment(1));
    db.ref('users/'+currentUser+'/pmSent').set(firebase.database.ServerValue.increment(1));
    // Передаємо id повідомлення (не сам текст!) — сервер сам підтягне текст із
    // Firebase за цим id, щоб у Telegram-боті одразу було видно зміст ПП.
    notifyBot('player-ping', null, { to, kind: 'pm', ref: { id: toRef.key } });
    if(msgEl) msgEl.value = '';
    notify('✉️ Надіслано!', 'success');
    renderPmInbox();
  });
}

function openPmThread(otherUser) {
  const inboxView = document.getElementById('pmInboxView');
  const threadView = document.getElementById('pmThreadView');
  if(!threadView) return;
  // Перемикаємо ВИДИМІСТЬ, а не знищуємо розмітку — інбокс лишається цілим
  if(inboxView) inboxView.classList.add('hidden');
  threadView.classList.remove('hidden');

  // Позначаємо цю переписку прочитаною — без цього в інбоксі назавжди
  // лишався б непрочитаний індикатор навіть після відкриття чату.
  if(currentUser) db.ref('users/'+currentUser+'/pmLastRead/'+otherUser).set(Date.now());

  threadView.innerHTML = `
    <div style="background:linear-gradient(135deg,#0a0d14,#0d1320);border-bottom:1px solid rgba(74,158,255,.15);padding:12px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <button class="btn-outline" onclick="closePmThread()" style="width:40px;padding:8px;margin:0;font-size:14px;">⬅</button>
      <div onclick="openPublicProfile(${jsArg(otherUser)})" style="display:flex;align-items:center;gap:10px;cursor:pointer;min-width:0;flex:1;">
        <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#1a2040,#2a3060);border:2px solid rgba(74,158,255,.3);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#4a9eff;flex-shrink:0;">${escapeHtml(otherUser[0].toUpperCase())}</div>
        <div style="min-width:0;">
          <div style="font-weight:800;font-size:14px;">${escapeHtml(otherUser)}</div>
          <div id="pmThreadStatus" style="font-size:10px;color:#555;">● ...</div>
        </div>
      </div>
    </div>
    <div id="pmThreadMessages" style="flex:1;overflow-y:auto;padding:12px 14px;background:#050505;min-height:0;"></div>
    <div id="pmImgPreview" style="display:none;padding:6px 14px;background:#0a0a0a;border-top:1px solid #111;flex-shrink:0;">
      <div style="position:relative;display:inline-block;max-width:90px;">
        <img id="pmImgPreviewImg" style="max-height:60px;max-width:90px;border-radius:8px;display:block;object-fit:cover;">
        <div onclick="clearPmImg()" style="position:absolute;top:-6px;right:-6px;background:#e74c3c;color:#fff;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;line-height:1;">×</div>
      </div>
    </div>
    <div style="background:#0a0a0a;border-top:1px solid #1a1a1a;padding:8px 12px calc(8px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:8px;flex-shrink:0;">
      <button onclick="document.getElementById('pmImgInput').click()" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:9px 11px;font-size:17px;cursor:pointer;width:auto;flex-shrink:0;line-height:1;">📎</button>
      <input type="file" id="pmImgInput" accept="image/*,.gif" style="display:none;" onchange="handlePmImage(this,'${otherUser}')">
      <input id="pmReplyInput" placeholder="Повідомлення..." style="flex:1;min-width:0;margin:0;text-align:left;" onkeydown="if(event.key==='Enter')pmReply('${otherUser}')">
      <button onclick="pmReply(${jsArg(otherUser)})" style="background:linear-gradient(135deg,#4a9eff,#2a6eff);border:none;border-radius:10px;padding:10px 14px;color:#fff;font-weight:800;cursor:pointer;font-size:15px;width:auto;flex-shrink:0;line-height:1;">➤</button>
    </div>`;

  // Реальний онлайн-статус замість того, що раніше було намертво
  // прописано "● Онлайн" незалежно від того, чи людина справді в мережі.
  if(_pmThreadPresenceListener) db.ref('online/'+_pmThreadPresenceUser).off('value', _pmThreadPresenceListener);
  _pmThreadPresenceUser = otherUser;
  _pmThreadPresenceListener = db.ref('online/'+otherUser).on('value', snap => {
    const el = document.getElementById('pmThreadStatus');
    if(!el) return;
    const isOnline = !!snap.val();
    el.style.color = isOnline ? '#3dd68c' : '#555';
    el.textContent = isOnline ? '● Онлайн' : '○ Офлайн';
  });

  // Listen for messages — ширше вікно, ніж було (50), щоб активне
  // листування з іншими людьми не витісняло історію ЦІЄЇ переписки з
  // вибірки (плаский pm/<user> список спільний для всіх діалогів разом).
  // 300 усунуло це повністю, але помітно сповільнило відкриття чату —
  // 120 лишається набагато безпечнішим за оригінал, не жертвуючи швидкістю.
  if(_pmThreadListener) db.ref('pm/'+currentUser).off('value', _pmThreadListener);
  _pmThreadListener = db.ref('pm/'+currentUser).orderByChild('ts').limitToLast(120).on('value', snap => {
    const el = document.getElementById('pmThreadMessages');
    if(!el) return;
    const msgs = Object.values(snap.val()||{})
      .filter(m=>(m.from===currentUser&&m.to===otherUser)||(m.from===otherUser&&m.to===currentUser))
      .sort((a,b)=>a.ts-b.ts);
    el.innerHTML = msgs.map(m => {
      const isMe = m.from === currentUser;
      const timeStr = new Date(m.ts).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
      // m.imgUrl прилітає з бази — перевіряємо, що це справді http(s) URL
      // (а не, наприклад, "javascript:..."), перед вставкою в src/onclick,
      // і так само екрануємо, як m.text нижче.
      const isValidPmImgUrl = typeof m.imgUrl === 'string' && /^https?:\/\//i.test(m.imgUrl);
      const safePmImgUrl = isValidPmImgUrl ? escapeHtml(m.imgUrl) : '';
      const contentHtml = m.imgUrl
        ? (isValidPmImgUrl
            ? `<img src="${safePmImgUrl}" style="max-width:200px;max-height:180px;border-radius:10px;display:block;margin-bottom:4px;cursor:pointer;" onclick="window.open('${safePmImgUrl}','_blank')">`
            : `<div style="font-size:12px;color:#777;">⚠️ Недійсне зображення</div>`)
        : `<div style="font-size:14px;line-height:1.4;white-space:pre-wrap;word-break:break-word;">${escapeHtml(m.text||'')}</div>`;
      return `<div style="display:flex;flex-direction:${isMe?'row-reverse':'row'};gap:8px;margin-bottom:8px;animation:slideUp .2s ease;">
        <div style="width:28px;height:28px;border-radius:50%;background:${isMe?'rgba(212,175,55,.2)':'rgba(74,158,255,.2)'};border:1.5px solid ${isMe?'rgba(212,175,55,.3)':'rgba(74,158,255,.3)'};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;flex-shrink:0;">${m.from[0].toUpperCase()}</div>
        <div style="max-width:72%;background:${isMe?'rgba(212,175,55,.08)':'rgba(255,255,255,.05)'};border:1px solid ${isMe?'rgba(212,175,55,.15)':'rgba(255,255,255,.07)'};border-radius:${isMe?'12px 4px 12px 12px':'4px 12px 12px 12px'};padding:8px 10px;">
          ${contentHtml}
          <div style="font-size:9px;color:#333;margin-top:3px;text-align:${isMe?'right':'left'};">${timeStr}</div>
        </div>
      </div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
    // Нові повідомлення надійшли, поки чат уже відкритий — теж позначаємо
    // прочитаними одразу, а не лише при першому відкритті.
    if(currentUser) db.ref('users/'+currentUser+'/pmLastRead/'+otherUser).set(Date.now());
  });
}
let _pmThreadPresenceListener = null;
let _pmThreadPresenceUser = null;

let _pmThreadListener = null;

function closePmThread() {
  if(_pmThreadListener) { db.ref('pm/'+currentUser).off('value', _pmThreadListener); _pmThreadListener = null; }
  if(_pmThreadPresenceListener) { db.ref('online/'+_pmThreadPresenceUser).off('value', _pmThreadPresenceListener); _pmThreadPresenceListener = null; _pmThreadPresenceUser = null; }
  const inboxView = document.getElementById('pmInboxView');
  const threadView = document.getElementById('pmThreadView');
  if(threadView) { threadView.classList.add('hidden'); threadView.innerHTML = ''; }
  if(inboxView) inboxView.classList.remove('hidden');
  renderPmInbox(); // освіжити список — статуси прочитання могли змінитись
}

function handlePmImage(input, toUser) {
  const file = input.files[0];
  if(!file) return;
  if(file.size > 4*1024*1024) { notify('Файл занадто великий','error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('pmImgPreview');
    const img = document.getElementById('pmImgPreviewImg');
    if(preview) preview.style.display = 'block';
    if(img) { img.src = e.target.result; img.dataset.src = e.target.result; }
  };
  reader.readAsDataURL(file);
}

function clearPmImg() {
  const preview = document.getElementById('pmImgPreview');
  if(preview) preview.style.display = 'none';
  const input = document.getElementById('pmImgInput');
  if(input) input.value = '';
}

// renderPmInboxFull() — прибрано, замінено на closePmThread() яка просто
// перемикає видимість підекранів, не знищуючи розмітку інбоксу

function pmReply(to) {
  const text = (document.getElementById('pmReplyInput')?.value||'').trim();
  const imgEl = document.getElementById('pmImgPreviewImg');
  const imgSrc = imgEl ? imgEl.dataset.src || imgEl.src : null;
  const hasImg = imgSrc && imgSrc.startsWith('data:');
  if(!text && !hasImg) return;
  const msg = { from:currentUser, to, text: text||'', ts:Date.now() };
  if(hasImg) msg.imgUrl = imgSrc;
  db.ref('pm/'+currentUser).push(msg);
  const toRef = db.ref('pm/'+to).push(msg);
  notifyBot('player-ping', null, { to, kind: 'pm', ref: { id: toRef.key } });
  db.ref('users/'+to+'/pmUnread').set(firebase.database.ServerValue.increment(1));
  db.ref('users/'+currentUser+'/pmSent').set(firebase.database.ServerValue.increment(1));
  const inp = document.getElementById('pmReplyInput');
  if(inp) inp.value = '';
  clearPmImg();
}

// ── THEME GRID ──
function renderThemeGrid() {
  const el = document.getElementById('themeGrid');
  if(!el) return;
  const current = localStorage.getItem('slotok_theme') || 'dark';
  el.innerHTML = Object.entries(THEMES).map(([id,t]) => `
    <div onclick="applyThemeVars('${id}');localStorage.setItem('slotok_theme','${id}');renderThemeGrid();"
      style="padding:16px;border-radius:14px;border:2px solid ${id===current?'var(--accent)':'#333'};background:${t.box};cursor:pointer;text-align:center;transition:.2s;">
      <div style="font-size:28px;margin-bottom:6px;">${t.emoji}</div>
      <div style="font-size:12px;font-weight:700;color:${t.text};">${t.label}</div>
      ${id===current?'<div style="font-size:10px;color:var(--green);margin-top:4px;">✅ Активна</div>':''}
    </div>`).join('');
}

// ── LOGIN STREAK EXTENDED: 7d = x2, 30d = skin ──
function checkStreakBonus(streak) {
  if(streak === 7) {
    notify('🔥 7 днів поспіль! Бонус x2 збільшено!', 'success');
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(500));
  }
  if(streak === 30) {
    notify('🌟 30 днів поспіль! Скін картки "Titanium" застосовано!', 'success');
    applyCardSkin('titanium');
  }
}

// ── ACTIVITY FEED (enhanced) ──
function renderActivityFeed() {
  const el = document.getElementById('activityFeed');
  if(!el) return;
  db.ref('win_feed').orderByChild('time').limitToLast(8).on('value', snap => {
    const data = snap.val() || {};
    const items = Object.values(data).sort((a,b)=>b.time-a.time);
    el.innerHTML = items.map(item => `
      <div class="feed-item">
        <div style="font-size:20px;">🎰</div>
        <div style="flex:1;"><b style="color:var(--accent);">${escapeHtml(item.user)}</b> виграв <b style="color:var(--green);">+₴${formatNumber(item.amount)}</b> у ${escapeHtml(item.game||'')}</div>
        <div style="font-size:10px;color:#444;">${getRelativeTime(item.time)}</div>
      </div>`).join('') || '<div style="color:#555;font-size:12px;text-align:center;padding:12px;">Поки немає великих виграшів</div>';
  });
}

function getRelativeTime(ts) {
  const diff = Date.now() - ts;
  if(diff < 60000) return 'щойно';
  if(diff < 3600000) return Math.floor(diff/60000) + 'хв';
  if(diff < 86400000) return Math.floor(diff/3600000) + 'год';
  return Math.floor(diff/86400000) + 'д';
}


// ══════════════════════════════════════════
// ❓ ІНСТРУКЦІЇ ДО ІГОР
// ══════════════════════════════════════════
const GAME_HELP = {
  chess: {
    title: '♟️ Шахи',
    rules: `<b>Мета:</b> Постав мат королю суперника.<br><br>
      <b>Режими:</b><br>
      🤖 <b>Проти AI</b> — обери складність (легко ×1.8, середньо ×3, важко ×5). Виграєш ставку × множник за мат AI.<br>
      👥 <b>Проти гравця</b> — створи кімнату або приєднайся до чужої. Переможець забирає банк мінус 5% комісії.<br><br>
      <b>Керування:</b> тапни на свою фігуру щоб побачити доступні ходи (зелені крапки), тапни на клітинку призначення щоб зробити хід.<br><br>
      <b>Особливі ходи підтримуються:</b> рокіровка, взяття на проході, перетворення пішака.<br><br>
      <b>Нічия (пат):</b> ставка повертається повністю.`
  },
  slots: {
    title: '🎰 Слоти',
    rules: `<b>Мета:</b> Отримай три однакові символи в ряд.<br><br>
      <b>Як грати:</b><br>
      1. Встанови ставку<br>
      2. Натисни "КРУТИТИ"<br>
      3. Три барабани зупиняться — якщо збіглись, ти виграв!<br><br>
      <b>Виплати:</b><br>
      💎💎💎 — x50 (джекпот!)<br>
      7️⃣7️⃣7️⃣ — x20<br>
      🍒🍒🍒 — x5<br>
      🍋🍋🍋 — x3<br>
      Два однакових — x1.5 (повернення)<br><br>
      <b>RTP:</b> ~95%`
  },
  diamond: {
    title: '💎 Diamond Rush',
    rules: `<b>Мета:</b> Отримай три однакові символи в ряд — окрема тема й таблиця виплат, без бонус-раундів і фріспінів.<br><br>
      <b>Як грати:</b><br>
      1. Встанови ставку<br>
      2. Натисни "КРУТИТИ"<br>
      3. Три барабани зупиняться — якщо збіглись, ти виграв!<br><br>
      <b>Виплати:</b><br>
      🎩🎩🎩 — x45 (джекпот!)<br>
      👑👑👑 — x15<br>
      💍💍💍 — x6<br>
      🔷🔷🔷 — x2.5<br>
      ✨✨🥂 — x1.3<br><br>
      <b>RTP:</b> ~93%`
  },
  crash: {
    title: '🚀 Краш',
    rules: `<b>Мета:</b> Вивести кошти до того, як ракета "крашнеться".<br><br>
      <b>Як грати:</b><br>
      1. Зроби ставку до початку раунду<br>
      2. Множник починає рости від x1.00<br>
      3. Натисни "ВИВЕСТИ" в будь-який момент<br>
      4. Якщо не встиг — ставка програна!<br><br>
      <b>Авто-вивід:</b> Встанови цільовий множник, і гра виведе автоматично.<br><br>
      <b>Порада:</b> Стратегія Martingale — подвоюй ставку після програшу, але будь обережний! 💡`
  },
  blackjack: {
    title: '🃏 Блекджек',
    rules: `<b>Мета:</b> Набрати 21 очко або більше ніж дилер, не перебравши.<br><br>
      <b>Значення карт:</b><br>
      2–10 = своє значення<br>
      J, Q, K = 10 очок<br>
      Туз = 1 або 11<br><br>
      <b>Дії:</b><br>
      🃏 <b>Взяти (Hit)</b> — ще одна карта<br>
      🛑 <b>Стати (Stand)</b> — зупинитись<br>
      ✌️ <b>Подвоїти (Double)</b> — подвій ставку і візьми ONE карту<br>
      ✂️ <b>Спліт (Split)</b> — розділи пару на дві руки<br>
      🏳️ <b>Здатись (Surrender)</b> — повернути половину ставки<br><br>
      <b>Блекджек</b> (туз + 10) = виплата 3:2! 🎉`
  },
  mines: {
    title: '💣 Mines',
    rules: `<b>Мета:</b> Відкрити якомога більше клітин без міни.<br><br>
      <b>Як грати:</b><br>
      1. Вибери кількість мін (1–24)<br>
      2. Постав ставку та натисни "Старт"<br>
      3. Клікай на клітини — зелений 💎 = безпечно<br>
      4. Натисни "Вивести" в будь-який момент<br><br>
      <b>Множник:</b> Чим більше мін і більше відкрив клітин — тим вищий множник!<br><br>
      <b>Обережно:</b> Якщо потрапиш на міну 💥 — програєш всю ставку!`
  },
  dice: {
    title: '🎲 Dice',
    rules: `<b>Мета:</b> Вгадати результат кидка кубика.<br><br>
      <b>Як грати:</b><br>
      1. Вибери: "Більше" чи "Менше" за число<br>
      2. Встанови поріг (1–98)<br>
      3. Постав ставку<br><br>
      <b>Виплати:</b><br>
      Шанс виграшу = (кількість переможних значень / 100)<br>
      Множник = 97 / шанс виграшу %<br><br>
      <b>Приклад:</b> Більше 50 → шанс 49% → множник ~x1.98`
  },
  plinko: {
    title: '🔻 Plinko',
    rules: `<b>Мета:</b> Кулька падає і потрапляє у комірку — кожна дає різний множник.<br><br>
      <b>Як грати:</b><br>
      1. Постав ставку<br>
      2. Натисни "Пустити кульку"<br>
      3. Кулька відбивається від кілочків і падає у комірку<br><br>
      <b>Виплати:</b><br>
      Центральні комірки — низький множник (~x0.5)<br>
      Крайні комірки — високий множник (~x10–x100)<br><br>
      <b>Стратегія:</b> Більше кулек = стабільніший результат!`
  },
  limbo: {
    title: '🎯 Limbo',
    rules: `<b>Мета:</b> Вгадати, чи впаде результат вище твого цільового множника.<br><br>
      <b>Як грати:</b><br>
      1. Встанови цільовий множник (від x1.01)<br>
      2. Постав ставку<br>
      3. Система генерує число — якщо воно ≥ цілі, ти виграв!<br><br>
      <b>Формула:</b> Результат = 97 / (випадкове число 0–100)<br><br>
      <b>Приклад:</b> Ціль x2 → шанс ~48.5% → виплата x2 від ставки<br>
      Ціль x100 → шанс ~0.97% → виплата x100!`
  },
  keno: {
    title: '🔢 Keno',
    rules: `<b>Мета:</b> Вибери числа і вгадай які випадуть!<br><br>
      <b>Як грати:</b><br>
      1. Вибери від 1 до 10 чисел (1–40)<br>
      2. Постав ставку<br>
      3. Система витягує 8 чисел<br>
      4. Чим більше збігів — тим вища виплата!<br><br>
      <b>Збіги → Множник:</b><br>
      0 збігів → x0<br>
      3/3 → x5 | 5/5 → x25<br>
      7/7 → x100 | 8/8+ → x500+`
  },
  fortune: {
    title: '🎡 Колесо Фортуни',
    rules: `<b>Мета:</b> Прокрутити колесо і виграти множник від ставки.<br><br>
      <b>Як грати:</b><br>
      1. Постав ставку<br>
      2. Натисни "КРУТИТИ"<br>
      3. Колесо зупиняється — отримуєш відповідний множник!<br><br>
      <b>Сектори:</b><br>
      x0.2 (програш) • x0.5 • x1 (повернення)<br>
      x2 • x3 • x5 • x10 • 🎰 ДЖЕКПОТ x50<br><br>
      <b>Безкоштовні спіни:</b> можна придбати у магазині Слотіків!`
  },
  roulette: {
    title: '🎡 Рулетка',
    rules: `<b>Мета:</b> Вгадати, на яке число або колір зупиниться куля.<br><br>
      <b>Типи ставок:</b><br>
      🔴/⚫ Колір — x2 (шанс ~46.5%)<br>
      Парне/Непарне — x2<br>
      1–18 / 19–36 — x2<br>
      Дюжина (1–12, 13–24, 25–36) — x3<br>
      Число (0–36) — x36<br><br>
      <b>Зелений 0:</b> Bank забирає всі ставки на колір/парне.`
  },
  hilo: {
    title: '🃏 Hi-Lo',
    rules: `<b>Мета:</b> Вгадувати, чи наступна карта буде вище (Hi) чи нижче (Lo).<br><br>
      <b>Як грати:</b><br>
      1. Постав ставку<br>
      2. Дивись на відкриту карту<br>
      3. Натисни "HI" (вище) або "LO" (нижче)<br>
      4. Правильно? Множник збільшується — гуляй далі або виводь!<br><br>
      <b>Туз:</b> Найнижча карта (1)<br>
      <b>Король:</b> Найвища карта (13)`
  },
  scratch: {
    title: '🎟️ Скретч',
    rules: `<b>Мета:</b> Стер 3 однакових символи — виграш твій!<br><br>
      <b>Як грати:</b><br>
      1. Постав ставку<br>
      2. Натисни на клітини, щоб зістерти<br>
      3. Три однакових символи → виграш!<br><br>
      <b>Виплати залежать від символу:</b><br>
      💎 x50 | ⭐ x20 | 🏆 x10<br>
      7️⃣ x5 | 🍀 x3 | 🍒 x2`
  },
  coinflip: {
    title: '🪙 Монетка (PvP)',
    rules: `<b>Мета:</b> Поставити проти іншого гравця — хто вгадає сторону монети.<br><br>
      <b>Як грати:</b><br>
      1. Натисни "Кинути виклик"<br>
      2. Вибери суму і сторону (Орел/Решка)<br>
      3. Чекай суперника або прийми чийсь виклик<br>
      4. Монета підкидається — переможець забирає все!<br><br>
      <b>Комісія:</b> 5% іде в будинок.`
  },
  baccarat: {
    title: '🃏 Бакара',
    rules: `<b>Мета:</b> Вгадати хто набере ближче до 9: Гравець чи Банкір.<br><br>
      <b>Ставки:</b><br>
      🔵 Гравець (Player) → x2<br>
      🔴 Банкір (Banker) → x1.95 (5% комісія)<br>
      🟡 Нічия (Tie) → x8<br><br>
      <b>Рахунок карт:</b><br>
      2–9 = своє значення, 10/J/Q/K = 0, Туз = 1<br>
      Якщо сума > 9, беруть лише одиниці (напр. 15 = 5)<br><br>
      <b>Третя карта:</b> Правила по таблиці Baccarat.`
  },
  videpoker: {
    title: '🎴 Відео Покер',
    rules: `<b>Гра:</b> Jacks or Better<br><br>
      <b>Як грати:</b><br>
      1. Постав ставку та натисни "Роздати"<br>
      2. Вибери які карти тримати (Hold)<br>
      3. Натисни "Замінити" — замінить незадержані карти<br><br>
      <b>Виплати:</b><br>
      🥇 Пара Валетів+ → x1<br>
      🎯 Дві пари → x2 | Сет → x3<br>
      📊 Стрит → x4 | Флеш → x6<br>
      🏠 Фул-хаус → x9 | Каре → x25<br>
      🌈 Стрит-флеш → x50 | Роял-флеш → x800`
  },
};

function showGameHelp(gameId) {
  const h = GAME_HELP[gameId];
  if(!h) return;
  let modal = document.getElementById('gameHelpModal');
  if(!modal) {
    modal = document.createElement('div');
    modal.id = 'gameHelpModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9800;display:flex;align-items:flex-end;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:linear-gradient(135deg,#0d0520,#1a0a35);border:1px solid rgba(212,175,55,0.3);border-radius:24px 24px 0 0;padding:24px;width:100%;box-sizing:border-box;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;color:var(--accent);">${h.title}</h3>
        <button onclick="document.getElementById('gameHelpModal').style.display='none'" style="background:rgba(255,255,255,.1);border:none;color:#aaa;border-radius:50%;width:36px;height:36px;font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="font-size:14px;color:#ccc;line-height:1.7;">${h.rules}</div>
    </div>`;
  modal.style.display = 'flex';
  modal.onclick = e => { if(e.target===modal) modal.style.display='none'; };
}


// ══════════════════════════════════════════════════════
// 🐉 DRAGON TOWER
// ══════════════════════════════════════════════════════
let dragonState = { active:false, level:0, bet:0, dragons:1, cols:3, mult:1 };
