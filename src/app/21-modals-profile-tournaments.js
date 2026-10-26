// ╔══════════════════════════════════════════════════════════════╗
// ║  UNIVERSAL MODAL MANAGER — виправляє всі модали             ║
// ╚══════════════════════════════════════════════════════════════╝

function openModal(id, contentHtml, opts) {
  // Close existing instance
  closeModal(id);
  var o = opts || {};
  var isFullscreen = o.fullscreen || false;
  var overlay = document.createElement('div');
  overlay.id = 'modal_' + id;
  overlay.setAttribute('data-modal', id);
  if(isFullscreen) {
    overlay.className = 'slotok-fullscreen-modal';
    overlay.innerHTML = contentHtml;
  } else {
    overlay.className = 'slotok-modal-overlay';
    overlay.innerHTML = '<div class="slotok-modal-box">' + contentHtml + '</div>';
    // Close on overlay click
    overlay.addEventListener('click', function(e) {
      if(e.target === overlay) closeModal(id);
    });
  }
  document.body.appendChild(overlay);
  // Close on Escape
  var escHandler = function(e) {
    if(e.key === 'Escape') { closeModal(id); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
  return overlay;
}

function closeModal(id) {
  var el = document.getElementById('modal_' + id);
  if(el) {
    el.style.animation = 'none';
    el.style.opacity = '0';
    el.style.transform = 'scale(.96)';
    el.style.transition = 'opacity .15s,transform .15s';
    setTimeout(function() { if(el.parentNode) el.parentNode.removeChild(el); }, 150);
  }
}

function modalCloseBtn(id) {
  return '<button class="slotok-modal-close" onclick="closeModal(\'' + id + '\')" title="Закрити">✕</button>';
}

// ── Перезаписуємо всі проблемні модали ──────────────────────

function openChangePasswordModal() {
  openModal('changepass',
    modalCloseBtn('changepass') +
    '<div style="font-size:15px;font-weight:900;color:var(--accent);margin-bottom:14px;font-family:var(--font-display);padding-right:36px;">🔑 Зміна пароля</div>' +
    '<input id="cpOld" type="password" placeholder="Поточний пароль" style="margin-bottom:8px;">' +
    '<input id="cpNew" type="password" placeholder="Новий пароль (мін. 6)" style="margin-bottom:8px;">' +
    '<input id="cpConf" type="password" placeholder="Повторіть новий пароль" style="margin-bottom:10px;">' +
    '<div id="cpError" style="color:var(--neg);font-size:11px;min-height:14px;margin-bottom:8px;"></div>' +
    '<button onclick="doChangePassword()" style="width:100%;background:var(--accent);border:none;border-radius:var(--r-lg);padding:13px;color:var(--on-accent);font-weight:900;cursor:pointer;font-size:14px;">✅ Змінити пароль</button>'
  );
}

function openSecurityQuestionModal() {
  const cur = userData && userData.securityQuestion ? securityQuestionText(userData.securityQuestion) : null;
  const opts = document.getElementById('regSecQuestion');
  openModal('secq',
    modalCloseBtn('secq') +
    '<div style="font-size:15px;font-weight:900;color:var(--accent);margin-bottom:8px;font-family:var(--font-display);padding-right:36px;">❓ Контрольне питання</div>' +
    '<div style="font-size:12px;color:var(--fg-3);margin-bottom:12px;line-height:1.4;">' +
      (cur ? 'Зараз: <b style="color:var(--fg-2);">' + escapeHtml(cur) + '</b><br>' : 'Контрольного питання ще немає.<br>') +
      'Потрібне, щоб відновити пароль без адміна. Обирай те, чого не знайти в соцмережах.</div>' +
    '<select id="sqSecQuestion" onchange="secQuestionChanged(\'sq\')" style="width:100%;background:var(--surface-1);border:1px solid var(--line);color:var(--fg);border-radius:var(--r-md);padding:9px;margin-bottom:8px;font-size:13px;">' +
      (opts ? opts.innerHTML : '<option value="custom">✍️ Своє питання</option>') + '</select>' +
    '<div id="sqSecCustomBox"><input id="sqSecCustom" maxlength="120" placeholder="Своє питання" style="margin-bottom:8px;"></div>' +
    '<input id="sqAnswer" placeholder="Відповідь (мін. 3 символи)" style="margin-bottom:8px;">' +
    '<input id="sqPass" type="password" placeholder="Поточний пароль" style="margin-bottom:10px;">' +
    '<div id="sqError" style="color:var(--neg);font-size:11px;min-height:14px;margin-bottom:8px;"></div>' +
    '<button onclick="doSetSecurityQuestion()" style="width:100%;background:var(--accent);border:none;border-radius:var(--r-lg);padding:13px;color:var(--on-accent);font-weight:900;cursor:pointer;font-size:14px;">✅ Зберегти</button>'
  );
  secQuestionChanged('sq');
}

async function doSetSecurityQuestion() {
  const errEl = document.getElementById('sqError');
  const showErr = m => { if(errEl) errEl.textContent = m; };
  const question = readSecQuestion('sq');
  const answer = (document.getElementById('sqAnswer')?.value || '').trim();
  const password = document.getElementById('sqPass')?.value || '';
  if(question.length < 3) return showErr('Напиши питання (мін. 3 символи) або обери зі списку');
  if(answer.length < 3) return showErr('Відповідь — мінімум 3 символи');
  if(!password) return showErr('Введіть поточний пароль');
  const done = () => { notify('✅ Контрольне питання оновлено', 'success'); closeModal('secq'); };
  const srv = await serverAuthCall('set-security', { nick: currentUser, password, question, answer });
  if(srv.status === 200) return done();
  if(serverAuthIsFinal(srv)) return showErr(srv.data.message);
  if(await serverAuthEnabled()) return showErr('Сервер недоступний. Спробуй за хвилину.');
  // Серверний вхід ще не ввімкнено — старий шлях у браузері.
  try {
    if(!(await SlotOKPassword.verify(password, userData.pass)).ok) return showErr('Поточний пароль невірний');
    await db.ref('users/' + currentUser).update({
      securityQuestion: question,
      securityAnswerHash: await SlotOKPassword.hash(answer.toLowerCase()),
    });
    done();
  } catch(e) { console.error(e); showErr('Не вдалося зберегти'); }
}

function openGiftVIPModal() {
  openModal('giftvip',
    modalCloseBtn('giftvip') +
    '<div style="font-size:15px;font-weight:900;color:var(--accent);margin-bottom:14px;font-family:var(--font-display);padding-right:36px;">🎁 Подарувати VIP</div>' +
    '<input id="gvNick" placeholder="Нік отримувача" style="margin-bottom:10px;">' +
    '<select id="gvDays" style="width:100%;background:var(--surface-1);border:1px solid var(--line);color:var(--fg);border-radius:var(--r-md);padding:9px;margin-bottom:14px;font-size:13px;">' +
    '<option value="1">1 день — 100₴</option><option value="7">7 днів — 700₴</option>' +
    '<option value="30">30 днів — 3 000₴</option></select>' +
    '<button onclick="giftVip(document.getElementById(\'gvNick\').value.trim(),parseInt(document.getElementById(\'gvDays\').value));closeModal(\'giftvip\')" style="width:100%;background:var(--accent);border:none;border-radius:var(--r-lg);padding:13px;color:var(--on-accent);font-weight:900;cursor:pointer;">🎁 Подарувати</button>'
  );
}

function comparePlayersModal() {
  var html = modalCloseBtn('compare') +
    '<div style="font-size:15px;font-weight:900;color:var(--info);margin-bottom:14px;font-family:var(--font-display);padding-right:36px;">📊 Порівняння гравців</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:14px;">' +
    '<input id="cmpNick" placeholder="Нік суперника" style="flex:1;">' +
    '<button onclick="doComparePlayers(document.getElementById(\'cmpNick\').value.trim())" style="background:var(--info);border:none;border-radius:var(--r-md);padding:10px 14px;color:var(--on-info);font-weight:900;cursor:pointer;white-space:nowrap;">🔍 Порівняти</button>' +
    '</div>' +
    '<div id="cmpResult"></div>';
  openModal('compare', html);
}

function showTopDonators() {
  openModal('topdonators',
    modalCloseBtn('topdonators') +
    '<div style="font-size:15px;font-weight:900;color:var(--accent);margin-bottom:14px;font-family:var(--font-display);padding-right:36px;">🏆 Топ Донатерів</div>' +
    '<div id="topDonatorsList" style="color:var(--fg-4);text-align:center;padding:20px;">Завантаження...</div>'
  );
  db.ref('users').orderByChild('totalDeposits').limitToLast(20).once('value').then(function(snap) {
    var el = document.getElementById('topDonatorsList'); if(!el) return;
    var sorted = Object.entries(snap.val()||{}).filter(function(e){return !e[1].isBot&&(e[1].totalDeposits||0)>0;})
      .sort(function(a,b){return (b[1].totalDeposits||0)-(a[1].totalDeposits||0);}).slice(0,10);
    if(!sorted.length){el.innerHTML='<div style="color:var(--fg-4);">Даних немає</div>';return;}
    var medals=['🥇','🥈','🥉'];
    el.innerHTML=sorted.map(function(e,i){
      var u=e[1];
      return '<div style="display:flex;align-items:center;gap:12px;padding:10px;background:var(--surface-1);border-radius:var(--r-md);margin-bottom:8px;">'
        +'<div style="font-size:18px;">'+(medals[i]||'#'+(i+1))+'</div>'
        +'<div style="font-size:18px;">'+(u.avatar||'👤')+'</div>'
        +'<div style="flex:1;"><div style="font-weight:700;font-size:13px;">'+e[0]+'</div><div style="font-size:10px;color:var(--fg-4);">'+(u.tag||'')+'</div></div>'
        +'<div style="font-weight:900;color:var(--accent);font-size:13px;">₴'+formatNumber(u.totalDeposits||0)+'</div>'
        +'</div>';
    }).join('');
  });
}

function showSecurityLog() {
  openModal('seclog',
    modalCloseBtn('seclog') +
    '<div style="font-size:15px;font-weight:900;color:var(--neg);margin-bottom:14px;font-family:var(--font-display);padding-right:36px;">📋 Журнал безпеки</div>' +
    '<div id="securityLogList" style="color:var(--fg-4);font-size:12px;">Завантаження...</div>'
  );
  db.ref('users/'+currentUser+'/securityLog').limitToLast(20).once('value').then(function(snap) {
    var el = document.getElementById('securityLogList'); if(!el) return;
    var data = snap.val();
    if(!data){el.innerHTML='<div style="color:var(--fg-4);text-align:center;padding:20px;">Подій немає</div>';return;}
    var icons={login:'🔑',register:'📝',passChange:'🔑',largeWithdraw:'💸',failed_login:'⚠️'};
    el.innerHTML=Object.values(data).sort(function(a,b){return b.ts-a.ts;}).map(function(e){
      return '<div style="display:flex;gap:10px;padding:10px;background:var(--bg);border-radius:var(--r-md);margin-bottom:8px;">'
        +'<div style="font-size:16px;">'+(icons[e.type]||'📋')+'</div>'
        +'<div><div style="font-size:12px;font-weight:700;">'+e.type+'</div>'
        +'<div style="font-size:10px;color:var(--fg-4);">'+new Date(e.ts).toLocaleString('uk-UA')+'</div>'
        +(e.details?'<div style="font-size:10px;color:var(--fg-3);margin-top:2px;">'+e.details+'</div>':'')
        +'</div></div>';
    }).join('');
  });
}

function showWishlist() {
  var items = _wishlist.length
    ? _wishlist.map(function(i){
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--surface-1);border:1px solid var(--line);border-radius:var(--r-md);margin-bottom:8px;">'
          +'<span style="font-size:13px;">'+i+'</span>'
          +'<button onclick="toggleWishlist(\''+i+'\');this.parentElement.remove()" style="background:rgb(var(--neg-rgb) / 0.1);border:1px solid rgb(var(--neg-rgb) / 0.2);border-radius:var(--r-sm);padding:4px 10px;color:var(--neg);cursor:pointer;font-size:11px;">✕</button>'
          +'</div>';
      }).join('')
    : '<div style="color:var(--fg-4);text-align:center;padding:30px;">Список порожній</div>';
  openModal('wishlist',
    modalCloseBtn('wishlist') +
    '<div style="font-size:15px;font-weight:900;color:var(--neg);margin-bottom:14px;font-family:var(--font-display);padding-right:36px;">❤️ Список побажань</div>' +
    items
  );
}

function showReferralQR() {
  var refCode = currentUser;
  var url = referralLink();
  var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url) + '&bgcolor=050505&color=d4af37&margin=10';
  openModal('qr',
    modalCloseBtn('qr') +
    '<div style="font-size:15px;font-weight:900;color:var(--accent);margin-bottom:14px;font-family:var(--font-display);padding-right:36px;text-align:center;">📲 QR-код реферала</div>' +
    '<img src="'+qrUrl+'" style="width:180px;height:180px;border-radius:var(--r-lg);display:block;margin:0 auto 12px;">' +
    '<div style="font-size:10px;color:var(--fg-4);word-break:break-all;background:var(--bg);border-radius:var(--r-md);padding:8px;margin-bottom:12px;">'+url+'</div>' +
    '<button onclick="navigator.clipboard&&navigator.clipboard.writeText(\''+url+'\').then(()=>notify(\'✅ Скопійовано!\',\'success\'));closeModal(\'qr\')" style="width:100%;background:rgb(var(--accent-rgb) / 0.1);border:1px solid rgb(var(--accent-rgb) / 0.2);border-radius:var(--r-md);padding:11px;color:var(--accent);cursor:pointer;font-size:13px;font-weight:700;">📋 Копіювати посилання</button>'
  );
}

function openCryptoSimulator() {
  updateCryptoPrices();
  openModal('crypto',
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">' +
    '<button onclick="closeModal(\'crypto\')" style="background:rgb(var(--tint-rgb) / 0.06);border:1px solid var(--line);border-radius:var(--r-md);padding:8px 14px;color:var(--fg-3);cursor:pointer;">⬅</button>' +
    '<div style="font-family:var(--font-display);font-size:16px;font-weight:900;color:var(--accent);">📈 Крипто</div></div>' +
    '<div style="background:rgb(var(--accent-rgb) / 0.06);border:1px solid rgb(var(--accent-rgb) / 0.15);border-radius:var(--r-lg);padding:12px;margin-bottom:14px;">' +
    '<div style="font-size:11px;color:var(--fg-3);margin-bottom:4px;">Портфель (₴)</div>' +
    '<div style="font-size:24px;font-weight:900;color:var(--accent);" id="cryptoPortfolioVal">₴ 0</div>' +
    '<div style="font-size:11px;color:var(--fg-4);">Баланс: ₴<span id="cryptoCasBal">'+formatNumber(userData.balance||0)+'</span></div></div>' +
    '<div id="cryptoAssets"></div>',
    {fullscreen: true}
  );
  renderCryptoAssets();
  clearInterval(window._cryptoIv);
  window._cryptoIv = setInterval(function() {
    updateCryptoPrices(); renderCryptoAssets();
  }, 5000);
}

function openProfileEffectShop() {
  var currentEffect = userData.profileEffect || '';
  var html = modalCloseBtn('profileeffect')
    +'<div style="font-size:15px;font-weight:900;color:var(--special);margin-bottom:14px;font-family:var(--font-display);padding-right:36px;">🎭 Ефекти профілю</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
    + PROFILE_EFFECTS.map(function(e){
        var owned = currentEffect === e.id;
        return '<div style="background:var(--surface-1);border:1.5px solid '+(owned?'rgb(var(--accent-rgb) / 0.4)':'rgb(var(--tint-rgb) / 0.07)')+';border-radius:var(--r-lg);padding:14px;text-align:center;cursor:pointer;" onclick="buyProfileEffect(\''+e.id+'\','+e.price+');closeModal(\'profileeffect\')">'
          +'<div style="font-size:32px;margin-bottom:6px;">'+e.emoji+'</div>'
          +'<div style="font-size:12px;font-weight:700;margin-bottom:4px;">'+e.name+'</div>'
          +'<div style="font-size:11px;color:'+(owned?'var(--accent)':'var(--fg-3)')+';">'+(owned?'✅ Активний':'🪙 '+formatNumber(e.price))+'</div>'
          +'</div>';
      }).join('')
    +'</div>';
  openModal('profileeffect', html);
}

function openCustomTagShop() {
  var TAGS = [
    {tag:'🔥 Вогонь',price:500},{tag:'💎 Діамант',price:1000},{tag:'👑 Король',price:2000},
    {tag:'⚡ Блискавка',price:500},{tag:'🐉 Дракон',price:3000},{tag:'🎯 Снайпер',price:750},
    {tag:'🌊 Хвиля',price:500},{tag:'🦁 Лев',price:1500},{tag:'🚀 Ракета',price:800},
    {tag:'🎭 Маестро',price:2500},{tag:'🧊 Крижаний',price:600},{tag:'☠️ Череп',price:700},
  ];
  var html = modalCloseBtn('tagshop')
    +'<div style="font-size:15px;font-weight:900;color:var(--accent);margin-bottom:14px;font-family:var(--font-display);padding-right:36px;">🏷️ Магазин тегів</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
    + TAGS.map(function(t){
        var safetag = t.tag.replace(/'/g, "\\'");
        return '<div style="background:var(--surface-1);border:1px solid var(--line);border-radius:var(--r-lg);padding:12px;text-align:center;cursor:pointer;" onclick="buyCustomTag(\''+safetag+'\','+t.price+');closeModal(\'tagshop\')">'
          +'<div style="font-size:18px;margin-bottom:6px;">'+t.tag+'</div>'
          +'<div style="font-size:11px;color:var(--accent);font-weight:700;">🪙 '+formatNumber(t.price)+'</div>'
          +'</div>';
      }).join('')
    +'</div>';
  openModal('tagshop', html);
}

function openSoundThemePicker() {
  var html = modalCloseBtn('soundtheme')
    +'<div style="font-size:15px;font-weight:900;color:var(--accent);margin-bottom:14px;font-family:var(--font-display);padding-right:36px;">🎵 Звукові теми</div>'
    + Object.keys(SOUND_THEMES).map(function(t){
        var labels = {default:'🔔 Стандартна',retro:'👾 Ретро (8-bit)',casino:'🎰 Казино',minimal:'🔇 Мінімальна'};
        var active = t === _soundTheme;
        return '<div onclick="setSoundTheme(\''+t+'\');closeModal(\'soundtheme\')" style="display:flex;justify-content:space-between;align-items:center;padding:13px;background:'+(active?'rgb(var(--accent-rgb) / 0.1)':'rgb(var(--tint-rgb) / 0.04)')+';border:1px solid '+(active?'rgb(var(--accent-rgb) / 0.3)':'rgb(var(--tint-rgb) / 0.07)')+';border-radius:var(--r-md);margin-bottom:8px;cursor:pointer;">'
          +'<span style="font-size:14px;color:'+(active?'var(--accent)':'var(--fg-2)')+';font-weight:'+(active?'800':'400')+';"> '+(labels[t]||t)+'</span>'
          +(active?'<span style="color:var(--accent);font-size:18px;">✓</span>':'')
          +'</div>';
      }).join('');
  openModal('soundtheme', html);
}
function initAllNewFeatures() {
  initShakeBonus();
  startOnlineTimer();
  saveUserIP();
  logSecurityEvent('login', '');
}



function adminStartBotEngine() {
  startBotEngine();
  setTimeout(() => {
    const count = Object.keys(_activeBotData).length;
    const el = document.getElementById('botEngineStatus');
    if(el) el.innerHTML = `<span style="color:var(--pos);">● Запущено</span> — ${count} ботів активні, тік кожні 5с`;
    notify('▶ Бот-движок запущено для ' + count + ' ботів', 'success');
  }, 1500);
}

function adminStopBotEngine() {
  stopBotEngine();
  _activeBotData = {};
  const el = document.getElementById('botEngineStatus');
  if(el) el.innerHTML = '<span style="color:var(--neg);">⏹ Зупинено</span>';
  notify('⏹ Бот-движок зупинено', 'info');
}

function loadBots() {
  const listEl = document.getElementById('botList');
  if(!listEl) return;
  listEl.innerHTML = '<div style="color:var(--fg-4);font-size:12px;padding:8px;">Завантаження...</div>';
  db.ref('users').orderByChild('isBot').equalTo(true).once('value', snap => {
    const bots = snap.val() || {};
    const entries = Object.entries(bots);
    if(!entries.length) { listEl.innerHTML = '<div style="color:var(--fg-4);font-size:12px;padding:8px;">Ботів немає</div>'; return; }
    const persIcons = { aggressive:'🔥', balanced:'⚖️', conservative:'🛡️', whale:'🐋' };
    listEl.innerHTML = entries.map(([nick, b]) => {
      const isActive = !!_activeBotData[nick];
      const persIcon = persIcons[b.personality] || '⚖️';
      return `<div class="bot-card">
        <div class="bot-avatar">${b.avatar && b.avatar.length > 2 ? `<img src="${safeUrl(b.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : escapeHtml(b.avatar||'🤖')}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;">${escapeHtml(nick)} ${persIcon}</div>
          <div style="font-size:10px;color:var(--fg-3);">💰 ${formatNumber(b.balance||0)}₴ · 🎮 ${b.totalGames||0} ігор · ${isActive?'<span style="color:var(--pos);">● Активний</span>':'<span style="color:var(--fg-4);">⚫ Стоп</span>'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
          <button onclick="toggleBot(${jsArg(nick)})" style="background:${isActive?'rgb(var(--neg-rgb) / 0.15)':'rgb(var(--pos-rgb) / 0.15)'};border:1px solid ${isActive?'var(--neg)':'var(--pos)'};border-radius:var(--r-sm);color:${isActive?'var(--neg)':'var(--pos)'};font-size:10px;padding:3px 8px;cursor:pointer;">${isActive?'⏹ Стоп':'▶ Грати'}</button>
          <button onclick="deleteBot(${jsArg(nick)})" style="background:rgb(var(--neg-rgb) / 0.08);border:1px solid var(--line);border-radius:var(--r-sm);color:var(--fg-3);font-size:10px;padding:3px 8px;cursor:pointer;">🗑 Видалити</button>
        </div>
      </div>`;
    }).join('');
    const el = document.getElementById('botEngineStatus');
    const activeCount = Object.keys(_activeBotData).length;
    if(el) el.innerHTML = _botEngine
      ? `<span style="color:var(--pos);">● Запущено</span> — ${activeCount} ботів активні`
      : `<span style="color:var(--fg-4);">⏹ Зупинено</span> — ${entries.length} ботів у базі`;
  });
}

function toggleBot(nick) {
  if(_activeBotData[nick]) {
    delete _activeBotData[nick];
    notify('⏹ Бот ' + nick + ' зупинено', 'info');
  } else {
    db.ref('users/' + nick).once('value', snap => {
      if(snap.exists()) addBotToEngine(nick, snap.val());
      notify('▶ Бот ' + nick + ' запущено', 'success');
    });
  }
  setTimeout(loadBots, 300);
}

function deleteBot(nick) {
  if(!confirm('Видалити бота ' + nick + '?')) return;
  delete _activeBotData[nick];
  db.ref('users/' + nick).remove();
  notify('🗑 Бот ' + nick + ' видалено', 'info');
  setTimeout(loadBots, 500);
}

function switchAdminTab(tab, el) {
  // Адмін без права на цю вкладку не має її відкривати навіть прямим викликом
  if(!adminCan(tab)) { requireAdminPerm(tab); return; }
  // Hide ALL panels cleanly
  ['requests','stats','users','bots','content','finance','security','moderation','admins'].forEach(function(t){
    var p = document.getElementById('adm-panel-'+t);
    if(p) { p.style.display = 'none'; }
  });
  document.querySelectorAll('.adm-tab-btn').forEach(function(b){ b.classList.remove('active'); });
  // Show target panel
  var panel = document.getElementById('adm-panel-'+tab);
  if(panel) { panel.style.display = 'block'; }
  if(el) el.classList.add('active');
  if(!el) { var btn = document.getElementById('admtb-'+tab); if(btn) btn.classList.add('active'); }
  if(tab==='requests'){ startAdminRequestListeners(); }
  if(tab==='users')   { try{setupAutoWipe();}catch(e) { console.warn(e); } }
  if(tab==='stats')   { refreshAdminDash(); try{loadAdminStats();}catch(e) { console.warn(e); } }
  if(tab==='bots')    { try{loadBots();}catch(e) { console.warn(e); } }
  if(tab==='content') { try{loadSupportThreads();}catch(e) { console.warn(e); } }
  if(tab==='finance') { try{loadRTPSettings();}catch(e) { console.warn(e); } try{loadLootboxEdgeSetting();}catch(e) { console.warn(e); } }
  if(tab==='moderation') { try{initModerationPanel();}catch(e){console.error(e);} }
  if(tab==='admins')  { try{initAdminsPanel();}catch(e){console.error(e);} }
}
function initAdminPanel() {
  // Force clear all panels first
  ['requests','stats','users','bots','content','finance','security','moderation','admins'].forEach(function(t){
    var p = document.getElementById('adm-panel-'+t);
    if(p) p.style.display = 'none';
  });
  // Ховаємо вкладки без доступу і відкриваємо першу дозволену
  var first = applyAdminTabVisibility();
  if(!first) {
    notify('⛔ Доступ до адмін-панелі обмежено', 'error');
    switchTab('profile');
    return;
  }
  switchAdminTab(first, document.getElementById('admtb-'+first));
}

function adminManualDeposit() {
  if(!requireAdminPerm('finance')) return;
  var user = (document.getElementById('adminDepUser').value||'').trim();
  var amt  = parseInt(document.getElementById('adminDepAmt').value||0);
  var note = (document.getElementById('adminDepNote').value||'Ручне нарахування').trim();
  if(!user||!amt) return notify('Введіть нік і суму','error');
  db.ref('users/'+user+'/balance').set(firebase.database.ServerValue.increment(amt));
  db.ref('users/'+user+'/history').push({text:(amt>0?'✅ ':'❌ ')+note+': '+(amt>0?'+':'')+amt+'₴', date:Date.now()});
  db.ref('pm/'+user+'/'+db.ref().push().key).set({from:'🏦 Admin',to:user,text:(amt>0?'✅ Нараховано +'+amt+'₴':'⚠️ Списано '+Math.abs(amt)+'₴')+'. '+note,ts:Date.now()});
  db.ref('users/'+user+'/pmUnread').set(firebase.database.ServerValue.increment(1));
  notify((amt>0?'✅':'⚠️')+' '+user+' '+(amt>0?'+':'')+amt+'₴','success');
}
function adminSetJackpot() {
  if(!requireAdminPerm('finance')) return;
  var amt = parseInt(document.getElementById('adminJackpotSet').value||0);
  if(!amt) return notify('Введіть суму','error');
  db.ref('jackpot/amount').set(amt);
  notify('🎰 Джекпот: ₴'+formatNumber(amt),'success');
}
function adminResetJackpot() {
  if(!requireAdminPerm('finance')) return;
  if(!confirm('Скинути джекпот до 0?')) return;
  db.ref('jackpot/amount').set(0);
  notify('Джекпот скинуто','info');
}
function adminGiveAllBonus() {
  var amt = parseInt(prompt('Бонус для ВСІХ гравців (₴):')||0);
  if(!amt||amt<1) return;
  if(!confirm('Видати '+amt+'₴ кожному?')) return;
  db.ref('users').once('value', function(snap){
    var users = snap.val()||{};
    var batch = {};
    Object.keys(users).forEach(function(u){
      if(users[u].isBot) return;
      batch['users/'+u+'/balance'] = (users[u].balance||0)+amt;
      batch['pm/'+u+'/'+Date.now()+'_'+u] = {from:'🎁 SlotOK',to:u,text:'🎁 Бонус від адміна: +'+amt+'₴!',ts:Date.now()};
    });
    db.ref().update(batch).then(function(){
      Object.keys(users).forEach(function(u){
        if(users[u].isBot) return;
        notifyBot('player-ping', null, { to: u, kind: 'bonus', ref: { amount: amt } });
      });
      notify('🎁 Бонус '+amt+'₴ видано!','success');
    });
  });
}
function adminForceJackpot() {
  db.ref('jackpot/amount').once('value', function(snap){
    var amt = snap.val()||0;
    if(amt<1) return notify('Джекпот порожній','error');
    var winner = prompt('Нік переможця:');
    if(!winner) return;
    db.ref('users/'+winner+'/balance').set(firebase.database.ServerValue.increment(amt));
    db.ref('jackpot/amount').set(0);
    db.ref('pm/'+winner+'/'+db.ref().push().key).set({from:'🎰 Jackpot',to:winner,text:'🎰 ДЖЕКПОТ! Вам нараховано ₴'+formatNumber(amt)+'!',ts:Date.now()});
    notifyBot('player-ping', null, { to: winner, kind: 'jackpot', ref: { amount: amt } });
    db.ref('global_chat').push({user:'🎰 SlotOK',msg:'🎰 ДЖЕКПОТ! @'+winner+' виграв ₴'+formatNumber(amt)+'!',ts:Date.now()});
    notify('🎰 Джекпот '+formatNumber(amt)+'₴ → '+winner,'success');
  });
}
function adminSetMultiplier() {
  var h = parseInt(prompt('На скільки годин x2 виплати?')||0);
  if(!h||h<1) return;
  db.ref('casino_events/double_winnings').set({active:true,until:Date.now()+h*3600000,by:currentUser});
  db.ref('global_chat').push({user:'🎉 SlotOK',msg:'🎉 x2 виплати на '+h+' год!',ts:Date.now()});
  notify('⚡ x2 подія на '+h+'г!','success');
}
function adminStartLottery() {
  if(!confirm('Провести розіграш лотереї зараз?')) return;
  var weekKey = getWeekStr ? getWeekStr() : 'manual';
  db.ref('lottery/'+weekKey).once('value', function(snap){
    var data = snap.val()||{};
    var tickets = Object.entries(data.tickets||{});
    if(!tickets.length) return notify('Немає квитків','error');
    var winner = tickets[Math.floor(Math.random()*tickets.length)][1].user;
    var prize = data.pool||0;
    db.ref('users/'+winner+'/balance').set(firebase.database.ServerValue.increment(prize));
    db.ref('lottery_history').push({winner:winner,prize:prize,ts:Date.now()});
    db.ref('lottery/'+weekKey+'/drawn').set(true);
    db.ref('pm/'+winner+'/'+db.ref().push().key).set({from:'🎟️ Лотерея',to:winner,text:'🎟️ ВИГРАШ! ₴'+formatNumber(prize)+'!',ts:Date.now()});
    db.ref('global_chat').push({user:'🎟️',msg:'🎟️ ПЕРЕМОЖЕЦЬ: @'+winner+' — ₴'+formatNumber(prize)+'!',ts:Date.now()});
    notify('🎟️ '+winner+' — ₴'+formatNumber(prize),'success');
  });
}

function refreshAdminDash() {
  db.ref('jackpot/amount').once('value', snap => {
    const el = document.getElementById('adminJackpotLive');
    if(el) el.textContent = '₴'+formatNumber(Math.floor(snap.val()||0));
  });
  db.ref('investPool/total').once('value', snap => {
    const el = document.getElementById('adminPoolLive');
    if(el) el.textContent = '₴'+formatNumber(Math.floor(snap.val()||0));
  });
  db.ref('lottery').limitToLast(1).once('value', snap => {
    const val = snap.val()||{};
    const pool = Object.values(val)[0]?.pool||0;
    const el = document.getElementById('adminLotteryLive');
    if(el) el.textContent = '₴'+formatNumber(Math.floor(pool));
  });
  refreshPendingWithdrawCount();
}

// Лічильник заявок на вивід показують дві різні панелі адмінки, і кожна раніше
// читала withdraw_requests власним запитом — при відкритті вкладки статистики
// летіли два однакові запити. Тепер один на обидві, а поки відкрита вкладка
// заявок, число оновлює її живий слухач — узагалі без запиту.
function setPendingWithdrawCount(count) {
  var a = document.getElementById('adminTurnover24h');
  var b = document.getElementById('statPendingWithdraws');
  if(a) a.textContent = count + ' очікують';
  if(b) b.textContent = count;
}
function refreshPendingWithdrawCount() {
  if(!db) return;
  db.ref('withdraw_requests').orderByChild('status').equalTo('pending').once('value', function(snap) {
    setPendingWithdrawCount(Object.keys(snap.val() || {}).length);
  });
}

function sendMassPm() {
  if(!isAdminUser()) return;
  const msg = document.getElementById('massPmMsg')?.value?.trim();
  if(!msg) return notify('Введіть повідомлення','error');
  db.ref('users').orderByChild('isBot').equalTo(null).limitToLast(200).once('value', snap=>{
    const users = snap.val()||{};
    const batch = {};
    Object.keys(users).forEach(u=>{
      if(u===currentUser) return;
      batch['pm/'+u+'/'+db.ref().push().key] = {from:'🔔 SlotOK Admin', to:u, text:msg, ts:Date.now()};
      batch['users/'+u+'/pmUnread'] = firebase.database.ServerValue.increment(1);
    });
    db.ref().update(batch).then(()=>{
      notify('📨 Розіслано '+Object.keys(users).length+' гравцям!','success');
      document.getElementById('massPmMsg').value='';
    });
  });
}
// ===== ONLINE USERS POPUP =====
function showOnlineUsers() {
  const dropdown = document.getElementById('onlineUsersDropdown');
  const listEl = document.getElementById('onlineUsersList');
  if(!dropdown || !listEl) return;

  const isOpen = !dropdown.classList.contains('hidden');
  if(isOpen) { dropdown.classList.add('hidden'); return; }

  dropdown.classList.remove('hidden');
  listEl.innerHTML = '<div style="color:var(--fg-4);font-size:12px;">Завантаження...</div>';

  const users = window._onlineUsers || [];
  if(!users.length) { listEl.innerHTML = '<div style="color:var(--fg-4);font-size:12px;">Немає онлайн</div>'; return; }

  // Fetch avatars for online users
  listEl.innerHTML = '';
  let loaded = 0;
  users.slice(0, 30).forEach(name => {
    db.ref('users/' + name + '/avatar').once('value', snap => {
      const av = snap.val();
      const avHtml = av && av.length > 4
        ? '<img src="' + safeUrl(av) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">'
        : escapeHtml(av || '👤');
      const pill = document.createElement('div');
      pill.style.cssText = 'display:flex;align-items:center;gap:6px;background:var(--box);border:1px solid var(--border);border-radius:var(--r-xl);padding:4px 10px 4px 4px;cursor:pointer;';
      pill.onclick = () => { dropdown.classList.add('hidden'); openPublicProfile(name); };
      pill.innerHTML =
        '<div style="width:28px;height:28px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:14px;overflow:hidden;flex-shrink:0;">' + avHtml + '</div>' +
        '<span style="font-size:12px;font-weight:bold;' + (name===currentUser?'color:var(--accent);':'') + '">' + escapeHtml(name) + (name===currentUser?' (я)':'') + '</span>' +
        '<span style="width:6px;height:6px;background:var(--green);border-radius:50%;flex-shrink:0;"></span>';
      listEl.appendChild(pill);
    });
  });
}

// Close online dropdown on outside click
document.addEventListener('click', e => {
  const dropdown = document.getElementById('onlineUsersDropdown');
  const pill = e.target.closest('.online-pill');
  if(dropdown && !dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && !pill) {
    dropdown.classList.add('hidden');
  }
});

// ===== WIN FEED для тікера =====
function addToWinFeed(game, amount, mult) {
  if(amount < 500) return; // Тільки великі виграші
  trackLbBigWin(amount);
  addTournamentPoints(game, amount, mult);
  triggerWinReaction(amount, game);
  celebrateTieredWin(amount, mult, game);
  db.ref('win_feed').push({
    user: currentUser, game, amount, mult: mult||1,
    time: Date.now()
  });
  // Чистимо старі
  db.ref('win_feed').orderByChild('time').limitToFirst(1).once('value', snap => {
    const data = snap.val();
    if(!data) return;
    const count = Object.keys(data).length;
    if(count > 50) Object.keys(data).forEach(k => db.ref('win_feed/' + k).remove());
  });
}



// ============================================
// ПУБЛІЧНИЙ ПРОФІЛЬ
// ============================================
function openPublicProfile(name) {
  if(name === currentUser) return switchTab('profile');
  db.ref('users/'+name).once('value', snap => {
    const d = snap.val();
    if(!d) return notify('Гравця не знайдено', 'error');
    const av = d.avatar && d.avatar.length > 20 ? `<img src="${safeUrl(d.avatar)}">` : '👤';
    const badges = computeBadges(d);
    document.getElementById('pubProfileContent').innerHTML = `
      <div class="pub-profile">
        <div class="profile-header">
          <div class="avatar-large">${av}</div>
          <div>
            <div style="font-size:22px;font-weight:bold;">${name}</div>
            <div style="color:var(--fg-3);font-size:13px;">${d.tag||'Гравець'}</div>
          </div>
        </div>
        <div style="color:var(--fg-4);font-size:12px;margin-bottom:10px;">ID: ${d.id||'—'} • Реєстрація: ${d.regDate ? new Date(d.regDate).toLocaleDateString('uk-UA') : 'Невідомо'}</div>
        <div class="pub-stats-grid">
          <div class="pub-stat"><div class="pub-stat-val">${formatNumber(d.balance)}</div><div class="pub-stat-label">₴ Баланс</div></div>
          <div class="pub-stat"><div class="pub-stat-val">${d.dailyStreak||0}</div><div class="pub-stat-label">🔥 Серія</div></div>
          <div class="pub-stat"><div class="pub-stat-val">${d.stats?.gamesPlayed||0}</div><div class="pub-stat-label">Ігор зіграно</div></div>
          <div class="pub-stat"><div class="pub-stat-val">${d.stats?.biggestWin ? formatNumber(d.stats.biggestWin) : '0'}</div><div class="pub-stat-label">🏆 Найб. виграш</div></div>
        </div>
        <div class="pub-badges">${badges}</div>
        <div style="display:flex;gap:8px;margin-top:15px;">
          <button class="btn-outline" style="flex:1;" onclick="messageUser(${jsArg(name)})">✉️ Написати</button>
          <button class="btn-outline" style="flex:1;" onclick="document.getElementById('transferToCard').value='${name}';openTabModal('transfer-modal');">💸 Надіслати</button>
          <button class="btn-outline" style="flex:1;" onclick="addContactByName(${jsArg(name)})">🤝 В знайомі</button>
        </div>
      </div>`;
    openTabModal('pub-profile-modal');
  });
}

// Відкриває переписку з гравцем НАПРЯМУ — обхід ручного пошуку ніка в
// ПП, коли людину вже знайшли деінде (чат, рейтинг, список знайомих).
function messageUser(name) {
  if(!name || name === currentUser) return;
  closeTabModal('pub-profile-modal');
  switchTab('pm');
  openPmThread(name);
}

function computeBadges(d) {
  let badges = '';
  if(d.balance >= 100000) badges += `<span class="badge gold">💰 Мільйонер</span>`;
  if(d.dailyStreak >= 7) badges += `<span class="badge gold">🔥 Серія 7+</span>`;
  if(d.stats?.gamesPlayed >= 100) badges += `<span class="badge">🎮 Ветеран</span>`;
  if(d.isAdmin) badges += `<span class="badge gold">⚙️ Адмін</span>`;
  if(d.stats?.biggestWin >= 10000) badges += `<span class="badge gold">🏆 Великий виграш</span>`;
  if(d.referrals >= 5) badges += `<span class="badge">👥 Рекрутер</span>`;
  return badges || `<span class="badge">🆕 Новачок</span>`;
}

function addContactByName(name) {
  db.ref('users/'+currentUser+'/contacts/'+name).set({avatar:'👤'});
  notify('Додано у знайомі!', 'success');
}

// ============================================
// ТУРНІРИ
// ============================================
function loadTournaments() {
  db.ref('tournaments').once('value', snap => {
    const data = snap.val();
    const list = document.getElementById('tournamentsList');
    if(!data) { list.innerHTML = '<div style="color:var(--fg-3);padding:20px;text-align:center;">Немає активних турнірів</div>'; return; }
    list.innerHTML = '';
    Object.entries(data).forEach(([id, t]) => {
      const endTime = t.startTime + t.duration * 3600000;
      const msLeft = endTime - Date.now();
      const hoursLeft = Math.max(0, Math.floor(msLeft / 3600000));
      const minsLeft = Math.max(0, Math.floor((msLeft % 3600000) / 60000));
      const isActive = msLeft > 0;
      list.innerHTML += `<div class="tournament-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:16px;font-weight:bold;">${t.name}</div>
          <span style="font-size:11px;background:${isActive?'rgb(var(--pos-rgb) / 0.2)':'rgb(var(--neg-rgb) / 0.2)'};color:${isActive?'var(--green)':'var(--red)'};padding:3px 8px;border-radius:var(--r-md);">${isActive?'🟢 Активний':'🔴 Завершено'}</span>
        </div>
        <div class="t-prize">🏆 ${formatNumber(t.prize)} ₴</div>
        <div class="t-info">${isActive ? `Закінчується через ${hoursLeft}год ${minsLeft}хв` : 'Турнір завершено'}</div>
        <div class="t-leaderboard" id="t-lb-${id}">
          <div style="color:var(--fg-4);font-size:12px;margin-top:8px;">Завантаження рейтингу...</div>
        </div>
        ${isActive ? `<button class="btn-gold" style="margin-top:10px;padding:10px;" onclick="joinTournament('${id}','${t.name}',${t.prize})">🎯 Взяти участь</button>` : ''}
      </div>`;
      loadTournamentLeaderboard(id);
    });
  });
}

function loadTournamentLeaderboard(tId) {
  db.ref('tournament_scores/'+tId).orderByValue().limitToLast(5).once('value', snap => {
    const el = document.getElementById('t-lb-'+tId);
    if(!el) return;
    const data = snap.val();
    if(!data) { el.innerHTML = '<div style="color:var(--fg-4);font-size:12px;margin-top:8px;">Ще немає учасників</div>'; return; }
    const sorted = Object.entries(data).sort((a,b)=>b[1]-a[1]);
    el.innerHTML = sorted.map(([name, score], i) =>
      `<div class="t-row"><span>${['🥇','🥈','🥉','4.','5.'][i]} ${name}</span><span style="color:var(--accent);">${formatNumber(score)} ₴</span></div>`
    ).join('');
  });
}

function joinTournament(id, name, prize) {
  db.ref('tournament_scores/'+id+'/'+currentUser).once('value', snap => {
    if(!snap.exists()) {
      db.ref('tournament_scores/'+id+'/'+currentUser).set(0);
      notify(`🏆 Ви приєднались до турніру "${name}"!`, 'success');
    } else {
      notify(`Ви вже беретесь у турнірі "${name}"`, 'info');
    }
  });
}

function createTournament() {
  const name  = document.getElementById('tName').value.trim();
  const prize = parseInt(document.getElementById('tPrize').value);
  const dur   = parseInt(document.getElementById('tDuration').value);
  const icon  = document.getElementById('tIcon')?.value || '🏆';
  if(!name || !prize || !dur) return notify('Заповніть усі поля', 'error');
  const allowedGames = ['crash','slots','mines','plinko','tower','limbo','dice','hilo'];
  db.ref('tournaments').push({name, prize, duration: dur, startTime: Date.now(), createdBy: currentUser, icon, allowedGames});
  notify(`${icon} Турнір "${name}" створено! Приз: ${formatNumber(prize)} ₴`, 'success');
  document.getElementById('tName').value=''; document.getElementById('tPrize').value=''; document.getElementById('tDuration').value='';
}

// ============================================
// РЕФЕРАЛИ
// ============================================
function checkRefParam() {
  const urlParams = new URLSearchParams(location.search);
  const ref = urlParams.get('ref');
  // Запам'ятовуємо запрошувача для НОВОГО гостя — реєстрація потім пише referredBy.
  // Раніше тут була умова currentUser, тож новачкам ref ніколи не зберігався.
  if(ref && !currentUser && /^[^.#$\[\]\/]{1,40}$/.test(ref)) {
    localStorage.setItem('ref_by', ref);
  }
}

// ============================================
// АДМІН: РОЗШИРЕНІ ФУНКЦІЇ
// ============================================
function loadAdminStats() {
  // Count users (shallow — only keys, no data download)
  db.ref('users').orderByKey().limitToLast(1000).once('value', snap => {
    const users = snap.val() || {};
    const total = Object.keys(users).length;
    const totalBal = Object.values(users).reduce((s,u) => s+(u.balance||0), 0);
    const el = document.getElementById('statTotalUsers');
    if(el) el.textContent = total;
    const el2 = document.getElementById('statTotalBalance');
    if(el2) el2.textContent = '₴'+formatNumber(Math.floor(totalBal));
  });
  // лічильник виводів заповнює refreshAdminDash() — один запит на обидві панелі
}
function sendAnnouncement() {
  const txt = document.getElementById('announceText').value.trim();
  if(!txt) return notify('Введіть текст', 'error');
  db.ref('announcement').set(txt);
  notify('📢 Оголошення опубліковано!', 'success');
}

function clearAnnouncement() {
  db.ref('announcement').remove();
  notify('Оголошення видалено', 'info');
}

function createPromo() {
  const code = document.getElementById('promoCode').value.trim().toUpperCase();
  const val = parseInt(document.getElementById('promoValue').value);
  const uses = parseInt(document.getElementById('promoUses').value) || 1;
  if(!code || !val) return notify('Заповніть поля', 'error');
  db.ref('promos/'+code).set({value: val, uses, createdBy: currentUser, time: Date.now()});
  notify(`🎁 Промокод ${code} (${val}₴) створено!`, 'success');
  document.getElementById('promoCode').value=''; document.getElementById('promoValue').value=''; document.getElementById('promoUses').value='';
  loadPromos();
}

function loadPromos() {
  db.ref('promos').once('value', snap => {
    const data = snap.val();
    const list = document.getElementById('promoList');
    if(!data) { list.innerHTML='<div style="color:var(--fg-3);font-size:13px;">Немає промокодів</div>'; return; }
    list.innerHTML = '';
    Object.entries(data).forEach(([code, p]) => {
      list.innerHTML += `<div class="promo-row">
        <div><b style="color:var(--accent);">${code}</b> <span style="color:var(--fg-3);font-size:12px;">(${p.value}₴, ${p.uses} раз)</span></div>
        <button class="btn-red" style="width:auto;padding:6px 12px;margin:0;font-size:12px;" onclick="deletePromo('${code}')">🗑️</button>
      </div>`;
    });
  });
}

function deletePromo(code) {
  db.ref('promos/'+code).remove();
  notify('Промокод видалено', 'info');
  loadPromos();
}

let _supportThreadsListener = null;
function loadSupportThreads() {
  const list = document.getElementById('supportThreadsList');
  if(!list) return;
  if(_supportThreadsListener) { db.ref('support_chats').off('value', _supportThreadsListener); _supportThreadsListener = null; }
  _supportThreadsListener = db.ref('support_chats').on('value', snap => {
    const data = snap.val();
    if(!data) { list.innerHTML='<div style="color:var(--fg-3);font-size:13px;">Немає чатів</div>'; return; }
    const threads = Object.entries(data)
      .map(([user, msgs]) => [user, Object.values(msgs).pop()])
      .filter(([,lastMsg]) => lastMsg)
      .sort((a,b) => (b[1].time||0) - (a[1].time||0));
    list.innerHTML = threads.map(([user, lastMsg]) => {
      const preview = lastMsg.mediaUrl ? (lastMsg.isVideo ? '🎥 Відео' : '📷 Фото') : (lastMsg.text||'');
      const isActive = user === admSupportUser;
      return `<div class="support-thread" style="${isActive?'border-color:var(--accent);':''}" onclick="openAdminSupport(${jsArg(user)})">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <b>${escapeHtml(user)}</b>
          ${lastMsg.sender==='user' ? '<span class="support-unread">Нове</span>' : ''}
        </div>
        <div style="color:var(--fg-3);font-size:12px;margin-top:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escapeHtml(preview)}</div>
      </div>`;
    }).join('');
  });
}

let admSupportUser = null;
let _admSupportListener = null;
let _admSupportListenerUser = null;
function openAdminSupport(user) {
  admSupportUser = user;
  document.getElementById('admSupportTitle').textContent = 'Чат з ' + user;
  const chat = document.getElementById('admSupportChat');
  chat.innerHTML = '';
  if(_admSupportListener) { db.ref('support_chats/'+_admSupportListenerUser).off('child_added', _admSupportListener); _admSupportListener = null; }
  _admSupportListenerUser = user;
  _admSupportListener = db.ref('support_chats/'+user).limitToLast(30).on('child_added', snap => {
    const m = snap.val();
    const isUser = m.sender === 'user';
    const timeStr = new Date(m.time||Date.now()).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});
    const senderLabel = m.sender==='admin' ? '[Підтримка] ' : m.sender==='ai' ? '[AI] ' : '';
    let mediaHtml = '';
    if(m.mediaUrl) {
      mediaHtml = m.isVideo
        ? `<video src="${safeUrl(m.mediaUrl)}" style="max-width:200px;max-height:180px;border-radius:var(--r-md);display:block;margin-top:4px;" controls muted playsinline></video>`
        : `<img src="${safeUrl(m.mediaUrl)}" style="max-width:200px;max-height:180px;border-radius:var(--r-md);display:block;margin-top:4px;cursor:pointer;" onclick="window.open(this.src,'_blank','noopener')">`;
    }
    const div = document.createElement('div');
    div.style.cssText = `margin-bottom:8px;padding:8px 12px;background:${isUser?'color-mix(in srgb, var(--primary) 20%, var(--surface-1))':'var(--info)'};border-radius:var(--r-md);width:fit-content;max-width:80%;margin-left:${isUser?'0':'auto'}`;
    div.innerHTML = `${m.text ? senderLabel + escapeHtml(m.text) : (senderLabel ? senderLabel : '')}${mediaHtml}<div style="font-size:9px;color:rgb(var(--fg-rgb) / 0.5);margin-top:4px;">${timeStr}</div>`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  });
  openTabModal('admin-support-modal');
  setTimeout(() => document.getElementById('admSupportReply')?.focus(), 100);
}

function sendAdminSupportReply() {
  const inp = document.getElementById('admSupportReply');
  const txt = inp.value.trim();
  if(!txt || !admSupportUser) return;
  inp.value = '';
  db.ref('support_chats/'+admSupportUser).push({text:txt, sender:'admin', time:Date.now()});
  db.ref('users/'+admSupportUser+'/supportUnread').set(firebase.database.ServerValue.increment(1));
}

// ── ADMIN PANEL INIT (called once per open) ──
let _adminInitialized = false;
let _depListener = null, _wdListener = null, _pwrListener = null;



function admMakeAdmin() {
  if(!admSelectedUser) return;
  if(!requireAdminPerm('admins')) return;
  if(!confirm('Дати права адміна: ' + admSelectedUser + '?\n\nБазовий набір: заявки, статистика, контент, модерація.\nЗмінити можна у вкладці 👑 Адміни.')) return;
  db.ref('users/' + admSelectedUser).update({ isAdmin: true, adminPerms: ADMIN_PRESET_DEFAULT });
  logAdminAction('admin_grant', `@${admSelectedUser} — базові права`);
  notify('👑 ' + admSelectedUser + ' тепер адмін', 'success');
}

// ── REAL-TIME REQUEST LISTENERS ──

function renderDepositCard(id, req) {
  const ago = Math.floor((Date.now()-req.time)/60000);
  const agoStr = ago<1?'щойно':ago<60?ago+'хв тому':Math.floor(ago/60)+'г тому';
  const methodIcon = req.method==='mono'?'🐈':req.method==='telegram'?'✈️':req.method==='usdt'?'₮':'🟢';
  const methodName = req.method ? req.method.toUpperCase() : 'PRIVAT';
  return `<div class="req-card deposit" id="depcard-${id}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div class="req-card-user">👤 ${escapeHtml(req.user)}</div>
        <div class="req-card-meta">ID: ${req.userId||'—'} • ${methodIcon} ${methodName}</div>
        <div class="req-card-time">${agoStr} • ${new Date(req.time).toLocaleString('uk-UA')}</div>
      </div>
      <div class="req-card-amount" style="color:var(--pos);">+${req.amount}₴</div>
    </div>
    <div class="req-actions">
      <button class="req-approve" onclick="approveDeposit('${id}','${req.user}',${req.amount},'${req.cardId||''}')">✅ Зарахувати</button>
      <button class="req-reject"  onclick="rejectDeposit('${id}','${req.user}')">❌ Відхилити</button>
    </div>
  </div>`;
}

function renderWithdrawCard(id, req) {
  const ago = Math.floor((Date.now()-req.time)/60000);
  const agoStr = ago<1?'щойно':ago<60?ago+'хв тому':Math.floor(ago/60)+'г тому';
  const methodIcon = req.method==='usdt'?'₮':req.method==='mono'?'🐈':'🟢';
  return `<div class="req-card withdraw" id="wdcard-${id}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div class="req-card-user">👤 ${escapeHtml(req.user)}</div>
        <div class="req-card-meta">${methodIcon} ${req.method?.toUpperCase()||'—'} • <span style="font-family:var(--font-mono);font-size:11px;">${req.card||'—'}</span></div>
        <div class="req-card-time">${agoStr} • ${new Date(req.time).toLocaleString('uk-UA')}</div>
      </div>
      <div class="req-card-amount" style="color:var(--accent);">−${req.amount}₴</div>
    </div>
    <div class="req-actions">
      <button class="req-approve" onclick="approveWithdraw('${id}','${req.user}')">✅ Виплачено</button>
      <button class="req-reject"  onclick="rejectWithdraw('${id}','${req.user}',${req.amount})">❌ Повернути</button>
    </div>
  </div>`;
}

function renderPwrCard(id, req) {
  const ago = Math.floor((Date.now()-req.time)/60000);
  const agoStr = ago<1?'щойно':ago<60?ago+'хв тому':Math.floor(ago/60)+'г тому';
  return `<div class="req-card" id="pwrcard-${id}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div class="req-card-user">👤 ${escapeHtml(req.user)}</div>
        <div class="req-card-time">${agoStr} • ${new Date(req.time).toLocaleString('uk-UA')}</div>
      </div>
    </div>
    <div class="req-actions">
      <button class="req-approve" onclick="approvePasswordReset('${id}','${req.user}')">🔑 Скинути пароль</button>
      <button class="req-reject"  onclick="rejectPasswordReset('${id}')">❌ Відхилити</button>
    </div>
  </div>`;
}

async function approvePasswordReset(id, user) {
  const tempPass = randomTempPassword();
  const tempPassHash = await SlotOKPassword.hash(tempPass);
  db.ref('users/' + user + '/pass').set(tempPassHash).then(() => {
    db.ref('password_reset_requests/' + id).update({ status: 'done', approvedAt: Date.now(), approvedBy: currentUser });
    db.ref('pm/' + user + '/' + db.ref().push().key).set({
      from: '🔑 SlotOK', to: user,
      text: `🔑 Ваш пароль скинуто адміністратором. Новий тимчасовий пароль: ${tempPass}\nБудь ласка, увійдіть і одразу змініть його в налаштуваннях.`,
      ts: Date.now()
    });
    db.ref('users/' + user + '/pmUnread').set(firebase.database.ServerValue.increment(1));
    notify('✅ Пароль для ' + user + ' скинуто, надіслано в ПП', 'success');
  }).catch(() => notify('Помилка скидання пароля', 'error'));
}

function rejectPasswordReset(id) {
  db.ref('password_reset_requests/' + id).update({ status: 'rejected', rejectedAt: Date.now() });
}

function startAdminRequestListeners() {
  var depEl  = document.getElementById('depositRequestsList');
  var wdEl   = document.getElementById('withdrawRequestsList');
  var pwrEl  = document.getElementById('pwrRequestsList');
  var depInd = document.getElementById('depLiveIndicator');
  var wdInd  = document.getElementById('wdLiveIndicator');
  var pwrInd = document.getElementById('pwrLiveIndicator');
  var depSt  = document.getElementById('depLiveStatus');
  var wdSt   = document.getElementById('wdLiveStatus');
  var pwrSt  = document.getElementById('pwrLiveStatus');

  // DEPOSITS — read all, filter client-side (no index needed)
  if(depEl) {
    depEl.innerHTML = '<div class="req-empty">⏳ Завантаження...</div>';
    if(_depListener) { db.ref('deposit_requests').off('value', _depListener); _depListener = null; }
    _depListener = db.ref('deposit_requests').limitToLast(200).on('value', function(snap) {
      var all = snap.val() || {};
      if(depInd) depInd.style.background = 'var(--pos)';
      if(depSt)  depSt.textContent = 'live ●';
      var pending = Object.entries(all)
        .filter(function(e){ return e[1].status === 'pending'; })
        .sort(function(a,b){ return (b[1].time||0)-(a[1].time||0); });
      depEl.innerHTML = pending.length
        ? pending.map(function(e){ return renderDepositCard(e[0], e[1]); }).join('')
        : '<div class="req-empty">✅ Заявок на поповнення немає</div>';
      updateRequestBadge();
    });
  }

  // WITHDRAWALS — same approach
  if(wdEl) {
    wdEl.innerHTML = '<div class="req-empty">⏳ Завантаження...</div>';
    if(_wdListener) { db.ref('withdraw_requests').off('value', _wdListener); _wdListener = null; }
    _wdListener = db.ref('withdraw_requests').limitToLast(200).on('value', function(snap) {
      var all = snap.val() || {};
      if(wdInd) wdInd.style.background = 'var(--accent)';
      if(wdSt)  wdSt.textContent = 'live ●';
      var pending = Object.entries(all)
        .filter(function(e){ return e[1].status === 'pending'; })
        .sort(function(a,b){ return (b[1].time||0)-(a[1].time||0); });
      wdEl.innerHTML = pending.length
        ? pending.map(function(e){ return renderWithdrawCard(e[0], e[1]); }).join('')
        : '<div class="req-empty">✅ Заявок на вивід немає</div>';
      setPendingWithdrawCount(pending.length);
      updateRequestBadge();
    });
  }

  // PASSWORD RESETS
  if(pwrEl) {
    pwrEl.innerHTML = '<div class="req-empty">⏳ Завантаження...</div>';
    if(_pwrListener) { db.ref('password_reset_requests').off('value', _pwrListener); _pwrListener = null; }
    _pwrListener = db.ref('password_reset_requests').limitToLast(200).on('value', function(snap) {
      var all = snap.val() || {};
      if(pwrInd) pwrInd.style.background = 'var(--special)';
      if(pwrSt)  pwrSt.textContent = 'live ●';
      var pending = Object.entries(all)
        .filter(function(e){ return e[1].status === 'pending'; })
        .sort(function(a,b){ return (b[1].time||0)-(a[1].time||0); });
      pwrEl.innerHTML = pending.length
        ? pending.map(function(e){ return renderPwrCard(e[0], e[1]); }).join('')
        : '<div class="req-empty">✅ Заявок на відновлення немає</div>';
      updateRequestBadge();
    });
  }
}

function updateRequestBadge() {
  var depEl = document.getElementById('depositRequestsList');
  var wdEl  = document.getElementById('withdrawRequestsList');
  var pwrEl = document.getElementById('pwrRequestsList');
  var badge = document.getElementById('adminRequestsBadge');
  var pendingBadge = document.getElementById('adminPendingBadge');
  if(!badge) return;
  var depCount = depEl ? depEl.querySelectorAll('.req-card.deposit').length : 0;
  var wdCount  = wdEl  ? wdEl.querySelectorAll('.req-card.withdraw').length : 0;
  var pwrCount = pwrEl ? pwrEl.querySelectorAll('.req-card').length : 0;
  var total = depCount + wdCount + pwrCount;
  if(total > 0) {
    badge.textContent = total;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
  if(pendingBadge) pendingBadge.textContent = total > 0 ? '⚠️ ' + total + ' заявок очікують' : '';
}

// Де лежать гроші конкретної картки: у балансі живе лише АКТИВНА картка, решта
// тримає свій баланс на собі. Цим шляхом ходить усе, що рухає кошти картки —
// зарахування депозиту, повернення відхиленого виводу, перекид між картками.
// Якщо картку встигли видалити — падаємо на спільний баланс, щоб гроші не зникли.
function cardBalancePath(u, cardId) {
  if(!u || !cardId) return 'balance';
  if(_cardIdsOf(u).indexOf(cardId) < 0) return 'balance';
  if(cardId === _activeCardIdOf(u)) return 'balance';
  return _cardBalPath(cardId);
}

function approveDeposit(id, user, amount, cardId) {
  db.ref('users/'+user).once('value', function(snap) {
    var u = snap.val() || {};
    var path = cardBalancePath(u, cardId);
    db.ref('users/'+user+'/'+path).set(firebase.database.ServerValue.increment(amount));
    // Якщо потрібну картку встигли відключити, кошти йдуть на активну —
    // і в історію теж саме її, а не зниклої.
    pushCardTx(user, {dir:'in', amount:amount, title:'Поповнення картки', subtitle:'Через касу', icon:'💳'},
               path === 'balance' ? _activeCardIdOf(u) : cardId);
    if(path !== 'balance') {
      var obj = (u.linkedCards && u.linkedCards[cardId]) || (cardId === 'axiom' ? u.virtualCard : null);
      var last4 = obj ? (obj.last4 || String(obj.number||'').replace(/\D/g,'').slice(-4)) : '';
      notify('Зараховано на картку ····' + last4 + ' (не активну)', 'info');
    }
  });
  db.ref('deposit_requests/'+id).update({status:'done', approvedAt:Date.now(), approvedBy:currentUser});
  db.ref('users/'+user+'/history').push({text:`✅ Депозит підтверджено: +${amount}₴`, date:Date.now()});
  db.ref('users/'+user+'/totalDeposits').set(firebase.database.ServerValue.increment(amount));
  db.ref('pm/'+user+'/'+db.ref().push().key).set({from:'🏦 SlotOK', to:user, text:`✅ Ваш депозит ${amount}₴ зараховано! Гарної гри! 🎰`, ts:Date.now()});
  db.ref('users/'+user+'/pmUnread').set(firebase.database.ServerValue.increment(1));
  // Update casino stats
  db.ref('casino_stats/totalDeposits').set(firebase.database.ServerValue.increment(amount));
  notify(`✅ Депозит ${amount}₴ зараховано гравцю ${user}`, 'success');
}

function rejectDeposit(id, user) {
  db.ref('deposit_requests/'+id).update({status:'rejected', rejectedAt:Date.now()});
  if(user) db.ref('pm/'+user+'/'+db.ref().push().key).set({from:'🏦 SlotOK', to:user, text:'❌ Ваш запит на поповнення відхилено. Зверніться до підтримки.', ts:Date.now()});
  if(user) db.ref('users/'+user+'/pmUnread').set(firebase.database.ServerValue.increment(1));
  notify('Депозит відхилено', 'info');
}

