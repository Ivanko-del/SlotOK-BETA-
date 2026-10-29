// ╔══════════════════════════════════════════════════════════════╗
// ║  Роль support, звернення (feedback) і безпека ПМ              ║
// ║                                                              ║
// ║  role у профілі (users/<нік>/role): 'support' | 'admin'.      ║
// ║  Support бачить в адмінці лише вкладку «Звернення»; адміни —  ║
// ║  як і раніше через isAdmin. Звернення лежать у feedback/<id>  ║
// ║  (правила — scripts/build-rules.js). Скарга на гравця з ПМ —  ║
// ║  теж звернення, type 'report'.                               ║
// ╚══════════════════════════════════════════════════════════════╝

function isSupportUser() {
  if(isAdminUser()) return true;
  const r = userData && userData.role;
  return r === 'support' || r === 'admin';
}

function currentUserRole() {
  if(isAdminUser()) return 'admin';
  return userData && userData.role === 'support' ? 'support' : 'player';
}

// ── Зображення: стиснення перед записом у базу ─────────────────
// Storage у проєкті не підключено: фото лягають у базу як data:-URL, тож
// стискаємо їх до розумного розміру ще в браузері.
const FEEDBACK_IMG_MAX_BYTES = 2 * 1024 * 1024;
const PM_GIF_MAX_BYTES = 1024 * 1024;
const PM_IMG_RE = /^(https?:\/\/[^\s"'<>`]+|data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+)$/i;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Не вдалося прочитати файл'));
    r.readAsDataURL(file);
  });
}

function compressImageFile(file, opts) {
  opts = opts || {};
  const maxSide = opts.maxSide || 1280, quality = opts.quality || 0.8;
  return new Promise((resolve, reject) => {
    if(!file || !/^image\//.test(file.type)) return reject(new Error('Це не зображення'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'white'; // JPEG без прозорості: PNG-скрін не стане чорним
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не вдалося відкрити зображення')); };
    img.src = url;
  });
}

// ══════════════════════════════════════════════════════════════
// ЗВЕРНЕННЯ: форма гравця
// ══════════════════════════════════════════════════════════════
const FEEDBACK_TYPES = { question: 'Питання', complaint: 'Скарга', suggestion: 'Пропозиція', report: 'Скарга на гравця' };
const FEEDBACK_STATUSES = { new: 'Нове', in_progress: 'В роботі', closed: 'Закрите' };
const FEEDBACK_COOLDOWN_MS = 60000;
let _fbType = 'question';
let _fbImg = null;

function closeFeedbackModal() { document.getElementById('feedbackModal')?.remove(); _fbImg = null; }

function openFeedbackModal(type) {
  if(!currentUser || !db) return notify('Увійди, щоб написати в підтримку', 'error');
  closeFeedbackModal();
  const wrap = document.createElement('div');
  wrap.id = 'feedbackModal';
  wrap.className = 'modal-backdrop is-sheet';
  wrap.innerHTML = `
    <form class="dialog fb-dialog" role="dialog" aria-modal="true" aria-labelledby="fbTitle" novalidate
      onsubmit="event.preventDefault();submitFeedback();">
      <div class="fb-head">
        <h2 class="dialog-title" id="fbTitle">Підтримка / Пропозиція</h2>
        <button type="button" class="ks-modal-x" onclick="closeFeedbackModal()" aria-label="Закрити"><span class="ic i-close" aria-hidden="true"></span></button>
      </div>
      <div class="field">
        <span class="field-label" id="fbTypeLbl">Тип</span>
        <div class="seg" role="radiogroup" aria-labelledby="fbTypeLbl">
          ${['question', 'complaint', 'suggestion'].map(t => `
            <button type="button" class="seg-item" role="radio" data-fb-type="${t}" onclick="pickFeedbackType('${t}')"><span class="seg-label">${FEEDBACK_TYPES[t]}</span></button>`).join('')}
        </div>
      </div>
      <label class="field"><span class="field-label">Тема</span><input id="fbSubject" maxlength="120" required></label>
      <label class="field"><span class="field-label">Текст</span><textarea id="fbMessage" maxlength="4000" required></textarea></label>
      <label class="field">
        <span class="field-label">Контакт <span class="field-optional">— необов'язково</span></span>
        <input id="fbContact" maxlength="200" placeholder="Telegram або email">
        <span class="field-hint">Відповідь однаково з'явиться в «Мої звернення» і прийде в ПМ.</span>
      </label>
      <div class="field">
        <span class="field-label">Скріншот <span class="field-optional">— необов'язково, до 2 МБ</span></span>
        <input type="file" id="fbFile" accept="image/*" onchange="pickFeedbackImage(this)">
        <div id="fbImgPrev" class="fb-img-prev hidden"></div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" onclick="openMyFeedback()">Мої звернення</button>
        <button type="submit" class="btn btn-primary" id="fbSend">Надіслати</button>
      </div>
    </form>`;
  wrap.addEventListener('click', e => { if(e.target === wrap) closeFeedbackModal(); });
  document.body.appendChild(wrap);
  pickFeedbackType(FEEDBACK_TYPES[type] && type !== 'report' ? type : 'question');
  setTimeout(() => document.getElementById('fbSubject')?.focus({ preventScroll: true }), 30);
}

function pickFeedbackType(t) {
  _fbType = t;
  document.querySelectorAll('#feedbackModal [data-fb-type]').forEach(b => {
    const on = b.dataset.fbType === t;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
}

async function pickFeedbackImage(input) {
  const file = input.files && input.files[0];
  const prev = document.getElementById('fbImgPrev');
  _fbImg = null;
  if(prev) { prev.classList.add('hidden'); prev.innerHTML = ''; }
  if(!file) return;
  if(file.size > FEEDBACK_IMG_MAX_BYTES) { input.value = ''; return notify('Файл більший за 2 МБ', 'error'); }
  try {
    _fbImg = await compressImageFile(file, { maxSide: 1600, quality: 0.8 });
  } catch(e) { input.value = ''; return notify(e.message, 'error'); }
  if(prev) {
    prev.innerHTML = `<img src="${safeUrl(_fbImg)}" alt="Скріншот до звернення">
      <button type="button" class="btn btn-ghost btn-sm" onclick="clearFeedbackImage()"><span class="ic i-trash" aria-hidden="true"></span> Прибрати</button>`;
    prev.classList.remove('hidden');
  }
}

function clearFeedbackImage() {
  _fbImg = null;
  const input = document.getElementById('fbFile');
  if(input) input.value = '';
  const prev = document.getElementById('fbImgPrev');
  if(prev) { prev.classList.add('hidden'); prev.innerHTML = ''; }
}

function feedbackCooldownLeft() {
  let last = 0;
  try { last = +localStorage.getItem('slotok_fb_last') || 0; } catch(e) {}
  return Math.max(0, FEEDBACK_COOLDOWN_MS - (Date.now() - last));
}

// Спільний запис для форми й скарги з ПМ.
function pushFeedback(rec) {
  const left = feedbackCooldownLeft();
  if(left) return Promise.reject(new Error('Зачекай ' + Math.ceil(left / 1000) + ' с перед наступним зверненням'));
  const full = Object.assign({
    uid: currentUser, role: currentUserRole(), contact: '',
    createdAt: Date.now(), status: 'new',
  }, rec);
  return db.ref('feedback').push(full).then(ref => {
    try { localStorage.setItem('slotok_fb_last', String(Date.now())); } catch(e) {}
    return ref;
  });
}

async function submitFeedback() {
  const subject = (document.getElementById('fbSubject')?.value || '').trim();
  const message = (document.getElementById('fbMessage')?.value || '').trim();
  const contact = (document.getElementById('fbContact')?.value || '').trim();
  if(subject.length < 3) return notify('Тема — мінімум 3 символи', 'error');
  if(message.length < 10) return notify('Опиши детальніше — мінімум 10 символів', 'error');
  const btn = document.getElementById('fbSend');
  if(btn) btn.disabled = true;
  const rec = { type: _fbType, subject, message, contact };
  if(_fbImg) rec.imgUrl = _fbImg;
  try {
    await pushFeedback(rec);
    closeFeedbackModal();
    notify('Звернення надіслано. Відповідь прийде в ПМ і в «Мої звернення».', 'success');
  } catch(e) {
    notify(e.message || 'Не вдалося надіслати', 'error');
  } finally { if(btn) btn.disabled = false; }
}

function feedbackStatusBadge(status) {
  const cls = status === 'closed' ? 'is-pos' : status === 'in_progress' ? 'is-info' : 'is-warn';
  return `<span class="badge ${cls}">${escapeHtml(FEEDBACK_STATUSES[status] || status || '')}</span>`;
}

function openMyFeedback() {
  if(!currentUser || !db) return;
  closeFeedbackModal();
  const wrap = document.createElement('div');
  wrap.id = 'feedbackModal';
  wrap.className = 'modal-backdrop is-sheet';
  wrap.innerHTML = `
    <div class="dialog fb-dialog" role="dialog" aria-modal="true" aria-labelledby="fbMyTitle">
      <div class="fb-head">
        <h2 class="dialog-title" id="fbMyTitle">Мої звернення</h2>
        <button type="button" class="ks-modal-x" onclick="closeFeedbackModal()" aria-label="Закрити"><span class="ic i-close" aria-hidden="true"></span></button>
      </div>
      <div id="fbMyList" class="fb-list"><div class="skeleton skeleton-card"></div></div>
      <button type="button" class="btn btn-primary btn-block" onclick="openFeedbackModal()"><span class="ic i-write" aria-hidden="true"></span> Нове звернення</button>
    </div>`;
  wrap.addEventListener('click', e => { if(e.target === wrap) closeFeedbackModal(); });
  document.body.appendChild(wrap);
  db.ref('feedback').orderByChild('uid').equalTo(currentUser).once('value').then(snap => {
    const el = document.getElementById('fbMyList');
    if(!el) return;
    const items = Object.values(snap.val() || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    el.innerHTML = items.length ? items.map(f => `
      <div class="fb-card">
        <div class="fb-card-top"><b>${escapeHtml(FEEDBACK_TYPES[f.type] || f.type || '')}</b> ${feedbackStatusBadge(f.status)}
          <span class="fb-date">${new Date(f.createdAt || 0).toLocaleDateString('uk-UA')}</span></div>
        <div class="fb-subject">${escapeHtml(f.subject || '')}</div>
        <div class="fb-text">${escapeHtml(f.message || '')}</div>
        ${f.reply ? `<div class="fb-reply"><span class="field-label">Відповідь підтримки</span><div class="fb-text">${escapeHtml(f.reply)}</div></div>` : ''}
      </div>`).join('')
      : '<div class="empty-state"><div class="empty-state-title">Звернень ще немає</div>Питання, скарги й ідеї — пиши сюди.</div>';
  }).catch(() => {
    const el = document.getElementById('fbMyList');
    if(el) el.innerHTML = '<div class="error-state">Не вдалося завантажити звернення</div>';
  });
}

// ══════════════════════════════════════════════════════════════
// ЗВЕРНЕННЯ: вкладка адмінки (support / admin)
// ══════════════════════════════════════════════════════════════
let _fbAdminFilter = 'new';
let _fbAdminCache = {};

function setFeedbackAdminFilter(f, btn) {
  _fbAdminFilter = f;
  document.querySelectorAll('#adm-panel-feedback [data-fb-filter]').forEach(b => {
    const on = b.dataset.fbFilter === f;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
  renderFeedbackAdmin();
}

function loadFeedbackAdmin() {
  if(!isSupportUser()) return;
  const el = document.getElementById('fbAdminList');
  if(el) el.innerHTML = '<div class="skeleton skeleton-card"></div>';
  db.ref('feedback').orderByChild('createdAt').limitToLast(300).once('value').then(snap => {
    _fbAdminCache = snap.val() || {};
    renderFeedbackAdmin();
  }).catch(e => {
    if(el) el.innerHTML = '<div class="error-state">Немає доступу до звернень: ' + escapeHtml(e.message || '') + '</div>';
  });
}

function updateFeedbackAdminBadge() {
  const n = Object.values(_fbAdminCache).filter(f => f.status === 'new').length;
  const b = document.getElementById('fbAdminBadge');
  if(b) { b.textContent = n; b.classList.toggle('hidden', !n); }
}

function renderFeedbackAdmin() {
  const el = document.getElementById('fbAdminList');
  if(!el) return;
  updateFeedbackAdminBadge();
  const list = Object.entries(_fbAdminCache)
    .filter(([, f]) => _fbAdminFilter === 'all' || (f.status || 'new') === _fbAdminFilter)
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  if(!list.length) { el.innerHTML = '<div class="empty-state"><div class="empty-state-title">Порожньо</div>Звернень з таким статусом немає.</div>'; return; }
  const canBan = adminCan('moderation');
  el.innerHTML = list.map(([id, f]) => {
    const img = f.imgUrl && safeUrl(f.imgUrl);
    const evidence = Array.isArray(f.evidence) ? f.evidence : Object.values(f.evidence || {});
    return `
    <div class="fb-card" id="fbc-${escapeHtml(id)}">
      <div class="fb-card-top">
        <b>${escapeHtml(FEEDBACK_TYPES[f.type] || f.type || '')}</b> ${feedbackStatusBadge(f.status || 'new')}
        <span class="fb-date">${new Date(f.createdAt || 0).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="fb-meta">
        Від <button type="button" class="link-btn" onclick="openPublicProfile(${jsArg(f.uid || '')})">${escapeHtml(f.uid || '?')}</button>
        <span class="fb-role">${escapeHtml(f.role || 'player')}</span>
        ${f.contact ? ' · ' + escapeHtml(f.contact) : ''}
      </div>
      ${f.reportedUser ? `<div class="fb-meta">На гравця: <button type="button" class="link-btn" onclick="openPublicProfile(${jsArg(f.reportedUser)})">${escapeHtml(f.reportedUser)}</button></div>` : ''}
      <div class="fb-subject">${escapeHtml(f.subject || '')}</div>
      <div class="fb-text">${escapeHtml(f.message || '')}</div>
      ${evidence.length ? `<div class="fb-evidence"><span class="field-label">Останні повідомлення гравця</span>${evidence.map(m => `<div class="fb-text">${escapeHtml(String(m || ''))}</div>`).join('')}</div>` : ''}
      ${img ? `<img class="fb-shot" src="${img}" alt="Скріншот" loading="lazy" onclick="pmOpenImage(this.src)">` : ''}
      <div class="fb-actions">
        <select id="fbSt-${escapeHtml(id)}" aria-label="Статус">
          ${Object.entries(FEEDBACK_STATUSES).map(([k, n]) => `<option value="${k}"${(f.status || 'new') === k ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
        <textarea id="fbRe-${escapeHtml(id)}" maxlength="4000" placeholder="Відповідь гравцю…">${escapeHtml(f.reply || '')}</textarea>
        ${f.reply_at ? `<div class="field-hint">Відповідь ${escapeHtml(f.reply_by || '')} · ${new Date(f.reply_at).toLocaleString('uk-UA')}</div>` : ''}
        <div class="btn-row">
          <button type="button" class="btn btn-primary btn-sm" onclick="saveFeedbackAdmin(${jsArg(id)})">Зберегти</button>
          ${f.reportedUser && canBan ? `<button type="button" class="btn btn-danger btn-sm" onclick="banFromFeedback(${jsArg(id)})"><span class="ic i-ban" aria-hidden="true"></span> Забанити ${escapeHtml(f.reportedUser)}</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function saveFeedbackAdmin(id) {
  if(!isSupportUser()) return notify('Немає доступу', 'error');
  const f = _fbAdminCache[id];
  if(!f) return;
  const status = document.getElementById('fbSt-' + id)?.value || f.status || 'new';
  const reply = (document.getElementById('fbRe-' + id)?.value || '').trim();
  const upd = { status };
  const replyChanged = reply && reply !== (f.reply || '');
  if(replyChanged) Object.assign(upd, { reply, reply_at: Date.now(), reply_by: currentUser });
  db.ref('feedback/' + id).update(upd).then(() => {
    Object.assign(f, upd);
    if(replyChanged && f.uid) {
      db.ref('pm/' + f.uid).push({
        from: 'Підтримка SlotOK', to: f.uid, ts: Date.now(),
        text: 'Відповідь на звернення «' + (f.subject || '') + '»:\n' + reply,
      });
      db.ref('users/' + f.uid + '/pmUnread').set(firebase.database.ServerValue.increment(1));
    }
    try { logAdminAction('feedback', `${id} → ${status}${replyChanged ? ' + відповідь' : ''}`); } catch(e) {}
    notify('Збережено', 'success');
    renderFeedbackAdmin();
  }).catch(e => notify('Не вдалося зберегти: ' + (e.message || ''), 'error'));
}

async function banFromFeedback(id) {
  const f = _fbAdminCache[id];
  if(!f || !f.reportedUser) return;
  const ok = await confirmAction({
    title: 'Забанити ' + f.reportedUser + '?',
    text: 'Акаунт буде заблоковано з причиною «' + (f.subject || 'скарга') + '».',
    confirm: 'Забанити', danger: true,
  });
  if(!ok) return;
  banPlayer(f.reportedUser, 'Скарга: ' + (f.subject || ''));
  document.getElementById('fbSt-' + id).value = 'closed';
  saveFeedbackAdmin(id);
}

// ══════════════════════════════════════════════════════════════
// БЕЗПЕКА ПМ: фільтр, блок, скарга
// ══════════════════════════════════════════════════════════════
// Лише найочевидніше — корені слів на початку слова, щоб «неба» чи
// «страх» не ловились. Це не модерація, а перший фільтр; решта — скаргами.
const PM_BAD_STEMS = [
  'секс', 'sex', 'порн', 'porn', 'xxx', 'нюдс', 'нюдси', 'nudes', 'nude', 'onlyfans', 'онліфанс', 'онлифанс',
  'інтим', 'интим', 'ескорт', 'эскорт', 'escort', 'мінет', 'минет', 'blowjob', 'сиськ', 'цицьк', 'boobs', 'tits',
  'pussy', 'dick', 'fuck', 'хуй', 'хуя', 'хує', 'хуе', 'пізд', 'пизд', 'єба', 'еба', 'ебат', 'ебл', 'йоба',
  'трахн', 'трахат', 'шлюх', 'повій', 'проститут', 'дроч', 'вагін', 'вагин', 'пеніс', 'пенис', 'penis',
  'голу фот', 'голі фот', 'голые фот', 'скинь ню', 'покажи себе', 'роздягн', 'раздень',
];
// Латиниця, схожа на кирилицю: «sеkс», «пoрн».
const PM_LOOKALIKE = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к', i: 'і', '0': 'о', '3': 'з' };
const _pmBadRe = new RegExp('(^|[^a-zа-яіїєґё])(' + PM_BAD_STEMS.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'i');

function isAbusiveText(text) {
  if(!text) return false;
  const low = String(text).toLowerCase().replace(/[​-‏⁠﻿]/g, '');
  if(_pmBadRe.test(low)) return true;
  // «с.е.к.с», «п о р н» — склеюємо одиничні літери через розділювачі
  const glued = low.replace(/(^|[^a-zа-яіїєґё])((?:[a-zа-яіїєґё][\s.\-_*]){2,}[a-zа-яіїєґё])(?![a-zа-яіїєґё])/g, (m, p, w) => p + w.replace(/[\s.\-_*]/g, ''));
  if(glued !== low && _pmBadRe.test(glued)) return true;
  const mixed = low.replace(/[a-z03]/g, ch => PM_LOOKALIKE[ch] || ch);
  return mixed !== low && /[а-яіїєґ]/.test(low) && _pmBadRe.test(mixed);
}

function pmIsBlockedByMe(nick) {
  return !!(userData && userData.blocked && userData.blocked[nick]);
}

// Чи заблокував нас отримувач — читаємо перед надсиланням (строгі правила
// бази однаково не пропустять такий запис).
function pmRecipientBlockedMe(to) {
  return db.ref('users/' + to + '/blocked/' + currentUser).once('value').then(s => s.exists()).catch(() => false);
}

async function pmCheckOutgoing(to, text) {
  if(isAbusiveText(text)) {
    notify('Повідомлення не надіслано: воно містить заборонені слова. Правила — у «Ще → Правила».', 'error');
    return false;
  }
  if(pmIsBlockedByMe(to)) { notify('Ти заблокував ' + to + '. Спершу розблокуй.', 'error'); return false; }
  if(await pmRecipientBlockedMe(to)) { notify('Гравець обмежив повідомлення від тебе', 'error'); return false; }
  return true;
}

async function pmToggleBlock(nick) {
  if(!currentUser || !nick || nick === currentUser) return;
  const blocked = pmIsBlockedByMe(nick);
  const ok = await confirmAction(blocked
    ? { title: 'Розблокувати ' + nick + '?', text: 'Гравець знову зможе писати тобі в ПМ.', confirm: 'Розблокувати' }
    : { title: 'Заблокувати ' + nick + '?', text: 'Гравець більше не зможе писати тобі в ПМ, а переписка з ним зникне з твоїх вхідних.', confirm: 'Заблокувати', danger: true });
  if(!ok) return;
  const ref = db.ref('users/' + currentUser + '/blocked/' + nick);
  await (blocked ? ref.remove() : ref.set(Date.now()));
  if(!userData.blocked) userData.blocked = {};
  if(blocked) delete userData.blocked[nick]; else userData.blocked[nick] = Date.now();
  notify(blocked ? nick + ' розблоковано' : nick + ' заблоковано', blocked ? 'info' : 'success');
  if(document.getElementById('pmThreadView') && !document.getElementById('pmThreadView').classList.contains('hidden')) {
    if(blocked) openPmThread(nick); else closePmThread();
  }
}

const PM_REPORT_REASONS = {
  sexual: 'Сексуальний контент',
  spam: 'Спам або реклама',
  abuse: 'Образи чи погрози',
  scam: 'Шахрайство',
  other: 'Інше',
};

function openPmReport(nick) {
  if(!currentUser || !nick) return;
  closeFeedbackModal();
  const wrap = document.createElement('div');
  wrap.id = 'feedbackModal';
  wrap.className = 'modal-backdrop is-sheet';
  wrap.innerHTML = `
    <form class="dialog fb-dialog" role="dialog" aria-modal="true" aria-labelledby="fbRepTitle" novalidate
      onsubmit="event.preventDefault();submitPmReport(${jsArg(nick)});">
      <div class="fb-head">
        <h2 class="dialog-title" id="fbRepTitle">Скарга на ${escapeHtml(nick)}</h2>
        <button type="button" class="ks-modal-x" onclick="closeFeedbackModal()" aria-label="Закрити"><span class="ic i-close" aria-hidden="true"></span></button>
      </div>
      <p class="dialog-text">Модератори побачать скаргу і останні повідомлення цього гравця з переписки.</p>
      <label class="field"><span class="field-label">Причина</span>
        <select id="fbRepReason">${Object.entries(PM_REPORT_REASONS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
      </label>
      <label class="field"><span class="field-label">Коментар <span class="field-optional">— необов'язково</span></span>
        <textarea id="fbRepText" maxlength="2000"></textarea>
      </label>
      <label class="fb-check"><input type="checkbox" id="fbRepBlock" checked> Одразу заблокувати гравця</label>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" onclick="closeFeedbackModal()">Скасувати</button>
        <button type="submit" class="btn btn-danger is-solid" id="fbRepSend">Поскаржитись</button>
      </div>
    </form>`;
  wrap.addEventListener('click', e => { if(e.target === wrap) closeFeedbackModal(); });
  document.body.appendChild(wrap);
}

async function submitPmReport(nick) {
  const reason = document.getElementById('fbRepReason')?.value || 'other';
  const comment = (document.getElementById('fbRepText')?.value || '').trim();
  const alsoBlock = !!document.getElementById('fbRepBlock')?.checked;
  const btn = document.getElementById('fbRepSend');
  if(btn) btn.disabled = true;
  try {
    // Докази — останні 10 повідомлень від цього гравця в нашій переписці
    const snap = await db.ref('pm/' + currentUser).orderByChild('ts').limitToLast(200).once('value');
    const evidence = Object.values(snap.val() || {})
      .filter(m => m && m.from === nick && m.to === currentUser)
      .sort((a, b) => a.ts - b.ts).slice(-10)
      .map(m => new Date(m.ts).toLocaleString('uk-UA') + ': ' + (m.imgUrl ? '[фото] ' : '') + String(m.text || '').slice(0, 300));
    await pushFeedback({
      type: 'report', reportedUser: nick,
      subject: PM_REPORT_REASONS[reason] || 'Скарга',
      message: comment || ('Скарга з приватних повідомлень: ' + (PM_REPORT_REASONS[reason] || reason)),
      evidence,
    });
    if(alsoBlock && !pmIsBlockedByMe(nick)) {
      await db.ref('users/' + currentUser + '/blocked/' + nick).set(Date.now());
      if(!userData.blocked) userData.blocked = {};
      userData.blocked[nick] = Date.now();
    }
    closeFeedbackModal();
    notify('Скаргу надіслано модераторам' + (alsoBlock ? ', гравця заблоковано' : ''), 'success');
    if(alsoBlock) closePmThread();
  } catch(e) {
    notify(e.message || 'Не вдалося надіслати скаргу', 'error');
  } finally { if(btn) btn.disabled = false; }
}

// ── Картинки в ПМ: плейсхолдер замість тексту помилки, перегляд ─
function pmImgPlaceholderHtml() {
  return '<div class="pm-img-ph"><span class="ic i-image" aria-hidden="true"></span> Фото недоступне</div>';
}
function pmImgFailed(img) {
  const ph = document.createElement('div');
  ph.innerHTML = pmImgPlaceholderHtml();
  img.replaceWith(ph.firstChild);
}
function pmOpenImage(src) {
  if(!src) return;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop pm-lightbox';
  wrap.innerHTML = '<img alt="Фото">';
  wrap.firstChild.src = src; // data:-URL у window.open браузери вже не відкривають
  wrap.onclick = () => wrap.remove();
  document.body.appendChild(wrap);
}

// ── Розкладка переписки на мобільному ──────────────────────────
// Переписка — position:fixed на весь екран. Висоту беремо з visualViewport:
// коли відкривається клавіатура, видима область менша за 100dvh, і поле
// вводу інакше ховалося б під клавіатурою.
function pmFitViewport() {
  const view = document.getElementById('pmThreadView');
  const vv = window.visualViewport;
  if(!view || !vv) return;
  view.style.setProperty('--pm-vv-h', Math.round(vv.height) + 'px');
  view.style.setProperty('--pm-vv-top', Math.round(vv.offsetTop) + 'px');
  const box = document.getElementById('pmThreadMessages');
  if(box && document.activeElement && document.activeElement.id === 'pmReplyInput') box.scrollTop = box.scrollHeight;
}

function pmLayoutOpen() {
  const view = document.getElementById('pmThreadView');
  // До <body>: у .screen лишається transform від анімації появи, і тоді
  // position:fixed рахується від екрана, а не від вікна, — нижня панель
  // перекривала поле вводу.
  if(view && view.parentElement !== document.body) document.body.appendChild(view);
  document.body.classList.add('pm-thread-open');
  if(window.visualViewport) {
    window.visualViewport.addEventListener('resize', pmFitViewport);
    window.visualViewport.addEventListener('scroll', pmFitViewport);
  }
  pmFitViewport();
}

function pmLayoutClose() {
  document.body.classList.remove('pm-thread-open');
  if(window.visualViewport) {
    window.visualViewport.removeEventListener('resize', pmFitViewport);
    window.visualViewport.removeEventListener('scroll', pmFitViewport);
  }
}

// Переписка висить поверх усього — при переході на інший екран закриваємо.
function pmThreadForceClose() {
  const view = document.getElementById('pmThreadView');
  if(view && !view.classList.contains('hidden')) closePmThread(true);
}

// Клавіатура відкрита — нижня панель на телефоні ховається (CSS: body.kb-open).
(function initKeyboardNavHide() {
  const isTextField = el => el && (el.tagName === 'TEXTAREA' || el.isContentEditable ||
    (el.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|file|color)$/i.test(el.type)));
  document.addEventListener('focusin', e => { if(isTextField(e.target)) document.body.classList.add('kb-open'); });
  document.addEventListener('focusout', () => {
    setTimeout(() => { if(!isTextField(document.activeElement)) document.body.classList.remove('kb-open'); }, 50);
  });
})();

// ── Призначення ролі support (вкладка «Адміни») ────────────────
function loadSupportList() {
  const el = document.getElementById('supportList');
  if(!el) return;
  db.ref('users').orderByChild('role').equalTo('support').once('value').then(snap => {
    const nicks = Object.keys(snap.val() || {}).sort();
    el.innerHTML = nicks.length ? nicks.map(n => `
      <div class="adm-admin-head fb-support-row">
        <div class="adm-admin-nick">${escapeHtml(n)}</div>
        <button class="adm-mini-btn danger" onclick="revokeSupport(${jsArg(n)})">Зняти роль</button>
      </div>`).join('')
      : '<div class="field-hint">Поки нікого</div>';
  }).catch(() => { el.innerHTML = '<div class="field-hint">Не вдалося завантажити</div>'; });
}

function grantSupport() {
  if(!requireAdminPerm('admins')) return;
  const inp = document.getElementById('newSupportNick');
  const nick = (inp?.value || '').trim();
  if(!nick) return notify('Введи нік гравця', 'error');
  db.ref('users/' + nick).once('value').then(snap => {
    if(!snap.exists()) return notify('Гравця не знайдено', 'error');
    if(snap.val().isAdmin === true) return notify(nick + ' уже адмін — «Звернення» в нього є', 'info');
    db.ref('users/' + nick + '/role').set('support').then(() => {
      db.ref('pm/' + nick).push({ from: '👑 SlotOK', to: nick, ts: Date.now(),
        text: 'Тобі видано роль підтримки: в адмін-панелі з’явилась вкладка «Звернення».' });
      db.ref('users/' + nick + '/pmUnread').set(firebase.database.ServerValue.increment(1));
      logAdminAction('support_grant', '@' + nick);
      notify(nick + ' тепер у підтримці', 'success');
      if(inp) inp.value = '';
      loadSupportList();
    });
  });
}

async function revokeSupport(nick) {
  if(!requireAdminPerm('admins')) return;
  const ok = await confirmAction({ title: 'Зняти роль support з ' + nick + '?', confirm: 'Зняти', danger: true });
  if(!ok) return;
  db.ref('users/' + nick + '/role').remove().then(() => {
    logAdminAction('support_revoke', '@' + nick);
    notify('Роль знято з ' + nick, 'success');
    loadSupportList();
  });
}
