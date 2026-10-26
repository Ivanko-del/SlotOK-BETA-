// Тимчасових карток SlotOK більше не існує — жодних термінів дії та
// нагадувань про продовження тут немає.

// ╔══════════════════════════════════════════════════════════════╗
// ║  BANNER CAROUSEL — авто-ротація + свайп + крапки            ║
// ╚══════════════════════════════════════════════════════════════╝
var _bannerIndex = 0;
var _bannerCount = 0;   // рахується з розмітки в initBannerCarousel
var _bannerAutoTimer = null;
var _bannerTouchStartX = 0;
var _bannerTouchDeltaX = 0;
var _bannerDragging = false;

function initBannerCarousel() {
  var dotsEl = document.getElementById('bannerDots');
  var trackEl = document.getElementById('bannerTrack');
  if(!dotsEl || !trackEl) return;

  _bannerCount = trackEl.querySelectorAll('.banner-slide').length;
  if(!_bannerCount) return;

  // Побудова крапок (один раз)
  if(!dotsEl.dataset.built) {
    dotsEl.innerHTML = '';
    for(var i = 0; i < _bannerCount; i++) {
      var d = document.createElement('div');
      d.className = 'banner-dot' + (i === 0 ? ' active' : '');
      d.onclick = (function(idx) { return function() { goToBannerSlide(idx); resetBannerAutoRotate(); }; })(i);
      dotsEl.appendChild(d);
    }
    dotsEl.dataset.built = '1';

    // Touch swipe
    trackEl.addEventListener('touchstart', function(e) {
      _bannerTouchStartX = e.touches[0].clientX;
      _bannerDragging = true;
      trackEl.style.transition = 'none';
    }, { passive: true });

    trackEl.addEventListener('touchmove', function(e) {
      if(!_bannerDragging) return;
      _bannerTouchDeltaX = e.touches[0].clientX - _bannerTouchStartX;
      var pct = (-_bannerIndex * 100) + (_bannerTouchDeltaX / trackEl.offsetWidth * 100);
      trackEl.style.transform = 'translateX(' + pct + '%)';
    }, { passive: true });

    trackEl.addEventListener('touchend', function() {
      if(!_bannerDragging) return;
      _bannerDragging = false;
      trackEl.style.transition = '';
      if(_bannerTouchDeltaX > 50 && _bannerIndex > 0) {
        goToBannerSlide(_bannerIndex - 1);
      } else if(_bannerTouchDeltaX < -50 && _bannerIndex < _bannerCount - 1) {
        goToBannerSlide(_bannerIndex + 1);
      } else {
        goToBannerSlide(_bannerIndex); // повернутись на місце
      }
      _bannerTouchDeltaX = 0;
      resetBannerAutoRotate();
    });
  }

  updateBannerDynamicContent();
  startBannerAutoRotate();
}

function goToBannerSlide(idx) {
  if(idx < 0) idx = _bannerCount - 1;
  if(idx >= _bannerCount) idx = 0;
  _bannerIndex = idx;
  var trackEl = document.getElementById('bannerTrack');
  if(trackEl) trackEl.style.transform = 'translateX(-' + (idx * 100) + '%)';
  document.querySelectorAll('.banner-dot').forEach(function(d, i) {
    d.classList.toggle('active', i === idx);
  });
}

function startBannerAutoRotate() {
  clearInterval(_bannerAutoTimer);
  _bannerAutoTimer = setInterval(function() {
    goToBannerSlide(_bannerIndex + 1);
  }, 5000);
}

function resetBannerAutoRotate() {
  startBannerAutoRotate();
}

// Заповнюємо динамічні поля всередині слайдів реальними даними
function updateBannerDynamicContent() {
  // Battle Pass рівень
  var bpEl = document.getElementById('bannerBpLevel');
  if(bpEl) bpEl.textContent = getBpData().level + 1 > BP_MAX_LEVEL ? 'MAX' : getBpData().level + 1;
  // Реферальний заробіток
  var refEl = document.getElementById('bannerRefEarned');
  if(refEl) refEl.textContent = '₴' + formatNumber(userData.referralEarnings || 0);
  // BTC ціна (якщо крипто-модуль вже ініціалізований)
  var btcEl = document.getElementById('bannerBtcPrice');
  if(btcEl && typeof _cryptoPrices !== 'undefined' && _cryptoPrices.BTC) {
    btcEl.textContent = '₴' + formatNumber(Math.round(_cryptoPrices.BTC));
  } else if(btcEl) {
    btcEl.textContent = '₴95 000';
  }
  // Моє місце в денному рейтингу (та сама таблиця, що й у «Ще» → Рейтинги)
  var lbRankEl = document.getElementById('bannerLbRank');
  if(lbRankEl && db && currentUser) {
    db.ref('leaderboards/' + getLbPeriodKey('day')).once('value').then(function(snap) {
      var sorted = Object.entries(snap.val() || {})
        .map(function(e) { return { name: e[0], val: e[1].wager || 0 }; })
        .filter(function(u) { return u.val > 0; })
        .sort(function(a, b) { return b.val - a.val; });
      var i = sorted.findIndex(function(u) { return u.name === currentUser; });
      lbRankEl.textContent = i >= 0 ? '#' + (i + 1) : '—';
    }).catch(function() {});
  }
  // Місце в турнірній таблиці
  var rankEl = document.getElementById('bannerTourneyRank');
  if(rankEl && db && currentUser) {
    db.ref('leaderboard_weekly/' + currentUser + '/rank').once('value').then(function(snap) {
      rankEl.textContent = snap.exists() ? ('#' + snap.val()) : '—';
    }).catch(function() {});
  }
  // Останній результат глобальної рулетки
  var rouletteEl = document.getElementById('bannerRouletteLast');
  if(rouletteEl && db) {
    db.ref('global_roulette/history').limitToLast(1).once('value').then(function(snap) {
      var vals = Object.values(snap.val() || {});
      if(!vals.length) { rouletteEl.textContent = '—'; return; }
      var last = vals[0];
      var colorDot = last.color === 'red' ? '🔴' : last.color === 'black' ? '⚫' : '🟢';
      rouletteEl.textContent = colorDot + ' ' + last.number;
    }).catch(function() {});
  }
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  МОДЕРАЦІЯ v2 — бан/мут (write-side яких раніше не було),   ║
// ║  maintenance mode, живий онлайн-монітор, нотатки, kill-switch║
// ╚══════════════════════════════════════════════════════════════╝

function logAdminAction(action, details) {
  if(!currentUser) return;
  db.ref('admin_action_log').push({
    admin: currentUser, action, details: details || '', ts: Date.now()
  });
}

// ── БАН / МУТ (нарешті є сторона запису — раніше тільки перевірялось) ──
// Єдина точка бана гравця — і вкладка "Модерація" (нік/причина з полів
// форми), і швидкий бан з картки гравця (admBanUser нижче) йдуть сюди,
// щоб не було двох різних реалізацій одного й того ж запису в базу.
function banPlayer(nickArg, reasonArg) {
  if(!requireAdminPerm('moderation')) return;
  const nick = (nickArg || document.getElementById('modUserNick')?.value || '').trim();
  const reason = (reasonArg || document.getElementById('modReason')?.value || '').trim();
  if(!nick) return notify('Введи нік гравця', 'error');
  db.ref('users/' + nick).once('value').then(snap => {
    if(!snap.exists()) return notify('Гравця не знайдено', 'error');
    db.ref('users/' + nick).update({ banned: true, banReason: reason || 'Порушення правил', bannedAt: Date.now(), bannedBy: currentUser });
    logAdminAction('ban', `@${nick} — ${reason || 'без причини'}`);
    notify('🚫 Гравця ' + nick + ' забанено', 'success');
  });
}

function unbanPlayer() {
  if(!requireAdminPerm('moderation')) return;
  const nick = (document.getElementById('modUserNick')?.value || '').trim();
  if(!nick) return notify('Введи нік гравця', 'error');
  db.ref('users/' + nick).update({ banned: false, banReason: null });
  logAdminAction('unban', `@${nick}`);
  notify('✅ Гравця ' + nick + ' розблоковано', 'success');
}

function mutePlayer() {
  if(!requireAdminPerm('moderation')) return;
  const nick = (document.getElementById('modUserNick')?.value || '').trim();
  const reason = (document.getElementById('modReason')?.value || '').trim();
  const hours = parseInt(document.getElementById('modMuteHours')?.value) || 1;
  if(!nick) return notify('Введи нік гравця', 'error');
  db.ref('users/' + nick).once('value').then(snap => {
    if(!snap.exists()) return notify('Гравця не знайдено', 'error');
    db.ref('users/' + nick).update({ muted: true, muteReason: reason || '', muteUntil: Date.now() + hours*3600000 });
    logAdminAction('mute', `@${nick} на ${hours}год — ${reason || 'без причини'}`);
    notify('🔇 Гравця ' + nick + ' замучено на ' + hours + 'год', 'success');
  });
}

function unmutePlayer() {
  if(!requireAdminPerm('moderation')) return;
  const nick = (document.getElementById('modUserNick')?.value || '').trim();
  if(!nick) return notify('Введи нік гравця', 'error');
  db.ref('users/' + nick).update({ muted: false, muteUntil: null });
  logAdminAction('unmute', `@${nick}`);
  notify('🔊 Гравця ' + nick + ' розмучено', 'success');
}

// ── MAINTENANCE MODE ──
function toggleMaintenanceMode() {
  if(!requireAdminPerm('moderation')) return;
  db.ref('site_config/maintenance').once('value').then(snap => {
    const newState = !snap.val();
    db.ref('site_config/maintenance').set(newState);
    logAdminAction('maintenance', newState ? 'Увімкнено' : 'Вимкнено');
    const btn = document.getElementById('maintenanceToggleBtn');
    if(btn) {
      btn.textContent = newState ? '✅ Вимкнути обслуговування' : '🚧 Увімкнути обслуговування';
      btn.className = newState ? 'btn-outline' : 'btn-red';
    }
    notify(newState ? '🚧 Режим обслуговування УВІМКНЕНО — нові входи заблоковані' : '✅ Сайт знову доступний всім', newState ? 'error' : 'success');
  });
}

function loadMaintenanceStatus() {
  db.ref('site_config/maintenance').once('value').then(snap => {
    const btn = document.getElementById('maintenanceToggleBtn');
    if(!btn) return;
    const on = !!snap.val();
    btn.textContent = on ? '✅ Вимкнути обслуговування' : '🚧 Увімкнути обслуговування';
    btn.className = on ? 'btn-outline' : 'btn-red';
  });
}

// ── ЖИВИЙ ОНЛАЙН-МОНІТОР ──
function loadOnlinePlayersAdmin() {
  const el = document.getElementById('adminOnlineList');
  if(!el) return;
  el.innerHTML = '<div style="color:#555;text-align:center;padding:14px;">Завантаження...</div>';
  db.ref('users').orderByChild('lastSeen').limitToLast(40).once('value').then(snap => {
    const users = snap.val() || {};
    const now = Date.now();
    const online = Object.entries(users)
      .filter(([nick, u]) => u.lastSeen && now - u.lastSeen < 300000 && !u.isBot)
      .sort((a,b) => (b[1].lastSeen||0) - (a[1].lastSeen||0));
    if(!online.length) { el.innerHTML = '<div style="color:#444;text-align:center;padding:14px;">Нікого онлайн</div>'; return; }
    el.innerHTML = online.map(([nick, u]) => {
      const minsAgo = Math.floor((now - u.lastSeen) / 60000);
      const statusColor = minsAgo < 2 ? '#3dd68c' : '#f39c12';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px;background:#0d0d0d;border-radius:10px;margin-bottom:6px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:12px;">${nick}${u.banned?' 🚫':''}${u.muted?' 🔇':''}${u.flagged?' 🚩':''}</div>
          <div style="font-size:10px;color:#555;">₴${formatNumber(u.balance||0)} · ${minsAgo}хв тому</div>
        </div>
        <button onclick="document.getElementById('modUserNick').value='${nick}';notify('Нік підставлено в поле модерації','info')" style="background:rgba(231,76,60,.08);border:1px solid #333;border-radius:6px;color:#888;font-size:10px;padding:4px 8px;cursor:pointer;">⚙️</button>
        <button onclick="document.getElementById('pmToInput')?document.getElementById('pmToInput').value='${nick}':null;switchTab('pm')" style="background:rgba(74,158,255,.08);border:1px solid #333;border-radius:6px;color:#4a9eff;font-size:10px;padding:4px 8px;cursor:pointer;">✉️</button>
      </div>`;
    }).join('');
  });
}

// ── НОТАТКИ АДМІНА ПРО ГРАВЦЯ ──
function loadPlayerNotes() {
  const nick = (document.getElementById('notesUserNick')?.value || '').trim();
  if(!nick) return notify('Введи нік гравця', 'error');
  db.ref('admin_notes/' + nick).once('value').then(snap => {
    const el = document.getElementById('playerNotesText');
    if(el) el.value = snap.val()?.text || '';
    notify('📝 Нотатки завантажено', 'info');
  });
}

function savePlayerNotes() {
  const nick = (document.getElementById('notesUserNick')?.value || '').trim();
  const text = document.getElementById('playerNotesText')?.value || '';
  if(!nick) return notify('Введи нік гравця', 'error');
  db.ref('admin_notes/' + nick).set({ text, updatedBy: currentUser, updatedAt: Date.now() });
  logAdminAction('note', `Оновлено нотатку про @${nick}`);
  notify('💾 Нотатку збережено', 'success');
}

// ── KILL-SWITCH ДЛЯ ІГОР ──
// Повний список усіх ігор сайту (синхронізовано з картками "Всі ігри" в лобі) —
// раніше тут було лише 9 ігор і решту адмін не міг вимкнути з панелі модерації.
const ADMIN_TOGGLEABLE_GAMES = [
  {id:'slots', name:'🎰 Classic 777'}, {id:'crash', name:'🚀 Crash Aviator'}, {id:'mines', name:'💣 Mines'},
  {id:'blackjack', name:'🃏 Blackjack'}, {id:'plinko', name:'🔻 Plinko'}, {id:'dice', name:'🎲 Dice Roll'},
  {id:'fortune', name:'🎡 Колесо Фортуни'}, {id:'poker', name:'♠️ Video Poker'}, {id:'hilo', name:'🃏 Hi-Lo Cards'},
  {id:'scratch', name:'🎟️ Скретч'}, {id:'limbo', name:'🎯 Limbo'}, {id:'tower', name:'🗼 Tower Climb'},
  {id:'roulette', name:'🎡 Roulette'}, {id:'keno', name:'🔢 Keno'}, {id:'monopoly', name:'🎩 Монополія'},
  {id:'cardgame', name:'🃏 Карти (Дурень)'}, {id:'chests', name:'📦 Magic Chests'}, {id:'coinflip', name:'🪙 Coinflip'},
  {id:'rps', name:'✊ Камінь-Ножиці'}, {id:'predict', name:'🔮 Prediction Duel'}, {id:'double', name:'🎰 Double'},
  {id:'sports', name:'⚽ Sport Betting'}, {id:'dragon', name:'🐉 Dragon Tower'}, {id:'penalty', name:'⚽ Penalty Kick'},
  {id:'bowling', name:'🎳 Bowling'}, {id:'archery', name:'🎯 Archery'}, {id:'sicbo', name:'🎲 Sic Bo'},
  {id:'cardwar', name:'⚔️ Card War'}, {id:'chess', name:'♟️ Шахи'}, {id:'duckshoot', name:'🦆 Duck Shoot'},
  {id:'balloon', name:'🎈 Balloon Pop'}, {id:'russianroulette', name:'🔫 Рулетка Ризику'}, {id:'quiz', name:'🧠 Quiz Battle'},
  {id:'horseracing', name:'🏇 Horse Racing'}, {id:'colorbet', name:'🎨 Color Bet'},
  {id:'diamond', name:'💎 Diamond Rush'},
];

let _gameToggleDisabledCache = {};
function renderGameToggleList() {
  const el = document.getElementById('gameToggleList');
  if(!el) return;
  db.ref('site_config/disabledGames').once('value').then(snap => {
    _gameToggleDisabledCache = snap.val() || {};
    filterGameToggleList(document.getElementById('gameToggleFilter')?.value || '');
  });
}

function filterGameToggleList(query) {
  const el = document.getElementById('gameToggleList');
  if(!el) return;
  const q = (query || '').trim().toLowerCase();
  const disabled = _gameToggleDisabledCache;
  const list = q ? ADMIN_TOGGLEABLE_GAMES.filter(g => g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q)) : ADMIN_TOGGLEABLE_GAMES;
  if(!list.length) { el.innerHTML = '<div style="color:#555;text-align:center;padding:10px;font-size:12px;">Нічого не знайдено</div>'; return; }
  el.innerHTML = list.map(g => {
    const isOff = !!disabled[g.id];
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#0d0d0d;border-radius:10px;margin-bottom:6px;">
      <span style="font-size:12px;">${g.name}</span>
      <button onclick="toggleGameEnabled('${g.id}')" style="background:${isOff?'rgba(231,76,60,.15)':'rgba(61,214,140,.15)'};border:1px solid ${isOff?'#e74c3c':'#3dd68c'};border-radius:8px;padding:4px 12px;color:${isOff?'#e74c3c':'#3dd68c'};font-size:11px;font-weight:700;cursor:pointer;">${isOff?'⛔ Вимкнена':'✅ Активна'}</button>
    </div>`;
  }).join('');
}

function toggleGameEnabled(gameId) {
  if(!isAdminUser()) return notify('Тільки для адміна', 'error');
  db.ref('site_config/disabledGames/' + gameId).once('value').then(snap => {
    const newState = !snap.val();
    db.ref('site_config/disabledGames/' + gameId).set(newState);
    logAdminAction('game_toggle', `${gameId}: ${newState ? 'вимкнено' : 'увімкнено'}`);
    renderGameToggleList();
  });
}

// ── ЖУРНАЛ ДІЙ АДМІНІВ ──
function loadAdminActionLog() {
  const el = document.getElementById('adminActionLog');
  if(!el) return;
  el.innerHTML = '<div style="color:#555;">Завантаження...</div>';
  db.ref('admin_action_log').limitToLast(30).once('value').then(snap => {
    const entries = Object.values(snap.val() || {}).sort((a,b) => b.ts - a.ts);
    if(!entries.length) { el.innerHTML = '<div style="color:#444;">Дій ще не було</div>'; return; }
    const icons = { ban:'🚫', unban:'✅', mute:'🔇', unmute:'🔊', maintenance:'🚧', note:'📝', game_toggle:'🎮' };
    el.innerHTML = entries.map(e => `<div style="padding:6px 0;border-bottom:1px solid #1a1a1a;">
      <span style="color:#888;">${icons[e.action]||'⚙️'} <b style="color:#d4af37;">${e.admin}</b> — ${e.action}</span>
      <div style="color:#555;font-size:10px;margin-top:2px;">${e.details} · ${new Date(e.ts).toLocaleString('uk-UA')}</div>
    </div>`).join('');
  });
}

function initModerationPanel() {
  loadMaintenanceStatus();
  loadOnlinePlayersAdmin();
  renderGameToggleList();
  loadAdminActionLog();
  loadFlaggedPlayers();
}

