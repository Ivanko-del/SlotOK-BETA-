// ============================================
// ЧАТ ЛОБІ (moved to home tab, new version below)
// ============================================
let chatListener = null;

// ============================================
// ===== HOME SUB-TABS =====
// ============================================
let homeTabInited = { chat: false, news: false };

function initHomeTab() {
  startWinTicker();
  if(!chatListener) initLobbyChat();
  initBannerCarousel();
  renderMysteryBoxWidget();
  renderFriendsFeed();
  renderHomeLastUpdate();
}

function switchHomeTab(tab, el) {
  document.querySelectorAll('.home-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.home-panel').forEach(p => p.classList.remove('active'));
  if(el) el.classList.add('active');
  const panel = document.getElementById('hp-' + tab);
  if(panel) panel.classList.add('active');

  if(tab === 'news') { switchNewsTab('news'); }
  if(tab === 'chat') {
    if(!chatListener) initLobbyChat();
    const badge = document.getElementById('chatNewBadge');
    if(badge) badge.classList.add('hidden');
    setTimeout(() => {
      const box = document.getElementById('lobbyChatBox');
      if(box) box.scrollTop = box.scrollHeight;
    }, 100);
  }
  if(tab === 'news') {
    if(!homeTabInited.news) { loadNews(); homeTabInited.news = true; }
    const badge = document.getElementById('newsNewBadge');
    if(badge) badge.classList.add('hidden');
  }
}

function appendChatEmoji(emoji) {
  const inp = document.getElementById('lobbyChatInput');
  if(inp) { inp.value += emoji; inp.focus(); }
}

// ===== WIN TICKER =====
const TICKER_GAMES = ['Slots','Blackjack','Crash','Roulette','Mines','Poker','Plinko','Keno','Fortune'];
const TICKER_NAMES = ['Lucky_77','ProGamer','MaxWin','CashKing','SlotMaster','VegasPro','UkrChamp','BonusHunter'];
let tickerIdx = 0;
let tickerItems = [];

function startWinTicker() {
  const el = document.getElementById('winTicker');
  if(!el) return;
  // Завантажимо реальні виграші + додамо фейкові між ними
  db.ref('win_feed').limitToLast(20).once('value', snap => {
    const real = snap.val() ? Object.values(snap.val()) : [];
    const fake = Array.from({length:10}, () => ({
      user: TICKER_NAMES[Math.floor(Math.random()*TICKER_NAMES.length)],
      game: TICKER_GAMES[Math.floor(Math.random()*TICKER_GAMES.length)],
      amount: (Math.floor(Math.random()*200)+2)*50,
      mult: (Math.random()*15+1.5).toFixed(1)
    }));
    tickerItems = [...real.map(r => ({ user:r.user, game:r.game, amount:r.amount, mult:r.mult })), ...fake];
    tickerItems.sort(() => Math.random()-0.5);
    animateTicker();
  });
}

function animateTicker() {
  const el = document.getElementById('winTicker');
  if(!el || !tickerItems.length) return;
  const item = tickerItems[tickerIdx % tickerItems.length];
  tickerIdx++;
  const emojis = { Slots:'🎰', Blackjack:'🃏', Crash:'🚀', Roulette:'🎡', Mines:'💣', Poker:'♠️', Plinko:'🔻', Keno:'🔢', Fortune:'🎡' };
  el.textContent = (emojis[item.game]||'🎮') + ' ' + item.user + ' виграв ' + formatNumber(item.amount) + '₴ × ' + item.mult + ' у ' + item.game;
  el.style.opacity = '0';
  el.style.transition = 'opacity 0.5s';
  setTimeout(() => { el.style.opacity = '1'; }, 50);
  setTimeout(animateTicker, 4000);
}

// ============================================
// ===== ПОКРАЩЕНИЙ ЧАТ =====
// ============================================
// Override initLobbyChat completely
function initLobbyChat() {
  const box = document.getElementById('lobbyChatBox');
  if(!box || chatListener) return;
  box.innerHTML = '';
  chatListener = db.ref('lobby_chat').limitToLast(60).on('child_added', snap => {
    const m = snap.val();
    if(!m) return;
    const time = new Date(m.time).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
    const el = document.createElement('div');
    const isMe = m.sender === currentUser;
    const isAdmin = m.isAdmin;
    if(m.system) {
      el.style.cssText = 'color:var(--fg-4);font-size:11px;text-align:center;padding:6px 0;';
      el.textContent = m.text;
    } else {
      el.className = 'chat-msg' + (isMe ? ' mine' : '') + (isAdmin ? ' admin-msg' : '');
      const nickColor = isMe ? 'var(--accent)' : (isAdmin ? '#ff6b6b' : '#4a9eff');
      const av = m.avatarEmoji || '👤';
      const avHtml = m.avatarUrl
        ? '<div class="chat-avatar-sm"><img src="' + safeUrl(m.avatarUrl) + '" onerror="this.parentElement.textContent=\'👤\'"></div>'
        : '<div class="chat-avatar-sm">' + escapeHtml(av) + '</div>';
      const adminTag = isAdmin ? '<span style="background:var(--neg);color:var(--on-neg);font-size:8px;padding:1px 5px;border-radius:var(--r-sm);margin-left:3px;">ADMIN</span>' : '';
      const botTag = '';  // bots look like regular players
      const msgKey = snap.key;
      const isAdminUserLocal = isAdminUser();
      const delBtn = isAdminUserLocal ? '<button onclick="adminDeleteMsg(\'' + msgKey + '\')" style="background:none;border:none;color:var(--neg);font-size:11px;cursor:pointer;padding:0 3px;opacity:0.5;" title="Видалити">✕</button>' : '';
      el.innerHTML =
        '<div class="chat-header-line">' + avHtml +
          '<span class="chat-nick" style="color:' + nickColor + '" onclick="openPublicProfile(' + jsArg(m.sender) + ')">' + escapeHtml(m.sender) + '</span>' +
          adminTag + botTag +
          '<span class="chat-time" style="margin-left:auto;">' + time + '</span>' +
          delBtn +
        '</div>' +
        '<div class="chat-body-text">' + escapeHtml(m.text) + '</div>';
    }
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;

    // Якщо чат не відкритий — показати badge
    const htbChat = document.getElementById('htb-chat');
    if(htbChat && !htbChat.classList.contains('active') && !m.system) {
      const badge = document.getElementById('chatNewBadge');
      if(badge) badge.classList.remove('hidden');
    }
  });

  db.ref('announcement').on('value', snap => {
    const txt = snap.val();
    const banner = document.getElementById('announceBanner');
    if(banner) {
      if(txt) { banner.textContent = '📢 ' + txt; banner.classList.remove('hidden'); }
      else { banner.classList.add('hidden'); }
    }
  });

  db.ref('online').on('value', snap => {
    const data = snap.val() || {};
    const users = Object.keys(data);
    window._onlineUsers = users;
    const el = document.getElementById('onlineCount');
    if(el) el.textContent = users.length;
  });
  db.ref('online/'+currentUser).set(true);
  db.ref('online/'+currentUser).onDisconnect().remove();
}

function sendLobbyMsg() {
  const input = document.getElementById('lobbyChatInput');
  const txt = input.value.trim();
  if(!txt || txt.length > 200) return;
  if(userData.muted) return notify('Вас замутовано в чаті', 'error');
  const isAdmin = isAdminUser();
  postChatMessage('lobby_chat', {
    sender: currentUser,
    text: txt,
    time: Date.now(),
    isAdmin,
    avatarEmoji: typeof userData.avatar === 'string' && userData.avatar.length <= 4 ? userData.avatar : '👤',
    avatarUrl: typeof userData.avatar === 'string' && userData.avatar.length > 10 ? userData.avatar : null,
  });
  input.value = '';
}


