// ============================================
// ===== MONO PASS (пропустити купівлю) =====
// ============================================
function monoPass() {
  const buyBtn  = document.getElementById('monoBuyBtn');
  const passBtn = document.getElementById('monoPassBtn');
  if(buyBtn)  buyBtn.disabled  = true;
  if(passBtn) passBtn.disabled = true;
  monoLog('⏭ Ви пропустили купівлю', 'info');
  setTimeout(monoAiTurn, 500);
}

// ============================================
// ===== НАЛАШТУВАННЯ =====
// ============================================
let appSettings = {};

function loadSettings() {
  try {
    appSettings = JSON.parse(localStorage.getItem('slotok_settings') || '{}');
  } catch(e) { appSettings = {}; }
  applyAllSettings();
  const cur = CURRENCIES[currentCurrency] || CURRENCIES.UAH;
  const flagEl = document.getElementById('settingCurrencyFlag');
  const nameEl = document.getElementById('settingCurrencyName');
  if(flagEl) flagEl.textContent = cur.flag;
  if(nameEl) nameEl.textContent = cur.name + ' (' + cur.code + ')';
  buildMiniRatesList();
}

function buildMiniRatesList() {
  const el = document.getElementById('miniRatesList'); if(!el) return;
  el.innerHTML = '';
  const rateInfoEl = document.getElementById('settingRateInfo');
  const keys = ['USD','EUR','PLN','BTC','ETH','SOL'];
  keys.forEach(code => {
    const cur = CURRENCIES[code]; if(!cur) return;
    const rate = currencyRates[code];
    if(!rate) return;
    const uahPer1 = 1/rate;
    const fmt = uahPer1 >= 1 ? uahPer1.toLocaleString('uk-UA',{maximumFractionDigits:1}) : uahPer1.toFixed(6);
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;justify-content:space-between;color:var(--fg-3);padding:2px 0;';
    div.innerHTML = '<span>' + cur.flag + ' ' + code + '</span><span style="color:var(--accent);">' + fmt + '₴</span>';
    el.appendChild(div);
  });
  if(rateInfoEl && ratesLastFetch) {
    rateInfoEl.textContent = 'Оновлено: ' + new Date(ratesLastFetch).toLocaleTimeString('uk-UA');
  } else if(rateInfoEl) {
    rateInfoEl.textContent = 'Кліки на валюту → зміна відображення';
  }
}

function saveSetting(key, val) {
  appSettings[key] = val;
  localStorage.setItem('slotok_settings', JSON.stringify(appSettings));
  if(key === 'sounds') {
    notify(val ? '🔊 Звук увімкнено' : '🔇 Звук вимкнено', 'info');
  }
  if(key === 'music') {
    if(val) startBgMusic();
    else    stopBgMusic();
  }
  if(key === 'notifs') {
    notify(val ? '🔔 Сповіщення увімкнено' : '🔕 Сповіщення вимкнено', 'info');
  }
}

function getSetting(key, def) {
  return appSettings[key] !== undefined ? appSettings[key] : def;
}

function applyAllSettings() {
  const ids = { sounds:['settingSounds'], music:['settingMusic'], vibrate:['settingVibrate'], notifs:['settingNotifs'], giftNotifs:['settingGiftNotifs'], bonusNotifs:['settingBonusNotifs'] };
  const defaults = { sounds:true, music:false, vibrate:true, notifs:true, giftNotifs:true, bonusNotifs:true };
  Object.entries(ids).forEach(([key, idList]) => {
    idList.forEach(id => {
      const el = document.getElementById(id);
      if(el) el.checked = getSetting(key, defaults[key]);
    });
  });
  // Font size — one system, restored on the button row
  const fs = getSetting('fontSize', 14);
  document.body.style.zoom = FONT_SIZE_ZOOM[fs] || 1;
  document.querySelectorAll('.font-size-btn').forEach(b=>b.classList.remove('active'));
  const fsBtn = document.getElementById('fs_' + fs);
  if(fsBtn) fsBtn.classList.add('active');
  const theme = normalizeThemeSetting(getSetting('theme', 'auto'));
  applyThemeVars(theme);
  syncThemeButtons(theme);
  loadAnimSpeed();
  loadLiveWallpaper();
}

// ── Тема інтерфейсу ──────────────────────────────────────────────────
// Дві теми — темна й світла (токени в src/css/00-tokens.css) плюс «Авто»,
// що йде за системою (prefers-color-scheme). Колишні кольорові теми
// (синя/неон/матриця/сакура…) тепер — варіанти акценту, див. setAccentColor().
const THEMES = {
  auto:  { label: 'Авто', hint: 'Як у системі' },
  dark:  { label: 'Темна', hint: 'Нічний друк' },
  light: { label: 'Світла', hint: 'Папір' },
};
// Старе значення теми → [тема, акцент]
const LEGACY_THEME_ACCENT = { blue: 'blue', green: 'matrix', red: 'coral', neon: 'neon', matrix: 'matrix', sakura: 'sakura' };

function normalizeThemeSetting(theme) {
  if (THEMES[theme]) return theme;
  // Гравець мав одну зі старих кольорових тем — переносимо її в акцент.
  const acc = LEGACY_THEME_ACCENT[theme];
  if (acc && !localStorage.getItem('slotok_accent')) setAccentColor(acc, null, true);
  try { saveSetting('theme', 'dark'); } catch (e) {}
  return 'dark';
}

function resolvedTheme(theme) {
  if (theme === 'dark' || theme === 'light') return theme;
  return window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyThemeVars(theme) {
  theme = THEMES[theme] ? theme : 'auto';
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  // Колір смуги браузера / PWA під поточне тло
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#0E1020');
  // Прибираємо сліди старої системи (інлайнові змінні й !important-оверрайд)
  ['--bg', '--box', '--border', '--input', '--text'].forEach((v) => root.style.removeProperty(v));
  document.getElementById('theme-override-style')?.remove();
  document.body.removeAttribute('data-theme');
  if (!localStorage.getItem('slotok_bg_type')) document.body.style.background = '';
  document.body.style.color = '';
}

if (window.matchMedia) {
  try {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (normalizeThemeSetting(getSetting('theme', 'auto')) === 'auto') applyThemeVars('auto');
    });
  } catch (e) {}
}

function syncThemeButtons(theme) {
  document.querySelectorAll('[data-theme-option]').forEach((b) => {
    const on = b.getAttribute('data-theme-option') === theme;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

// Відповідальна гра — окремий вхід з «Ще» й Профілю: відкриває Налаштування
// одразу на блоці лімітів, щоб його не треба було шукати.
function openResponsibleGaming() {
  switchTab('settings');
  setTimeout(() => {
    const el = document.getElementById('rgSection');
    if(!el) return;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    el.classList.add('is-highlight');
    setTimeout(() => el.classList.remove('is-highlight'), 1600);
  }, 120);
}

function setTheme(theme, el) {
  if (!THEMES[theme]) theme = 'auto';
  saveSetting('theme', theme);
  applyThemeVars(theme);
  syncThemeButtons(theme);
  notify('Тема: ' + THEMES[theme].label, 'info');
}


// Звуки - поважати налаштування (пряма заміна функції)
// (patch applied below - playSound checks settings inline)

// ============================================
// ===== СПОВІЩЕННЯ =====
// ============================================
let allNotifs = [];
let notifFilter = 'all';

function pushNotif(type, icon, title, text, colorClass) {
  const id = 'n_' + Date.now() + '_' + Math.random();
  const notif = { id, type, icon, title, text, colorClass: colorClass||'', time: Date.now(), read: false };
  allNotifs.unshift(notif);
  if(allNotifs.length > 100) allNotifs = allNotifs.slice(0, 100);
  try { localStorage.setItem('slotok_notifs', JSON.stringify(allNotifs.slice(0, 50))); } catch(e) { console.warn(e); }
  updateNotifBadge();
}

function loadNotifsFromStorage() {
  try {
    allNotifs = JSON.parse(localStorage.getItem('slotok_notifs') || '[]');
  } catch(e) { allNotifs = []; }
}

function updateNotifBadge() {
  const unread = allNotifs.filter(n => !n.read).length;
  const dot = document.getElementById('notifNavBadge');
  if(dot) dot.classList.toggle('hidden', unread === 0);
}

function filterNotifs(f, el) {
  notifFilter = f;
  document.querySelectorAll('.notif-filter-btn').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderNotifs();
}

function renderNotifs() {
  const list = document.getElementById('notifList');
  if(!list) return;
  const filtered = notifFilter === 'all' ? allNotifs : allNotifs.filter(n => n.type === notifFilter);
  if(!filtered.length) {
    list.innerHTML = '<div style="color:var(--fg-3);font-size:13px;text-align:center;padding:30px 0;">Немає сповіщень</div>';
    return;
  }
  list.innerHTML = filtered.map(n => {
    const t = timeAgo(n.time);
    return '<div class="notif-item ' + (n.read ? '' : 'unread ' + (n.colorClass||'')) + '" onclick="readNotif(\'' + n.id + '\')">' +
      '<div class="notif-icon">' + n.icon + '</div>' +
      '<div class="notif-body">' +
        '<div class="notif-title">' + n.title + '</div>' +
        '<div class="notif-text">' + n.text + '</div>' +
        '<div class="notif-time">' + t + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function readNotif(id) {
  const n = allNotifs.find(x => x.id === id);
  if(n) n.read = true;
  try { localStorage.setItem('slotok_notifs', JSON.stringify(allNotifs.slice(0, 50))); } catch(e) { console.warn(e); }
  updateNotifBadge();
  renderNotifs();
}

function markAllNotifsRead() {
  allNotifs.forEach(n => n.read = true);
  try { localStorage.setItem('slotok_notifs', JSON.stringify(allNotifs.slice(0, 50))); } catch(e) { console.warn(e); }
  updateNotifBadge();
  renderNotifs();
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if(diff < 60000) return 'щойно';
  if(diff < 3600000) return Math.floor(diff/60000) + ' хв тому';
  if(diff < 86400000) return Math.floor(diff/3600000) + ' год тому';
  return new Date(ts).toLocaleDateString('uk-UA');
}

// Хуки для авто-сповіщень
const _origNotify = notify;
let _lastPushedNotif = { msg: '', time: 0 };

// Дрібні UI-дії, які НЕ повинні засмічувати центр сповіщень —
// toast все одно покажеться, просто не зберігається в дзвіночку
const MINOR_ACTION_PATTERNS = [
  'Скін', 'скін', 'застосовано', 'Скопійовано', 'скопійовано',
  'Мова:', 'Тег встановлено', 'Ефект активовано', 'застосована',
  'Copied', 'заблоковано', 'розблоковано', 'Приховати', 'Показати',
];

window.notify = function(msg, type) {
  msg = msg == null ? '' : String(msg); // порожнє повідомлення не має валити гру, що його показує
  const isBonus = msg.includes('бонус') || msg.includes('Бонус') || msg.includes('щоденний') || msg.includes('погодинний');
  const isGift  = msg.includes('Подарунок') || msg.includes('подарунок');
  const isNotifCategory = isBonus || isGift || type === 'success' ||
    msg.includes('WIN') || msg.includes('Виграш') || msg.includes('виграш') || msg.includes('виграли') || msg.includes('Перемога') ||
    msg.includes('Програш') || msg.includes('програли') || msg.includes('Краш') || msg.includes('КРАШ') ||
    msg.includes('Депозит') || msg.includes('депозит') || msg.includes('Поповнення') || msg.includes('вивід') || msg.includes('Вивід');

  // "Сповіщення" вимикає тільки toast/дзвіночок про виграші/бонуси/депозити.
  // Помилки й нейтральні info-повідомлення завжди показуються — це не спам, а важливий фідбек.
  if(isNotifCategory && !getSetting('notifs', true)) return;

  _origNotify(msg, type);
  if(!isNotifCategory) return; // помилки/info в центр сповіщень не пишемо

  // Дедублікація — та сама фраза протягом 4с не дублюється в центрі сповіщень
  const now = Date.now();
  if(msg === _lastPushedNotif.msg && now - _lastPushedNotif.time < 4000) return;

  // Дрібні UI-дії пропускаємо — вони й так видно як toast
  if(MINOR_ACTION_PATTERNS.some(p => msg.includes(p))) return;

  if(isBonus && !getSetting('bonusNotifs', true)) return;
  if(isGift  && !getSetting('giftNotifs', true))  return;

  let pushed = true;
  if(isBonus) {
    pushNotif('bonus', '🎁', 'Бонус', msg, 'green-notif');
  } else if(isGift) {
    pushNotif('gift', '🎀', 'Подарунок', msg, 'green-notif');
  } else if(msg.includes('WIN') || msg.includes('Виграш') || msg.includes('виграш') || msg.includes('виграли') || msg.includes('Перемога')) {
    pushNotif('game', '🏆', 'Виграш', msg, 'green-notif');
  } else if(msg.includes('Програш') || msg.includes('програли') || msg.includes('Краш') || msg.includes('КРАШ')) {
    pushNotif('game', '😔', 'Гра', msg, 'red-notif');
  } else if(msg.includes('Депозит') || msg.includes('депозит') || msg.includes('Поповнення')) {
    pushNotif('system', '💳', 'Депозит', msg, 'green-notif');
  } else if(msg.includes('вивід') || msg.includes('Вивід')) {
    pushNotif('system', '💸', 'Вивід', msg, 'green-notif');
  } else if(type === 'success') {
    pushNotif('system', '✅', 'Успіх', msg, 'green-notif');
  } else {
    pushed = false;
  }

  if(pushed) { _lastPushedNotif = { msg, time: now }; }
};

// ============================================
// ===== МУЛЬТИПЛЕЄР МОНОПОЛІЯ =====
// (реалізація нижче, "МОНОПОЛІЯ МП: 2-4 ГРАВЦІ" —
//  стара 1v1-версія видалена як мертвий код, її window.* перевизначення
//  повністю затінювали ці функції)
// ============================================
let mpRoomId  = null;
let mpIsHost  = false;
let mpListener = null;
// Партія обмежена раундами (інакше гроші майже не рухаються і гра не
// закінчується ніколи) і часом на хід (інакше один AFK зупиняє всіх).
const MP_MAX_ROUNDS = 25;
const MP_TURN_MS = 60000;
let mpTurnTimer = null, mpTurnSeen = null, mpRefunded = false;

function mpActiveOrder(r, players) {
  players = players || r.players || {};
  return (r.turnOrder || Object.keys(players)).filter(n => players[n] && !players[n].bankrupt);
}
// Хто ходить після name (name може вже бути банкрутом)
function mpNextAfter(r, name, players) {
  const order = r.turnOrder || Object.keys(r.players || {});
  players = players || r.players || {};
  const i = order.indexOf(name);
  for(let k = 1; k <= order.length; k++) {
    const n = order[(i + k) % order.length];
    if(players[n] && !players[n].bankrupt) return n;
  }
  return null;
}
// Статки: гроші + ціна ділянок — так визначаємо переможця за лімітом раундів
function mpWorth(r, name) {
  const p = (r.players || {})[name] || {};
  let w = p.money || 0;
  Object.entries(r.props || {}).forEach(([pos, owner]) => {
    if(owner !== name) return;
    const cell = MONO_CELLS.find(c => c.pos === +pos);
    if(cell && cell.price) w += cell.price;
  });
  return w;
}
// Хід передає лише наступний активний гравець і лише через транзакцію, тож
// при кількох вкладках хід не «перескочить» двічі.
function mpForceSkip(r, why) {
  const stuck = r.turn;
  const next = mpNextAfter(r, stuck);
  if(!next || next !== currentUser) return;
  db.ref('mp_rooms/' + mpRoomId + '/turn').transaction(cur => (cur === stuck ? next : undefined), (err, committed) => {
    if(err || !committed) return;
    db.ref('mp_rooms/' + mpRoomId).update({ pendingBuy: null });
    mpAddLog2('⏭ ' + stuck + ': ' + why);
  });
}

function resetMpUI() {
  if(mpTurnTimer) { clearTimeout(mpTurnTimer); mpTurnTimer = null; }
  mpTurnSeen = null; mpRefunded = false;
  mpRoomId = null; mpIsHost = false;
  document.getElementById('mpGameScreen').classList.add('hidden');
  document.getElementById('mpWaitScreen').classList.add('hidden');
  document.getElementById('mpLobbyScreen').classList.remove('hidden');
}




// ============================================
// ===== CSS ДЛЯ MP SIZE КНОПОК (додаємо inline) =====
// ============================================
(function addDynCSS(){
  const s = document.createElement('style');
  s.textContent = `
    .mp-size-btn { padding:10px 6px; background:#1a1a1a; border:1px solid #333; border-radius:10px;
      text-align:center; cursor:pointer; font-size:12px; font-weight:bold; color:#777; transition:all 0.2s; }
    .mp-size-btn.active { border-color:var(--accent); color:var(--accent); background:rgba(212,175,55,0.1); }
    .mp-player-info { min-width:80px; flex:1; background:#111; border:2px solid #222; border-radius:10px;
      padding:8px; text-align:center; font-size:11px; }
    .mp-player-info.my-turn { border-color:var(--accent); animation:pulse 1s infinite; }
    .mp-player-info.bankrupt { opacity:0.4; text-decoration:line-through; }
    @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(212,175,55,0.4)} 50%{box-shadow:0 0 8px 4px rgba(212,175,55,0.15)} }
    .card { display:inline-flex; align-items:center; justify-content:center; width:48px; height:68px;
      background:#fff; border-radius:8px; font-size:18px; color:#000; font-weight:bold; cursor:pointer;
      border:2px solid transparent; transition:all 0.15s; flex-shrink:0; box-shadow:0 2px 6px rgba(0,0,0,0.4);
      flex-direction:column; line-height:1; }
    .card.red { color:#cc0000; }
    .card.selected { border-color:var(--accent); transform:translateY(-8px); }
    .card.face-down { background:#1a4a1a; color:#fff; font-size:24px; }
    .card.small { width:36px; height:50px; font-size:14px; }
    .cg-table-card { width:44px; height:62px; background:#fff; border-radius:6px; font-size:16px;
      display:inline-flex; flex-direction:column; align-items:center; justify-content:center;
      color:#000; margin:2px; box-shadow:0 1px 4px rgba(0,0,0,0.3); }
    .cg-table-card.red { color:#cc0000; }
    .cg-table-card.covered { background:#fff; border:1px dashed #4cd964; }
    .cg-room-card { background:#111; border:1px solid #222; border-radius:10px; padding:12px; margin-bottom:8px; }
    .cg-room-card.waiting { border-color:#d4af37; }
    .vip-tab-btns { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; padding-bottom:4px; margin-bottom:12px; }
    .vip-tab-btn { padding:6px 14px; border-radius:20px; font-size:12px; font-weight:bold; cursor:pointer;
      background:#1a1a1a; border:1px solid #333; color:#777; white-space:nowrap; }
    .vip-tab-btn.active { background:rgba(212,175,55,0.15); border-color:var(--accent); color:var(--accent); }
  `;
  document.head.appendChild(s);
})();

// ============================================
// ===== ЧАТ: ADMIN DELETE + AUTO-CLEAR =====
// ============================================
function adminDeleteMsg(key) {
  if(!confirm('Видалити це повідомлення?')) return;
  db.ref('lobby_chat/' + key).remove()
    .then(() => notify('🗑️ Повідомлення видалено', 'info'))
    .catch(() => notify('Помилка видалення', 'error'));
}

function adminDeleteComment(newsId, commentId) {
  if(!confirm('Видалити коментар?')) return;
  db.ref('casino_news/' + newsId + '/comments/' + commentId).remove().then(() => {
    db.ref('casino_news/' + newsId + '/commentCount').transaction(v => Math.max(0,(v||1)-1));
    notify('🗑️ Коментар видалено', 'info');
    loadComments(newsId);
  });
}

// Патч loadComments — додати кнопки видалення для адмінів
const _origLoadComments = loadComments;
window.loadComments = function(newsId) {
  const list = document.getElementById('cmtlist-' + newsId);
  if(!list) return;
  list.innerHTML = '<div style="color:var(--fg-4);font-size:12px;padding:5px 0;">Завантаження...</div>';
  db.ref('casino_news/' + newsId + '/comments').orderByChild('time').limitToLast(30).once('value', snap => {
    const data = snap.val();
    if(!data) { list.innerHTML = '<div style="color:var(--fg-4);font-size:12px;padding:8px 0;">Коментарів ще немає!</div>'; return; }
    list.innerHTML = '';
    const isAdminUserLocal = isAdminUser();
    Object.entries(data).forEach(([cid, c]) => {
      const t = timeAgo(c.time);
      const avHtml = c.avatarUrl
        ? '<div class="comment-avatar"><img src="' + safeUrl(c.avatarUrl) + '"></div>'
        : '<div class="comment-avatar">' + escapeHtml(c.avatarEmoji||'👤') + '</div>';
      const delBtn = isAdminUserLocal ? '<button onclick="adminDeleteComment(\'' + newsId + '\',\'' + cid + '\')" style="background:none;border:none;color:var(--neg);font-size:11px;cursor:pointer;padding:0 4px;opacity:0.6;" title="Видалити">✕</button>' : '';
      const div = document.createElement('div');
      div.className = 'comment-item';
      div.innerHTML = avHtml +
        '<div style="flex:1;">' +
          '<div style="display:flex;align-items:center;gap:4px;">' +
            '<span class="comment-nick" onclick="openPublicProfile(' + jsArg(c.author) + ')">' + escapeHtml(c.author) + '</span>' +
            delBtn +
          '</div>' +
          '<div class="comment-text">' + escapeHtml(c.text) + '</div>' +
          '<div class="comment-time">' + t + '</div>' +
        '</div>';
      list.appendChild(div);
    });
  });
};

// Авто-очищення чату кожні 24 год через Firebase scheduled timestamp
function initChatAutoClear() {
  // Auto-clear: only runs for admins, max once per 24h per server timestamp
  const isAdminUserLocal = isAdminUser();
  if(!isAdminUserLocal) return; // Non-admins skip
  db.ref('chat_meta/lastClear').once('value', snap => {
    const last = snap.val() || 0;
    const now = Date.now();
    if(now - last > 24 * 3600 * 1000) {
      // Use transaction to prevent multiple admins clearing at once
      db.ref('chat_meta/lastClear').transaction(current => {
        if(!current || now - current > 24 * 3600 * 1000) return now;
        return; // abort - someone else already cleared
      }, (err, committed) => {
        if(committed && !err) {
          db.ref('lobby_chat').remove();
          setTimeout(() => {
            db.ref('lobby_chat').push({ system: true, text: '🧹 Чат очищено автоматично', time: Date.now() });
          }, 500);
        }
      });
    }
  });
}

// ============================================
// ===== МОНОПОЛІЯ МП: 2-4 ГРАВЦІ =====
// ============================================
let mpSelectedSize = 2;
const MP_COLORS = ['#4CD964','#FF9500','#FF3B30','#007AFF'];
const MP_TOKENS = ['🟢','🟠','🔴','🔵'];

function selectMpSize(n, el) {
  mpSelectedSize = n;
  document.querySelectorAll('.mp-size-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

// Override createMpRoom to support 2-4
window.createMpRoom = function() {
  const bet = parseInt(document.getElementById('mpBetInput').value) || 500;
  if(bet < 100) return notify('Мінімальна ставка 100₴', 'error');
  if((userData.balance || 0) < bet) return notify('Недостатньо коштів', 'error');

  db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(-bet));

  const roomId = 'mp_' + currentUser + '_' + Date.now();
  mpRoomId = roomId;
  mpIsHost = true;

  const players = {};
  players[currentUser] = { money: 3000, pos: 0, jail: 0, bankrupt: false, color: MP_COLORS[0], token: MP_TOKENS[0] };

  db.ref('mp_rooms/' + roomId).set({
    host: currentUser, bet, maxPlayers: mpSelectedSize, status: 'waiting',
    created: Date.now(),
    players,
    props: {},
    turn: currentUser,
    turnOrder: [currentUser],
    gameOver: false
  });

  // Якщо хост закриє вкладку поки кімната ще чекає на гравців — кімната не
  // має зависнути в лобі назавжди: скасовуємо її і повертаємо ставку хосту.
  db.ref('mp_rooms/' + roomId).onDisconnect().update({ status: 'cancelled' });
  db.ref('users/' + currentUser + '/balance').onDisconnect().set(firebase.database.ServerValue.increment(bet));

  showMpWaitScreen2(roomId, bet, mpSelectedSize);
  listenMpRoom2(roomId);
};

function showMpWaitScreen2(roomId, bet, maxPlayers) {
  document.getElementById('mpLobbyScreen').classList.add('hidden');
  document.getElementById('mpWaitScreen').classList.remove('hidden');
  document.getElementById('mpWaitInfo').textContent = 'Ставка: ' + bet + '₴ • ' + maxPlayers + ' гравці • ID: ' + roomId.slice(-8);
  renderWaitPlayers({ [currentUser]: { color: MP_COLORS[0], token: MP_TOKENS[0] } }, maxPlayers);
}

function renderWaitPlayers(players, maxPlayers) {
  const el = document.getElementById('mpWaitPlayers');
  if(!el) return;
  el.innerHTML = '';
  const filled = Object.keys(players);
  for(let i = 0; i < maxPlayers; i++) {
    const div = document.createElement('div');
    div.className = 'mp-player-slot ' + (filled[i] ? 'filled' : 'empty');
    div.innerHTML = filled[i]
      ? '<div style="font-size:16px;">' + (players[filled[i]].token||'👤') + '</div><div style="font-size:11px;margin-top:3px;">' + filled[i] + '</div>'
      : '<div style="font-size:20px;color:var(--fg-4);">+</div><div style="font-size:11px;color:var(--fg-4);margin-top:3px;">Чекаємо...</div>';
    el.appendChild(div);
  }
}

// Override loadMpRooms for new structure
window.loadMpRooms = function() {
  db.ref('mp_rooms').orderByChild('status').equalTo('waiting').limitToLast(15).once('value', snap => {
    const list = document.getElementById('mpRoomsList');
    if(!list) return;
    const data = snap.val();
    if(!data) { list.innerHTML = '<div style="color:var(--fg-3);font-size:13px;text-align:center;padding:20px;">Немає відкритих кімнат</div>'; return; }
    list.innerHTML = '';
    Object.entries(data).forEach(([id, r]) => {
      if(r.host === currentUser) return;
      const playerCount = r.players ? Object.keys(r.players).length : 1;
      const spotsLeft = (r.maxPlayers || 2) - playerCount;
      if(spotsLeft <= 0) return;
      list.innerHTML += '<div class="mp-room-card waiting">' +
        '<div class="mp-room-header">' +
          '<span style="font-weight:bold;">🧑 ' + r.host + '</span>' +
          '<span class="mp-status-badge mp-waiting">' + playerCount + '/' + r.maxPlayers + ' 👥</span>' +
        '</div>' +
        '<div style="color:var(--fg-3);font-size:12px;margin-bottom:8px;">Ставка: <b style="color:var(--accent);">' + r.bet + '₴</b> • Вільних місць: <b style="color:var(--green);">' + spotsLeft + '</b></div>' +
        '<button class="btn-gold" style="padding:10px;" onclick="joinMpRoom2(\'' + id + '\',' + r.bet + ')">➕ ПРИЄДНАТИСЬ</button>' +
      '</div>';
    });
    if(!list.innerHTML) list.innerHTML = '<div style="color:var(--fg-3);font-size:13px;text-align:center;padding:20px;">Немає відкритих кімнат</div>';
  });
};

function joinMpRoom2(roomId, bet) {
  if((userData.balance||0) < bet) return notify('Недостатньо коштів: ' + bet + '₴', 'error');
  // Атомарний join — без транзакції два гравці, що тиснуть "Приєднатись"
  // одночасно, могли обидва пройти перевірку playerCount<maxPlayers за
  // застарілим once('value') і зайняти останнє місце разом.
  db.ref('mp_rooms/' + roomId).transaction(r => {
    // null на першому проході — лише порожній локальний кеш, а не відсутня
    // кімната: віддаємо null, і SDK повторить транзакцію зі справжнім значенням
    // (раніше тут був abort, і приєднатись не вдавалось нікому).
    if(r === null) return null;
    if(r.status !== 'waiting') return; // кімната вже не очікує — абортуємо
    const players = r.players || {};
    if(players[currentUser]) return; // вже в кімнаті — нічого не міняємо
    const maxPlayers = r.maxPlayers || 2;
    const playerCount = Object.keys(players).length;
    if(playerCount >= maxPlayers) return; // місць не лишилось

    const colorIdx = playerCount % MP_COLORS.length;
    players[currentUser] = { money: 3000, pos: 0, jail: 0, bankrupt: false, color: MP_COLORS[colorIdx], token: MP_TOKENS[colorIdx] };
    r.players = players;

    const newCount = playerCount + 1;
    if(newCount >= maxPlayers) {
      const allPlayers = Object.keys(players);
      r.status = 'playing';
      r.turnOrder = allPlayers;
      r.turn = allPlayers[0];
    }
    return r;
  }, (err, committed, snap) => {
    if(err) { console.warn(err); notify('Помилка приєднання', 'error'); return; }
    if(!committed) { notify('Кімната недоступна', 'error'); loadMpRooms(); return; }
    const r = snap.val();
    if(!r || !r.players || !r.players[currentUser]) { notify('Кімната недоступна', 'error'); return; }

    db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(-bet));
    mpRoomId = roomId; mpIsHost = false;

    // Якщо гравець зникне ще до старту гри — звільняємо його місце й
    // повертаємо ставку; якщо гра вже почалась (комплект зібрався) —
    // на дисконнект просто відмічаємо його банкрутом (див. listenMpRoom2,
    // де перепрограмовується цей самий onDisconnect на старті гри).
    if(r.status === 'playing') {
      db.ref('mp_rooms/' + roomId + '/players/' + currentUser + '/bankrupt').onDisconnect().set(true);
    } else {
      db.ref('mp_rooms/' + roomId + '/players/' + currentUser).onDisconnect().remove();
      db.ref('users/' + currentUser + '/balance').onDisconnect().set(firebase.database.ServerValue.increment(bet));
    }

    listenMpRoom2(roomId);
    document.getElementById('mpLobbyScreen').classList.add('hidden');
    document.getElementById('mpWaitScreen').classList.remove('hidden');
  });
}

function listenMpRoom2(roomId) {
  if(mpListener) { try { db.ref('mp_rooms/' + roomId).off('value', mpListener); } catch(e) { console.warn(e); } }
  mpListener = db.ref('mp_rooms/' + roomId).on('value', snap => {
    const r = snap.val(); if(!r) return;
    if(r.status === 'cancelled') {
      // Хост повертає ставку лише собі — гості, що вже зайшли, повертають свою самі.
      if(r.host !== currentUser && r.players && r.players[currentUser] && !mpRefunded) {
        mpRefunded = true;
        db.ref('mp_rooms/' + roomId + '/players/' + currentUser).onDisconnect().cancel();
        db.ref('users/' + currentUser + '/balance').onDisconnect().cancel();
        db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(r.bet));
      }
      notify('Кімнату скасовано, ставку повернено', 'error');
      if(mpListener) { db.ref('mp_rooms/' + roomId).off('value', mpListener); mpListener = null; }
      resetMpUI(); return;
    }
    if(r.status === 'waiting' && r.players) {
      renderWaitPlayers(r.players, r.maxPlayers || 2);
    }
    if(r.status === 'playing') {
      const gsc = document.getElementById('mpGameScreen');
      if(gsc && gsc.classList.contains('hidden')) {
        document.getElementById('mpWaitScreen').classList.add('hidden');
        gsc.classList.remove('hidden');
        mpAddLog2('🎩 Гра почалась! Гравці: ' + Object.keys(r.players).join(', '));
        // Гра стартувала — попередні onDisconnect ("скасувати кімнату" у
        // хоста / "звільнити своє місце" у гостя) вже не актуальні: тепер
        // моя ставка в загальному банку, тож на дисконнект просто стаю
        // банкрутом (як при surrenderMp), а не забираю кімнату чи гроші.
        db.ref('mp_rooms/' + roomId).onDisconnect().cancel();
        db.ref('mp_rooms/' + roomId + '/players/' + currentUser).onDisconnect().cancel();
        db.ref('users/' + currentUser + '/balance').onDisconnect().cancel();
        db.ref('mp_rooms/' + roomId + '/players/' + currentUser + '/bankrupt').onDisconnect().set(true);
      }
      renderMpGame2(r);

      // Якщо після чиєїсь відключки (бо onDisconnect вище позначив
      // банкрутом) лишився рівно один активний гравець — завершуємо гру
      // замість того, щоб кімната зависла в статусі "playing" назавжди.
      const active = mpActiveOrder(r);
      if(active.length > 1 && r.players[r.turn] && r.players[r.turn].bankrupt) {
        mpForceSkip(r, 'вибув — хід переходить далі');
      }
      // Таймер ходу: новий хід — новий відлік
      const turnKey = r.turn + '|' + (r.round || 1) + '|' + (r.pendingBuy ? 1 : 0);
      if(turnKey !== mpTurnSeen) {
        mpTurnSeen = turnKey;
        if(mpTurnTimer) clearTimeout(mpTurnTimer);
        mpTurnTimer = setTimeout(() => {
          db.ref('mp_rooms/' + roomId).once('value', s2 => {
            const r2 = s2.val();
            if(r2 && r2.status === 'playing' && r2.turn === r.turn) mpForceSkip(r2, 'час на хід вийшов');
          });
        }, MP_TURN_MS + 1500);
      }
      if(active.length === 1 && !r.gameOver) {
        db.ref('mp_rooms/' + roomId + '/status').transaction(cur => cur === 'playing' ? 'finishing' : undefined, (err, committed) => {
          if(!err && committed) finishMpGame2(active[0], r.bet, r.turnOrder);
        });
      }
    }
    if(r.status === 'finished') handleMpFinished2(r);
  });
}

function renderMpGame2(r) {
  const bar = document.getElementById('mpPlayersInfoBar');
  if(bar) {
    bar.innerHTML = '';
    (r.turnOrder || Object.keys(r.players)).forEach(name => {
      const p = r.players[name];
      const isCurrent = r.turn === name;
      const isMe = name === currentUser;
      const div = document.createElement('div');
      div.className = 'mp-player-info' + (isCurrent ? ' my-turn' : '') + (p.bankrupt ? ' bankrupt' : '');
      div.innerHTML =
        '<div style="font-size:18px;">' + (p.token||'👤') + '</div>' +
        '<div style="font-size:10px;font-weight:bold;color:' + (isMe?'var(--accent)':'var(--fg-2)') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px;">' + name + (isMe?' (я)':'') + '</div>' +
        '<div style="font-size:11px;color:' + (p.bankrupt?'var(--neg)':'var(--green)') + ';font-weight:bold;">' + (p.bankrupt?'БАНКРУТ':formatNumber(p.money||0)+'₴') + '</div>';
      if(p.bankrupt) div.style.opacity = '0.4';
      bar.appendChild(div);
    });
  }

  const myTurn = r.turn === currentUser;
  const turnEl = document.getElementById('mpTurnInfo');
  if(turnEl) {
    if(r.gameOver) { turnEl.textContent = '🏁 Гра завершена!'; turnEl.style.color = 'var(--fg-3)'; }
    else if(myTurn) { turnEl.textContent = '⚡ Ваш хід! · раунд ' + (r.round || 1) + '/' + MP_MAX_ROUNDS + ' · 60 с'; turnEl.style.color = 'var(--green)'; }
    else { turnEl.textContent = '⏳ Хід гравця ' + r.turn + ' · раунд ' + (r.round || 1) + '/' + MP_MAX_ROUNDS; turnEl.style.color = 'var(--fg-3)'; }
  }

  const rollBtn = document.getElementById('mpRollBtn');
  const buyBtn  = document.getElementById('mpBuyBtn');
  const passBtn = document.getElementById('mpPassBtn');
  if(rollBtn) rollBtn.disabled = !myTurn || r.gameOver || !!(r.pendingBuy);
  if(buyBtn)  { buyBtn.disabled  = !myTurn || !r.pendingBuy; }
  if(passBtn) { passBtn.disabled = !myTurn || !r.pendingBuy; }

  renderMpBoard2(r);
}

function renderMpBoard2(r) {
  const board = document.getElementById('mpBoard');
  if(!board) return;
  board.innerHTML = '';
  board.style.display = 'grid';
  board.style.gridTemplateColumns = '1fr repeat(9,1fr) 1fr';
  board.style.gridTemplateRows = '1fr repeat(9,1fr) 1fr';

  const grid = Array.from({length:11}, () => Array(11).fill(null));
  MONO_CELLS.forEach(cell => { const [c,ro] = cellGridPos(cell.pos); grid[ro][c] = cell; });

  for(let ro = 0; ro < 11; ro++) {
    for(let c = 0; c < 11; c++) {
      if(ro >= 1 && ro <= 9 && c >= 1 && c <= 9) {
        if(ro === 1 && c === 1) {
          const ctr = document.createElement('div');
          ctr.className = 'mono-center';
          ctr.style.gridColumn = '2 / 11'; ctr.style.gridRow = '2 / 11';
          ctr.innerHTML = '<div style="font-size:12px;letter-spacing:1px;">МОНОПОЛІЯ</div><div style="font-size:28px;">🎩</div>';
          board.appendChild(ctr);
        }
        continue;
      }
      const cell = grid[ro][c];
      const div = document.createElement('div');
      if(!cell) { div.style.cssText='background:transparent;border:none;'; board.appendChild(div); continue; }

      let stripeClass = '';
      if(cell.pos>=1&&cell.pos<=9)  stripeClass='prop-top';
      if(cell.pos>=11&&cell.pos<=19) stripeClass='prop-right';
      if(cell.pos>=21&&cell.pos<=29) stripeClass='prop-bottom';
      if(cell.pos>=31&&cell.pos<=39) stripeClass='prop-left';

      const propsObj = r.props || {};
      const owner = propsObj[cell.pos];
      let ownerClass = '';
      if(owner === currentUser) ownerClass = 'owned-me';
      else if(owner) ownerClass = 'owned-ai';

      div.className = 'mono-cell ' + (cell.type==='corner'?'corner':'') + ' ' + stripeClass + ' ' + ownerClass;
      if(cell.color && MONO_COLORS) div.style.borderColor = MONO_COLORS[cell.color]||'var(--fg-3)';

      const cornerIcons = {0:'🏁',10:'⛓️',20:'🌳',30:'👮'};
      if(cell.type==='corner') div.innerHTML='<span style="font-size:11px;">'+(cornerIcons[cell.pos]||'')+'</span><span style="font-size:7px;white-space:pre-line;">'+cell.label+'</span>';
      else if(cell.type==='prop') div.innerHTML='<span style="font-size:7px;white-space:pre-line;">'+cell.label+'</span><span class="cell-price">'+cell.price+'₴</span>';
      else if(cell.type==='station') div.innerHTML='<span style="font-size:10px;">🚂</span><span style="font-size:7px;">'+cell.label+'</span>';
      else if(cell.type==='utility') div.innerHTML='<span style="font-size:12px;">'+(cell.icon||'')+'</span>';
      else if(cell.type==='special') div.innerHTML='<span style="font-size:13px;">'+(cell.icon||'❓')+'</span>';
      else if(cell.type==='tax') div.innerHTML='<span style="font-size:10px;">'+(cell.icon||'💸')+'</span>';
      board.appendChild(div);
    }
  }
  placeMpPlayers2(r);
}

function placeMpPlayers2(r) {
  document.querySelectorAll('#mpBoardWrap .mono-player').forEach(e => e.remove());
  const wrap = document.getElementById('mpBoardWrap');
  if(!wrap || !r.players) return;
  const cellW = wrap.offsetWidth / 11;
  Object.entries(r.players).forEach(([name, p], i) => {
    if(p.bankrupt) return;
    const [col, row] = cellGridPos(p.pos || 0);
    const el = document.createElement('div');
    el.className = 'mono-player';
    el.style.background = p.color || MP_COLORS[i % MP_COLORS.length];
    el.style.left = (col * cellW + 2 + i * 8) + 'px';
    el.style.top  = (row * cellW + 2) + 'px';
    el.title = name;
    wrap.appendChild(el);
  });
}

// Override mpRoll for multi-player
window.mpRoll = function() {
  if(!mpRoomId) return;
  db.ref('mp_rooms/' + mpRoomId).once('value', snap => {
    const r = snap.val(); if(!r) return;
    if(r.turn !== currentUser || r.gameOver || r.pendingBuy) return;

    const d1 = monoRollDie(), d2 = monoRollDie();
    const die1 = document.getElementById('mpDie1'), die2 = document.getElementById('mpDie2');
    if(die1) { die1.classList.add('rolling'); die1.textContent = DICE_EMOJI[d1]; }
    if(die2) { die2.classList.add('rolling'); die2.textContent = DICE_EMOJI[d2]; }
    setTimeout(() => { if(die1) die1.classList.remove('rolling'); if(die2) die2.classList.remove('rolling'); }, 500);

    const steps = d1 + d2;
    const players = JSON.parse(JSON.stringify(r.players));
    const p = players[currentUser];
    mpAddLog2('🎲 ' + currentUser + ' кидає: ' + d1 + '+' + d2 + '=' + steps);

    if(p.jail > 0) { p.jail--; mpAddLog2('⛓️ ' + currentUser + ' у в\'язниці'); mpNextTurn2(r, players, {}); return; }

    const oldPos = p.pos;
    p.pos = (p.pos + steps) % 40;
    if(p.pos < oldPos) { p.money += 200; mpAddLog2('🏁 ' + currentUser + ' пройшов GO +200₴'); }

    const cell = MONO_CELLS.find(c => c.pos === p.pos);
    const props = r.props || {};
    let pendingBuy = null;

    if(cell) {
      if(cell.pos === 30) { p.pos = 10; p.jail = 2; mpAddLog2('👮 ' + currentUser + ' іде у в\'язницю!'); }
      else if(cell.type === 'tax') { const tax = cell.pos===4?100:150; p.money -= tax; mpAddLog2('💸 Податок -' + tax + '₴'); if(p.money <= 0) { p.bankrupt = true; mpAddLog2('💀 ' + currentUser + ' банкрут!'); } }
      else if(cell.type === 'special') { const bonus = [100,-75,50,150,-50,200][Math.floor(Math.random()*6)]; p.money += bonus; mpAddLog2('🃏 ' + currentUser + ': ' + (bonus>0?'+':'') + bonus + '₴'); if(p.money <= 0) { p.bankrupt = true; mpAddLog2('💀 ' + currentUser + ' банкрут!'); } }
      else if((cell.type==='prop'||cell.type==='station'||cell.type==='utility') && cell.price) {
        const owner = props[cell.pos];
        if(!owner) {
          pendingBuy = { pos: cell.pos, price: cell.price, label: cell.label, buyer: currentUser };
          mpAddLog2('🏠 ' + cell.label.replace('\n',' ') + ' вільна — купити?');
        } else if(owner !== currentUser) {
          const rent = cell.rent || 25;
          p.money -= rent;
          players[owner] = players[owner] || {}; players[owner].money = (players[owner].money||0) + rent;
          mpAddLog2('💸 ' + currentUser + ' платить ренту ' + rent + '₴ → ' + owner);
          if(p.money <= 0) { p.bankrupt = true; mpAddLog2('💀 ' + currentUser + ' банкрут!'); }
        } else { mpAddLog2('✅ ' + currentUser + ' на своїй ділянці'); }
      }
    }

    // Check game over
    const activePlayers = Object.entries(players).filter(([,v]) => !v.bankrupt);
    if(activePlayers.length === 1) {
      db.ref('mp_rooms/' + mpRoomId).update({ players, props });
      db.ref('mp_rooms/' + mpRoomId + '/status').transaction(cur => cur === 'playing' ? 'finishing' : undefined, (err, committed) => {
        if(!err && committed) finishMpGame2(activePlayers[0][0], r.bet, r.turnOrder);
      });
      return;
    }

    if(pendingBuy) {
      db.ref('mp_rooms/' + mpRoomId).update({ players, pendingBuy, props });
    } else {
      mpNextTurn2(r, players, props);
    }
  });
};

function mpNextTurn2(r, players, props) {
  const order = r.turnOrder || Object.keys(r.players);
  const nextTurn = mpNextAfter(r, r.turn, players);
  if(!nextTurn) return;
  // Новий раунд — коли хід повертається на початок черги
  let round = r.round || 1;
  if(order.indexOf(nextTurn) <= order.indexOf(r.turn)) round++;
  if(round > MP_MAX_ROUNDS) {
    const rr = Object.assign({}, r, { players, props: props || r.props });
    const best = mpActiveOrder(rr, players).sort((a, b) => mpWorth(rr, b) - mpWorth(rr, a))[0];
    mpAddLog2('🏁 ' + MP_MAX_ROUNDS + ' раундів зіграно — перемагає найбагатший: ' + best);
    db.ref('mp_rooms/' + mpRoomId).update({ players, props: props || r.props, pendingBuy: null });
    db.ref('mp_rooms/' + mpRoomId + '/status').transaction(cur => cur === 'playing' ? 'finishing' : undefined, (err, committed) => {
      if(!err && committed) finishMpGame2(best, r.bet, r.turnOrder);
    });
    return;
  }
  db.ref('mp_rooms/' + mpRoomId).update({ players, props: props||r.props, turn: nextTurn, pendingBuy: null, round });
}

window.mpBuy = function() {
  db.ref('mp_rooms/' + mpRoomId).once('value', snap => {
    const r = snap.val(); if(!r || !r.pendingBuy || r.pendingBuy.buyer !== currentUser) return;
    const pb = r.pendingBuy;
    const players = JSON.parse(JSON.stringify(r.players));
    const p = players[currentUser];
    if(p.money < pb.price) { notify('Недостатньо коштів!', 'error'); mpDoPass2(r); return; }
    p.money -= pb.price;
    const props = Object.assign({}, r.props, { [pb.pos]: currentUser });
    mpAddLog2('✅ ' + currentUser + ' купив ' + pb.label.replace('\n',' '));
    mpNextTurn2(r, players, props);
  });
};

window.mpPass = function() {
  db.ref('mp_rooms/' + mpRoomId).once('value', snap => {
    const r = snap.val(); if(!r) return;
    mpAddLog2('⏭ ' + currentUser + ' пропустив');
    mpNextTurn2(r, JSON.parse(JSON.stringify(r.players)), r.props||{});
  });
};

function mpDoPass2(r) { mpNextTurn2(r, JSON.parse(JSON.stringify(r.players)), r.props||{}); }

function finishMpGame2(winnerName, bet, turnOrder) {
  const prize = Math.floor(bet * (turnOrder ? turnOrder.length : 2) * 0.9);
  db.ref('mp_rooms/' + mpRoomId).update({ status: 'finished', winner: winnerName, prize });
  db.ref('users/' + winnerName + '/balance').set(firebase.database.ServerValue.increment(prize));
}

function handleMpFinished2(r) {
  if(mpTurnTimer) { clearTimeout(mpTurnTimer); mpTurnTimer = null; }
  db.ref('mp_rooms/' + mpRoomId + '/players/' + currentUser + '/bankrupt').onDisconnect().cancel();
  const isWin = r.winner === currentUser;
  mpAddLog2(isWin ? '🏆 ВИ ПЕРЕМОГЛИ! +' + r.prize + '₴' : '😔 Переміг ' + r.winner, isWin?'good':'bad');
  if(isWin) { playSound('win'); notify('🎩 Монополія: +' + r.prize + '₴!', 'success'); }
  if(mpListener) { db.ref('mp_rooms/' + mpRoomId).off('value', mpListener); mpListener = null; }
  setTimeout(resetMpUI, 4000);
}

window.cancelMpRoom = function() {
  if(!mpRoomId) return;
  db.ref('mp_rooms/' + mpRoomId).once('value', snap => {
    const r = snap.val(); if(!r) return;
    db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(r.bet));
    db.ref('mp_rooms/' + mpRoomId).update({ status: 'cancelled' });
  });
  if(mpListener) { db.ref('mp_rooms/' + mpRoomId).off('value', mpListener); mpListener = null; }
  mpRoomId = null; resetMpUI();
};

window.surrenderMp = function() {
  if(!mpRoomId || !confirm('Здатись? Ви програєте.')) return;
  db.ref('mp_rooms/' + mpRoomId).once('value', snap => {
    const r = snap.val(); if(!r) return;
    const players = JSON.parse(JSON.stringify(r.players));
    players[currentUser].bankrupt = true;
    const active = (r.turnOrder||Object.keys(r.players)).filter(n => !players[n].bankrupt);
    db.ref('mp_rooms/' + mpRoomId + '/players/' + currentUser).update({ bankrupt: true });
    if(active.length === 1) {
      db.ref('mp_rooms/' + mpRoomId + '/status').transaction(cur => cur === 'playing' ? 'finishing' : undefined, (err, committed) => {
        if(!err && committed) finishMpGame2(active[0], r.bet, r.turnOrder);
      });
    }
  });
};

function mpAddLog2(text, cls) {
  const log = document.getElementById('mpLog'); if(!log) return;
  const item = document.createElement('div');
  item.className = 'mono-log-item ' + (cls||'');
  item.textContent = text;
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}

