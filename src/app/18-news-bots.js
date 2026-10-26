// ============================================
// ===== НОВИНИ =====
// ============================================
const NEWS_REACTIONS = ['❤️','🔥','👏','😮','😂','💎'];

function loadNews() {
  const container = document.getElementById('newsListContainer');
  if(!container) return;
  container.innerHTML = '<div style="text-align:center;color:#555;padding:30px 0;">Завантаження...</div>';
  db.ref('casino_news').orderByChild('time').limitToLast(20).once('value', snap => {
    const data = snap.val();
    if(!data) {
      container.innerHTML = '<div style="text-align:center;color:#555;padding:30px 0;font-size:13px;">Новин ще немає.<br>Слідкуй за оновленнями!</div>';
      return;
    }
    const items = Object.entries(data).map(([id,n])=>({id,...n})).reverse();
    container.innerHTML = '';
    items.forEach(n => container.appendChild(buildNewsCard(n)));
  });
}

function buildNewsCard(n) {
  const card = document.createElement('div');
  card.className = 'news-card';
  card.id = 'news-' + n.id;
  const t = timeAgo(n.time);
  const catColors = { news:'#4a9eff', update:'#4cd964', event:'#d4af37', promo:'#ff6b6b', warn:'#ff9f0a' };
  const catColor = catColors[n.category] || '#777';

  const myReactions = n.myReaction ? [n.myReaction] : [];
  const reactionHtml = NEWS_REACTIONS.map(r => {
    const cnt = n.reactions && n.reactions[r] ? n.reactions[r] : 0;
    const reacted = myReactions.includes(r);
    return '<div class="reaction-btn ' + (reacted?'reacted':'') + '" onclick="reactNews(\'' + n.id + '\',\'' + r + '\',this)">' +
      r + '<span class="reaction-count">' + (cnt||'') + '</span></div>';
  }).join('');

  const avHtml = n.authorAvatarUrl
    ? '<div class="news-avatar"><img src="' + safeUrl(n.authorAvatarUrl) + '"></div>'
    : '<div class="news-avatar">' + escapeHtml(n.authorEmoji||'👤') + '</div>';

  card.innerHTML =
    '<div class="news-header">' +
      '<div class="news-author">' +
        avHtml +
        '<div>' +
          '<div class="news-name">' + escapeHtml(n.author||'Адмін') + ' <span class="news-admin-badge">ADMIN</span></div>' +
          '<div class="news-time">' + t + ' · <span style="color:' + catColor + ';font-size:10px;">' + escapeHtml(n.emoji||'📢') + ' ' + escapeHtml(n.category) + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="news-title">' + escapeHtml(n.title) + '</div>' +
      '<div class="news-body">' + escapeHtml(n.body) + '</div>' +
    '</div>' +
    '<div class="news-reactions" id="reactions-' + n.id + '">' + reactionHtml + '</div>' +
    '<div class="news-comments-toggle" onclick="toggleComments(\'' + n.id + '\')">' +
      '💬 Коментарі <span id="cmtcount-' + n.id + '">' + (n.commentCount||0) + '</span>' +
    '</div>' +
    '<div class="news-comments-box" id="cmtbox-' + n.id + '">' +
      '<div id="cmtlist-' + n.id + '"></div>' +
      '<div class="comment-input-row">' +
        '<input id="cmtinput-' + n.id + '" placeholder="Написати коментар..." style="margin:0;flex:1;padding:10px;" maxlength="200" onkeypress="if(event.key===\'Enter\')submitComment(\'' + n.id + '\')">' +
        '<button class="btn-gold" style="width:auto;padding:10px 14px;margin:0;" onclick="submitComment(\'' + n.id + '\')">➤</button>' +
      '</div>' +
    '</div>';

  return card;
}

function reactNews(newsId, reaction, el) {
  db.ref('casino_news/' + newsId + '/reactions/' + reaction).transaction(v => (v||0) + 1);
  const container = document.getElementById('reactions-' + newsId);
  if(container) {
    container.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('reacted'));
    el.classList.toggle('reacted');
    const countEl = el.querySelector('.reaction-count');
    if(countEl) {
      const cur = parseInt(countEl.textContent) || 0;
      countEl.textContent = cur + 1;
    }
  }
}

function toggleComments(newsId) {
  const box = document.getElementById('cmtbox-' + newsId);
  if(!box) return;
  const isOpen = box.classList.contains('open');
  box.classList.toggle('open', !isOpen);
  if(!isOpen) loadComments(newsId);
}

function loadComments(newsId) {
  const list = document.getElementById('cmtlist-' + newsId);
  if(!list) return;
  list.innerHTML = '<div style="color:#555;font-size:12px;padding:5px 0;">Завантаження...</div>';
  db.ref('casino_news/' + newsId + '/comments').orderByChild('time').limitToLast(30).once('value', snap => {
    const data = snap.val();
    if(!data) { list.innerHTML = '<div style="color:#555;font-size:12px;padding:8px 0;">Коментарів ще немає. Будь першим!</div>'; return; }
    list.innerHTML = '';
    Object.values(data).forEach(c => {
      const t = timeAgo(c.time);
      const avHtml = c.avatarUrl
        ? '<div class="comment-avatar"><img src="' + safeUrl(c.avatarUrl) + '"></div>'
        : '<div class="comment-avatar">' + escapeHtml(c.avatarEmoji||'👤') + '</div>';
      const div = document.createElement('div');
      div.className = 'comment-item';
      div.innerHTML = avHtml +
        '<div>' +
          '<span class="comment-nick" onclick="openPublicProfile(' + jsArg(c.author) + ')">' + escapeHtml(c.author) + '</span>' +
          '<div class="comment-text">' + escapeHtml(c.text) + '</div>' +
          '<div class="comment-time">' + t + '</div>' +
        '</div>';
      list.appendChild(div);
    });
  });
}

function submitComment(newsId) {
  const inp = document.getElementById('cmtinput-' + newsId);
  const txt = inp ? inp.value.trim() : '';
  if(!txt || txt.length > 200) return;
  const isAdmin = isAdminUser();
  const av = typeof userData.avatar === 'string';
  const comment = {
    author: currentUser,
    text: txt,
    time: Date.now(),
    avatarEmoji: av && userData.avatar.length <= 4 ? userData.avatar : '👤',
    avatarUrl: av && userData.avatar.length > 10 ? userData.avatar : null,
    isAdmin,
  };
  db.ref('casino_news/' + newsId + '/comments').push(comment);
  db.ref('casino_news/' + newsId + '/commentCount').transaction(v => (v||0)+1);
  inp.value = '';
  setTimeout(() => loadComments(newsId), 500);
  const cnt = document.getElementById('cmtcount-' + newsId);
  if(cnt) cnt.textContent = parseInt(cnt.textContent||0)+1;
  notify('💬 Коментар додано!', 'success');
}

// ===== ADMIN: ПУБЛІКАЦІЯ НОВИН =====
function publishNews() {
  const title    = document.getElementById('newsTitle').value.trim();
  const body     = document.getElementById('newsBody').value.trim();
  const emoji    = document.getElementById('newsEmoji').value.trim() || '📢';
  const category = document.getElementById('newsCategory').value;
  if(!title || !body) return notify('Введіть заголовок і текст новини', 'error');

  const av = typeof userData.avatar === 'string';
  db.ref('casino_news').push({
    title, body, emoji, category,
    author: currentUser,
    authorEmoji: av && userData.avatar.length <= 4 ? userData.avatar : '👤',
    authorAvatarUrl: av && userData.avatar.length > 10 ? userData.avatar : null,
    time: Date.now(),
    reactions: {},
    commentCount: 0,
  });
  document.getElementById('newsTitle').value = '';
  document.getElementById('newsBody').value = '';
  notify('📰 Новину опубліковано!', 'success');
  homeTabInited.news = false; // Reset so it reloads

  // Показати badge на news вкладці
  const badge = document.getElementById('newsNewBadge');
  if(badge) badge.classList.remove('hidden');
}

function loadAdminNews() {
  const list = document.getElementById('adminNewsList');
  if(!list) return;
  db.ref('casino_news').orderByChild('author').equalTo(currentUser).limitToLast(10).once('value', snap => {
    const data = snap.val();
    if(!data) { list.innerHTML = '<div style="color:#555;font-size:12px;padding:8px;">Новин немає</div>'; return; }
    list.innerHTML = '';
    Object.entries(data).reverse().forEach(([id,n]) => {
      const div = document.createElement('div');
      div.style.cssText = 'padding:8px;background:#111;border-radius:8px;margin-bottom:5px;border:1px solid #222;';
      div.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<div style="font-size:13px;font-weight:bold;">' + (n.emoji||'📢') + ' ' + n.title + '</div>' +
          '<button onclick="deleteNews(\'' + id + '\')" style="background:var(--red);color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;">🗑️</button>' +
        '</div>' +
        '<div style="font-size:11px;color:#555;margin-top:3px;">' + timeAgo(n.time) + ' · 💬' + (n.commentCount||0) + '</div>';
      list.appendChild(div);
    });
  });
}

function deleteNews(id) {
  if(!confirm('Видалити новину?')) return;
  db.ref('casino_news/' + id).remove();
  notify('🗑️ Новину видалено', 'info');
  loadAdminNews();
}

// ============================================
// ===== БОТИ =====
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('botAvatar');
  if(sel) sel.addEventListener('change', function() {
    const urlBox = document.getElementById('botAvatarUrlBox');
    if(urlBox) urlBox.classList.toggle('hidden', this.value !== 'custom');
  });
});

function createBot() {
  const nick     = (document.getElementById('botNick')?.value || '').trim();
  const balance  = parseInt(document.getElementById('botBalance')?.value) || 5000;
  const avSel    = document.getElementById('botAvatar')?.value || '🤖';
  const avUrl    = document.getElementById('botAvatarUrl')?.value?.trim() || '';
  const activity = document.getElementById('botActivity')?.value || 'active';
  const pers     = document.getElementById('botPersonality')?.value || 'balanced';

  if(!nick || nick.length < 2) return notify('Введіть нік бота (мін. 2 символи)', 'error');
  if(!/^[a-zA-Zа-яА-ЯіІїЇєЄ0-9_]+$/.test(nick)) return notify('Нік: лише букви, цифри та _', 'error');

  const avatarEmoji = avSel === 'custom' ? '🤖' : avSel;
  const avatarUrl   = avSel === 'custom' ? avUrl : null;

  db.ref('users/' + nick).once('value', snap => {
    if(snap.exists() && !snap.val().isBot) return notify('Нік вже зайнятий реальним гравцем!', 'error');

    const botData = {
      balance, tag: '', isBot: true, isActive: activity === 'active',
      personality: pers,
      createdBy: currentUser, createdAt: Date.now(),
      registeredAt: Date.now(), lastSeen: Date.now(),
      dailyStreak: 0, id: 'BOT_' + Date.now(),
      avatar: avatarUrl || avatarEmoji,
      totalGames: Math.floor(Math.random()*500)+50,
      totalWins:  Math.floor(Math.random()*200)+20,
      totalWagered: Math.floor(Math.random()*50000)+1000,
      stats: { gamesPlayed: Math.floor(Math.random()*500)+50, biggestWin: Math.floor(Math.random()*5000)+500 },
    };

    db.ref('users/' + nick).set(botData).then(() => {
      if(activity === 'active') {
        addBotToEngine(nick, botData);
      }
      notify('🤖 Бот ' + nick + ' створено! (' + pers + ')', 'success');
      document.getElementById('botNick').value = '';
      loadBots();
    });
  });
}

// ╔══════════════════════════════════════════════════════╗
// ║            БОТ-ДВИЖОК v2 — постійна гра             ║
// ╚══════════════════════════════════════════════════════╝

var BOT_GAMES = [
  { game:'🎰 Слоти',    minBet:50,  maxBet:2000, rtp:.95 },
  { game:'🚀 Краш',    minBet:100, maxBet:5000, rtp:.97 },
  { game:'💣 Майнер',  minBet:100, maxBet:3000, rtp:.96 },
  { game:'🎲 Dice',    minBet:50,  maxBet:1000, rtp:.99 },
  { game:'🌀 Limbo',   minBet:100, maxBet:2000, rtp:.96 },
  { game:'🃏 Блекджек',minBet:200, maxBet:3000, rtp:.995 },
  { game:'🔻 Plinko',  minBet:100, maxBet:2000, rtp:.98 },
  { game:'🎡 Рулетка', minBet:100, maxBet:3000, rtp:.973 },
  { game:'🪙 Coinflip', minBet:200, maxBet:5000, rtp:.98 },
  { game:'⚽ Спорт',   minBet:100, maxBet:2000, rtp:.94 },
  { game:'🃏 Бакара',  minBet:300, maxBet:5000, rtp:.989 },
  { game:'🔫 Рулетка Ризику', minBet:500, maxBet:5000, rtp:.85 },
  { game:'🏇 Скачки',  minBet:200, maxBet:2000, rtp:.80 },
];

var BOT_MESSAGES = [
  'Тільки що зробив x{{mult}} на {{game}}! 🔥', 'Хто грає зараз?',
  'Виграв {{amount}}₴ за одну ставку 😤', '{{game}} — топ гра!',
  'Хто ставить на краш разом? 🚀', 'Серія перемог — 4 поспіль 🏆',
  'Ніхто не зупинить мій стрік 💪', 'Ставлю ва-банк 😅',
  'Кому пощастить сьогодні — мені чи казино?', 'Ого! Що за ніч 🤑',
  'Блекджек дав 21 з першої 🃏', 'Майнер — клас коли знаєш де міни',
  'Вперше граю в {{game}} — сподобалось!', 'Знову програв... але не здамся',
  'Фортуна любить сміливих!', 'Рекорд побитий: {{amount}}₴!',
];

var BOT_PERSONALITIES = {
  aggressive: { betMult:[1.5,3.0], winRate:.42, msgFreq:.45, playInterval:[8,20]  },
  balanced:   { betMult:[0.8,1.5], winRate:.47, msgFreq:.25, playInterval:[15,40] },
  conservative:{ betMult:[0.3,0.8],winRate:.52, msgFreq:.15, playInterval:[25,60] },
  whale:      { betMult:[3.0,8.0], winRate:.40, msgFreq:.5,  playInterval:[5,15]  },
};

let _botEngine = null;
let _activeBotData = {}; // nick → {balance, personality, nextPlay}

function startBotEngine() {
  if(_botEngine) return; // already running
  // Load all active bots from Firebase
  db.ref('users').orderByChild('isBot').equalTo(true).once('value', snap => {
    const bots = snap.val() || {};
    Object.entries(bots).forEach(([nick, data]) => {
      if(data.banned) return;
      const personalities = Object.keys(BOT_PERSONALITIES);
      const pers = data.personality || personalities[Math.floor(Math.random()*personalities.length)];
      const nextDelay = Math.random() * 30000 + 5000;
      _activeBotData[nick] = {
        balance: data.balance || 5000,
        personality: pers,
        nextPlay: Date.now() + nextDelay,
        avatarEmoji: data.avatar || '🤖',
      };
    });
    if(Object.keys(_activeBotData).length === 0) return;
    // Start engine tick every 5 seconds
    _botEngine = setInterval(botEngineTick, 5000);
    console.log('🤖 Бот-движок запущено для', Object.keys(_activeBotData).length, 'ботів');
  });
}

function botEngineTick() {
  const now = Date.now();
  Object.entries(_activeBotData).forEach(([nick, bot]) => {
    if(now < bot.nextPlay) return;
    botPlayGame(nick, bot);
  });
}

function botPlayGame(nick, bot) {
  const pers = BOT_PERSONALITIES[bot.personality] || BOT_PERSONALITIES.balanced;
  const g = BOT_GAMES[Math.floor(Math.random() * BOT_GAMES.length)];

  const betMultiplier = pers.betMult[0] + Math.random() * (pers.betMult[1] - pers.betMult[0]);
  const baseBet = Math.min(g.maxBet, Math.max(g.minBet, Math.floor(bot.balance * 0.02 * betMultiplier)));
  const bet = Math.round(baseBet / 50) * 50; // round to 50s

  const isWin = Math.random() < pers.winRate;
  const mult = isWin ? parseFloat((Math.random() * (
    bot.personality === 'whale' ? 8 :
    bot.personality === 'aggressive' ? 6 : 4
  ) + 1.1).toFixed(2)) : 0;
  const pnl = isWin ? Math.floor(bet * mult - bet) : -bet;

  bot.balance = Math.max(200, bot.balance + pnl);

  const interval = pers.playInterval;
  bot.nextPlay = Date.now() + (interval[0] + Math.random() * (interval[1] - interval[0])) * 1000;

  db.ref('users/' + nick + '/balance').set(bot.balance);
  db.ref('users/' + nick + '/lastSeen').set(Date.now());
  db.ref('users/' + nick + '/totalGames').set(firebase.database.ServerValue.increment(1));
  if(isWin) db.ref('users/' + nick + '/totalWins').set(firebase.database.ServerValue.increment(1));
  db.ref('users/' + nick + '/totalWagered').set(firebase.database.ServerValue.increment(bet));

  db.ref('live_bets').push({
    user: nick, game: g.game, bet, mult: isWin ? mult : 0,
    pnl, isWin, ts: Date.now(), isBot: true,
  });

  db.ref('casino_stats/jackpot').set(firebase.database.ServerValue.increment(Math.floor(bet * 0.005)));

  if(!isWin) db.ref('casino_stats/todayWins').set(firebase.database.ServerValue.increment(1));

  // Chat message (random chance)
  if(Math.random() < pers.msgFreq) {
    const tpl = BOT_MESSAGES[Math.floor(Math.random() * BOT_MESSAGES.length)];
    const msg = tpl
      .replace('{{mult}}', mult)
      .replace('{{game}}', g.game)
      .replace('{{amount}}', formatNumber(Math.abs(pnl)));
    // Post in both global chat and lobby chat
    const chatMsg = { user: nick, text: msg, ts: Date.now(), avatar: bot.avatarEmoji, isBot: true };
    if(Math.random() < 0.5) db.ref('global_chat').push(chatMsg);
    db.ref('lobby_chat').push({ sender: nick, text: msg, time: Date.now(), isBot: true });
  }

  if(isWin && pnl > 5000) {
    db.ref('global_chat').push({
      user: '🏆 SlotOK',
      text: `🎉 ${nick} щойно виграв ${formatNumber(pnl)}₴ в ${g.game}! Мультиплікатор ×${mult}`,
      ts: Date.now(), avatar: '🏆', isBot: true,
    });
  }

  // Auto refill if balance too low
  if(bot.balance < 500) {
    bot.balance = Math.floor(Math.random() * 8000) + 3000;
    db.ref('users/' + nick + '/balance').set(bot.balance);
  }
}

function addBotToEngine(nick, data) {
  const personalities = Object.keys(BOT_PERSONALITIES);
  const pers = data.personality || personalities[Math.floor(Math.random() * personalities.length)];
  _activeBotData[nick] = {
    balance: data.balance || 5000,
    personality: pers,
    nextPlay: Date.now() + Math.random() * 15000 + 3000,
    avatarEmoji: data.avatar || '🤖',
  };
  if(!_botEngine) _botEngine = setInterval(botEngineTick, 5000);
}

function stopBotEngine() {
  if(_botEngine) { clearInterval(_botEngine); _botEngine = null; }
}

