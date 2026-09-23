// ═══════════════════════════════════════════════════════════════════
// AxiomaSDK — підключення проєкту-партнера до картки Аксіоми.
//
// Потрібні скрипти Firebase 8.x: firebase-app, firebase-auth, firebase-database.
// Проєкт працює від імені гравця: гравець входить у свій акаунт Аксіоми
// (нік + пароль Аксіоми), і SDK бачить лише його основну картку.
//
//   AxiomaSDK.init();                                   // один раз
//   AxiomaSDK.onChange((acc) => { ... });               // acc = null або стан картки
//   await AxiomaSDK.login(nick, pass);                  // кидає Error з текстом для гравця
//   await AxiomaSDK.link('slotok', 'нік_у_проєкті');    // позначити проєкт підключеним
//   await AxiomaSDK.withdrawFromCard(100, { project: 'slotok', title: 'Поповнення гри' });
//   await AxiomaSDK.depositToCard(100, { project: 'slotok', title: 'Виведення з гри' });
//
// Гроші: списання з картки — транзакцією (не піде в мінус), з перевіркою
// блокування й денного ліміту картки; зарахування — атомарним increment.
// ═══════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';

  const CONFIG = {
    apiKey:            "AIzaSyANB_QQ4V62gbbly0hXgDTX1YTMButPEg4",
    authDomain:        "axioma-bank.firebaseapp.com",
    databaseURL:       "https://axioma-bank-default-rtdb.firebaseio.com",
    projectId:         "axioma-bank",
    storageBucket:     "axioma-bank.firebasestorage.app",
    messagingSenderId: "645185578160",
    appId:             "1:645185578160:web:94b128b8f29cd5aadd8775",
  };
  const EMAIL_DOMAIN = 'axioma-bank.firebaseapp.com';
  const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

  let app = null, auth = null, db = null;
  let uid = null, nick = null;
  let card = null, profile = null, partners = null;
  const subs = [];
  const handlers = new Set();

  function nickEmail(n) {
    let bits = 0, val = 0, out = '';
    new TextEncoder().encode(n).forEach((b) => {
      val = ((val << 8) | b) & 0xfff; bits += 8;
      while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    });
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out + '@' + EMAIL_DOMAIN;
  }
  function nickFromEmail(email) {
    const local = String(email || '').split('@')[0];
    const bytes = [];
    let bits = 0, val = 0;
    for (const ch of local) {
      const i = B32.indexOf(ch);
      if (i < 0) return '';
      val = ((val << 5) | i) & 0xfff; bits += 5;
      if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 255); bits -= 8; }
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch (e) { return ''; }
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function dayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function fail(msg) { const e = new Error(msg); e.axioma = true; return e; }

  function limitLeft(c) {
    const lim = Math.max(0, Number(c && c.dayLimit) || 0);
    if (!lim) return Infinity;
    const spent = c.dayKey === dayKey() ? (Number(c.daySpent) || 0) : 0;
    return Math.max(0, lim - spent);
  }

  function snapshot() {
    if (!uid || !card) return null;
    const digits = String(card.number || '').replace(/\D/g, '');
    return {
      nick: nick,
      name: profile && profile.firstName ? profile.firstName + (profile.lastName ? ' ' + profile.lastName.charAt(0) + '.' : '') : nick,
      card: {
        number: card.number || '', last4: digits.slice(-4), expiry: card.expiry || '', holder: card.holder || '',
        balance: Number(card.balance) || 0, frozen: !!card.frozen,
        skin: card.skin || '', customPhotoUrl: card.skin === 'custom-photo' ? (card.customPhotoUrl || '') : '',
        limitLeft: limitLeft(card),
      },
      partners: partners || {},
    };
  }
  function emit() {
    const s = snapshot();
    handlers.forEach((h) => { try { h(s); } catch (e) { console.error(e); } });
  }

  function detach() {
    subs.splice(0).forEach((r) => r.off());
    card = null; profile = null; partners = null;
  }
  function onAuth(user) {
    detach();
    uid = user ? user.uid : null;
    nick = user ? nickFromEmail(user.email) : null;
    if (!uid || !nick) { uid = null; nick = null; emit(); return; }
    const watch = (path, set) => {
      const ref = db.ref('users/' + uid + '/' + path);
      ref.on('value', (s) => { set(s.val()); emit(); }, (e) => console.error('AxiomaSDK:', e));
      subs.push(ref);
    };
    watch('cards/main', (v) => { card = v; });
    watch('profile', (v) => { profile = v; });
    watch('partners', (v) => { partners = v; });
  }

  function init(opts) {
    if (app) return api;
    if (typeof firebase === 'undefined' || !firebase.auth || !firebase.database) throw new Error('AxiomaSDK: потрібні firebase-app, firebase-auth і firebase-database');
    app = firebase.apps.find((a) => a.name === 'axioma') || firebase.initializeApp(CONFIG, 'axioma');
    auth = app.auth();
    db = app.database();
    if (opts && opts.emulatorHost) {
      db.useEmulator(opts.emulatorHost, 9000);
      auth.useEmulator('http://' + opts.emulatorHost + ':9099');
    }
    auth.onAuthStateChanged(onAuth);
    return api;
  }

  async function login(n, pass) {
    n = String(n || '').trim();
    if (!n || !pass) throw fail('Введи нік і пароль Аксіоми');
    try {
      await auth.signInWithEmailAndPassword(nickEmail(n), pass);
    } catch (e) {
      const code = (e && e.code) || '';
      if (code === 'auth/too-many-requests') throw fail('Забагато спроб. Зачекай кілька хвилин');
      if (code === 'auth/network-request-failed') throw fail('Немає зʼєднання з Аксіомою');
      const exists = await db.ref('handles/' + nickEmail(n).split('@')[0]).once('value').then((s) => s.exists()).catch(() => true);
      throw fail(exists ? 'Невірний нік або пароль Аксіоми' : 'Акаунта Аксіоми з ніком «' + n + '» немає. Спершу відкрий Аксіому й увійди там');
    }
  }
  function logout() { return auth ? auth.signOut() : Promise.resolve(); }

  function onChange(cb) {
    handlers.add(cb);
    cb(snapshot());
    return () => handlers.delete(cb);
  }

  function requireAuth() { if (!uid) throw fail('Спершу увійди в акаунт Аксіоми'); }

  async function link(projectId, projectUser) {
    requireAuth();
    await db.ref('users/' + uid + '/partners/' + projectId).set({ user: String(projectUser || ''), linkedAt: firebase.database.ServerValue.TIMESTAMP });
  }
  async function unlink(projectId) {
    requireAuth();
    await db.ref('users/' + uid + '/partners/' + projectId).remove();
  }

  function logTx(dir, amount, o) {
    return db.ref('users/' + uid + '/tx').push({
      acct: 'main', dir: dir, amount: amount, title: String(o.title || '').slice(0, 80),
      subtitle: String(o.subtitle || o.project || '').slice(0, 80), partner: String(o.project || ''), ts: Date.now(),
    }).catch((e) => console.error('AxiomaSDK tx:', e));
  }

  // Списати з основної картки (гра поповнюється з картки).
  async function withdrawFromCard(amount, o) {
    o = o || {};
    requireAuth();
    amount = round2(Number(amount) || 0);
    if (!(amount > 0)) throw fail('Некоректна сума');
    if (o.project && !(partners && partners[o.project])) throw fail('Проєкт не підключено до картки Аксіоми');
    if (!card) throw fail('Картку Аксіоми ще не випущено — відкрий Аксіому');
    if (card.frozen) throw fail('Картку Аксіоми заблоковано');
    if (amount > limitLeft(card)) throw fail('Денний ліміт картки: сьогодні лишилось ' + limitLeft(card) + ' ₴');
    const res = await db.ref('users/' + uid + '/cards/main/balance').transaction((cur) => {
      const v = Number(cur) || 0;
      if (v + 1e-9 < amount) return;
      return round2(v - amount);
    }, undefined, false);
    if (!res.committed) throw fail('Недостатньо коштів на картці Аксіоми');
    if (Number(card.dayLimit) > 0) {
      const spent = (card.dayKey === dayKey() ? (Number(card.daySpent) || 0) : 0) + amount;
      db.ref('users/' + uid + '/cards/main').update({ dayKey: dayKey(), daySpent: round2(spent) }).catch((e) => console.error(e));
    }
    logTx('out', amount, o);
    return true;
  }

  // Зарахувати на основну картку (виведення з гри або повернення).
  async function depositToCard(amount, o) {
    o = o || {};
    requireAuth();
    amount = round2(Number(amount) || 0);
    if (!(amount > 0)) throw fail('Некоректна сума');
    if (!card) throw fail('Картку Аксіоми ще не випущено — відкрий Аксіому');
    await db.ref('users/' + uid + '/cards/main/balance').set(firebase.database.ServerValue.increment(amount));
    logTx('in', amount, o);
    return true;
  }

  const api = {
    init, login, logout, onChange, link, unlink, withdrawFromCard, depositToCard,
    get account() { return snapshot(); },
    get nick() { return nick; },
    _nickEmail: nickEmail,
  };
  root.AxiomaSDK = api;
})(typeof self !== 'undefined' ? self : this);
