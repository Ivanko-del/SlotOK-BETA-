// ============================================
// АДМІН-ПАНЕЛЬ
// ============================================
function loadUserList() {
  const d = document.getElementById('userList');
  if(!d) return;
  d.innerHTML = '<div style="color:#555;text-align:center;padding:14px;">⏳ Завантаження...</div>';
  // Limit to 200 most recently seen users for speed
  db.ref('users').orderByKey().limitToFirst(200).once('value', s => {
    const users = s.val();
    if(!users) { d.innerHTML='Немає гравців'; return; }
    const entries = Object.entries(users)
      .filter(([n,u]) => !u.isBot)
      .sort((a,b) => (b[1].balance||0)-(a[1].balance||0));
    d.innerHTML = entries.map(([n,u]) =>
      `<div class="admin-user-card" onclick="openAdminManage(${jsArg(n)})">
        <div>
          <b>${n}</b>
          ${u.isAdmin?'<span style="color:#d4af37;font-size:10px;"> 👑</span>':''}
          ${u.banned?'<span style="color:#e74c3c;font-size:10px;"> 🚫</span>':''}
          <div style="color:#555;font-size:11px;">ID: ${u.id||'?'} ${u.tag?'• '+u.tag:''}</div>
        </div>
        <span style="color:var(--green);font-weight:bold;">${formatNumber(u.balance||0)}₴</span>
      </div>`
    ).join('');
  });
}


function approveWithdraw(id, user) {
    if(!requireAdminPerm('requests')) return;
    db.ref('withdraw_requests/'+id).once('value').then(snap => {
        const req = snap.val() || {};
        const amount = req.amount || 0;
        db.ref('withdraw_requests/'+id).update({status:'done', approvedAt:Date.now(), approvedBy:currentUser});
        db.ref('users/'+user+'/withdraws/'+id).update({status:'done'});
        db.ref('users/'+user).update({pendingWithdraw: false});
        pushCardTx(user, {dir:'out', amount:amount, title:'Виведення коштів', subtitle: req.method||'', icon:'💸'}, req.cardId || null);
        db.ref('users/'+user+'/history').push({text:`✅ Вивід підтверджено: -${amount}₴`, date:Date.now()});
        db.ref('pm/'+user+'/'+db.ref().push().key).set({from:'🏦 SlotOK', to:user, text:'✅ Ваш вивід коштів схвалено! Кошти надійдуть на реквізити протягом 1-24 год.', ts:Date.now()});
        db.ref('users/'+user+'/pmUnread').set(firebase.database.ServerValue.increment(1));
        notify('✅ Вивід схвалено — гравець отримав повідомлення', 'success');
    });
}

function rejectWithdraw(id, user, amount) {
    if(!requireAdminPerm('requests')) return;
    // Повертаємо саме на ту картку, з якої гроші заморозили: поки заявка висіла
    // в адмінці, гравець міг перемкнути активну — і повернення на спільний
    // balance поклало б кошти чужій картці.
    db.ref('withdraw_requests/'+id+'/cardId').once('value').then(function(cs) {
        var cardId = cs.val() || null;
        db.ref('users/'+user).once('value').then(function(us) {
            var path = cardBalancePath(us.val() || {}, cardId);
            db.ref('users/'+user+'/'+path).set(firebase.database.ServerValue.increment(amount));
        });
    });
    db.ref('withdraw_requests/'+id).update({status:'rejected'});
    db.ref('users/'+user+'/withdraws/'+id).update({status:'rejected'});
    db.ref('users/'+user).update({pendingWithdraw: false});
    db.ref('pm/'+user+'/'+db.ref().push().key).set({from:'🏦 SlotOK', to:user, text:`❌ Ваш запит на вивід ${amount}₴ відхилено. Кошти повернуто на баланс.`, ts:Date.now()});
    db.ref('users/'+user+'/pmUnread').set(firebase.database.ServerValue.increment(1));
    notify('❌ Вивід відхилено, ₴'+amount+' повернуто гравцю', 'success');
}

let admSelectedUser = null;
function openAdminManage(n) { 
    admSelectedUser=n; 
    document.getElementById('admin-user-manage').classList.remove('hidden'); 
    document.getElementById('admManageName').textContent=n; 
}
function admGiveMoney() {
    if(!requireAdminPerm('users')) return;
    const a=parseInt(document.getElementById('admAmount').value);
    if(!a) return;
    db.ref('users/'+admSelectedUser+'/balance').set(firebase.database.ServerValue.increment(a));
    logAdminAction('give_money', `@${admSelectedUser}: ${a>0?'+':''}${a}₴`);
    notify("Баланс змінено","success");
}
function admSetTag() {
    if(!requireAdminPerm('users')) return;
    const t=document.getElementById('admTag').value;
    if(t){
        db.ref('users/'+admSelectedUser).update({tag:t});
        logAdminAction('set_tag', `@${admSelectedUser}: "${t}"`);
        notify("Статус змінено");
    }
}
// Та сама реалізація бана, що й у вкладці "Модерація" (banPlayer вище) —
// з причиною, перевіркою існування гравця й логом дії.
function admBanUser(nick) {
    if(!requireAdminPerm('moderation')) return;
    nick = nick || admSelectedUser;
    if(nick && confirm("Заблокувати гравця?")) banPlayer(nick, 'Заблоковано з панелі гравця');
}
function admDeleteUser() {
    if(!requireAdminPerm('users')) return;
    if(confirm("ВИДАЛИТИ АКАУНТ НАЗАВЖДИ?")){
        const deletedUser = admSelectedUser;
        db.ref('users/'+admSelectedUser).remove().then(()=>{
            logAdminAction('delete_user', `@${deletedUser}`);
            notify("Видалено"); closeTabModal('admin-user-manage'); loadUserList();
        });
    }
}
function wipeEconomy() {
    if(!requireAdminPerm('users')) return;
    if(prompt("Введіть WIPE щоб обнулити ВСІХ гравців:") !== "WIPE") return;
    db.ref('users').once('value', s => {
        const users = s.val() || {};
        const updates = {};
        Object.keys(users).forEach(k => {
            updates[k+'/balance']        = 0;
            updates[k+'/totalWagered']   = 0;
            updates[k+'/totalWins']      = 0;
            updates[k+'/totalLosses']    = 0;
            updates[k+'/totalBets']      = 0;
            updates[k+'/dailyStreak']    = 0;
            updates[k+'/cashbackPending']= 0;
            updates[k+'/cashbackWeekUsed']= 0;
            updates[k+'/slotiky']        = 0;
            updates[k+'/achievements']   = null;
            updates[k+'/achievementXP']  = 0;
            updates[k+'/luckyGamesLeft'] = 0;
        });
        db.ref('users').update(updates).then(()=>notify('💀 Всі гравці обнулені!','success'));
    });
}

// Авто-скидання за розкладом
function setupAutoWipe() {
    const setting = userData.autoWipeSchedule;
    const el = document.getElementById('autoWipeStatus');
    if(el) el.textContent = setting ? `Активно: ${setting}` : 'Не налаштовано';
}

function saveAutoWipe() {
    const mode = document.getElementById('autoWipeMode').value;
    const time = document.getElementById('autoWipeTime').value;
    if(!time) return notify('Вкажіть час', 'error');
    db.ref('settings/autoWipe').set({ mode, time, setBy: currentUser, setAt: Date.now() });
    notify(`✅ Авто-скидання: ${mode} о ${time}`, 'success');
    // Save to Firebase settings, will be processed server-side
    // Client-side: check on login if wipe is due
    localStorage.setItem('slotok_autoWipe', JSON.stringify({ mode, time }));
}

function checkAutoWipeOnLoad() {
    try {
        const cfg = JSON.parse(localStorage.getItem('slotok_autoWipe') || 'null');
        if(!cfg) return;
        const now = new Date();
        const [h, m] = cfg.time.split(':').map(Number);
        const lastWipe = parseInt(localStorage.getItem('slotok_lastAutoWipe') || '0');
        const oneDay = 86400000, oneWeek = 604800000, oneMonth = 2592000000;
        const periods = { daily: oneDay, weekly: oneWeek, monthly: oneMonth };
        const period = periods[cfg.mode] || oneDay;
        // Check if now is close to scheduled time and period has elapsed
        const scheduledToday = new Date(); scheduledToday.setHours(h, m, 0, 0);
        const diffMs = Math.abs(now - scheduledToday);
        if(diffMs < 60000 && (Date.now() - lastWipe) > period - 60000) {
            // Time to wipe!
            const isAdm = isAdminUser();
            if(isAdm) {
                wipeEconomy_auto();
                localStorage.setItem('slotok_lastAutoWipe', String(Date.now()));
            }
        }
    } catch(e) { console.warn(e); }
}

function wipeEconomy_auto() {
    // Тільки адмін може викликати
    if(!isAdminUser()) return;
    db.ref('users').once('value', s => {
        const users = s.val() || {};
        const updates = {};
        Object.keys(users).forEach(k => {
            updates[k+'/balance']        = 0;
            updates[k+'/totalWagered']   = 0;
            updates[k+'/dailyStreak']    = 0;
            updates[k+'/cashbackPending']= 0;
        });
        db.ref('users').update(updates);
        db.ref('settings/lastAutoWipe').set(Date.now());
    });
}

