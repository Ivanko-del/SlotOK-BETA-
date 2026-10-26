function initChat() {
  const msgsEl = document.getElementById('chatMessages');
  if(!msgsEl) return;
  if(globalChatListener) { db.ref('global_chat').off('value', globalChatListener); }
  globalChatListener = db.ref('global_chat').limitToLast(60).on('value', snap => {
    const msgs = snap.val()||{};
    const sorted = Object.values(msgs).sort((a,b)=>a.ts-b.ts);
    let prevUser = null;
    msgsEl.innerHTML = sorted.map(m => {
      const isMe = m.user === currentUser;
      const isAdmin = m.user === 'theivankoo';
      const showHeader = m.user !== prevUser;
      prevUser = m.user;
      const avatarHtml = m.avatarUrl
        ? `<img src="${escapeHtml(m.avatarUrl)}" class="chat-msg-avatar-img">`
        : `<div class="chat-msg-avatar-emoji">${escapeHtml(m.avatar||'👤')}</div>`;
      const contentHtml = m.imgUrl
        ? (m.isVideo
            ? `<video src="${escapeHtml(m.imgUrl)}" style="max-width:220px;max-height:200px;border-radius:var(--r-lg);display:block;margin-bottom:4px;cursor:pointer;" controls muted playsinline data-fullscreen-toggle></video>`
            : `<img src="${escapeHtml(m.imgUrl)}" class="chat-img-msg" data-open-img="${escapeHtml(m.imgUrl)}">`)
        : `<div class="chat-msg-text" style="${isMe?'color:#ddd;':''}">${escapeHtml(m.text||'')}</div>`;
      const nameBadge = isAdmin ? ' <span style="background:var(--accent);color:var(--on-accent);font-size:8px;font-weight:900;padding:1px 5px;border-radius:var(--r-xs);">ADMIN</span>' : '';
      const headerHtml = showHeader
        ? `<div class="chat-msg-user" style="${isMe?'color:var(--accent);':''}${isAdmin?'color:#d4af37;':''}">${escapeHtml(m.user)}${nameBadge}</div>`
        : '';
      return `<div class="chat-msg" style="flex-direction:${isMe?'row-reverse':'row'};${!showHeader?'padding-top:2px;':''}">
        ${showHeader ? avatarHtml : `<div style="width:32px;flex-shrink:0;"></div>`}
        <div class="chat-msg-body" style="${isMe?'align-items:flex-end;background:rgba(74,158,255,.1);border:1px solid rgba(74,158,255,.15);':''}border-radius:${isMe?'14px 4px 14px 14px':'4px 14px 14px 14px'};padding:8px 10px;">
          ${headerHtml}
          ${contentHtml}
          <div style="font-size:9px;color:var(--fg-4);margin-top:3px;">${new Date(m.ts).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      </div>`;
    }).join('');
    msgsEl.scrollTop = msgsEl.scrollHeight;
    // Online count from recent messages
    const online = new Set(sorted.filter(m=>Date.now()-m.ts<180000).map(m=>m.user)).size;
    const el = document.getElementById('chatOnlineCount');
    if(el) el.textContent = '● '+(Math.max(online,1))+' онлайн';
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// URL з бази (аватарки, медіа в чатах) — пишеться будь-ким, тож у src="…"
// пускаємо лише https:/http:, data:image|video і blob:, і екрануємо, щоб лапка
// в «URL» не розірвала атрибут і не дописала onerror=…
function safeUrl(u) {
  if(typeof u !== 'string') return '';
  const t = u.trim();
  if(!/^(https?:|data:(image|video)\/|blob:)/i.test(t)) return '';
  return escapeHtml(t);
}
// Рядок як аргумент JS усередині onclick="…": escapeHtml сам по собі тут не
// рятує — браузер декодує &#39; назад в ' ще до розбору JS.
function jsArg(v) {
  return escapeHtml(JSON.stringify(String(v == null ? '' : v)));
}

function handleChatImage(input) {
  const file = input.files[0];
  if(!file) return;
  const isVideo = file.type.startsWith('video/');
  const maxSize = isVideo ? 25 * 1024 * 1024 : 4 * 1024 * 1024;
  if(file.size > maxSize) {
    notify(isVideo ? 'Відео занадто велике (макс 25 МБ)' : 'Фото занадто велике (макс 4 МБ)', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    chatPendingImage = e.target.result;
    chatPendingIsVideo = isVideo;
    const preview = document.getElementById('chatImagePreview');
    const img = document.getElementById('chatImagePreviewImg');
    if(preview) preview.style.display = 'block';
    if(img) {
      if(isVideo) {
        img.src = '';
        img.style.display = 'none';
        // Show video preview
        let vidEl = document.getElementById('chatVideoPreview');
        if(!vidEl) {
          vidEl = document.createElement('video');
          vidEl.id = 'chatVideoPreview';
          vidEl.style.cssText = 'max-height:80px;border-radius:var(--r-md);border:1px solid var(--line);display:block;';
          vidEl.controls = true;
          vidEl.muted = true;
          img.parentElement.appendChild(vidEl);
        }
        vidEl.src = e.target.result;
        vidEl.style.display = 'block';
      } else {
        // Hide video preview if exists
        const vidEl = document.getElementById('chatVideoPreview');
        if(vidEl) vidEl.style.display = 'none';
        img.style.display = 'block';
        img.src = e.target.result;
        chatPendingIsVideo = false;
      }
    }
  };
  reader.readAsDataURL(file);
}

function clearChatImage() {
  chatPendingImage = null;
  chatPendingIsVideo = false;
  const preview = document.getElementById('chatImagePreview');
  if(preview) preview.style.display = 'none';
  const input = document.getElementById('chatImgInput');
  if(input) input.value = '';
  const vidEl = document.getElementById('chatVideoPreview');
  if(vidEl) { vidEl.src = ''; vidEl.style.display = 'none'; }
  const img = document.getElementById('chatImagePreviewImg');
  if(img) { img.removeAttribute('src'); img.style.display = 'block'; }
}

function toggleGifPanel() {
  const p = document.getElementById('gifPanel');
  if(p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function selectGif(url) {
  chatPendingImage = url;
  const preview = document.getElementById('chatImagePreview');
  const img = document.getElementById('chatImagePreviewImg');
  if(preview) preview.style.display = 'block';
  if(img) img.src = url;
  toggleGifPanel();
}

function sendChatMsg() {
  const inp = document.getElementById('chatInput');
  if(!inp) return;
  const text = inp.value.trim();
  if(!text && !chatPendingImage) return;
  if(!currentUser) return;
  if(text.length > 300) return notify('Повідомлення занадто довге', 'error');
  if(!checkChatRateLimit()) return;
  // Giveaway participation
  if(text === '+' && _activeGiveaway) { participateGiveaway(); inp.value = ''; return; }
  const forbidden = ['http','www','.com','.ua'];
  if(!chatPendingImage && forbidden.some(w => text.toLowerCase().includes(w))) return notify('Реклама заборонена', 'error');
  const msg = {
    user: currentUser, text: text || '', ts: Date.now(),
    avatar: userData.avatar || '👤', avatarUrl: userData.avatarUrl || null,
  };
  if(chatPendingImage) {
    msg.imgUrl = chatPendingImage;
    if(chatPendingIsVideo) msg.isVideo = true;
  }
  postChatMessage('global_chat', msg);
  inp.value = '';
  clearChatImage();
}

// ═══════════════════════════════════════════════════════
// 🤝 AFFILIATE
// ═══════════════════════════════════════════════════════
function initAffiliate() {
  if(!currentUser) return;
  const link = referralLink();
  const el = document.getElementById('affLink');
  if(el) el.textContent = link;
  db.ref('users').orderByChild('referredBy').equalTo(currentUser).once('value', snap => {
    const refs = snap.val()||{};
    const count = Object.keys(refs).length;
    const refWager = u => u.totalWagered || u.totalWager || 0;  // totalWager — легасі-поле
    const active = Object.values(refs).filter(u => refWager(u) > 100).length;
    const earned = Math.floor(Object.values(refs).reduce((s,u)=>(s+refWager(u)*0.01),0));
    const e1=document.getElementById('affRefs'), e2=document.getElementById('affEarned'), e3=document.getElementById('affActive');
    if(e1) e1.textContent=count; if(e2) e2.textContent='₴'+formatNumber(earned); if(e3) e3.textContent=active;
    const pending = Math.max(0, earned - (userData.affClaimed || 0));
    const claimBtn = document.getElementById('affClaimBtn');
    if(claimBtn) {
      claimBtn.disabled = pending <= 0;
      claimBtn.textContent = pending > 0 ? '💰 Отримати ₴' + formatNumber(pending) + ' на баланс' : '💰 Немає нарахувань';
      claimBtn.onclick = () => claimAffiliateEarnings(earned);
    }
  });
}

// «Нараховано» — це 1% від вейджеру рефералів наростаючим підсумком, а не
// готівка на окремому рахунку. affClaimed — межа, до якої вже виплачено;
// щоразу зараховуємо лише різницю, щоб не платити той самий заробіток двічі.
function claimAffiliateEarnings(earnedTotal) {
  const claimed = userData.affClaimed || 0;
  const pending = Math.floor(earnedTotal - claimed);
  if(pending <= 0) return notify('Немає нарахувань для отримання', 'info');
  db.ref('users/'+currentUser).update({
    balance: firebase.database.ServerValue.increment(pending),
    affClaimed: earnedTotal
  });
  playSound('win');
  notify('💰 Реферальний дохід зараховано: +' + formatNumber(pending) + ' ₴', 'success');
  addToHistory('Реферальний дохід: +'+pending);
  addCardTransaction('in', pending, 'Реферальний дохід', 'SlotOK Casino');
  initAffiliate();
}

function copyAffLink() {
  const link = referralLink();
  navigator.clipboard.writeText(link).then(()=>notify('📋 Посилання скопійовано!','success'));
}

function shareAffLink() {
  const link = referralLink();
  if(navigator.share) navigator.share({title:'SlotOK — казино з друзями',text:'🎰 Граю в SlotOK — слоти, рулетка, краш і турніри на віртуальні гривні. Реєструйся за моїм посиланням і забирай стартовий бонус!',url:link});
  else copyAffLink();
}

// ═══════════════════════════════════════════════════════
// ⚡ QUICK BET BUTTONS helper
// ═══════════════════════════════════════════════════════
function setQuickBet(inputId, val) {
  const inp = document.getElementById(inputId);
  if(!inp) return;
  if(val === 'max') {
    db.ref('users/'+currentUser+'/balance').once('value', s => { inp.value = Math.floor((s.val()||0)*0.9); });
  } else if(val === 'half') {
    inp.value = Math.max(1, Math.floor(parseFloat(inp.value||0)/2));
  } else if(val === 'double') {
    inp.value = Math.floor(parseFloat(inp.value||0)*2);
  } else {
    inp.value = val;
  }
}

// ═══════════════════════════════════════════════════════
// 🎮 GAME SEARCH + FAVORITES + RECENTLY PLAYED
// ═══════════════════════════════════════════════════════
let favoriteGames = JSON.parse(localStorage.getItem('slotok_favs')||'[]');
let recentlyPlayed = JSON.parse(localStorage.getItem('slotok_recent')||'[]');

function toggleFavorite(gameId, el) {
  event.stopPropagation();
  const idx = favoriteGames.indexOf(gameId);
  if(idx >= 0) { favoriteGames.splice(idx,1); if(el) el.classList.remove('active'); }
  else { favoriteGames.push(gameId); if(el) el.classList.add('active'); }
  if(el) el.setAttribute('aria-pressed', el.classList.contains('active') ? 'true' : 'false');
  localStorage.setItem('slotok_favs', JSON.stringify(favoriteGames));
  if(typeof applyLobbyFilters === 'function' && typeof lobbyState !== 'undefined' && lobbyState.mode === 'fav') applyLobbyFilters();
}

function trackRecentGame(gameId) {
  recentlyPlayed = [gameId, ...recentlyPlayed.filter(g=>g!==gameId)].slice(0,8);
  localStorage.setItem('slotok_recent', JSON.stringify(recentlyPlayed));
  renderRecentGames();
}

function renderRecentGames() {
  const section = document.getElementById('recentGamesSection');
  if(section) section.style.display = recentlyPlayed.length>0?'block':'none';
  const el = document.getElementById('recentGamesRow');
  if(!el || !recentlyPlayed.length) return;
  const gameMap = {slots:'🎰',crash:'🚀',mines:'💣',plinko:'🔻',blackjack:'🃏',dice:'🎲',roulette:'🎡',poker:'♠️',hilo:'🃏',limbo:'🎯',dragon:'🐉',balloon:'🎈',horseracing:'🏇',colorbet:'🎨'};
  el.innerHTML = recentlyPlayed.map(g=>`<button type="button" class="chip recent-game-chip" onclick="openGame('${g}')">${gameMap[g]||'🎮'} ${g}</button>`).join('');
}

// Старі точки входу фільтрів — тепер усе йде через спільний стан лоббі
// (applyLobbyFilters у src/app/31-…), щоб пошук і фільтри поєднувались.
function sortGames(mode, el) { lobbySetMode(mode === 'rtp' ? 'all' : mode, el); }
function showFavorites(el) { lobbySetMode('fav', el); }
function searchGames(query) {
  lobbyState.q = String(query || '').trim().toLowerCase();
  applyLobbyFilters();
}

// ═══════════════════════════════════════════════════════
// 💰 RAKEBACK — це той самий VIP-кешбек
// ═══════════════════════════════════════════════════════
// Ракебек у налаштуваннях і кешбек у Касі — одна й та сама накопичена сума
// (cashbackPending), і ставка береться з VIP-рівня (VIP_LEVELS), а не з
// фіксованих 0.5%. Старий claimRakeback() рахував 0.5% від поля totalWager,
// яке ніде не пишеться (пишеться totalWagered), тож завжди видавав ₴0 —
// і водночас суперечив відсоткам, обіцяним на екрані VIP.
function updateRakebackUI() {
  const titleEl = document.getElementById('rakebackTitle');
  if(!titleEl || !userData) return;
  const vip     = getVipLevel(userData.totalWagered || 0);
  const rate    = vip.cashback + clanCashbackBonus;
  const pending = userData.cashbackPending || 0;
  const pct     = Math.min(100, Math.round(pending / CASHBACK_MIN_CLAIM * 100));

  titleEl.textContent = `💰 Ракебек (${+(rate * 100).toFixed(2)}% від ставки · ${vip.icon} ${vip.name})`;
  const amountEl = document.getElementById('rakebackAmount');
  if(amountEl) amountEl.textContent = '₴' + formatNumber(pending);
  const barEl = document.getElementById('rakebackBar');
  if(barEl) barEl.style.width = pct + '%';
  const nextEl = document.getElementById('rakebackNext');
  if(nextEl) nextEl.textContent = pending >= CASHBACK_MIN_CLAIM
    ? 'Можна вивести'
    : `До виводу лишилось ₴${formatNumber(CASHBACK_MIN_CLAIM - pending)}`;
}

// ═══════════════════════════════════════════════════════
// 🛡️ RESPONSIBLE GAMBLING
// ═══════════════════════════════════════════════════════
// Точка відліку для лімітів (заповнюється в startDataSync на вході в сесію).
let _rgSessionStartBalance = null;
let _rgSessionStartTime = null;

// Ліміти зберігаються в Firebase (users/<nick>/rgLimits), а не в localStorage —
// ліміт, який гравець може обійти простим очищенням даних сайту, не є
// реальним запобіжником. userData.rgLimits синхронізується тим самим
// realtime-слухачем, що й решта userData.
async function saveRGLimits() {
  const loss = Math.max(0, parseInt(document.getElementById('rgLossLimit')?.value || 0) || 0);
  const session = Math.max(0, parseInt(document.getElementById('rgSessionLimit')?.value || 0) || 0);
  const parts = [loss ? 'програш за сесію — до ₴' + formatNumber(loss) : 'ліміт програшу вимкнено',
                 session ? 'тривалість сесії — до ' + session + ' хв' : 'ліміт часу вимкнено'];
  const ok = await confirmAction({ title: 'Зберегти ліміти?', text: 'Нові ліміти: ' + parts.join('; ') + '.', confirm: 'Зберегти' });
  if(!ok) return;
  db.ref('users/' + currentUser + '/rgLimits').set({ loss, session }).then(() => {
    notify('✅ Ліміти збережено', 'success');
    updateRGLossWarnUI();
  });
}

// Показує/ховає банер "Ви досягли ліміту" відповідно до поточного стану —
// викликається і одразу після збереження лімітів, і щоразу коли відкривають
// Налаштування, щоб попередження лишалось видимим, а не зникало як toast.
function updateRGLossWarnUI() {
  const el = document.getElementById('rgLossWarn');
  if(!el || !userData) return;
  const rg = userData.rgLimits;
  const lossInp = document.getElementById('rgLossLimit');
  const sessInp = document.getElementById('rgSessionLimit');
  if(lossInp && document.activeElement !== lossInp) lossInp.value = (rg && rg.loss) || '';
  if(sessInp && document.activeElement !== sessInp) sessInp.value = (rg && rg.session) || '';
  let msg = '';
  if(rg && rg.session > 0 && _rgSessionStartTime && (Date.now() - _rgSessionStartTime) >= rg.session * 60000) {
    msg = '⏰ Досягнуто встановлений ліміт часу сесії. Зроби перерву.';
  } else if(rg && rg.loss > 0 && _rgSessionStartBalance !== null && (_rgSessionStartBalance - (userData.balance || 0)) >= rg.loss) {
    msg = '⚠️ Ви досягли встановленого ліміту програшів! Зробіть перерву.';
  }
  if(msg) { el.textContent = msg; el.style.display = 'block'; }
  else { el.style.display = 'none'; }
}

// Викликається з validateBet() перед кожною ставкою — якщо повертає true,
// ставку треба заблокувати. Єдина точка правди для обох лімітів, щоб
// перевірка завжди узгоджувалась з тим, що показує updateRGLossWarnUI().
function isRGLimitReached() {
  const rg = userData && userData.rgLimits;
  if(!rg) return false;
  if(rg.session > 0 && _rgSessionStartTime && (Date.now() - _rgSessionStartTime) >= rg.session * 60000) return true;
  if(rg.loss > 0 && _rgSessionStartBalance !== null && (_rgSessionStartBalance - (userData.balance || 0)) >= rg.loss) return true;
  return false;
}

async function selfExclude(days) {
  const word = days === 1 ? '24 години' : days + ' днів';
  const ok = await confirmAction({
    title: 'Пауза на ' + word + '?',
    text: 'Ти вийдеш з акаунту й не зможеш грати ' + word + '. Скасувати паузу раніше не вийде.',
    confirm: 'Так, увімкнути паузу', danger: true,
  });
  if(!ok) return;
  db.ref('users/'+currentUser+'/selfExcludeUntil').set(Date.now()+days*86400000);
  db.ref('users/'+currentUser+'/selfExcluded').set(true);
  notify('Само-виключення активовано на '+days+' д.','success');
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

// ═══════════════════════════════════════════════════════
// 🔊 SOUND VOLUME
// ═══════════════════════════════════════════════════════
let masterVolume = parseFloat(localStorage.getItem('slotok_volume')||'0.7');

function setVolume(val) {
  masterVolume = val;
  localStorage.setItem('slotok_volume', val);
  const lbl = document.getElementById('volumeLabel');
  if(lbl) lbl.textContent = Math.round(val*100)+'%';
}

// ═══════════════════════════════════════════════════════
// 📳 VIBRATION ON WIN
// ═══════════════════════════════════════════════════════
function vibrateOnWin(amount) {
  if(!navigator.vibrate) return;
  if(!getSetting('vibrate', true)) return;
  if(amount > 10000) navigator.vibrate([200,100,200,100,300]);
  else if(amount > 1000) navigator.vibrate([100,50,100]);
  else navigator.vibrate(50);
}

// ═══════════════════════════════════════════════════════
// 🅰️ FONT SIZE
// ═══════════════════════════════════════════════════════
// Розмір шрифту — раніше міняв лише кореневий rem-розмір, але 95%+ сайту
// написано з фіксованими px, тому візуально нічого не змінювалось.
// Правильний підхід для сайту з "px скрізь" — масштабувати всю сторінку
// через zoom (охоплює текст, відступи, кнопки, все одразу).
const FONT_SIZE_ZOOM = { 12: 0.86, 14: 1, 16: 1.14, 18: 1.28 };
function setFontSize(size) {
  document.body.style.zoom = FONT_SIZE_ZOOM[size] || 1;
  saveSetting('fontSize', size);
  document.querySelectorAll('.font-size-btn').forEach(b=>b.classList.remove('active'));
  const el = document.getElementById('fs_'+size);
  if(el) el.classList.add('active');
}
// ═══════════════════════════════════════════════════════
// ⚡ TURBO MODE (speed up all game animations)
// ═══════════════════════════════════════════════════════
let turboMode = false;
function toggleTurbo() {
  turboMode = !turboMode;
  document.body.classList.toggle('turbo', turboMode);
  if(turboMode) document.documentElement.style.setProperty('--game-speed','0.3s');
  else document.documentElement.style.setProperty('--game-speed','1s');
  notify(turboMode?'⚡ Турбо режим УВІМК':'⚡ Турбо режим ВИМК','info');
}

// ═══════════════════════════════════════════════════════
// 🎰 COMPACT MODE
// ═══════════════════════════════════════════════════════
function toggleCompactMode() {
  const compact = document.body.classList.toggle('compact-mode');
  localStorage.setItem('slotok_compact', compact?'1':'');
  if(compact) {
    document.documentElement.style.setProperty('--box-padding','8px');
    notify('📐 Компактний режим УВІМК','info');
  } else {
    document.documentElement.style.removeProperty('--box-padding');
    notify('📐 Компактний режим ВИМК','info');
  }
}

// ═══════════════════════════════════════════════════════
// 📱 QUICK DEPOSIT FROM HEADER
// ═══════════════════════════════════════════════════════
let quickDepModal = null;
function openQuickDeposit() {
  const existing = document.getElementById('quickDepOverlay');
  if(existing) existing.remove();
  const amounts = [100,250,500,1000,2500,5000];
  const modal = document.createElement('div');
  modal.id = 'quickDepOverlay';
  modal.style.cssText='position:fixed;inset:0;background:rgb(var(--recess-rgb) / calc(0.85 * var(--recess-k)));z-index:9000;display:flex;align-items:flex-end;';
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
  modal.innerHTML=`
    <div style="background:var(--surface-1);border-radius:var(--r-xl) var(--r-xl) 0 0;padding:20px;width:100%;border-top:1px solid rgb(var(--accent-rgb) / 0.3);">
      <div style="text-align:center;font-weight:900;font-size:16px;color:var(--accent);margin-bottom:14px;">⚡ Швидкий депозит</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
        ${amounts.map(a=>`<button onclick="quickDepAction(${a})" style="background:rgb(var(--accent-rgb) / 0.08);border:1px solid rgb(var(--accent-rgb) / 0.2);border-radius:var(--r-md);padding:12px;color:var(--accent);font-size:14px;font-weight:800;cursor:pointer;">₴${formatNumber(a)}</button>`).join('')}
      </div>
      <button onclick="document.getElementById('quickDepOverlay').remove()" style="width:100%;background:var(--surface-2);border:none;border-radius:var(--r-md);padding:12px;color:var(--fg-3);cursor:pointer;">Скасувати</button>
    </div>`;
  document.body.appendChild(modal);
}
function quickDepAction(amount) {
  document.querySelector('div[style*="inset:0"]')?.remove();
  switchTab('cashier');
  setTimeout(()=>{ const inp=document.getElementById('depositAmount'); if(inp) inp.value=amount; }, 300);
}

// ═══════════════════════════════════════════════════════
// 💬 DOUBLE-CLICK BALANCE = QUICK DEPOSIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const balEl = document.querySelector('.header-bal');
  if(balEl) {
    let dblTap = 0;
    balEl.addEventListener('click', () => {
      const now = Date.now();
      if(now-dblTap<400) openQuickDeposit();
      dblTap = now;
    });
  }
});

