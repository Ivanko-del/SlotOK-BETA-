// ============================================
// ІНШІ ФУНКЦІЇ
// ============================================
function openGame(g) { trackRecentGame(g); switchTab(g); }
function openTabModal(id) { document.getElementById(id).classList.remove('hidden'); if(id === 'transfer-modal' && typeof renderSourceBars === 'function') renderSourceBars(); }
function closeTabModal(id) { var el=document.getElementById(id); if(el) el.classList.add('hidden'); }

// Переказ між гравцями SlotOK — лише за ніком.
function formatCardInput(inp) {
  const raw = inp.value.trim();
  const info = document.getElementById('transferRecipientInfo');
  const clear = () => { if(info) { info.textContent = ''; } };
  if(raw.replace(/^@/,'').length < 3) return clear();
  if(info) { info.textContent = 'Пошук…'; info.style.color = 'var(--info)'; }
  // Дебаунс: кожен символ ніку раніше запускав повне завантаження вузла users
  // (часткового ніку немає в базі → перебір усіх гравців), і відповіді могли
  // прийти не по черзі. Тепер шукаємо через паузу в наборі й показуємо лише
  // відповідь на останній запит.
  clearTimeout(formatCardInput._t);
  const seq = formatCardInput._seq = (formatCardInput._seq || 0) + 1;
  formatCardInput._t = setTimeout(() => {
    resolveTransferRecipient(inp.value, name => {
      if(!info || seq !== formatCardInput._seq) return;
      info.textContent = name ? ('Отримувач: ' + name) : 'Гравця не знайдено';
      info.style.color = name ? 'var(--pos)' : 'var(--neg)';
    }, true);
  }, 450);
}

// Один шлях розв'язання отримувача для підказки в полі та для самого переказу,
// щоб вони не могли розійтись у логіці пошуку.
function resolveTransferRecipient(raw, cb, hint) {
  const str = String(raw || '').trim();
  const digits = '';
  const byCard = false;
  const nick = str.replace(/^@/,'');
  if(nick.length < 3) return cb(null, null);
  // Нік із точним регістром — один прямий запит замість усього вузла users.
  // Повний перебір лишається для пошуку за карткою й без урахування регістру.
  if(!byCard && !/[.#$\[\]\/]/.test(nick)) {
    db.ref('users/' + nick).once('value', s => {
      if(s.exists()) cb(nick, s.val());
      else resolveTransferRecipientScan(byCard, digits, nick, cb, hint);
    }, () => resolveTransferRecipientScan(byCard, digits, nick, cb, hint));
    return;
  }
  resolveTransferRecipientScan(byCard, digits, nick, cb, hint);
}
// Повний перебір users — дорогий. Для підказки в полі (hint) тримаємо результат
// 60 с; сам переказ завжди читає свіжі дані.
let _transferScanCache = null;
function resolveTransferRecipientScan(byCard, digits, nick, cb, hint) {
  const finish = users => {
    let found = null;
    Object.keys(users).forEach(name => {
      if(found) return;
      if(name.toLowerCase() === nick.toLowerCase()) {
        found = name;
      }
    });
    cb(found, found ? users[found] : null);
  };
  if(hint && _transferScanCache && Date.now() - _transferScanCache.at < 60000) return finish(_transferScanCache.users);
  db.ref('users').once('value', snap => {
    const users = snap.val() || {};
    const entry = _transferScanCache = { at: Date.now(), users };
    setTimeout(() => { if(_transferScanCache === entry) _transferScanCache = null; }, 60000); // не тримаємо мегабайти в пам'яті
    finish(users);
  }, () => cb(null, null));
}
function sendMoney() {
  const btn = document.getElementById('sendMoneyBtn');
  if(btn && btn.disabled) return; // запобігаємо подвійному кліку
  const input = (document.getElementById('transferToCard') || {value:''}).value.trim();
  const isCard = false;
  const a = parseInt(document.getElementById('transferAmount').value);
  if(!isCard && input.replace(/^@/,'').length < 3) return notify('Введіть нік гравця', 'error');
  if(!a || a < 10) return notify('Мінімум 10 ₴', 'error');
  if((userData.balance||0) < a) return notify('Недостатньо коштів', 'error');
  if(isActiveCardFrozen()) return notify('🔒 Активна картка заблокована — розблокуй її в Гаманці', 'error');
  if(!checkCardLimit(getActiveCardId(), a)) return;

  if(btn) { btn.disabled = true; btn.textContent = 'Відправляємо…'; }
  const resetBtn = () => { if(btn) { btn.disabled = false; btn.textContent = 'Надіслати'; } };

  resolveTransferRecipient(input, (recipientName, recipientData) => {
    if(!recipientName) { resetBtn(); return notify(isCard ? '❌ Картку не знайдено' : '❌ Гравця з таким ніком немає', 'error'); }
    if(recipientName === currentUser) { resetBtn(); return notify('❌ Не можна переказати самому собі', 'error'); }
    const recipient = recipientData || {};
    if(isCardFrozenOf(recipient, _activeCardIdOf(recipient))) { resetBtn(); return notify('❌ Картка отримувача заблокована', 'error'); }

    const formattedCard = '@' + recipientName;
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-a));
    db.ref('users/'+recipientName+'/balance').set(firebase.database.ServerValue.increment(a));
    db.ref('users/'+currentUser+'/virtualCard/totalOut').set(firebase.database.ServerValue.increment(a));
    db.ref('users/'+recipientName+'/virtualCard/totalIn').set(firebase.database.ServerValue.increment(a));

    noteCardSpend(getActiveCardId(), a);
    // Transactions log both sides
    addCardTransaction('out', a, 'Переказ → ' + recipientName, formattedCard);
    pushCardTx(recipientName, { dir:'in', amount:a, title:'Переказ від ' + currentUser, subtitle: '@' + currentUser }, _activeCardIdOf(recipient));

    playSound('win');
    notify('✅ Переказано ' + formatNumber(a) + ' ₴ → ' + recipientName, 'success');
    closeTabModal('transfer-modal');
    resetBtn();
    const inp = document.getElementById('transferToCard'); if(inp) inp.value = '';
    const info = document.getElementById('transferRecipientInfo'); if(info) info.textContent = '';
    document.getElementById('transferAmount').value = '';
  });
}

function activatePromo() { 
    const c=document.getElementById('promoInput').value.trim(); 
    db.ref('promos/'+c).once('value', s=>{ 
        if(s.exists()){ 
            db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(s.val().value)); 
            notify("Промокод активовано!","success"); closeTabModal('promo-modal'); 
        } else { notify("Невірний код","error"); } 
    }); 
}

function addContact() { 
    const i=document.getElementById('addContactInput').value; 
    db.ref('users/'+i).once('value', s=>{ 
        if(s.exists()){ db.ref('users/'+currentUser+'/contacts/'+i).set({avatar:s.val().avatar||'👤'}); notify("Додано!"); loadContacts(); } 
        else { notify("Не знайдено","error"); } 
    }); 
}

function loadContacts() { 
    const l=document.getElementById('contactsList'); 
    if(!userData.contacts){ l.innerHTML="<div style='color:var(--fg-3)'>Список порожній</div>"; return; } 
    let html = "";
    for(let n in userData.contacts){ 
        html+=`<div class="contact-row"><b>${escapeHtml(n)}</b> <button class="btn-green" style="width:auto;padding:8px 15px;margin:0;" onclick="quickSend(${jsArg(n)})">💸</button></div>`; 
    } 
    l.innerHTML = html;
}

function quickSend(n) {
  openTabModal('transfer-modal');
  const inp = document.getElementById('transferToCard');
  if(inp) inp.value = '';
  if(inp) { inp.value = n; inp.dispatchEvent(new Event('input')); }
}
// deleteAccount() — див. 55-legal.js (видалення через сервер)
function updateBio(v) { db.ref('users/'+currentUser).update({tag:v}); notify("Статус оновлено"); }
function handleAvatarUpload(i) { 
    if(i.files[0]){ 
        const r=new FileReader(); 
        r.onload=e=>db.ref('users/'+currentUser).update({avatar:e.target.result}); 
        r.readAsDataURL(i.files[0]); notify("Завантаження..."); 
    } 
}
function openHistoryModal() { 
    openTabModal('history-modal'); 
    const c=document.getElementById('historyList'); c.innerHTML="Завантаження...";
    db.ref('users/'+currentUser+'/history').limitToLast(20).once('value', s=>{ 
        c.innerHTML=""; 
        if(s.val()) Object.values(s.val()).reverse().forEach(i=>{ c.innerHTML+=`<div style="padding:10px;border-bottom:1px solid var(--line);color:var(--fg-2);">${escapeHtml(i.text||'')}</div>`; });
        else c.innerHTML="<div style='padding:10px;color:var(--fg-3);'>Порожньо</div>"; 
    }); 
}
// openSupportModal() — визначено нижче, єдина версія (стару дублюючу прибрано)
var _supportPendingMedia = null;
var _supportPendingIsVideo = false;

function handleSupportMedia(input) {
  const file = input.files[0]; if(!file) return;
  const isVideo = file.type.startsWith('video/');
  const maxSize = isVideo ? 25*1024*1024 : 4*1024*1024;
  if(file.size > maxSize) return notify(isVideo?'Відео макс 25 МБ':'Фото макс 4 МБ','error');
  const reader = new FileReader();
  reader.onload = e => {
    _supportPendingMedia = e.target.result;
    _supportPendingIsVideo = isVideo;
    const prev = document.getElementById('supportMediaPreview');
    const img = document.getElementById('supportPreviewImg');
    const vid = document.getElementById('supportPreviewVid');
    if(prev) prev.style.display = 'block';
    if(isVideo) {
      if(img) img.style.display = 'none';
      if(vid) { vid.src = e.target.result; vid.style.display = 'block'; }
    } else {
      if(vid) vid.style.display = 'none';
      if(img) { img.src = e.target.result; img.style.display = 'block'; }
    }
  };
  reader.readAsDataURL(file);
}

function clearSupportMedia() {
  _supportPendingMedia = null; _supportPendingIsVideo = false;
  const prev = document.getElementById('supportMediaPreview');
  if(prev) prev.style.display = 'none';
  const inp = document.getElementById('supportFileInput');
  if(inp) inp.value = '';
}

window.openUserProfile = function(name) { 
    if(name===currentUser) return switchTab('profile'); 
    db.ref('users/'+name).once('value', s=>{ 
        const d=s.val(); 
        if(d){ 
            document.getElementById('viewUserName').textContent=name; 
            document.getElementById('viewUserId').textContent=d.id; 
            document.getElementById('viewUserBal').textContent=formatNumber(d.balance); 
            document.getElementById('viewUserTag').textContent=d.tag||"Гравець"; 
            document.getElementById('viewUserAvatar').innerHTML=(d.avatar&&d.avatar.length>20)?`<img src="${safeUrl(d.avatar)}">`:'👤'; 
            openTabModal('view-user-modal'); 
        } 
    }); 
}
