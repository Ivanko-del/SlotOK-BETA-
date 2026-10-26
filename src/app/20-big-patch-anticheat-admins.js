// ╔══════════════════════════════════════════════════════════════╗
// ║  НОВІ ФУНКЦІЇ: пароль, CSV, пошук, AI, мова, крипто, P2P   ║
// ╚══════════════════════════════════════════════════════════════╝

// 1. ЗМІНА ПАРОЛЯ
async function doChangePassword() {
  const old  = document.getElementById('cpOld')?.value || '';
  const nw   = document.getElementById('cpNew')?.value || '';
  const conf = document.getElementById('cpConf')?.value || '';
  const errEl = document.getElementById('cpError');
  const showErr = e => { if(errEl) errEl.textContent = e; };
  if(!old) return showErr('Введіть поточний пароль');
  if(nw.length < 6) return showErr('Мінімум 6 символів');
  if(nw !== conf) return showErr('Паролі не збігаються');
  const cpDone = () => {
    notify('✅ Пароль змінено!', 'success');
    closeModal('changepass');
    document.getElementById('modalChangePass')?.remove();
  };
  const srv = await serverAuthCall('change-password', { nick: currentUser, password: old, newPassword: nw });
  if(srv.status === 200) return cpDone();
  if(serverAuthIsFinal(srv)) return showErr(srv.data.message);
  if(await serverAuthEnabled()) return showErr('Сервер недоступний. Спробуй за хвилину.');
  let nwHash;
  try {
    if(!(await SlotOKPassword.verify(old, userData.pass)).ok) return showErr('Поточний пароль невірний');
    nwHash = await SlotOKPassword.hash(nw);
  } catch(e) {
    console.error('Change password error:', e);
    return showErr(e.message || 'Не вдалося перевірити пароль');
  }
  db.ref('users/' + currentUser + '/pass').set(nwHash).then(() => {
    userData.pass = nwHash;
    cpDone();
  }).catch(() => showErr('Помилка збереження'));
}

// 2. ЕКСПОРТ CSV
function exportHistoryCSV() {
  if(!db) return notify('Немає зʼєднання', 'error');
  db.ref('users/' + currentUser + '/history').once('value').then(function(snap) {
    var data = snap.val();
    if(!data) return notify('Історія порожня', 'error');
    var rows = [['Дата', 'Операція']];
    Object.values(data).sort(function(a,b){return a.date-b.date;}).forEach(function(h) {
      rows.push([new Date(h.date).toLocaleString('uk-UA'), h.text]);
    });
    var csv = rows.map(function(r){ return r.map(function(v){ return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\ufeff' + csv);
    a.download = 'slotok_' + currentUser + '_history.csv';
    a.click();
    notify('📥 CSV завантажено!', 'success');
  });
}

// 3. ГЛОБАЛЬНИЙ ПОШУК
var _searchDebounce = null;
function openGlobalSearch() {
  var ex = document.getElementById('globalSearchModal');
  if(ex) { ex.remove(); return; }
  var m = document.createElement('div');
  m.id = 'globalSearchModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgb(var(--recess-rgb) / calc(0.96 * var(--recess-k)));z-index:9997;padding:16px;overflow-y:auto;';
  m.innerHTML = '<div style="display:flex;gap:10px;margin-bottom:14px;align-items:center;">'
    + '<div style="position:relative;flex:1;"><span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:16px;">🔍</span>'
    + '<input id="globalSearchInput" placeholder="Пошук гравців, ігор..." style="padding-left:40px;font-size:15px;" oninput="onGlobalSearch(this.value)"></div>'
    + '<button onclick="document.getElementById(\'globalSearchModal\').remove()" style="background:rgb(var(--tint-rgb) / 0.06);border:1px solid var(--line);border-radius:var(--r-md);padding:10px 14px;color:var(--fg-3);cursor:pointer;">✕</button></div>'
    + '<div id="searchResults" style="color:var(--fg-4);text-align:center;padding:30px;font-size:13px;">Введіть запит</div>';
  document.body.appendChild(m);
  setTimeout(function() { var el = document.getElementById('globalSearchInput'); if(el) el.focus(); }, 100);
}
function onGlobalSearch(query) {
  clearTimeout(_searchDebounce);
  var res = document.getElementById('searchResults');
  if(!res) return;
  if(query.length < 2) { res.innerHTML = '<div style="color:var(--fg-4);text-align:center;padding:20px;">Мін. 2 символи</div>'; return; }
  _searchDebounce = setTimeout(function() { runGlobalSearch(query); }, 400);
}
function runGlobalSearch(q) {
  var res = document.getElementById('searchResults');
  if(!res) return;
  var ql = q.toLowerCase();
  var results = [];
  var gamesList = [
    {name:'Слоти 🎰',tab:'slots'},{name:'Краш 🚀',tab:'crash'},{name:'Майнер 💣',tab:'mines'},
    {name:'Dice 🎲',tab:'dice'},{name:'Plinko 🔻',tab:'plinko'},{name:'Блекджек 🃏',tab:'blackjack'},
    {name:'Рулетка 🎡',tab:'roulette'},{name:'Coinflip 🪙',tab:'coinflip'},{name:'Hi-Lo 🃏',tab:'hilo'},
    {name:'Limbo 🌀',tab:'limbo'},{name:'Tower 🗼',tab:'tower'},{name:'Keno 🔢',tab:'keno'},
    {name:'Скачки 🏇',tab:'horseracing'},{name:'Quiz 🧠',tab:'quiz'},{name:'Balloon 🎈',tab:'balloon'},
    {name:'Бакара 🃏',tab:'baccarat'},{name:'Відеопокер 🎴',tab:'videpoker'},
  ];
  gamesList.filter(function(g){ return g.name.toLowerCase().indexOf(ql) >= 0 || g.tab.toLowerCase().indexOf(ql) >= 0; }).forEach(function(g) {
    results.push({type:'Гра', icon:'🎮', name:g.name, action:"switchTab('" + g.tab + "');document.getElementById('globalSearchModal').remove()"});
  });
  if(!db) {
    showSearchResults(results, res);
    return;
  }
  db.ref('users').orderByKey().limitToFirst(100).once('value').then(function(snap) {
    var users = snap.val() || {};
    Object.entries(users).filter(function(entry){ return entry[0].toLowerCase().indexOf(ql) >= 0 && !users[entry[0]].isBot && entry[0] !== currentUser; })
      .forEach(function(entry) {
        var nick = entry[0], u = entry[1];
        results.push({type:'Гравець', icon:u.avatar||'👤', name:nick, sub:u.tag||'',
          action:"showPlayerCard('" + nick + "');document.getElementById('globalSearchModal').remove()"});
      });
    showSearchResults(results, res);
  });
}
function showSearchResults(results, res) {
  if(!results.length) { res.innerHTML = '<div style="color:var(--fg-4);text-align:center;padding:20px;">😔 Нічого не знайдено</div>'; return; }
  res.innerHTML = results.slice(0,20).map(function(r) {
    return '<div onclick="' + r.action + '" style="display:flex;align-items:center;gap:12px;padding:12px;background:rgb(var(--tint-rgb) / 0.04);border:1px solid rgb(var(--tint-rgb) / 0.07);border-radius:var(--r-lg);margin-bottom:8px;cursor:pointer;">'
      + '<div style="width:40px;height:40px;border-radius:var(--r-md);background:rgb(var(--accent-rgb) / 0.1);display:flex;align-items:center;justify-content:center;font-size:20px;">' + r.icon + '</div>'
      + '<div style="flex:1;"><div style="font-weight:700;font-size:14px;">' + r.name + '</div>' + (r.sub ? '<div style="font-size:11px;color:var(--fg-3);">' + r.sub + '</div>' : '') + '</div>'
      + '<div style="font-size:9px;color:var(--fg-4);background:rgb(var(--tint-rgb) / 0.04);border-radius:var(--r-sm);padding:3px 8px;">' + r.type + '</div>'
      + '</div>';
  }).join('');
}

// 7. КРИПТО-СИМУЛЯТОР
var _cryptoPortfolio = JSON.parse(localStorage.getItem('slotok_crypto') || '{}');
var CRYPTO_ASSETS = [
  {sym:'BTC', name:'Bitcoin',  emoji:'₿', base:95000, vol:0.04},
  {sym:'ETH', name:'Ethereum', emoji:'Ξ', base:3500,  vol:0.06},
  {sym:'SOL', name:'Solana',   emoji:'◎', base:180,   vol:0.08},
  {sym:'BNB', name:'BNB',      emoji:'⬡', base:600,   vol:0.05},
];
var _cryptoPrices = {};
function updateCryptoPrices() {
  CRYPTO_ASSETS.forEach(function(a) {
    var last = _cryptoPrices[a.sym] || a.base;
    _cryptoPrices[a.sym] = Math.max(last * (1 + (Math.random() - 0.48) * a.vol), a.base * 0.3);
  });
}
function buyCryptoFromBtn(btn) { buyCrypto(btn.dataset.sym, parseInt(btn.dataset.amt)); }
function sellCryptoFromBtn(btn) { sellCrypto(btn.dataset.sym); }

function renderCryptoAssets() {
  var el = document.getElementById('cryptoAssets');
  if(!el) return;
  var pv = 0;
  Object.keys(_cryptoPortfolio).forEach(function(s) { pv += (_cryptoPortfolio[s]||0) * (_cryptoPrices[s]||0); });
  var pvel = document.getElementById('cryptoPortfolioVal');
  if(pvel) pvel.textContent = '₴ ' + formatNumber(Math.round(pv));
  el.innerHTML = CRYPTO_ASSETS.map(function(a) {
    var price  = _cryptoPrices[a.sym] || a.base;
    var owned  = _cryptoPortfolio[a.sym] || 0;
    var chg    = ((price - a.base) / a.base * 100).toFixed(1);
    var isPos  = parseFloat(chg) >= 0;
    var sym    = a.sym;
    var ownedHtml = owned > 0
      ? '<div style="font-size:11px;color:var(--fg-3);margin-bottom:8px;">У портфелі: '
        + owned.toFixed(6) + ' ' + sym + ' ≈ ₴' + formatNumber(Math.round(owned*price)) + '</div>'
      : '';
    var sellBtn = owned > 0
      ? '<button data-sym="' + sym + '" onclick="sellCryptoFromBtn(this)" '
        + 'style="flex:1;background:rgb(var(--neg-rgb) / 0.1);border:1px solid rgb(var(--neg-rgb) / 0.2);'
        + 'border-radius:8px;padding:8px;color:var(--neg);cursor:pointer;font-size:12px;font-weight:700;">Продати</button>'
      : '';
    return '<div style="background:var(--surface-1);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px;margin-bottom:10px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<div style="width:40px;height:40px;border-radius:var(--r-lg);background:rgb(var(--accent-rgb) / 0.1);'
      + 'display:flex;align-items:center;justify-content:center;font-size:20px;">' + a.emoji + '</div>'
      + '<div><div style="font-weight:800;">' + sym + '</div>'
      + '<div style="font-size:10px;color:var(--fg-4);">' + a.name + '</div></div></div>'
      + '<div style="text-align:right;">'
      + '<div style="font-weight:900;font-size:15px;">₴' + formatNumber(Math.round(price)) + '</div>'
      + '<div style="font-size:11px;color:' + (isPos ? 'var(--pos)' : 'var(--neg)') + ';">'
      + (isPos ? '+' : '') + chg + '%</div></div></div>'
      + ownedHtml
      + '<div style="display:flex;gap:6px;">'
      + '<button data-sym="' + sym + '" data-amt="100" onclick="buyCryptoFromBtn(this)" '
      + 'style="flex:1;background:rgb(var(--pos-rgb) / 0.1);border:1px solid rgb(var(--pos-rgb) / 0.2);'
      + 'border-radius:8px;padding:8px;color:var(--pos);cursor:pointer;font-size:12px;font-weight:700;">+100₴</button>'
      + '<button data-sym="' + sym + '" data-amt="500" onclick="buyCryptoFromBtn(this)" '
      + 'style="flex:1;background:rgb(var(--pos-rgb) / 0.08);border:1px solid rgb(var(--pos-rgb) / 0.15);'
      + 'border-radius:8px;padding:8px;color:var(--pos);cursor:pointer;font-size:12px;">+500₴</button>'
      + sellBtn
      + '</div></div>';
  }).join('');
}

function buyCrypto(sym, amount) {
  if(isActiveCardFrozen()) return notify('🔒 Активна картка заблокована — розблокуй її в Касі', 'error');
  if(!userData.balance || userData.balance < amount) return notify('Недостатньо балансу', 'error');
  if(!checkCardLimit(getActiveCardId(), amount)) return;
  var price = _cryptoPrices[sym];
  if(!price) return;
  var qty = amount / price;
  _cryptoPortfolio[sym] = (_cryptoPortfolio[sym] || 0) + qty;
  localStorage.setItem('slotok_crypto', JSON.stringify(_cryptoPortfolio));
  db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(-amount));
  noteCardSpend(getActiveCardId(), amount);
  userData.balance -= amount;
  notify('✅ Куплено ' + qty.toFixed(6) + ' ' + sym + ' за ₴' + amount, 'success');
  renderCryptoAssets();
}
function sellCrypto(sym) {
  var qty = _cryptoPortfolio[sym];
  if(!qty) return notify('Немає активу', 'error');
  var value = Math.round(qty * (_cryptoPrices[sym] || 0));
  db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(value));
  userData.balance += value;
  delete _cryptoPortfolio[sym];
  localStorage.setItem('slotok_crypto', JSON.stringify(_cryptoPortfolio));
  notify('💰 Продано ' + sym + ' за ₴' + formatNumber(value), 'success');
  renderCryptoAssets();
}



// ╔══════════════════════════════════════════════════════════════╗
// ║  ВЕЛИКИЙ ПАТЧ — 30 нових функцій                           ║
// ╚══════════════════════════════════════════════════════════════╝

// ── TELEGRAM MINI APP ──────────────────────────────────────────
function initTelegramMiniApp() {
  if (typeof window.Telegram === 'undefined' || !window.Telegram.WebApp) return;
  var tgApp = window.Telegram.WebApp;
  tgApp.ready();
  tgApp.expand();
  tgApp.setHeaderColor('#000000');
  tgApp.setBackgroundColor('#050505');
  if (tgApp.initDataUnsafe && tgApp.initDataUnsafe.user) {
    var tgUser = tgApp.initDataUnsafe.user;
    notify('✈️ Привіт, ' + (tgUser.first_name || 'Гравець') + '! Telegram MiniApp', 'info');
  }
  var btn = tgApp.MainButton;
  btn.setText('🎰 ГРАТИ');
  btn.onClick(function() { switchTab('lobby'); });
}
// Auto-init on load
setTimeout(function() { try { initTelegramMiniApp(); } catch(e) { console.warn(e); } }, 1000);

// ── ДЕМО РЕЖИМ (гість без реєстрації) ─────────────────────────
var _isDemoMode = false;
function startDemoMode() {
  _isDemoMode = true;
  currentUser = 'demo_guest_' + Math.floor(Math.random()*9999);
  userData = {
    balance: 50000, tag: '🎮 Демо', avatar: '🎮', id: 0,
    freeSlots: 50, totalGames: 0, totalWins: 0, totalWagered: 0,
    dailyStreak: 0, isDemo: true,
  };
  var authScr = document.getElementById('auth-screen');
  if (authScr) authScr.classList.add('hidden');
  updateUI();
  notify('🎮 Демо-режим! Баланс: ₴50 000 (не зберігається)', 'info');
  var banner = document.createElement('div');
  banner.id = 'demoBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,color-mix(in srgb, var(--special) 14%, var(--surface-1)),color-mix(in srgb, var(--special) 21%, var(--surface-1)));border-bottom:1px solid var(--special);padding:6px 16px;text-align:center;z-index:8000;font-size:11px;color:var(--special);display:flex;justify-content:space-between;align-items:center;';
  banner.innerHTML = '<span>🎮 ДЕМО-РЕЖИМ · Всі дані скидаються</span><button onclick="document.getElementById(\'demoBanner\').remove();showAuthScreen()" style="background:var(--accent);border:none;border-radius:var(--r-sm);padding:4px 10px;color:var(--on-accent);font-weight:800;cursor:pointer;font-size:11px;">Реєстрація →</button>';
  document.body.insertBefore(banner, document.body.firstChild);
}

// ── FOLLOW СИСТЕМА ─────────────────────────────────────────────
function followPlayer(nick) {
  if (!nick || nick === currentUser || !db) return;
  db.ref('users/' + currentUser + '/following/' + nick).once('value').then(function(snap) {
    if (snap.exists()) {
      db.ref('users/' + currentUser + '/following/' + nick).remove();
      notify('👤 Відписались від ' + nick, 'info');
    } else {
      db.ref('users/' + currentUser + '/following/' + nick).set(Date.now());
      db.ref('pm/' + nick + '/' + db.ref().push().key).set({
        from: '👥 Підписки', to: nick,
        text: '👥 @' + currentUser + ' підписався на вас!', ts: Date.now()
      });
      db.ref('users/' + nick + '/pmUnread').set(firebase.database.ServerValue.increment(1));
      notify('✅ Ви підписались на ' + nick, 'success');
    }
  });
}

// ── BLOCK ГРАВЦЯ ───────────────────────────────────────────────
function blockUser(nick) {
  if (!nick || nick === currentUser) return;
  db.ref('users/' + currentUser + '/blocked/' + nick).once('value').then(function(snap) {
    if (snap.exists()) {
      db.ref('users/' + currentUser + '/blocked/' + nick).remove();
      notify('🔓 ' + nick + ' розблоковано', 'info');
    } else {
      db.ref('users/' + currentUser + '/blocked/' + nick).set(Date.now());
      notify('🚫 ' + nick + ' заблоковано. Більше не отримаєш ПМ від нього.', 'success');
    }
  });
}

// ── КАРТКА ГРАВЦЯ POPUP ────────────────────────────────────────
function showPlayerCard(nick, event) {
  var existing = document.getElementById('playerCardPopup');
  if (existing) existing.remove();
  if (!nick || nick === currentUser) return;
  db.ref('users/' + nick).once('value').then(function(snap) {
    if (!snap.exists()) return;
    var u = snap.val();
    var card = document.createElement('div');
    card.id = 'playerCardPopup';
    var x = event ? Math.min(event.clientX, window.innerWidth - 200) : 50;
    var y = event ? Math.min(event.clientY, window.innerHeight - 250) : 50;
    card.style.cssText = 'position:fixed;top:' + y + 'px;left:' + x + 'px;background:#111;border:1.5px solid rgba(212,175,55,.3);border-radius:16px;padding:14px;z-index:9000;width:200px;animation:popIn .2s ease;box-shadow:0 8px 32px rgba(0,0,0,.8);';
    var avHtml = (u.avatarUrl || (u.avatar && u.avatar.startsWith('http')))
      ? '<img src="' + safeUrl(u.avatarUrl || u.avatar) + '" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid rgb(var(--accent-rgb) / 0.3);">'
      : '<div style="width:48px;height:48px;border-radius:50%;background:rgb(var(--accent-rgb) / 0.1);display:flex;align-items:center;justify-content:center;font-size:24px;">' + escapeHtml(u.avatar || '👤') + '</div>';
    card.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
      + avHtml
      + '<div><div style="font-weight:800;font-size:13px;">' + escapeHtml(nick) + '</div>'
      + '<div style="font-size:10px;color:var(--fg-3);">' + escapeHtml(u.tag || 'Гравець') + '</div></div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;font-size:10px;">'
      + '<div style="background:var(--bg);border-radius:var(--r-sm);padding:6px;text-align:center;"><div style="color:var(--accent);font-weight:800;">' + formatNumber(u.totalGames||0) + '</div><div style="color:var(--fg-4);">Ігор</div></div>'
      + '<div style="background:var(--bg);border-radius:var(--r-sm);padding:6px;text-align:center;"><div style="color:var(--pos);font-weight:800;">₴' + formatNumber(u.totalWagered||0) + '</div><div style="color:var(--fg-4);">Ставок</div></div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      + '<button onclick="switchTab(\'pm\');document.getElementById(\'pmToInput\').value=' + jsArg(nick) + ';document.getElementById(\'playerCardPopup\').remove()" style="flex:1;background:rgb(var(--info-rgb) / 0.1);border:1px solid rgb(var(--info-rgb) / 0.2);border-radius:var(--r-md);padding:7px;color:var(--info);cursor:pointer;font-size:11px;">✉️ ПМ</button>'
      + '<button onclick="followPlayer(' + jsArg(nick) + ');document.getElementById(\'playerCardPopup\').remove()" style="flex:1;background:rgb(var(--pos-rgb) / 0.1);border:1px solid rgb(var(--pos-rgb) / 0.2);border-radius:var(--r-md);padding:7px;color:var(--pos);cursor:pointer;font-size:11px;">👥 Follow</button>'
      + '<button onclick="blockUser(' + jsArg(nick) + ');document.getElementById(\'playerCardPopup\').remove()" style="background:rgb(var(--neg-rgb) / 0.08);border:1px solid var(--line);border-radius:var(--r-md);padding:7px;color:var(--fg-4);cursor:pointer;font-size:11px;">🚫</button>'
      + '</div>';
    document.body.appendChild(card);
    // Close on outside click
    setTimeout(function() {
      document.addEventListener('click', function handler(e) {
        if (!card.contains(e.target)) { card.remove(); document.removeEventListener('click', handler); }
      });
    }, 100);
  });
}

// ── QR КОД РЕФЕРАЛЬНОГО ───────────────────────────────────────
// ── SHAKE BONUS ────────────────────────────────────────────────
var _lastShakeBonus = 0;
var _shakeThreshold = 20;
var _lastAccel = {x:0,y:0,z:0};
function initShakeBonus() {
  if (!window.DeviceMotionEvent) return;
  window.addEventListener('devicemotion', function(e) {
    var acc = e.accelerationIncludingGravity;
    if (!acc) return;
    var delta = Math.abs(acc.x - _lastAccel.x) + Math.abs(acc.y - _lastAccel.y) + Math.abs(acc.z - _lastAccel.z);
    _lastAccel = {x: acc.x||0, y: acc.y||0, z: acc.z||0};
    if (delta > _shakeThreshold && Date.now() - _lastShakeBonus > 3600000) {
      _lastShakeBonus = Date.now();
      var bonus = Math.floor(Math.random() * 200) + 50;
      if (db && currentUser) {
        db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(bonus));
        notify('📳 Потряс телефон — бонус +' + bonus + '₴! 🎉', 'success');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      }
    }
  });
}

// ── ОНЛАЙН ТАЙМЕР ─────────────────────────────────────────────
var _onlineSeconds = parseInt(localStorage.getItem('slotok_online_total') || '0');
var _onlineTimer = null;
function startOnlineTimer() {
  if (_onlineTimer) clearInterval(_onlineTimer);
  _onlineTimer = setInterval(function() {
    _onlineSeconds++;
    if (_onlineSeconds % 60 === 0) {
      localStorage.setItem('slotok_online_total', _onlineSeconds);
      if (db && currentUser) db.ref('users/' + currentUser + '/onlineSeconds').set(_onlineSeconds);
      var el = document.getElementById('onlineTimeDisplay');
      if (el) el.textContent = getOnlineTimeStr();
    }
  }, 1000);
}
function getOnlineTimeStr() {
  var h = Math.floor(_onlineSeconds / 3600);
  var m = Math.floor((_onlineSeconds % 3600) / 60);
  return h + 'г ' + m + 'хв';
}

// ── СПИСОК ПОБАЖАНЬ ────────────────────────────────────────────
var _wishlist = JSON.parse(localStorage.getItem('slotok_wishlist') || '[]');
function toggleWishlist(item) {
  var idx = _wishlist.indexOf(item);
  if (idx >= 0) {
    _wishlist.splice(idx, 1);
    notify('💔 Видалено зі списку побажань', 'info');
  } else {
    _wishlist.push(item);
    notify('❤️ Додано до списку побажань!', 'success');
  }
  localStorage.setItem('slotok_wishlist', JSON.stringify(_wishlist));
}
// ── КЛАНОВИЙ ЧАТ ──────────────────────────────────────────────
var _clanChatListener = null;
function initClanChat(clanId) {
  if (!clanId) return;
  var msgEl = document.getElementById('clanChatMessages');
  if (!msgEl) return;
  if (_clanChatListener) db.ref('clan_chats/' + clanId).off('value', _clanChatListener);
  _clanChatListener = db.ref('clan_chats/' + clanId).limitToLast(50).on('value', function(snap) {
    var msgs = snap.val() || {};
    msgEl.innerHTML = Object.values(msgs).sort(function(a,b) { return a.ts-b.ts; }).map(function(m) {
      var isMe = m.user === currentUser;
      // Старі повідомлення зберігали весь userData.avatar як є (могло бути base64-фото,
      // до ~80к символів) — підтримуємо і новий формат (avatarEmoji/avatarUrl), і legacy.
      var avatarUrl = m.avatarUrl || (typeof m.avatar === 'string' && m.avatar.length > 10 ? m.avatar : null);
      var avatarEmoji = m.avatarEmoji || (typeof m.avatar === 'string' && m.avatar.length <= 4 ? m.avatar : '👤');
      var avHtml = avatarUrl
        ? '<img src="' + escapeHtml(avatarUrl) + '" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.replaceWith(document.createTextNode(\'👤\'))">'
        : escapeHtml(avatarEmoji);
      return '<div style="display:flex;flex-direction:' + (isMe ? 'row-reverse' : 'row') + ';gap:8px;margin-bottom:8px;">'
        + '<div style="font-size:20px;flex-shrink:0;">' + avHtml + '</div>'
        + '<div style="background:' + (isMe ? 'rgb(var(--accent-rgb) / 0.08)' : 'rgb(var(--tint-rgb) / 0.04)') + ';border:1px solid ' + (isMe ? 'rgb(var(--accent-rgb) / 0.15)' : 'rgb(var(--tint-rgb) / 0.07)') + ';border-radius:var(--r-lg);padding:8px 10px;max-width:72%;">'
        + '<div style="font-size:10px;color:var(--fg-3);margin-bottom:3px;">' + escapeHtml(m.user) + '</div>'
        + '<div style="font-size:13px;">' + escapeHtml(m.text || '') + '</div>'
        + '</div></div>';
    }).join('');
    msgEl.scrollTop = msgEl.scrollHeight;
  });
}
function sendClanChatMsg(clanId) {
  var inp = document.getElementById('clanChatInput');
  var text = inp ? inp.value.trim() : '';
  if (!text || !clanId) return;
  db.ref('clan_chats/' + clanId).push({
    user: currentUser, text: text, ts: Date.now(),
    avatarEmoji: typeof userData.avatar === 'string' && userData.avatar.length <= 4 ? userData.avatar : '👤',
    avatarUrl: typeof userData.avatar === 'string' && userData.avatar.length > 10 ? userData.avatar : null,
  });
  db.ref('clans/' + clanId + '/members').once('value', snap => {
    const members = Object.keys(snap.val() || {});
    members.forEach(m => {
      if (m === currentUser) return;
      notifyBot('player-ping', null, { to: m, kind: 'clan-chat' });
    });
  });
  if (inp) inp.value = '';
}

// ── КЛАНОВИЙ БАНК ──────────────────────────────────────────────
function depositToClanBank(clanId, amount) {
  if (!amount || amount < 100) return notify('Мін. 100₴', 'error');
  if (!userData.balance || userData.balance < amount) return notify('Недостатньо балансу', 'error');
  db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(-amount));
  db.ref('clans/' + clanId + '/bank').set(firebase.database.ServerValue.increment(amount));
  db.ref('clans/' + clanId + '/bankLog').push({ user: currentUser, amount: amount, ts: Date.now(), type: 'deposit' });
  notify('🏦 Внесено в клановий банк: ₴' + formatNumber(amount), 'success');
  const inp = document.getElementById('clanBankDepositInput');
  if (inp) inp.value = '';
  recalcClanScore(clanId);
  loadMyClan(clanId);
}

// ── ЖУРНАЛ БЕЗПЕКИ ─────────────────────────────────────────────
function logSecurityEvent(type, details) {
  if (!db || !currentUser) return;
  db.ref('users/' + currentUser + '/securityLog').push({
    type: type, details: details || '', ts: Date.now(),
    ua: navigator.userAgent.slice(0, 80)
  });
}
// ── ТІНЬОВИЙ РЕЖИМ АДМІНА ─────────────────────────────────────
var _shadowUser = null;
function enterShadowMode(targetNick) {
  if (!isAdminUser()) return notify('Тільки для адміна', 'error');
  db.ref('users/' + targetNick).once('value').then(function(snap) {
    if (!snap.exists()) return notify('Гравця не знайдено', 'error');
    _shadowUser = currentUser;
    var data = snap.val();
    userData = data;
    var banner = document.createElement('div');
    banner.id = 'shadowBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,color-mix(in srgb, var(--neg) 13%, var(--surface-1)),color-mix(in srgb, var(--neg) 22%, var(--surface-1)));border-bottom:2px solid var(--neg);padding:8px 16px;z-index:9999;display:flex;justify-content:space-between;align-items:center;';
    banner.innerHTML = '<span style="color:var(--neg);font-size:12px;font-weight:800;">👁️ SHADOW: @' + targetNick + '</span>'
      + '<button onclick="exitShadowMode()" style="background:var(--neg);border:none;border-radius:var(--r-sm);padding:4px 12px;color:var(--on-neg);cursor:pointer;font-size:11px;font-weight:800;">Вийти</button>';
    document.body.insertBefore(banner, document.body.firstChild);
    updateUI();
    notify('👁️ Shadow режим: @' + targetNick, 'info');
  });
}
function exitShadowMode() {
  if (!_shadowUser) return;
  var el = document.getElementById('shadowBanner');
  if (el) el.remove();
  currentUser = _shadowUser;
  _shadowUser = null;
  startDataSync();
  notify('👁️ Вийшли з Shadow режиму', 'info');
}

// ── АНТИЧІТ ────────────────────────────────────────────────────
var _betHistory = [];
// ╔══════════════════════════════════════════════════════════════╗
// ║  АНТИ-ЧІТ v2 — реальне виявлення + сповіщення адміну         ║
// ║                                                                ║
// ║  Чесно: без бекенду (сайт = статичний HTML + Firebase),      ║
// ║  неможливо ФІЗИЧНО заборонити комусь відкрити консоль         ║
// ║  браузера і написати db.ref(...).set(999999) — для цього      ║
// ║  потрібен сервер, якого тут немає. Що МОЖНА зробити чесно:    ║
// ║  виявляти підозрілі патерни в реальному часі й одразу         ║
// ║  сповіщати адміна, щоб він міг забанити/перевірити вручну.    ║
// ╚══════════════════════════════════════════════════════════════╝

let _antiCheatBetTimestamps = [];

function antiCheatRecordBet(bet) {
  if(!currentUser) return;
  const now = Date.now();
  _antiCheatBetTimestamps.push(now);
  _antiCheatBetTimestamps = _antiCheatBetTimestamps.filter(t => now - t < 60000);
  // Людина фізично не встигне усвідомлено зробити стільки ставок за хвилину
  // в казино з підтвердженнями/анімаціями — це ознака скрипта/бота.
  // Поріг налаштовується в адмінці → 👑 Адміни → Анти-чіт.
  if(_acConfig.enabled && _antiCheatBetTimestamps.length > _acConfig.rapidBetsPerMin) {
    antiCheatFlag('rapid_betting', `${_antiCheatBetTimestamps.length} ставок за 60с`, 'medium');
    _antiCheatBetTimestamps = []; // не спамити повторно щохвилини
  }
  // Персистентний лічильник — переживає перезавантаження сторінки
  db.ref('users/'+currentUser+'/antiCheat/betCount').transaction(c => (c||0)+1);
}

function antiCheatCheckBalanceJump(oldBalance, newBalance) {
  if(!_acConfig.enabled) return;
  if(oldBalance === null || oldBalance === undefined || !currentUser) return; // перший запуск — нема з чим порівнювати
  const delta = newBalance - oldBalance;
  if(delta <= 0) return; // цікавлять лише РАПТОВІ збільшення

  const wagered = userData.totalWagered || 0;
  const games = userData.totalGames || 0;

  // Великий стрибок балансу при тому що акаунт майже не грав —
  // класична ознака ручної правки балансу через консоль браузера
  if(delta > _acConfig.balanceJumpAmount && games < _acConfig.balanceJumpMinGames) {
    antiCheatFlag('balance_jump', `+₴${formatNumber(delta)} за раз, зіграно лише ${games} ігор`, 'high');
    return;
  }
  // Баланс сильно переважає над сумою всіх ставок гравця — теж підозріло,
  // бо в чесній грі баланс не може рости набагато швидше за обіг ставок
  if(newBalance > _acConfig.implausibleBalance && wagered < newBalance * (_acConfig.implausibleRatio / 100)) {
    antiCheatFlag('balance_implausible', `Баланс ₴${formatNumber(newBalance)} при загальних ставках лише ₴${formatNumber(wagered)}`, 'high');
  }
}

function antiCheatFlag(type, details, severity) {
  if(!currentUser || !_acConfig.enabled) return;
  severity = severity || 'low';
  db.ref('anti_cheat_flags/'+currentUser).push({ type, details, severity, ts: Date.now() });
  db.ref('users/'+currentUser+'/flagged').set(true);
  db.ref('users/'+currentUser+'/flagReason').set(details);
  // Автоматична дія: 'high' — це патерни, що майже ніколи не трапляються
  // чесно (від'ємний баланс, ручна правка балансу консоллю тощо), тож
  // варто одразу призупинити ставки/виводи до ручної перевірки адміном,
  // а не лишень мовчазно чекати поки хтось прочитає сповіщення.
  if(severity === 'high' && _acConfig.autoFreeze && !userData?.autoFrozen) {
    db.ref('users/'+currentUser).update({ autoFrozen: true, autoFrozenReason: details, autoFrozenAt: Date.now() });
  }
  // Реальне сповіщення адміну — не просто мовчазний лог
  const icon = severity === 'high' ? '🔴' : severity === 'medium' ? '🟠' : '🟡';
  db.ref('pm/'+ADMIN_OWNER+'/'+db.ref().push().key).set({
    from: '🚩 Анти-чіт', to: ADMIN_OWNER,
    text: `${icon} Підозріла активність @${currentUser}\nТип: ${type}\n${details}${severity === 'high' ? '\n⛔ Акаунт автоматично призупинено до перевірки' : ''}`,
    ts: Date.now()
  });
  db.ref('users/'+ADMIN_OWNER+'/pmUnread').set(firebase.database.ServerValue.increment(1));
}

// Список позначених акаунтів для адмін-панелі
function loadFlaggedPlayers() {
  const el = document.getElementById('flaggedPlayersList');
  if(!el) return;
  el.innerHTML = '<div style="color:var(--fg-4);text-align:center;padding:14px;">Завантаження...</div>';
  db.ref('users').orderByChild('flagged').equalTo(true).limitToLast(30).once('value').then(snap => {
    const users = snap.val() || {};
    const entries = Object.entries(users);
    if(!entries.length) { el.innerHTML = '<div style="color:var(--fg-4);text-align:center;padding:14px;">🎉 Немає позначених гравців</div>'; return; }
    el.innerHTML = entries.map(([nick, u]) => `
      <div style="background:var(--surface-1);border:1px solid rgb(var(--neg-rgb) / 0.25);border-radius:var(--r-md);padding:10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-weight:700;font-size:12px;">🚩 ${nick} ${u.autoFrozen ? '<span style="background:rgb(var(--neg-rgb) / 0.18);color:var(--neg);border-radius:var(--r-sm);padding:1px 6px;font-size:9px;margin-left:4px;">⛔ ПРИЗУПИНЕНО</span>' : ''}</span>
          <button onclick="clearPlayerFlag(${jsArg(nick)})" style="background:rgb(var(--pos-rgb) / 0.1);border:1px solid rgb(var(--pos-rgb) / 0.2);border-radius:var(--r-sm);color:var(--pos);font-size:10px;padding:3px 8px;cursor:pointer;">✅ Зняти позначку</button>
        </div>
        <div style="font-size:10px;color:var(--fg-3);">${u.flagReason || 'без деталей'}</div>
        <div style="font-size:10px;color:var(--fg-4);margin-top:2px;">₴${formatNumber(u.balance||0)} · ${u.totalGames||0} ігор · ставок на ₴${formatNumber(u.totalWagered||0)}</div>
      </div>`).join('');
  });
}

function clearPlayerFlag(nick) {
  if(!isAdminUser()) return notify('Тільки для адміна', 'error');
  db.ref('users/'+nick).update({ flagged: false, flagReason: null, autoFrozen: false, autoFrozenReason: null });
  logAdminAction('unflag', `@${nick}`);
  notify('✅ Позначку знято з '+nick, 'success');
  loadFlaggedPlayers();
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  КЕРУВАННЯ АДМІНАМИ — призначити, обмежити, зняти           ║
// ╚══════════════════════════════════════════════════════════════╝

// Набір прав за замовчуванням для новопризначеного адміна:
// повсякденна робота без доступу до грошей, обнулення й інших адмінів
const ADMIN_PRESET_DEFAULT = { requests:true, stats:true, users:false, bots:false, content:true, finance:false, security:false, moderation:true, admins:false };

function loadAdminsList() {
  const el = document.getElementById('adminsList');
  if(!el) return;
  el.innerHTML = '<div style="color:var(--fg-4);text-align:center;padding:14px;font-size:12px;">Завантаження...</div>';
  db.ref('users').orderByChild('isAdmin').equalTo(true).once('value').then(snap => {
    const users = snap.val() || {};
    // Власник може не мати isAdmin у базі — права в нього за ніком
    if(!Object.keys(users).some(n => n.toLowerCase() === ADMIN_OWNER)) users[ADMIN_OWNER] = { _ownerStub: true };

    el.innerHTML = Object.keys(users).sort().map(nick => {
      const u = users[nick] || {};
      const owner = nick.toLowerCase() === ADMIN_OWNER;
      const perms = u.adminPerms;
      const legacy = !owner && (!perms || typeof perms !== 'object');
      // Показуємо лише видані права — так одразу видно обсяг доступу,
      // а не сіро-зелену мозаїку з усіх дев'яти
      const granted = legacy || owner ? [] : ADMIN_PERMS.filter(p => perms[p.key] === true);
      const chips = owner
        ? '<span class="adm-perm-chip on">Повний доступ (власник)</span>'
        : legacy
          ? '<span class="adm-perm-chip legacy">Повний доступ — права не обмежено</span>'
          : granted.length
            ? granted.map(p => `<span class="adm-perm-chip on">${p.icon} ${p.name}</span>`).join('')
              + (granted.length < ADMIN_PERMS.length ? `<span class="adm-perm-chip">решта закрита</span>` : '')
            : '<span class="adm-perm-chip off">Доступу немає жодного</span>';

      return `<div class="adm-admin-card">
        <div class="adm-admin-head">
          <div style="min-width:0;">
            <div class="adm-admin-nick">${owner ? '👑' : '🛡️'} ${escapeHtml(nick)}${owner ? '<span class="adm-owner-tag">ВЛАСНИК</span>' : ''}</div>
            <div class="adm-admin-sub">${owner ? 'Права не можна змінити' : legacy ? 'Призначений до появи прав' : 'Доступ обмежено'}</div>
          </div>
          ${owner ? '' : `<button class="adm-mini-btn danger" onclick="revokeAdmin(${jsArg(nick)})">Зняти адмінку</button>`}
        </div>
        <div class="adm-perm-chips">${chips}</div>
        ${owner ? '' : `<div class="adm-perm-toggles" id="admPerms-${escapeHtml(nick)}" style="display:none;">
          ${ADMIN_PERMS.map(p => `<label class="adm-perm-row">
            <input type="checkbox" data-admin-nick="${escapeHtml(nick)}" data-perm="${p.key}" ${(!legacy && perms[p.key] === true) ? 'checked' : ''}>
            <span><b>${p.icon} ${p.name}</b><br><span style="color:var(--fg-3);font-size:10px;">${p.desc}</span></span>
          </label>`).join('')}
          <button class="adm-mini-btn" style="width:100%;margin-top:8px;" onclick="saveAdminPerms(${jsArg(nick)})">💾 Зберегти права</button>
        </div>
        <button class="adm-mini-btn" style="width:100%;margin-top:8px;" onclick="toggleAdminPermsEditor(${jsArg(nick)})">⚙️ Налаштувати права</button>`}
      </div>`;
    }).join('');
  }).catch(() => {
    el.innerHTML = '<div style="color:var(--neg);text-align:center;padding:14px;font-size:12px;">Не вдалось завантажити список</div>';
  });
}

function toggleAdminPermsEditor(nick) {
  const box = document.getElementById('admPerms-' + nick);
  if(box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

function saveAdminPerms(nick) {
  if(!requireAdminPerm('admins')) return;
  if(nick.toLowerCase() === ADMIN_OWNER) return notify('Права власника змінити не можна', 'error');
  if(nick === currentUser) return notify('Свої власні права міняти не можна', 'error');
  const perms = {};
  document.querySelectorAll(`[data-admin-nick="${nick}"]`).forEach(cb => { perms[cb.dataset.perm] = cb.checked; });
  const granted = ADMIN_PERMS.filter(p => perms[p.key]).map(p => p.name);
  db.ref('users/' + nick + '/adminPerms').set(perms).then(() => {
    logAdminAction('admin_perms', `@${nick} → ${granted.length ? granted.join(', ') : 'нічого'}`);
    notify('✅ Права оновлено: ' + nick, 'success');
    loadAdminsList();
  });
}

function grantAdmin() {
  if(!requireAdminPerm('admins')) return;
  const nick = (document.getElementById('newAdminNick')?.value || '').trim();
  if(!nick) return notify('Введи нік гравця', 'error');
  db.ref('users/' + nick).once('value').then(snap => {
    if(!snap.exists()) return notify('Гравця не знайдено', 'error');
    if(snap.val().isAdmin === true) return notify(nick + ' уже адмін', 'info');
    db.ref('users/' + nick).update({ isAdmin: true, adminPerms: ADMIN_PRESET_DEFAULT });
    db.ref('pm/' + nick + '/' + db.ref().push().key).set({
      from: '👑 SlotOK', to: nick,
      text: 'Тобі видано права адміністратора. Доступні розділи видно в адмін-панелі.', ts: Date.now()
    });
    db.ref('users/' + nick + '/pmUnread').set(firebase.database.ServerValue.increment(1));
    logAdminAction('admin_grant', `@${nick} — базові права`);
    notify('👑 ' + nick + ' тепер адмін', 'success');
    const inp = document.getElementById('newAdminNick');
    if(inp) inp.value = '';
    loadAdminsList();
  });
}

function revokeAdmin(nick) {
  if(!requireAdminPerm('admins')) return;
  if(nick.toLowerCase() === ADMIN_OWNER) return notify('Власника не можна зняти з адмінки', 'error');
  if(nick === currentUser) return notify('Зняти адмінку сам із себе не можна', 'error');
  if(!confirm('Зняти права адміна з ' + nick + '?')) return;
  db.ref('users/' + nick).update({ isAdmin: false, adminPerms: null });
  db.ref('pm/' + nick + '/' + db.ref().push().key).set({
    from: '👑 SlotOK', to: nick, text: 'Права адміністратора знято.', ts: Date.now()
  });
  db.ref('users/' + nick + '/pmUnread').set(firebase.database.ServerValue.increment(1));
  logAdminAction('admin_revoke', `@${nick}`);
  notify('Права знято з ' + nick, 'success');
  loadAdminsList();
}

// Показуємо лише ті вкладки адмінки, до яких у цього адміна є доступ
function applyAdminTabVisibility() {
  let firstAllowed = null;
  ADMIN_PERMS.forEach(p => {
    const btn = document.getElementById('admtb-' + p.key);
    if(!btn) return;
    const allowed = adminCan(p.key);
    btn.style.display = allowed ? '' : 'none';
    if(allowed && !firstAllowed) firstAllowed = p.key;
  });
  return firstAllowed;
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  НАЛАШТУВАННЯ АНТИ-ЧІТА                                      ║
// ╚══════════════════════════════════════════════════════════════╝

// Значення за замовчуванням = ті самі пороги, що були зашиті в коді,
// тож поки власник нічого не міняв, поведінка лишається як була
const AC_DEFAULTS = {
  enabled: true,
  autoFreeze: true,
  rapidBetsPerMin: 25,
  balanceJumpAmount: 100000,
  balanceJumpMinGames: 5,
  implausibleBalance: 3000000,
  implausibleRatio: 2,        // % від балансу
  multiAccount: true,
  multiAccountMin: 2,
};
let _acConfig = Object.assign({}, AC_DEFAULTS);

function watchAntiCheatConfig() {
  if(!db) return;
  db.ref('site_config/antiCheat').on('value', snap => {
    _acConfig = Object.assign({}, AC_DEFAULTS, snap.val() || {});
  });
}

function loadAntiCheatSettings() {
  db.ref('site_config/antiCheat').once('value').then(snap => {
    const c = Object.assign({}, AC_DEFAULTS, snap.val() || {});
    const set = (id, val, isCheck) => {
      const el = document.getElementById(id);
      if(!el) return;
      if(isCheck) el.checked = !!val; else el.value = val;
    };
    set('acEnabled', c.enabled, true);
    set('acAutoFreeze', c.autoFreeze, true);
    set('acMultiAccount', c.multiAccount, true);
    set('acRapidBets', c.rapidBetsPerMin);
    set('acJumpAmount', c.balanceJumpAmount);
    set('acJumpGames', c.balanceJumpMinGames);
    set('acImplausible', c.implausibleBalance);
    set('acRatio', c.implausibleRatio);
    set('acMultiMin', c.multiAccountMin);
    updateAntiCheatStatusLine(c);
  });
}

function updateAntiCheatStatusLine(c) {
  const el = document.getElementById('acStatusLine');
  if(!el) return;
  el.textContent = c.enabled
    ? (c.autoFreeze ? '✅ Увімкнено · підозрілі акаунти призупиняються автоматично'
                    : '✅ Увімкнено · лише сповіщення, без автопризупинення')
    : '⛔ Вимкнено — порушення не відстежуються';
  el.style.color = c.enabled ? 'var(--pos)' : 'var(--neg)';
}

function saveAntiCheatSettings() {
  if(!requireAdminPerm('admins')) return;
  const num = (id, def, min) => {
    const v = parseInt(document.getElementById(id)?.value);
    return (isNaN(v) || v < (min === undefined ? 1 : min)) ? def : v;
  };
  const cfg = {
    enabled:             !!document.getElementById('acEnabled')?.checked,
    autoFreeze:          !!document.getElementById('acAutoFreeze')?.checked,
    multiAccount:        !!document.getElementById('acMultiAccount')?.checked,
    rapidBetsPerMin:     num('acRapidBets', AC_DEFAULTS.rapidBetsPerMin, 5),
    balanceJumpAmount:   num('acJumpAmount', AC_DEFAULTS.balanceJumpAmount, 1000),
    balanceJumpMinGames: num('acJumpGames', AC_DEFAULTS.balanceJumpMinGames, 0),
    implausibleBalance:  num('acImplausible', AC_DEFAULTS.implausibleBalance, 10000),
    implausibleRatio:    num('acRatio', AC_DEFAULTS.implausibleRatio, 1),
    multiAccountMin:     num('acMultiMin', AC_DEFAULTS.multiAccountMin, 1),
  };
  db.ref('site_config/antiCheat').set(cfg).then(() => {
    logAdminAction('anticheat_config', cfg.enabled ? `увімкнено (автостоп: ${cfg.autoFreeze ? 'так' : 'ні'})` : 'ВИМКНЕНО');
    notify('🛡️ Налаштування анти-чіта збережено', 'success');
    updateAntiCheatStatusLine(cfg);
  });
}

function resetAntiCheatSettings() {
  if(!requireAdminPerm('admins')) return;
  if(!confirm('Повернути стандартні пороги анти-чіта?')) return;
  db.ref('site_config/antiCheat').set(AC_DEFAULTS).then(() => {
    logAdminAction('anticheat_config', 'скинуто до стандартних');
    notify('↩️ Повернуто стандартні налаштування', 'success');
    loadAntiCheatSettings();
  });
}

function initAdminsPanel() {
  loadAdminsList();
  loadAntiCheatSettings();
}

// ── IP ЛОГУВАННЯ ───────────────────────────────────────────────
function saveUserIP() {
  if (!db || !currentUser) return;
  // Вузол users читається публічно, тож відкриту IP туди не пишемо (персональні
  // дані). Для пошуку мультиакаунтів достатньо порівнювати хеш; у журнал
  // безпеки гравця — лише замаскована адреса.
  fetch('https://api.ipify.org?format=json').then(function(r) { return r.json(); }).then(async function(data) {
    const ip = data.ip || 'unknown';
    const ipHash = ip === 'unknown' ? null : await hashIp(ip);
    db.ref('users/' + currentUser).update({ lastIP: null, lastIpHash: ipHash });
    logSecurityEvent('login', 'IP: ' + maskIp(ip));
    if(ipHash) antiCheatCheckMultiAccount(ipHash);
  }).catch(function() {
    logSecurityEvent('login', 'IP: unknown');
  });
}

// Кілька акаунтів з однієї IP не завжди читерство (сім'я/гуртожиток на
// одному Wi-Fi), тож це лише 'medium' — сповіщає адміна для ручної
// перевірки, а не блокує нікого автоматично.
async function hashIp(ip) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('slotok-ip-v1:' + ip));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
function maskIp(ip) {
  if(/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split('.').slice(0, 2).join('.') + '.x.x';
  if(ip.includes(':')) return ip.split(':').slice(0, 2).join(':') + ':…';
  return ip;
}
function antiCheatCheckMultiAccount(ipHash) {
  if(!currentUser || !_acConfig.enabled || !_acConfig.multiAccount) return;
  db.ref('users').orderByChild('lastIpHash').equalTo(ipHash).once('value').then(snap => {
    const users = snap.val() || {};
    const others = Object.keys(users).filter(n => n !== currentUser && !users[n].isBot);
    if(others.length >= _acConfig.multiAccountMin) {
      antiCheatFlag('multi_account', `Та сама IP що й у ${others.length} інших акаунтів: ${others.slice(0,5).join(', ')}`, 'medium');
    }
  }).catch(() => {});
}

// ── ЧАТОВИЙ РОЗІГРАШ ───────────────────────────────────────────
var _activeGiveaway = null;
function startChatGiveaway(amount) {
  if (!isAdminUser()) return notify('Тільки для адміна', 'error');
  if (!amount || amount < 100) return notify('Мін. 100₴', 'error');
  _activeGiveaway = { amount: amount, participants: {}, startedBy: currentUser, endTime: Date.now() + 30000 };
  db.ref('global_chat').push({
    user: '🎰 SlotOK', text: '🎁 РОЗІГРАШ ' + formatNumber(amount) + '₴! Напиши + щоб взяти участь! ⏰ 30 секунд!',
    ts: Date.now(), avatar: '🏆',
  });
  notify('🎁 Розіграш запущено! 30 секунд...', 'info');
  setTimeout(function() { finishGiveaway(_activeGiveaway); }, 30000);
}
function participateGiveaway() {
  if (!_activeGiveaway) return;
  if (Date.now() > _activeGiveaway.endTime) return notify('Розіграш завершено', 'error');
  _activeGiveaway.participants[currentUser] = true;
  notify('✅ Ти в розіграші!', 'success');
}
function finishGiveaway(g) {
  if (!g) return;
  var parts = Object.keys(g.participants);
  if (!parts.length) {
    db.ref('global_chat').push({ user: '🎰 SlotOK', text: '😔 Розіграш завершено без учасників', ts: Date.now(), avatar: '🏆' });
    return;
  }
  var winner = parts[Math.floor(Math.random() * parts.length)];
  db.ref('users/' + winner + '/balance').set(firebase.database.ServerValue.increment(g.amount));
  db.ref('global_chat').push({
    user: '🎰 SlotOK',
    text: '🏆 Переможець розіграшу: @' + winner + ' виграв ' + formatNumber(g.amount) + '₴! 🎉',
    ts: Date.now(), avatar: '🏆',
  });
  notify('🏆 Переможець: @' + winner, 'success');
  _activeGiveaway = null;
}

// ── ЗВУКОВІ ТЕМИ ───────────────────────────────────────────────
var _soundTheme = localStorage.getItem('slotok_sound_theme') || 'default';
var SOUND_THEMES = {
  default: { win: [523,659,784], lose: [200,150], click: [440] },
  retro:   { win: [220,440,880], lose: [150,100], click: [220] },
  casino:  { win: [440,554,659,880], lose: [220,196], click: [554] },
  minimal: { win: [880],         lose: [220],    click: [0] },
};
function setSoundTheme(theme) {
  _soundTheme = theme;
  localStorage.setItem('slotok_sound_theme', theme);
  notify('🎵 Звукова тема: ' + theme, 'info');
  playSound('win');
}
// ── КАСТОМНИЙ ТЕГ (купити) ─────────────────────────────────────
function buyCustomTag(tag, price) {
  var slotikyEl = document.getElementById('headerSlotiky');
  var slotiky = parseInt(slotikyEl ? slotikyEl.textContent : 0) || userData.slotiky || 0;
  if (slotiky < price) return notify('Потрібно ' + formatNumber(price) + ' 🪙 Слотиків', 'error');
  db.ref('users/' + currentUser + '/slotiky').set(firebase.database.ServerValue.increment(-price));
  db.ref('users/' + currentUser + '/tag').set(tag);
  userData.tag = tag;
  notify('✅ Тег встановлено: ' + tag, 'success');
  document.querySelector('div[style] .grid')?.parentElement?.parentElement?.remove();
}

// ── GIFTING VIP ────────────────────────────────────────────────
function giftVip(toNick, days) {
  if (!toNick || !days) return notify('Заповни всі поля', 'error');
  var cost = days * 100;
  if (!userData.balance || userData.balance < cost) return notify('Потрібно ₴' + formatNumber(cost), 'error');
  db.ref('users/' + toNick).once('value').then(function(snap) {
    if (!snap.exists()) return notify('Гравця не знайдено', 'error');
    db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(-cost));
    var vipUntil = Date.now() + days * 86400000;
    db.ref('users/' + toNick + '/vipGiftUntil').set(vipUntil);
    db.ref('pm/' + toNick + '/' + db.ref().push().key).set({
      from: '🎁 SlotOK', to: toNick,
      text: '🎁 @' + currentUser + ' подарував тобі VIP на ' + days + ' днів! Насолоджуйся!',
      ts: Date.now()
    });
    db.ref('users/' + toNick + '/pmUnread').set(firebase.database.ServerValue.increment(1));
    notify('🎁 VIP подарований @' + toNick + ' на ' + days + ' днів!', 'success');
  });
}
// ── ТОП ДОНАТЕРІВ ─────────────────────────────────────────────
// ── ПОРІВНЯННЯ ГРАВЦІВ ─────────────────────────────────────────
function doComparePlayers(nick) {
  var el = document.getElementById('cmpResult');
  if (!el || !nick) return;
  el.innerHTML = '<div style="color:var(--fg-4);text-align:center;padding:20px;">Завантаження...</div>';
  db.ref('users/' + nick).once('value').then(function(snap) {
    if (!snap.exists()) { el.innerHTML = '<div style="color:var(--neg);text-align:center;">Гравця не знайдено</div>'; return; }
    var them = snap.val();
    var me = userData;
    var stats = [
      {label:'Ігор', me: me.totalGames||0, them: them.totalGames||0},
      {label:'Перемог', me: me.totalWins||0, them: them.totalWins||0},
      {label:'Ставок', me: me.totalWagered||0, them: them.totalWagered||0},
      {label:'Баланс', me: me.balance||0, them: them.balance||0},
      {label:'Серія', me: me.dailyStreak||0, them: them.dailyStreak||0},
    ];
    el.innerHTML = '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;margin-bottom:8px;font-size:11px;text-align:center;">'
      + '<div style="color:var(--accent);font-weight:800;">@' + currentUser + '</div><div></div><div style="color:var(--info);font-weight:800;">@' + nick + '</div></div>'
      + stats.map(function(s) {
          var meWins = s.me >= s.them;
          return '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);">'
            + '<div style="text-align:center;font-weight:' + (meWins?'900':'400') + ';color:' + (meWins?'var(--accent)':'var(--fg-3)') + ';">' + formatNumber(s.me) + '</div>'
            + '<div style="text-align:center;font-size:10px;color:var(--fg-4);">' + s.label + '</div>'
            + '<div style="text-align:center;font-weight:' + (!meWins?'900':'400') + ';color:' + (!meWins?'var(--info)':'var(--fg-3)') + ';">' + formatNumber(s.them) + '</div>'
            + '</div>';
        }).join('');
  });
}

// ── ПРОФІЛЬНІ ЕФЕКТИ ───────────────────────────────────────────
var PROFILE_EFFECTS = [
  {id:'gold_glow', name:'Золоте сяйво', emoji:'✨', css:'box-shadow:0 0 20px rgba(212,175,55,.8),0 0 40px rgba(212,175,55,.4);animation:pulseGlow 2s infinite;', price:500},
  {id:'fire', name:'Вогонь', emoji:'🔥', css:'box-shadow:0 0 20px rgba(255,100,0,.8);animation:heartbeat .8s infinite;', price:750},
  {id:'ice', name:'Крига', emoji:'❄️', css:'box-shadow:0 0 20px rgba(100,200,255,.8);filter:drop-shadow(0 0 10px #4af);', price:750},
  {id:'rainbow', name:'Веселка', emoji:'🌈', css:'border:3px solid transparent;background-clip:padding-box;animation:winShimmer 1s infinite;', price:1000},
  {id:'vip_crown', name:'VIP корона', emoji:'👑', css:'box-shadow:0 0 30px rgba(212,175,55,1);border:3px solid #d4af37;', price:1500},
];
function buyProfileEffect(effectId, price) {
  var slotiky = userData.slotiky || 0;
  if (slotiky < price) return notify('Потрібно ' + formatNumber(price) + ' 🪙', 'error');
  db.ref('users/' + currentUser + '/slotiky').set(firebase.database.ServerValue.increment(-price));
  db.ref('users/' + currentUser + '/profileEffect').set(effectId);
  userData.profileEffect = effectId;
  userData.slotiky = (userData.slotiky||0) - price;
  notify('✅ Ефект активовано!', 'success');
}

