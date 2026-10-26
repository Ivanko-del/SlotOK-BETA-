// ============================================================
// SlotOK Casino — app.js
// Firebase 8.10.1 + Realtime Database
// Project: nye-slotok
// ============================================================

'use strict';


// ============================================
// ІНІЦІАЛІЗАЦІЯ
// ============================================
// СПЛЕШ — керується окремим тегом вище
// ============================================

const firebaseConfig = {
  apiKey:            "AIzaSyBQelUmnWpgdjV_Y22GBjjZZPxUb85PUuI",
  authDomain:        "nye-slotok.firebaseapp.com",
  databaseURL:       "https://nye-slotok-default-rtdb.firebaseio.com",
  projectId:         "nye-slotok",
  storageBucket:     "nye-slotok.firebasestorage.app",
  messagingSenderId: "436174740835",
  appId:             "1:436174740835:web:b70e8467396e9f983ac756",
  measurementId:     "G-Y2CQBQDRMQ"
};

let db = null;
try {
  if(typeof firebase === 'undefined') throw new Error('Firebase SDK не завантажився');
  if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  setTimeout(initAxioma, 0); // після виконання всього app.js — тоді змінні інтеграції вже оголошені
} catch(e) {
  console.error('Firebase init error:', e);
  // Show friendly error but DON'T block the app
  setTimeout(() => {
    const authErr = document.getElementById('authError');
    if(authErr) {
      authErr.textContent = '⚠️ Немає з\'єднання з сервером. Перевір інтернет і перезавантаж сторінку.';
      authErr.style.display = 'block';
    }
    // Also show on splash if still visible
    const splashEl = document.querySelector('#loading-overlay div:last-child');
    if(splashEl) splashEl.textContent = '⚠️ Помилка з\'єднання';
  }, 2200);
}

// Safe wrapper — щоб не крешитись якщо db = null
const safeDb = {
  ref: (path) => db ? db.ref(path) : {
    once: () => Promise.reject('no db'),
    set: () => Promise.reject('no db'),
    update: () => Promise.reject('no db'),
    on: () => null, off: () => null, push: () => ({ key: 'offline' }),
    orderByChild: function() { return this; },
    equalTo: function() { return this; },
    limitToLast: function() { return this; },
    limitToFirst: function() { return this; },
    endAt: function() { return this; },
  }
};

// ============================================
// ОСНОВНІ ЗМІННІ
// ============================================
let currentUser = null; 
let userData = {}; 
let selectedWithdrawMethod = 'privat';
let selectedDepAmount = 0;
const MAX_BET = 1000000; 
let audioCtx = null;

// Telegram Bot Username — замінити на свій!
const TG_BOT_USERNAME = 'SlotOK_DepositBot';
// Одна адреса для всіх запрошень — старий slotok.web.app віддає 404
const SITE_URL = 'https://slot-ok-beta.vercel.app';
function referralLink() { return SITE_URL + '/?ref=' + encodeURIComponent(currentUser); }

// ============================================
// ПЕРЕВІРКА ЛОГІНУ
// ============================================
let _capturedLastSeen; // undefined = ще не зловили; для системи "Ми скучили"
const SESSION_KEY = 'slotok_user';
const LEGACY_SESSION_KEY = 'royal_online_user'; // назва з часів, коли проєкт звався Royal Online

// Переносимо вже відкриті сесії на новий ключ, щоб ніхто не вилетів із акаунту
let savedUser = localStorage.getItem(SESSION_KEY);
if(!savedUser) {
  const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
  if(legacy) { savedUser = legacy; localStorage.setItem(SESSION_KEY, legacy); }
}
localStorage.removeItem(LEGACY_SESSION_KEY);
if(savedUser) { currentUser = savedUser; whenAuthReady(startDataSync); }

// Firebase Auth відновлює збережену сесію асинхронно. Якщо підписатись на
// закриті вузли раніше, строгі правила відмовлять і підписка вже не оживе —
// тож чекаємо першої відповіді Auth (не довше 3 с; без входу через сервер
// вона приходить одразу з null).
function whenAuthReady(cb) {
  let done = false;
  const go = () => { if(!done) { done = true; cb(); } };
  try {
    if(typeof firebase !== 'undefined' && firebase.auth) {
      const unsub = firebase.auth().onAuthStateChanged(() => { unsub(); go(); });
      setTimeout(go, 3000);
      return;
    }
  } catch(e) { console.warn(e); }
  go();
}

// ── Серверний вхід (api/auth.js) ──────────────────────────────
// Пароль перевіряє сервер і видає Firebase custom token (uid = нік), після
// чого правила бази бачать auth.uid. Поки на Vercel не задано
// FIREBASE_SERVICE_ACCOUNT_KEY, сервер відповідає 503 і все працює по-старому
// (перевірка пароля в браузері).
let _serverAuthStatusPromise = null;
function serverAuthEnabled() {
  if(!_serverAuthStatusPromise) {
    _serverAuthStatusPromise = fetch('/api/auth', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { serverAuth: false })
      .then(d => !!(d && d.serverAuth))
      .catch(() => false);
  }
  return _serverAuthStatusPromise;
}
async function serverAuthCall(action, payload) {
  try {
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action }, payload)),
    });
    let data = {};
    try { data = await r.json(); } catch(e) {}
    return { status: r.status, data: data || {} };
  } catch(e) {
    return { status: 0, data: {} }; // мережа / локальний запуск без api
  }
}
// Відповідь сервера, яку треба показати гравцю як є (невірний пароль, бан,
// ліміт спроб). 0/404 без коду/5xx/503 — сервер недоступний, працюємо по-старому.
function serverAuthIsFinal(r) {
  return r.status >= 400 && r.status < 500 && !!(r.data && r.data.error);
}
// Технічний текст помилки Firebase (JSON, коди) — у консоль; гравцю — людською мовою.
function friendlySignInError(e) {
  const raw = String((e && (e.code || e.message)) || '');
  if(/network|offline|timeout|unavailable/i.test(raw)) return 'Немає зʼєднання. Перевір інтернет і спробуй ще раз.';
  if(/too-many|TOO_MANY/i.test(raw)) return 'Забагато спроб. Зачекай кілька хвилин.';
  return 'Вхід тимчасово недоступний. Спробуй за кілька хвилин, а якщо не минеться — напиши в підтримку.';
}
// ── Серверні ігри (api/play.js) ──
// Результат і баланс рахує сервер. Повертає:
//   { mode: 'server', r }  — зіграно на сервері, баланс уже змінено там;
//   { mode: 'legacy' }     — серверні ігри не налаштовані, граємо як раніше;
//   { mode: 'error' }      — помилку вже показано гравцю, ставку не прийнято.
async function serverPlay(game, bet, params) {
  if(!(await serverAuthEnabled())) return { mode: 'legacy' };
  const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
  if(!user) { notify('🔐 Сесія застаріла — увійди ще раз', 'error'); return { mode: 'error' }; }
  const id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9_-]/g, '');
  const send = async () => fetch('/api/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
    body: JSON.stringify({ game, bet, params, id }),
  });
  let res;
  try { res = await send(); }
  catch(e) {
    // Обрив мережі: повтор з тим самим id безпечний — сервер не зіграє двічі.
    try { res = await send(); } catch(e2) { notify('Немає зʼєднання. Перевір інтернет.', 'error'); return { mode: 'error' }; }
  }
  let data = {};
  try { data = await res.json(); } catch(e) {}
  if(res.status === 200) { serverProgress(data); return { mode: 'server', r: data }; }
  if(res.status === 503 && data.error === 'not_configured') return { mode: 'legacy' };
  notify(data.message || 'Ставку не прийнято. Спробуй ще раз.', 'error');
  return { mode: 'error' };
}

// ── Серверні раунди з кількома ходами (api/round.js: Mines, Tower, Hi-Lo) ──
// Повертає { mode: 'server', r } | { mode: 'legacy' } | { mode: 'error', status }.
async function serverRound(action, game, extra) {
  return serverApi('/api/round', Object.assign({ action, game }, extra || {}));
}

// ── Бонуси й нагороди (api/reward.js): суму, право й час рахує сервер ──
// Ті самі три режими, що й serverRound. _rewardBusy — від подвійного кліку.
let _rewardBusy = false;
async function serverReward(action, extra) {
  if(_rewardBusy) return { mode: 'error', status: 429 };
  _rewardBusy = true;
  try { return await serverApi('/api/reward', Object.assign({ action }, extra || {})); }
  finally { _rewardBusy = false; }
}

async function serverApi(url, body) {
  if(!(await serverAuthEnabled())) return { mode: 'legacy' };
  const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
  if(!user) { notify('🔐 Сесія застаріла — увійди ще раз', 'error'); return { mode: 'error', status: 401 }; }
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
      body: JSON.stringify(body),
    });
  } catch(e) { notify('Немає зʼєднання. Перевір інтернет.', 'error'); return { mode: 'error', status: 0 }; }
  let data = {};
  try { data = await res.json(); } catch(e) {}
  if(res.status === 200) { serverProgress(data); return { mode: 'server', r: data }; }
  if(res.status === 503 && data.error === 'not_configured') return { mode: 'legacy' };
  notify(data.message || 'Не вдалося. Спробуй ще раз.', 'error');
  return { mode: 'error', status: res.status, r: data };
}

// Ставку, списану на сервері, сервер сам записав у вейджер/XP/кешбек і
// повернув progress. addWager() цю суму вдруге не пише (див. _serverWagerCredit),
// а тут лише показуємо підвищення VIP чи рівня Battle Pass.
let _serverWagerCredit = 0, _serverWagerCreditAt = 0;
function serverProgress(r) {
  const p = r && !r.replay && r.progress;
  if(!p || !(p.wager > 0)) return;
  if(Date.now() - _serverWagerCreditAt > 15000) _serverWagerCredit = 0;
  _serverWagerCredit += p.wager;
  _serverWagerCreditAt = Date.now();
  if(p.vipUp) {
    setTimeout(() => notify(`🎉 VIP підвищено до ${p.vipUp.icon} ${p.vipUp.name}!`, 'success'), 700);
    notifyBot('player-ping', null, { to: currentUser, kind: 'vipup', ref: { name: p.vipUp.name, icon: p.vipUp.icon } });
  }
  if(p.bpLevelUp) showBpLevelUp(p.bpLevelUp);
}

async function serverSignIn(token) {
  if(typeof firebase === 'undefined' || !firebase.auth) throw new Error('Firebase Auth не завантажився');
  await firebase.auth().signInWithCustomToken(token);
}
// Збережена сесія — це лише нік у localStorage. Коли серверний вхід увімкнено,
// вимагаємо ще й справжню Firebase Auth-сесію з тим самим uid; інакше (нік
// вписали руками, або сесія з часів до серверного входу) — просимо увійти знову.
async function verifyServerSession(nick) {
  if(!(await serverAuthEnabled())) return;
  if(typeof firebase === 'undefined' || !firebase.auth) return;
  const unsub = firebase.auth().onAuthStateChanged(user => {
    unsub();
    if(!user || user.uid !== nick) {
      localStorage.removeItem(SESSION_KEY);
      alert('🔐 Для безпеки акаунту увійди, будь ласка, ще раз.');
      location.reload();
    }
  });
}
if(savedUser) verifyServerSession(savedUser);

function startDataSync() {
    try {
        let _firstSnapshot = true;
        db.ref('users/' + currentUser).on('value', (snapshot) => {
            const data = snapshot.val();
            if(!data) { logout(); return; }
            const prevBalance = userData ? userData.balance : null;
            if(_firstSnapshot) {
              _firstSnapshot = false;
              // Явний логін вже зберіг lastSeen ДО перезапису в _capturedLastSeen.
              // Якщо це авто-вхід через збережену сесію — лишень зараз бачимо
              // справжнє попереднє значення (ще ніхто нічого не перезаписав).
              if(_capturedLastSeen === undefined) _capturedLastSeen = data.lastSeen || null;
              // Точка відліку для лімітів "Відповідальної гри" (програш/час за
              // сесію) — беремо баланс і час РІВНО на вході, до першої ставки.
              _rgSessionStartBalance = data.balance || 0;
              _rgSessionStartTime = Date.now();
            }
            userData = data;
            migrateCardFreeze();
            retireMigratedAxiomCard();
            syncClanBankListener();
            if(userData.banned) { alert("ВАШ АКАУНТ ЗАБЛОКОВАНО!" + (userData.banReason ? "\nПричина: " + userData.banReason : "")); logout(); return; }
            // Само-виключення — раніше цей прапорець лише встановлювався і ніде
            // й ніколи не перевірявся, тож гравець міг зайти назад одразу ж.
            // Перевіряємо тут (а не лише при явному вході), бо той самий шлях
            // спрацьовує і для автовходу через збережену сесію.
            if(userData.selfExcluded) {
              if(userData.selfExcludeUntil && userData.selfExcludeUntil > Date.now()) {
                const hrsLeft = Math.ceil((userData.selfExcludeUntil - Date.now()) / 3600000);
                alert("🚫 Ви увімкнули само-виключення. Залишилось: " + hrsLeft + " год.");
                logout();
                return;
              } else {
                // Термін вийшов — знімаємо прапорець, щоб не перевіряти щоразу.
                db.ref('users/' + currentUser + '/selfExcluded').set(false);
              }
            }
            if(userData.autoFrozen && !window._autoFrozenNoticeShown) {
              window._autoFrozenNoticeShown = true;
              setTimeout(() => notify('🚩 Акаунт тимчасово призупинено через підозрілу активність — ставки й виводи недоступні до перевірки адміном. Напиши в підтримку.', 'error'), 800);
            }
            if(!userData.isBot) {
              antiCheatCheckBalanceJump(prevBalance, userData.balance);
              if(userData.balance < 0) antiCheatFlag('negative_balance', `Баланс пішов у мінус: ₴${formatNumber(userData.balance)}`, 'high');
            }
            const isAdminAcc = currentUser.toLowerCase() === 'theivankoo' || userData.isAdmin === true;
            if(!isAdminAcc) {
              db.ref('site_config/maintenance').once('value', mSnap => {
                if(mSnap.val()) { alert("🚧 Сайт зараз на технічному обслуговуванні. Зайдіть пізніше."); logout(); }
              });
            }
            document.getElementById('auth-screen').classList.add('hidden');
            stopAuthStatsListeners();
            updateUI();
            checkTermsGate();
            loadContacts();
            checkAdmin();
            checkDailyBonus();
            loadNotifsFromStorage();
            updateNotifBadge();
            loadSettings();
            if(!window._bgTasksStarted) { window._bgTasksStarted = true; setTimeout(startAllBackgroundTasks, 2000); startDisabledGamesWatcher(); watchAntiCheatConfig(); if(localStorage.getItem('pushEnabled')) registerFcmToken(); }
            if(!window._newFeaturesInited) { window._newFeaturesInited = true; setTimeout(initAllNewFeatures, 3000); }
            if(!window._winBackChecked) { window._winBackChecked = true; checkWelcomeBack(); checkOnboarding(); }
            if(!window._initDone) {
              window._initDone = true;
              setTimeout(initHomeTab, 100);
              setTimeout(initBgMusicFromSettings, 1800);
              setTimeout(checkCardOnboarding, 3500);
              setTimeout(checkChangelogBadge, 1000);
              setTimeout(seedChangelogIfAdmin, 3000);
              setTimeout(initChatAutoClear, 500);
              setTimeout(initAiSupport, 600);
              setTimeout(initCurrencySystem, 200);
              setTimeout(checkPendingBetsOnStartup, 3000);
              setTimeout(watchPmUnread, 1500);
              setTimeout(watchSupportUnread, 1500);
              setTimeout(initV62Features, 2200);
              setTimeout(renderActivityFeed, 2000);
              if(userData.virtualCard?.axiomLinked) setTimeout(startAxiomFreezeSync, 1000);
            }
        }, (error) => {
            notify("Помилка зв'язку з базою.", "error");
        });
    } catch(e) { console.error("Sync error:", e); }
}

