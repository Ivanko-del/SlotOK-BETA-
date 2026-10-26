// ╔══════════════════════════════════════════════════════════════╗
// ║  ФІЧА 1: Firebase Security Rules — показ в адмін-панелі    ║
// ╚══════════════════════════════════════════════════════════════╝
var FIREBASE_SECURITY_RULES = `{
  "rules": {
"users": {
  "$uid": {
    ".read": "$uid === auth.uid || root.child('users').child(auth.uid).child('isAdmin').val() === true",
    ".write": "$uid === auth.uid || root.child('users').child(auth.uid).child('isAdmin').val() === true",
    "balance":    { ".validate": "newData.isNumber() && newData.val() >= 0" },
    "isAdmin":    { ".write": "root.child('users').child(auth.uid).child('isAdmin').val() === true" },
    "isBot":      { ".write": "root.child('users').child(auth.uid).child('isAdmin').val() === true" },
    "banned":     { ".write": "root.child('users').child(auth.uid).child('isAdmin').val() === true" }
  }
},
"global_chat": {
  ".read":  "auth != null",
  ".write": "auth != null",
  "$msg": {
    ".validate": "newData.child('text').val().length <= 300 && newData.child('user').val().length <= 30"
  }
},
"live_bets":        { ".read": "auth != null", ".write": "auth != null" },
"deposit_requests": { ".read": "root.child('users').child(auth.uid).child('isAdmin').val() === true || newData.child('user').val() === auth.uid", ".write": "auth != null" },
"withdraw_requests":{ ".read": "root.child('users').child(auth.uid).child('isAdmin').val() === true", ".write": "auth != null" },
"password_reset_requests": { ".read": "root.child('users').child(auth.uid).child('isAdmin').val() === true", ".write": "auth != null" },
"pm": {
  "$user": {
    ".read":  "$user === auth.uid || root.child('users').child(auth.uid).child('isAdmin').val() === true",
    ".write": "auth != null"
  }
},
"casino_stats":     { ".read": true, ".write": "auth != null" },
"leaderboard":      { ".read": true, ".write": "auth != null" },
"lobby_chat":       { ".read": "auth != null", ".write": "auth != null" },
".read":  false,
".write": false
  }
}`;

function showFirebaseRules() {
  const existing = document.getElementById('fbRulesModal');
  if(existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'fbRulesModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgb(var(--recess-rgb) / calc(0.92 * var(--recess-k)));z-index:9999;overflow-y:auto;padding:20px;box-sizing:border-box;';
  modal.innerHTML = `
    <div style="max-width:600px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-family:var(--font-display);font-size:16px;color:var(--accent);">🛡️ Firebase Security Rules</div>
        <button onclick="document.getElementById('fbRulesModal').remove()" style="background:none;border:1px solid var(--line);border-radius:var(--r-md);color:var(--fg-3);padding:6px 14px;cursor:pointer;">✕ Закрити</button>
      </div>
      <div style="background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px;margin-bottom:12px;font-family:var(--font-mono);font-size:11px;color:var(--fg-2);white-space:pre-wrap;overflow-x:auto;max-height:60vh;overflow-y:auto;">${FIREBASE_SECURITY_RULES}</div>
      <button onclick="navigator.clipboard.writeText(FIREBASE_SECURITY_RULES);notify('✅ Rules скопійовано!','success')" style="width:100%;background:var(--accent);border:none;border-radius:var(--r-md);padding:12px;color:var(--on-accent);font-weight:900;cursor:pointer;font-size:14px;">📋 Копіювати правила</button>
      <div style="font-size:10px;color:var(--fg-4);margin-top:8px;text-align:center;">Вставте ці правила в Firebase Console → Realtime Database → Rules</div>
    </div>`;
  document.body.appendChild(modal);
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  ФІЧА 2: Provably Fair — SHA-256 для Dice та Plinko        ║
// ╚══════════════════════════════════════════════════════════════╝
let _serverSeed   = '';
let _clientSeed   = Math.random().toString(36).slice(2, 10);
let _nonce        = 0;

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// Тимчасовий пароль після скидання — це повноцінний доступ до акаунту, тому
// він мусить братись із криптографічного джерела. Math.random() передбачуваний:
// знаючи кілька попередніх значень, наступні можна вирахувати.
function randomTempPassword() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'; // без схожих 0/o/1/l — пароль диктують у чат
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes).map(b => alphabet[b % alphabet.length]).join('');
}

async function getProvablyFairResult(min = 1, max = 100) {
  if(!_serverSeed) _serverSeed = Math.random().toString(36).slice(2, 18);
  _nonce++;
  const combined = `${_serverSeed}:${_clientSeed}:${_nonce}`;
  const hash = await sha256(combined);
  // Use first 8 hex chars as a number
  const num = parseInt(hash.slice(0, 8), 16);
  return min + (num % (max - min + 1));
}

function generateNewClientSeed() {
  _clientSeed = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  _nonce = 0;
  notify('🎲 Новий Client Seed: ' + _clientSeed, 'info');
}

function showProvablyFairModal(game, serverSeed, clientSeed, nonce, result) {
  const existing = document.getElementById('provablyFairModal');
  if(existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'provablyFairModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgb(var(--recess-rgb) / calc(0.9 * var(--recess-k)));z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
  modal.innerHTML = `
    <div style="background:var(--surface-1);border:1.5px solid rgb(var(--pos-rgb) / 0.3);border-radius:var(--r-xl);padding:20px;max-width:380px;width:100%;">
      <div style="font-family:var(--font-display);font-size:15px;color:var(--pos);margin-bottom:14px;">🔐 Provably Fair — ${game}</div>
      <div style="font-size:11px;color:var(--fg-4);margin-bottom:6px;">Server Seed (hashed):</div>
      <div style="background:var(--bg);border-radius:var(--r-md);padding:8px 10px;font-family:var(--font-mono);font-size:11px;color:var(--fg-3);word-break:break-all;margin-bottom:10px;">${serverSeed.slice(0,16)}...${serverSeed.slice(-8)}</div>
      <div style="font-size:11px;color:var(--fg-4);margin-bottom:6px;">Client Seed:</div>
      <div style="background:var(--bg);border-radius:var(--r-md);padding:8px 10px;font-family:var(--font-mono);font-size:12px;color:var(--accent);margin-bottom:10px;">${clientSeed}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <div style="background:var(--bg);border-radius:var(--r-md);padding:8px;text-align:center;"><div style="font-size:10px;color:var(--fg-4);">Nonce</div><div style="font-weight:900;color:var(--info);">${nonce}</div></div>
        <div style="background:var(--bg);border-radius:var(--r-md);padding:8px;text-align:center;"><div style="font-size:10px;color:var(--fg-4);">Результат</div><div style="font-weight:900;color:var(--pos);">${result}</div></div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="generateNewClientSeed();document.getElementById('provablyFairModal').remove()" style="flex:1;background:rgb(var(--pos-rgb) / 0.1);border:1px solid rgb(var(--pos-rgb) / 0.3);border-radius:var(--r-md);padding:10px;color:var(--pos);cursor:pointer;font-size:12px;">🔄 Новий seed</button>
        <button onclick="document.getElementById('provablyFairModal').remove()" style="flex:1;background:rgb(var(--tint-rgb) / 0.05);border:1px solid var(--line);border-radius:var(--r-md);padding:10px;color:var(--fg-3);cursor:pointer;font-size:12px;">✕ Закрити</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  ФІЧА 3: Rate Limiting — чат і ставки                      ║
// ╚══════════════════════════════════════════════════════════════╝
const _chatTimes    = [];
const CHAT_MAX_MSGS = 4;      // max messages
const CHAT_WINDOW   = 10000;  // per 10 seconds
const CHAT_COOLDOWN = 2000;   // min 2s between messages

function checkChatRateLimit() {
  const now = Date.now();
  // Remove old entries outside window
  while(_chatTimes.length && now - _chatTimes[0] > CHAT_WINDOW) _chatTimes.shift();
  if(_chatTimes.length && now - _chatTimes[_chatTimes.length - 1] < CHAT_COOLDOWN) {
    const wait = Math.ceil((CHAT_COOLDOWN - (now - _chatTimes[_chatTimes.length - 1])) / 1000);
    notify(`⏱ Почекай ${wait}с перед наступним повідомленням`, 'error');
    return false;
  }
  if(_chatTimes.length >= CHAT_MAX_MSGS) {
    notify('🚫 Занадто швидко! Максимум 4 повідомлення за 10 секунд', 'error');
    return false;
  }
  _chatTimes.push(now);
  return true;
}

const _betTimes   = {};        // gameKey → last bet timestamp
const BET_COOLDOWN_MS = 600;   // min 600ms between bets

function checkBetRateLimit(gameKey) {
  const now = Date.now();
  if(_betTimes[gameKey] && now - _betTimes[gameKey] < BET_COOLDOWN_MS) {
    notify('⚡ Не так швидко! Зачекай трохи', 'error');
    return false;
  }
  _betTimes[gameKey] = now;
  return true;
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  ФІЧА 4: Push Notifications — Firebase FCM                 ║
// ╚══════════════════════════════════════════════════════════════╝
// Публічний VAPID-ключ для Web Push — НЕ секрет (на відміну від
// FIREBASE_SERVICE_ACCOUNT_KEY у lib/fcm.js), береться з Firebase Console →
// Налаштування проєкту → Cloud Messaging → Web Push certificates. Поки тут
// заглушка — реальні push не активуються, доки хтось не вставить справжній
// ключ сюди.
const FCM_VAPID_KEY = 'REPLACE_WITH_YOUR_VAPID_KEY';

async function requestPushPermission() {
  if(!('Notification' in window)) return notify('Браузер не підтримує сповіщення', 'error');
  const perm = await Notification.requestPermission();
  if(perm === 'granted') {
    localStorage.setItem('pushEnabled', '1');
    notify('🔔 Сповіщення увімкнено!', 'success');
    sendNativeNotif('🎰 SlotOK', 'Ви підписались на сповіщення! 🎉');
    db.ref('users/'+currentUser+'/pushEnabled').set(true);
    registerFcmToken();
  } else {
    notify('❌ Сповіщення заблоковано браузером', 'error');
  }
}

// Реєструє токен цього пристрою для push-сповіщень, які приходять навіть
// коли застосунок повністю закритий — на відміну від sendNativeNotif, яка
// працює лише поки вкладка відкрита у фоні. Тихо нічого не робить, доки
// FCM_VAPID_KEY лишається заглушкою (немає токена — немає push, решта сайту
// працює як і раніше).
const _scriptLoads = {};
function loadScriptOnce(src) {
  if(!_scriptLoads[src]) {
    _scriptLoads[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.async = true;
      el.onload = resolve;
      el.onerror = () => { delete _scriptLoads[src]; reject(new Error('Не вдалося завантажити ' + src)); };
      document.head.appendChild(el);
    });
  }
  return _scriptLoads[src];
}
async function registerFcmToken() {
  if(!currentUser || !('serviceWorker' in navigator) || FCM_VAPID_KEY === 'REPLACE_WITH_YOUR_VAPID_KEY') return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    if(typeof firebase === 'undefined') return;
    // SDK повідомлень (~100 КБ) вантажимо лише тут, а не на кожному відкритті сторінки.
    if(!firebase.messaging) await loadScriptOnce('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');
    if(!firebase.messaging) return;
    const messaging = firebase.messaging();
    const token = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
    if(token) db.ref('users/'+currentUser+'/fcmTokens/'+token).set(true);
  } catch(e) { console.warn('registerFcmToken:', e); }
}

function sendNativeNotif(title, body, icon = '🎰') {
  if(Notification.permission !== 'granted') return;
  if(!localStorage.getItem('pushEnabled')) return;
  // Only send when tab is hidden
  if(document.visibilityState === 'visible') return;
  try { new Notification(title, { body, icon: '/icons/icon-192.png' }); } catch(e) { console.warn(e); }
}

function checkPendingNotifs() {
  if(!currentUser) return;
  db.ref('users/'+currentUser+'/pendingNotifs').once('value', snap => {
    const notifs = snap.val();
    if(!notifs) return;
    Object.entries(notifs).slice(-3).forEach(([key, n]) => {
      setTimeout(() => sendNativeNotif(n.title, n.body), 500);
    });
    // Clear after reading
    db.ref('users/'+currentUser+'/pendingNotifs').remove();
  });
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  ФІЧА 5: 2FA для великих виводів                           ║
// ║  Раніше цей "2FA" був суто косметичний: код генерувався тут ж ║
// ║  у браузері, писався у ПП (яке той самий браузер вільно      ║
// ║  читає напряму з Firebase) і мав кнопку "показати" прямо в   ║
// ║  тому ж вікні — тобто нічого насправді не перевіряв.         ║
// ║  Тепер підтвердження — це тап по кнопці у ВЛАСНОМУ Telegram  ║
// ║  гравця: код на бекенді (api/notify.js) ніколи не генерується ║
// ║  й не зберігається в клієнтській базі — просто інлайн-кнопки ║
// ║  "confirm"/"cancel", а справжня перевірка — чий саме chatId   ║
// ║  Telegram доставив у наш webhook (api/telegram-webhook.js).  ║
// ╚══════════════════════════════════════════════════════════════╝
const WITHDRAW_2FA_THRESHOLD = 5000; // ₴ — поріг для 2FA
let _wd2faListener = null, _wd2faListenerId = null;

function showWithdraw2FAWait(amount, requestId) {
  const existing = document.getElementById('modal2FA');
  if(existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'modal2FA';
  modal.style.cssText = 'position:fixed;inset:0;background:rgb(var(--recess-rgb) / calc(0.92 * var(--recess-k)));z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:linear-gradient(135deg,var(--surface-1),var(--surface-2));border:2px solid rgb(var(--info-rgb) / 0.3);border-radius:var(--r-xl);padding:22px;max-width:340px;width:100%;animation:slideUp .3s ease;text-align:center;">
      <div id="wd2faIcon" style="font-size:42px;margin-bottom:8px;animation:pulse2 1.5s ease infinite;">🔐</div>
      <div style="font-family:var(--font-display);font-size:15px;color:var(--info);font-weight:900;">Підтвердь вивід у Telegram</div>
      <div style="font-size:12px;color:var(--fg-3);margin-top:6px;">Сума: <b style="color:var(--accent);">${formatNumber(amount)}₴</b></div>
      <div id="wd2faMsg" style="font-size:13px;color:var(--fg-2);margin-top:14px;line-height:1.5;">Ми надіслали повідомлення у твій Telegram із кнопками «Підтвердити» / «Скасувати». Відкрий бота і натисни потрібну.</div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button onclick="notifyBot('withdraw-2fa', '${requestId}');notify('🔄 Надіслано ще раз','info')" style="flex:1;background:rgb(var(--info-rgb) / 0.1);border:1px solid rgb(var(--info-rgb) / 0.3);border-radius:var(--r-lg);padding:12px;color:var(--info);font-weight:700;cursor:pointer;font-size:13px;">🔄 Надіслати ще раз</button>
        <button onclick="closeWithdraw2FAWait()" style="background:rgb(var(--tint-rgb) / 0.05);border:1px solid var(--line);border-radius:var(--r-lg);padding:12px;color:var(--fg-3);cursor:pointer;font-size:13px;">Закрити</button>
      </div>
      <div style="font-size:10px;color:var(--fg-4);margin-top:10px;">Заявка нікуди не зникає — можна повернутись і підтвердити пізніше</div>
    </div>`;
  document.body.appendChild(modal);

  if(_wd2faListener) { db.ref('withdraw_requests/'+_wd2faListenerId+'/status').off('value', _wd2faListener); }
  _wd2faListenerId = requestId;
  _wd2faListener = db.ref('withdraw_requests/'+requestId+'/status').on('value', snap => {
    const status = snap.val();
    if(status === 'pending_2fa') return; // ще чекаємо на тап у Telegram
    db.ref('withdraw_requests/'+requestId+'/status').off('value', _wd2faListener);
    _wd2faListener = null;
    const icon = document.getElementById('wd2faIcon');
    const msg = document.getElementById('wd2faMsg');
    if(status === 'pending') {
      if(icon) icon.textContent = '✅';
      if(msg) msg.innerHTML = '<span style="color:var(--pos);">Підтверджено!</span> Заявку передано адміністратору — обробка 1-24 год.';
      loadMyWithdraws();
      setTimeout(closeWithdraw2FAWait, 2500);
    } else if(status === 'cancelled') {
      if(icon) icon.textContent = '❌';
      if(msg) msg.innerHTML = '<span style="color:var(--neg);">Скасовано.</span> Кошти повернуто на баланс.';
      loadMyWithdraws();
      setTimeout(closeWithdraw2FAWait, 2500);
    }
  });
}

function closeWithdraw2FAWait() {
  document.getElementById('modal2FA')?.remove();
  if(_wd2faListener && _wd2faListenerId) {
    db.ref('withdraw_requests/'+_wd2faListenerId+'/status').off('value', _wd2faListener);
  }
  _wd2faListener = null; _wd2faListenerId = null;
}

// HTML і раніше, і зараз викликає submitWithdrawWith2FA() — залишаємо назву,
// щоб не чіпати розмітку, але вся логіка тепер просто в submitWithdraw().
function submitWithdrawWith2FA() { submitWithdraw(); }

// ╔══════════════════════════════════════════════════════════════╗
// ║  ФІЧА 6: Provably Fair — Dice і Plinko з seed-перевіркою   ║
// ╚══════════════════════════════════════════════════════════════╝
async function rollDiceFair(dir) {
  // Коли серверні ігри ввімкнено, результат кидає сервер (api/play.js) —
  // це справжня чесність, на відміну від seed, який генерує сам браузер.
  if(await serverAuthEnabled()) return rollDiceClassic(dir);
  if(!checkBetRateLimit('dice')) return;
  const bet = validateBet(document.getElementById('diceBet').value);
  if(!bet) return;
  const target = parseInt(document.getElementById('diceSlider').value);
  const result = await getProvablyFairResult(1, 99);
  const win = (dir === 'over') ? result > target : result < target;
  const chance = dir === 'over' ? (99 - target) / 99 : (target - 1) / 99;
  const mult = parseFloat((0.97 / chance).toFixed(2));
  const winAmt = Math.floor(bet * mult);

  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win ? winAmt - bet : -bet));
  addWager(bet);
  trackLbStat('wager', bet); trackLbStat('games', 1);
  publishLiveBet('Dice ⚖️', '🎲', bet, win ? mult : 0);
  playSound(win ? 'win' : 'loss');

  const resEl = document.getElementById('diceResult');
  const histEl = document.getElementById('diceHistory');
  if(resEl) resEl.innerHTML = win
    ? `<span style="color:var(--green);font-weight:900;">🎲 ${result} — ВИГРАШ! +${formatNumber(winAmt)}₴ <button onclick="showProvablyFairModal('Dice','${_serverSeed}','${_clientSeed}',${_nonce},${result})" style="background:rgb(var(--pos-rgb) / 0.1);border:1px solid rgb(var(--pos-rgb) / 0.2);border-radius:var(--r-sm);color:var(--pos);font-size:10px;padding:2px 8px;cursor:pointer;margin-left:6px;">⚖️ Verify</button></span>`
    : `<span style="color:var(--red);font-weight:900;">🎲 ${result} — Програш -${formatNumber(bet)}₴ <button onclick="showProvablyFairModal('Dice','${_serverSeed}','${_clientSeed}',${_nonce},${result})" style="background:rgb(var(--neg-rgb) / 0.08);border:1px solid var(--line);border-radius:var(--r-sm);color:var(--fg-3);font-size:10px;padding:2px 8px;cursor:pointer;margin-left:6px;">⚖️ Verify</button></span>`;
  if(win) { notify('🎲 ' + result + ' → +' + formatNumber(winAmt) + '₴', 'success'); addToHistory('Dice: +'+winAmt); }
  else { notify('🎲 ' + result + ' — Програш', 'error'); addToHistory('Dice: -'+bet); }
  if(histEl) {
    const dot = document.createElement('div');
    dot.className = 'dice-result-dot';
    dot.style.background = win ? 'var(--green)' : 'var(--red)';
    dot.textContent = result;
    histEl.insertBefore(dot, histEl.firstChild);
    if(histEl.children.length > 20) histEl.removeChild(histEl.lastChild);
  }
  updateStreak(win); recordBalanceHistory();
}

let plinkoBusy = false;
async function dropPlinkoFair() {
  if(plinkoBusy) return;
  if(!checkBetRateLimit('plinko')) return;
  const bet = validateBet(document.getElementById('betAmountPlinko').value);
  if(!bet) return;
  const risk = PLINKO_TABLE[plinkoRisk] ? plinkoRisk : 'med';
  plinkoBusy = true;
  let srv;
  try { srv = await serverPlay('plinko', bet, { risk }); } finally { plinkoBusy = false; }
  if(srv.mode === 'error') return;
  if(srv.mode === 'server') return animatePlinkoServerRound(bet, risk, srv.r);
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  addWager(bet); trackQuest('totalGames',1);
  publishLiveBet('Plinko ⚖️', '🔻', bet, '');
  playSound('click');
  const ball = document.getElementById('plinkoBall');
  if(ball) ball.style.display = 'block';
  const fairNum = await getProvablyFairResult(0, 999);
  const bucketIndex = plinkoBucketFor(fairNum / 1000, risk);
  const targetLeft = (bucketIndex * 14) + 7;
  if(ball) ball.animate([{top:'0',left:'50%'},{top:'100%',left:targetLeft+'%'}], {duration:1200,fill:'forwards',easing:'ease-in'});
  setTimeout(() => {
    const mult = PLINKO_TABLE[risk].mults[bucketIndex];
    const win = Math.floor(bet * mult);
    if(mult > 0) db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(win));
    if(win > bet) { playSound('win'); notify(`🔻 +${win}₴ (×${mult}) `, 'success'); addToHistory('Plinko: +'+win); }
    else { notify(`🔻 ×${mult} — ${win}₴`, mult > 0 ? 'info' : 'error'); addToHistory('Plinko: '+win); }
    updateStreak(win >= bet); recordBalanceHistory();
    if(ball) ball.style.display = 'none';
    // Show verify button
    notify(`⚖️ <span onclick="showProvablyFairModal('Plinko','${_serverSeed}','${_clientSeed}',${_nonce},${fairNum})" style="cursor:pointer;text-decoration:underline;color:var(--info);">Перевірити чесність гри</span>`, 'info');
  }, 1200);
}

// Раунд Plinko, який уже зіграв сервер: лише анімація й статистика.
function animatePlinkoServerRound(bet, risk, r) {
  addWager(bet); trackQuest('totalGames',1);
  publishLiveBet('Plinko', '🔻', bet, '');
  playSound('click');
  const ball = document.getElementById('plinkoBall');
  if(ball) {
    ball.style.display = 'block';
    const targetLeft = (r.bucket * 14) + 7;
    ball.animate([{top:'0',left:'50%'},{top:'100%',left:targetLeft+'%'}], {duration:1200,fill:'forwards',easing:'ease-in'});
  }
  setTimeout(() => {
    const win = r.payout;
    if(win > bet) { playSound('win'); notify(`🔻 +${win}₴ (×${r.mult})`, 'success'); addToHistory('Plinko: +'+win); trackLbStat('wins', win); }
    else { notify(`🔻 ×${r.mult} — ${win}₴`, r.mult > 0 ? 'info' : 'error'); addToHistory('Plinko: '+win); }
    updateStreak(win >= bet); recordBalanceHistory();
    if(ball) ball.style.display = 'none';
  }, 1200);
}

// Override original functions with fair versions
// (called from HTML buttons — we patch here so HTML doesn't need changes)
window.rollDice = rollDiceFair;
window.dropPlinko = dropPlinkoFair;

// ╔══════════════════════════════════════════════════════════════╗
// ║  ФІЧА 7: Автоочищення live_bets та старих чат-повідомлень  ║
// ╚══════════════════════════════════════════════════════════════╝
function startAutoCleanup() {
  // Run every 10 minutes
  setInterval(runCleanup, 10 * 60 * 1000);
  // Also run on startup after 30 seconds
  setTimeout(runCleanup, 30000);
}

async function runCleanup() {
  const cutoff = Date.now() - 30 * 60 * 1000; // keep last 30 minutes
  const chatCutoff = Date.now() - 6 * 60 * 60 * 1000; // keep last 6 hours of chat
  let cleaned = 0;

  // Clean live_bets older than 30 min
  db.ref('live_bets').orderByChild('ts').endAt(cutoff).once('value', snap => {
    const data = snap.val();
    if(!data) return;
    const keys = Object.keys(data);
    if(keys.length < 50) return; // keep at least 50 entries
    const toDelete = keys.slice(0, keys.length - 50);
    const updates = {};
    toDelete.forEach(k => { updates['live_bets/' + k] = null; cleaned++; });
    if(Object.keys(updates).length) db.ref().update(updates);
  });

  // Чати чистить лише адмін: раніше кожен гравець раз на 10 хв качав увесь
  // global_chat і lobby_chat, а строгі правила й не дадуть гравцю видаляти чуже.
  if(!isAdminUser()) return;

  // Clean global_chat older than 6 hours (keep last 200 messages)
  db.ref('global_chat').orderByChild('ts').once('value', snap => {
    const data = snap.val();
    if(!data) return;
    const entries = Object.entries(data).sort((a,b) => a[1].ts - b[1].ts);
    if(entries.length <= 200) return;
    const toDelete = entries.slice(0, entries.length - 200);
    const updates = {};
    toDelete.forEach(([k]) => { updates['global_chat/' + k] = null; cleaned++; });
    if(Object.keys(updates).length) db.ref().update(updates);
  });

  // Clean lobby_chat keeping last 100
  db.ref('lobby_chat').orderByChild('time').once('value', snap => {
    const data = snap.val();
    if(!data) return;
    const entries = Object.entries(data).sort((a,b) => (a[1].time||0) - (b[1].time||0));
    if(entries.length <= 100) return;
    const toDelete = entries.slice(0, entries.length - 100);
    const updates = {};
    toDelete.forEach(([k]) => { updates['lobby_chat/' + k] = null; });
    if(Object.keys(updates).length) db.ref().update(updates);
  });
}

// Старт автоочищення при логіні
function startAllBackgroundTasks() {
  startAutoCleanup();
  checkPendingNotifs();
  checkAutoWipeOnLoad();
}


