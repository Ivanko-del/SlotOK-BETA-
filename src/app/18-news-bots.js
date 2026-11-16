// ============================================
// ===== НОВИНИ =====
// ============================================
const NEWS_REACTIONS = ['❤️','🔥','👏','😮','😂','💎'];

function loadNews() {
  const container = document.getElementById('newsListContainer');
  if(!container) return;
  container.innerHTML = '<div style="text-align:center;color:var(--fg-4);padding:30px 0;">Завантаження...</div>';
  db.ref('casino_news').orderByChild('time').limitToLast(20).once('value', snap => {
    const data = snap.val();
    if(!data) {
      container.innerHTML = '<div style="text-align:center;color:var(--fg-4);padding:30px 0;font-size:13px;">Новин ще немає.<br>Слідкуй за оновленнями!</div>';
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
  list.innerHTML = '<div style="color:var(--fg-4);font-size:12px;padding:5px 0;">Завантаження...</div>';
  db.ref('casino_news/' + newsId + '/comments').orderByChild('time').limitToLast(30).once('value', snap => {
    const data = snap.val();
    if(!data) { list.innerHTML = '<div style="color:var(--fg-4);font-size:12px;padding:8px 0;">Коментарів ще немає. Будь першим!</div>'; return; }
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
    if(!data) { list.innerHTML = '<div style="color:var(--fg-4);font-size:12px;padding:8px;">Новин немає</div>'; return; }
    list.innerHTML = '';
    Object.entries(data).reverse().forEach(([id,n]) => {
      const div = document.createElement('div');
      div.style.cssText = 'padding:8px;background:var(--surface-1);border-radius:var(--r-md);margin-bottom:5px;border:1px solid var(--line);';
      div.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<div style="font-size:13px;font-weight:bold;">' + (n.emoji||'📢') + ' ' + n.title + '</div>' +
          '<button onclick="deleteNews(\'' + id + '\')" style="background:var(--red);color:var(--fg);border:none;border-radius:var(--r-sm);padding:4px 10px;font-size:11px;cursor:pointer;">🗑️</button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--fg-4);margin-top:3px;">' + timeAgo(n.time) + ' · 💬' + (n.commentCount||0) + '</div>';
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
// ===== БОТИ — ВИМКНЕНО НАЗАВЖДИ =====
// ============================================
// Фальшиві гравці, фейкові виграші та «живі» повідомлення заборонені
// (правове рішення власника). Движок більше нічого не пише в БД; лишилися
// порожні заглушки, щоб старі виклики не ламались, і адмінська очистка
// старих записів isBot.
var _botEngine = null;
var _activeBotData = {};
function createBot() { notify('Боти вимкнено назавжди: фальшиві гравці заборонені.', 'error'); }
function startBotEngine() {}
function botEngineTick() {}
function botPlayGame() {}
function addBotToEngine() {}
function stopBotEngine() {}

// Адмін: видалити всі записи ботів, що лишились у базі (users/<nick> з isBot).
async function adminPurgeBots() {
  if(!isAdminUser()) return;
  const ok = await confirmAction({ title: 'Видалити всіх ботів?', text: 'Усі акаунти з позначкою «бот» буде видалено з бази без відновлення.', confirm: 'Видалити', danger: true });
  if(!ok) return;
  db.ref('users').orderByChild('isBot').equalTo(true).once('value', snap => {
    const bots = snap.val() || {};
    const upd = {};
    Object.keys(bots).forEach(n => { upd['users/' + n] = null; });
    const n = Object.keys(upd).length;
    if(!n) { notify('Ботів у базі немає', 'info'); return; }
    db.ref().update(upd).then(() => { notify('Видалено ботів: ' + n, 'success'); loadBots(); }).catch(e => notify('Помилка: ' + e.message, 'error'));
  });
}
