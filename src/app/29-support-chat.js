// ============================================================
// ===== ЧАТ ПІДТРИМКИ (v122) =====
// Гравець: екран #support-modal — швидкі теми, бот, фото, жива підтримка.
// Підтримка: вкладка адмінки «Чати» — список розмов зі статусами й відповідь.
//
// Повідомлення — support_chats/<нік> (стара історія там же й лишається),
// стан розмови — support_threads/<нік>. Пише сервер (api/support.js →
// lib/support.js), бот відповідає там же за shared/support-kb.js. Без сервера
// (503) — запасний режим: браузер пише сам і бот відповідає тут, за тією ж базою.
// ============================================================
const SUP_STATUS_TEXT = {
  bot: 'Відповідає бот · людину можна покликати кнопкою «Покликати людину»',
  waiting: 'Чекаємо на підтримку — відповідь прийде сюди',
  answered: 'Підтримка відповіла',
  closed: 'Розмову закрито — напиши, щоб відкрити знову',
};
const SUP_STATUS_SHORT = { bot: 'Бот', waiting: 'Чекає', answered: 'Відповіли', closed: 'Закрито' };
const SUP_IMG_MAX_BYTES = 8 * 1024 * 1024;

let _supMsgsRef = null, _supMsgsCb = null, _supThreadRef = null, _supThreadCb = null;
let _supThread = {};
let _supPendingImg = null;
let _supSending = false;

function supportApi(action, body) {
  return serverApi('/api/support', Object.assign({ action }, body || {}));
}

function supTime(m) { return m.time || m.ts || 0; }

// Одне повідомлення → HTML. Спільне для гравця й підтримки (side: хто «я»).
function supMessageHtml(m, mine) {
  const isMe = mine(m);
  const who = m.sender === 'user' ? (isMe ? 'Ви' : 'Гравець')
    : m.sender === 'ai' ? 'Бот підтримки'
    : 'Підтримка' + (m.by ? ' · ' + m.by : '');
  const media = m.imgUrl || m.mediaUrl;
  let mediaHtml = '';
  if(media) {
    const url = safeUrl(media);
    mediaHtml = !url ? pmImgPlaceholderHtml()
      : m.isVideo ? `<video class="pm-img" src="${url}" controls muted playsinline></video>`
      : `<img class="pm-img" src="${url}" alt="Фото" loading="lazy" onerror="pmImgFailed(this)" onclick="pmOpenImage(this.src)">`;
  }
  const t = supTime(m);
  return `<div class="sup-msg${isMe ? ' is-me' : ''} is-${m.sender === 'user' ? 'user' : m.sender === 'ai' ? 'bot' : 'staff'}">
    <div class="sup-bubble">
      <div class="sup-who">${escapeHtml(who)}</div>
      ${mediaHtml}
      ${m.text ? `<div class="sup-text">${escapeHtml(m.text)}</div>` : ''}
      ${t ? `<div class="sup-time">${new Date(t).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>` : ''}
    </div>
  </div>`;
}

function supRenderList(box, data, mine) {
  if(!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const list = Object.values(data || {}).filter(Boolean).sort((a, b) => supTime(a) - supTime(b));
  box.innerHTML = list.length ? list.map(m => supMessageHtml(m, mine)).join('')
    : '<div class="empty-state"><div class="empty-state-title">Повідомлень ще немає</div>Обери тему вгорі або напиши питання.</div>';
  if(nearBottom || !box.dataset.scrolled) { box.scrollTop = box.scrollHeight; box.dataset.scrolled = '1'; }
}

// ══════════════════════ Гравець ══════════════════════
function renderSupportTopics() {
  const el = document.getElementById('supTopics');
  if(!el) return;
  el.innerHTML = SUPPORT_TOPICS.filter(t => t.quick).map(t =>
    `<button type="button" class="chip${t.id === SUPPORT_HUMAN_TOPIC ? ' is-human' : ''}" onclick="sendSupportTopic(${jsArg(t.id)})">${escapeHtml(t.quick)}</button>`).join('');
}

function supFitViewport() {
  const el = document.getElementById('support-modal');
  const vv = window.visualViewport;
  if(!el || !vv) return;
  el.style.setProperty('--sup-vv-h', Math.round(vv.height) + 'px');
  el.style.setProperty('--sup-vv-top', Math.round(vv.offsetTop) + 'px');
}

async function openSupportModal() {
  if(!currentUser || !db) return notify('Увійди, щоб написати в підтримку', 'error');
  const el = document.getElementById('support-modal');
  if(!el) return;
  if(el.parentElement !== document.body) document.body.appendChild(el);
  el.classList.remove('hidden');
  document.body.classList.add('pm-thread-open');
  if(window.visualViewport) {
    window.visualViewport.addEventListener('resize', supFitViewport);
    window.visualViewport.addEventListener('scroll', supFitViewport);
  }
  supFitViewport();
  renderSupportTopics();
  const box = document.getElementById('supportChatBox');
  if(box) delete box.dataset.scrolled;
  if(!_supMsgsRef) {
    _supMsgsRef = db.ref('support_chats/' + currentUser).limitToLast(100);
    _supMsgsCb = _supMsgsRef.on('value', snap => supRenderList(document.getElementById('supportChatBox'), snap.val(), m => m.sender === 'user'));
    _supThreadRef = db.ref('support_threads/' + currentUser);
    _supThreadCb = _supThreadRef.on('value', snap => {
      _supThread = snap.val() || {};
      const st = document.getElementById('supStatus');
      if(st) { st.textContent = SUP_STATUS_TEXT[_supThread.status || 'bot']; st.dataset.status = _supThread.status || 'bot'; }
    });
  }
  const srv = await supportApi('open');
  if(srv.mode === 'legacy') await supLegacyGreeting();
  supMarkRead();
}

function closeSupportModal() {
  const el = document.getElementById('support-modal');
  if(el) el.classList.add('hidden');
  document.body.classList.remove('pm-thread-open');
  if(window.visualViewport) {
    window.visualViewport.removeEventListener('resize', supFitViewport);
    window.visualViewport.removeEventListener('scroll', supFitViewport);
  }
  supMarkRead();
}

function supMarkRead() {
  if(!currentUser) return;
  supportApi('read').then(srv => {
    if(srv.mode === 'legacy') db.ref('users/' + currentUser + '/supportUnread').set(0);
  });
}

async function handleSupportMedia(input) {
  const file = input.files && input.files[0];
  if(!file) return;
  if(file.size > SUP_IMG_MAX_BYTES) { input.value = ''; return notify('Фото до 8 МБ', 'error'); }
  try { _supPendingImg = await compressImageFile(file, { maxSide: 1280, quality: 0.78 }); }
  catch(e) { input.value = ''; return notify(e.message || 'Не вдалося відкрити фото', 'error'); }
  const prev = document.getElementById('supPreview');
  const img = document.getElementById('supPreviewImg');
  if(img) img.src = _supPendingImg;
  if(prev) prev.classList.remove('hidden');
}

function clearSupportMedia() {
  _supPendingImg = null;
  const prev = document.getElementById('supPreview');
  if(prev) prev.classList.add('hidden');
  const inp = document.getElementById('supportFileInput');
  if(inp) inp.value = '';
}

async function sendSupportMsg(topic) {
  if(_supSending || !currentUser) return;
  const inp = document.getElementById('supportMsg');
  const text = topic ? '' : (inp ? inp.value.trim() : '');
  const img = topic ? null : _supPendingImg;
  if(!text && !img && !topic) return;
  if(text && isAbusiveText(text)) return notify('Повідомлення містить заборонені слова', 'error');
  _supSending = true;
  try {
    const body = {};
    if(text) body.text = text;
    if(img) body.imgUrl = img;
    if(topic) body.topic = topic;
    const srv = await supportApi('send', body);
    if(srv.mode === 'error') return;
    if(srv.mode === 'legacy') await supLegacySend(body);
    if(inp && !topic) inp.value = '';
    if(!topic) clearSupportMedia();
  } finally { _supSending = false; }
}
function sendSupportTopic(id) { return sendSupportMsg(id); }

// ── Запасний режим без сервера: те саме, що робить lib/support.js ──
async function supLegacyGreeting() {
  const snap = await db.ref('support_chats/' + currentUser).limitToLast(1).once('value');
  if(snap.exists()) return;
  await db.ref('support_chats/' + currentUser).push({ sender: 'ai', text: supportPick(SUPPORT_GREETING), time: Date.now() });
}
async function supLegacySend(body) {
  const ref = db.ref('support_chats/' + currentUser);
  const quick = body.topic ? supportTopic(body.topic) : null;
  const msg = { sender: 'user', time: Date.now() };
  if(body.text) msg.text = body.text; else if(quick && !body.imgUrl) msg.text = quick.quick;
  if(body.imgUrl) msg.imgUrl = body.imgUrl;
  const sent = await ref.push(msg);
  notifyBot('support', sent.key, { user: currentUser });
  const withHuman = _supThread.status === 'waiting' || _supThread.status === 'answered';
  const tRef = db.ref('support_threads/' + currentUser);
  const meta = { lastTs: msg.time, lastText: msg.text || '📷 Фото', lastFrom: 'user', updatedAt: msg.time };
  if(withHuman && body.topic !== SUPPORT_HUMAN_TOPIC) {
    await tRef.update(Object.assign(meta, { status: 'waiting', unreadStaff: (Number(_supThread.unreadStaff) || 0) + 1 }));
    return;
  }
  let reply, handoff;
  if(quick) { reply = supportPick(quick.replies); handoff = !!quick.human; }
  else if(!body.text && body.imgUrl) { reply = supportPick(SUPPORT_PHOTO_REPLY); handoff = true; }
  else {
    const m = supportMatch(body.text);
    reply = m ? supportPick(m.topic.replies) : supportPick(SUPPORT_FALLBACK);
    handoff = m ? !!m.topic.human : true;
  }
  await new Promise(r => setTimeout(r, 500));
  const t = Date.now();
  await ref.push({ sender: 'ai', text: reply, time: t });
  await tRef.update({ lastTs: t, lastText: reply.slice(0, 120), lastFrom: 'ai', updatedAt: t,
    status: handoff ? 'waiting' : (_supThread.status === 'waiting' ? 'waiting' : 'bot'),
    unreadStaff: (Number(_supThread.unreadStaff) || 0) + (handoff ? 1 : 0) });
}

// ══════════════════════ Підтримка (адмінка → «Чати») ══════════════════════
let _supAdminFilter = 'waiting';
let _supAdminThreads = {};
let _supAdminListRef = null;
let _supAdminNick = null, _supAdminMsgsRef = null;
let _supAdminImg = null;

const SUP_CANNED = [
  'Дякуємо, що написав! Уже перевіряємо.',
  'Донат знайшли й зарахували — перевір баланс у Гаманці.',
  'Не бачимо такого платежу. Надішли, будь ласка, скрін квитанції з часом оплати.',
  'Пароль скинуто. Новий тимчасовий пароль надіслали в ПМ — зміни його в Налаштуваннях.',
  'Перевірили: збій з нашого боку, баланс повернуто. Вибач за незручності.',
  'Акаунт перевірили, обмеження знято. Гарної гри!',
  'Скаргу отримали, гравця перевіряє модерація. Дякуємо, що повідомив.',
  'Передали ідею команді. Дякуємо!',
  'Якщо питання вирішено — закриваю розмову. Пиши, якщо щось ще.',
];

function initAdminSupportChats() {
  if(!isSupportUser()) return;
  const f = document.getElementById('supAdminFilter');
  if(f) f.innerHTML = [['waiting', 'Чекають'], ['answered', 'Відповіли'], ['bot', 'Бот'], ['closed', 'Закриті'], ['all', 'Усі']]
    .map(([k, n]) => `<button type="button" class="seg-item${k === _supAdminFilter ? ' active' : ''}" role="radio" aria-checked="${k === _supAdminFilter}" data-sup-filter="${k}" onclick="setAdminSupportFilter('${k}')"><span class="seg-label">${n}</span></button>`).join('');
  const c = document.getElementById('supAdminCanned');
  if(c && !c.options.length) c.innerHTML = '<option value="">Шаблон відповіді…</option>' + SUP_CANNED.map((t, i) => `<option value="${i}">${escapeHtml(t.slice(0, 60))}</option>`).join('');
  if(!_supAdminListRef) {
    _supAdminListRef = db.ref('support_threads').orderByChild('lastTs').limitToLast(300);
    _supAdminListRef.on('value', snap => { _supAdminThreads = snap.val() || {}; renderAdminSupportList(); });
  }
}

function setAdminSupportFilter(k) {
  _supAdminFilter = k;
  initAdminSupportChats();
  renderAdminSupportList();
  // Старі розмови (до v122) не мають стану — показуємо їх у «Усі»
  if(k === 'all' && !_supAdminLegacyLoaded) loadLegacySupportThreads();
}

let _supAdminLegacyLoaded = false;
function loadLegacySupportThreads() {
  _supAdminLegacyLoaded = true;
  db.ref('support_chats').once('value').then(snap => {
    Object.entries(snap.val() || {}).forEach(([nick, msgs]) => {
      if(_supAdminThreads[nick]) return;
      const last = Object.values(msgs || {}).filter(Boolean).sort((a, b) => supTime(a) - supTime(b)).pop();
      if(last) _supAdminThreads[nick] = { status: 'closed', lastTs: supTime(last), lastText: last.text || '📷 Фото', lastFrom: last.sender, legacy: true };
    });
    renderAdminSupportList();
  }).catch(() => {});
}

function renderAdminSupportList() {
  const el = document.getElementById('supAdminList');
  const waiting = Object.values(_supAdminThreads).filter(t => t && t.status === 'waiting').length;
  const badge = document.getElementById('supAdminBadge');
  if(badge) { badge.textContent = waiting; badge.classList.toggle('hidden', !waiting); }
  if(!el) return;
  const rows = Object.entries(_supAdminThreads)
    .filter(([, t]) => t && (_supAdminFilter === 'all' || (t.status || 'bot') === _supAdminFilter))
    .sort((a, b) => (b[1].lastTs || 0) - (a[1].lastTs || 0));
  el.innerHTML = rows.length ? rows.map(([nick, t]) => `
    <button type="button" class="list-row sup-row" onclick="openAdminSupportThread(${jsArg(nick)})">
      <span class="list-row-main">
        <span class="list-row-title"><span data-pn="${escapeHtml(nick)}">${escapeHtml(nick)}</span></span>
        <span class="list-row-sub">${t.lastFrom === 'user' ? '' : (t.lastFrom === 'ai' ? 'Бот: ' : 'Ви: ')}${escapeHtml(t.lastText || '')}</span>
      </span>
      <span class="sup-row-end">
        <span class="badge sup-st-${escapeHtml(t.status || 'bot')}">${SUP_STATUS_SHORT[t.status || 'bot'] || ''}</span>
        ${t.unreadStaff > 0 ? `<span class="tab-badge">${Number(t.unreadStaff)}</span>` : ''}
        <span class="sup-time">${t.lastTs ? getRelativeTime(t.lastTs) : ''}</span>
      </span>
    </button>`).join('')
    : '<div class="empty-state"><div class="empty-state-title">Порожньо</div>Розмов з таким статусом немає.</div>';
}

function openAdminSupportThread(nick) {
  if(!isSupportUser()) return;
  _supAdminNick = nick;
  document.getElementById('supAdminListView').classList.add('hidden');
  document.getElementById('supAdminThread').classList.remove('hidden');
  const n = document.getElementById('supAdminNick');
  if(n) { n.textContent = nick; n.onclick = () => openPublicProfile(nick); }
  renderAdminSupportHead();
  if(_supAdminMsgsRef) _supAdminMsgsRef.off();
  const box = document.getElementById('supAdminMsgs');
  if(box) { box.innerHTML = ''; delete box.dataset.scrolled; }
  _supAdminMsgsRef = db.ref('support_chats/' + nick).limitToLast(150);
  _supAdminMsgsRef.on('value', snap => supRenderList(document.getElementById('supAdminMsgs'), snap.val(), m => m.sender !== 'user'));
  supportApi('staffRead', { nick }).then(srv => { if(srv.mode === 'legacy') db.ref('support_threads/' + nick + '/unreadStaff').set(0); });
}

function renderAdminSupportHead() {
  const t = _supAdminThreads[_supAdminNick] || {};
  const st = document.getElementById('supAdminStatus');
  if(st) st.textContent = SUP_STATUS_TEXT[t.status || 'bot'] || '';
  const b = document.getElementById('supAdminCloseBtn');
  if(b) b.textContent = t.status === 'closed' ? 'Відкрити знову' : 'Закрити';
}

function closeAdminSupportThread() {
  if(_supAdminMsgsRef) { _supAdminMsgsRef.off(); _supAdminMsgsRef = null; }
  _supAdminNick = null;
  document.getElementById('supAdminThread').classList.add('hidden');
  document.getElementById('supAdminListView').classList.remove('hidden');
  renderAdminSupportList();
}

async function toggleAdminSupportClosed() {
  if(!_supAdminNick) return;
  const t = _supAdminThreads[_supAdminNick] || {};
  const status = t.status === 'closed' ? 'waiting' : 'closed';
  if(status === 'closed') {
    const ok = await confirmAction({ title: 'Закрити розмову з ' + _supAdminNick + '?', text: 'Гравець побачить, що розмову закрито. Нове повідомлення відкриє її знову.', confirm: 'Закрити' });
    if(!ok) return;
  }
  const srv = await supportApi('staffStatus', { nick: _supAdminNick, status });
  if(srv.mode === 'legacy') await db.ref('support_threads/' + _supAdminNick).update({ status, updatedAt: Date.now(), by: currentUser });
  if(srv.mode !== 'error') {
    _supAdminThreads[_supAdminNick] = Object.assign({}, t, { status });
    renderAdminSupportHead();
  }
}

function useAdminCanned(sel) {
  const i = sel.value;
  if(i === '') return;
  const ta = document.getElementById('supAdminReply');
  if(ta) { ta.value = (ta.value ? ta.value + '\n' : '') + SUP_CANNED[Number(i)]; ta.focus(); }
  sel.value = '';
}

async function handleAdminSupportMedia(input) {
  const file = input.files && input.files[0];
  if(!file) return;
  try { _supAdminImg = await compressImageFile(file, { maxSide: 1280, quality: 0.78 }); }
  catch(e) { input.value = ''; return notify(e.message || 'Не вдалося відкрити фото', 'error'); }
  document.getElementById('supAdminPreviewImg').src = _supAdminImg;
  document.getElementById('supAdminPreview').classList.remove('hidden');
}
function clearAdminSupportMedia() {
  _supAdminImg = null;
  document.getElementById('supAdminPreview').classList.add('hidden');
  const inp = document.getElementById('supAdminFile');
  if(inp) inp.value = '';
}

let _supAdminSending = false;
async function sendAdminSupportReply() {
  if(!_supAdminNick || _supAdminSending) return;
  const ta = document.getElementById('supAdminReply');
  const text = (ta ? ta.value : '').trim();
  if(!text && !_supAdminImg) return;
  _supAdminSending = true;
  try {
    const body = { nick: _supAdminNick };
    if(text) body.text = text;
    if(_supAdminImg) body.imgUrl = _supAdminImg;
    const srv = await supportApi('staffReply', body);
    if(srv.mode === 'error') return;
    if(srv.mode === 'legacy') {
      const msg = { sender: isAdminUser() ? 'admin' : 'support', by: currentUser, time: Date.now() };
      if(text) msg.text = text;
      if(_supAdminImg) msg.imgUrl = _supAdminImg;
      await db.ref('support_chats/' + _supAdminNick).push(msg);
      await db.ref('support_threads/' + _supAdminNick).update({ status: 'answered', lastTs: msg.time, lastText: text || '📷 Фото', lastFrom: msg.sender, unreadStaff: 0, by: currentUser });
      db.ref('users/' + _supAdminNick + '/supportUnread').set(firebase.database.ServerValue.increment(1));
    }
    if(ta) ta.value = '';
    clearAdminSupportMedia();
  } finally { _supAdminSending = false; }
}
