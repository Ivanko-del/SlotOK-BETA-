// ============================================
// ОНОВЛЕНИЙ switchTab — ініціалізація при відкритті
// ============================================
// ============================================
// ===== КЛАНИ =====
// ============================================
function loadClanTab() {
  loadClanLeague();
  const clanId = userData.clanId;
  if(clanId) {
    document.getElementById('noClanSection').classList.add('hidden');
    document.getElementById('myClanSection').classList.remove('hidden');
    loadMyClan(clanId);
  } else {
    document.getElementById('noClanSection').classList.remove('hidden');
    document.getElementById('myClanSection').classList.add('hidden');
    loadPublicClans();
  }
}

function createClan() {
  const name = document.getElementById('clanNameInput').value.trim().slice(0,20);
  const tag  = document.getElementById('clanTagInput').value.trim().toUpperCase().slice(0,4);
  const desc = document.getElementById('clanDescInput').value.trim().slice(0,80);
  if(!name || !tag || tag.length < 2) return notify('Введіть назву і тег (2-4 літери)', 'error');
  if(userData.balance < 500) return notify('Потрібно 500₴ для створення клану', 'error');
  const clanId = currentUser + '_clan_' + Date.now();
  db.ref('users/' + currentUser).update({ balance: firebase.database.ServerValue.increment(-500), clanId });
  db.ref('clans/' + clanId).set({
    name, tag, desc, leader: currentUser,
    bank: 0, privacy: 'open',
    members: { [currentUser]: { role: 'leader', joined: Date.now() } },
    created: Date.now(), weekWager: 0
  });
  addToHistory('Створено клан ' + name + ': -500₴');
  notify('🛡️ Клан [' + tag + '] ' + name + ' створено!', 'success');
  loadClanTab();
}

function loadPublicClans() {
  db.ref('clans').limitToFirst(10).once('value', snap => {
    const list = document.getElementById('clanListPublic');
    if(!list) return;
    const data = snap.val();
    if(!data) { list.innerHTML = '<div style="color:var(--fg-3);font-size:13px;padding:10px 0;text-align:center;">Кланів поки немає</div>'; return; }
    list.innerHTML = '';
    Object.entries(data).forEach(([id, c]) => {
      const memberCount = c.members ? Object.keys(c.members).length : 1;
      list.innerHTML += '<div class="clan-banner member" style="margin-bottom:8px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<div><span style="font-size:11px;color:var(--green);border:1px solid var(--green);padding:1px 6px;border-radius:var(--r-sm);">[' + escapeHtml(c.tag) + ']</span>' +
          '<span class="clan-name" style="font-size:16px;margin-left:8px;">' + escapeHtml(c.name) + '</span></div>' +
          '<span style="color:var(--fg-3);font-size:12px;">' + memberCount + ' гравців</span>' +
        '</div>' +
        '<div style="color:var(--fg-3);font-size:12px;margin:6px 0;">' + (c.desc||'') + '</div>' +
        '<button class="btn-green" style="padding:8px;font-size:12px;" onclick="joinClan(\'' + id + '\')">' + (c.privacy === 'private' ? '📩 Подати заявку' : '➕ Вступити') + '</button>' +
      '</div>';
    });
  });
}

function joinClan(clanId) {
  if(userData.clanId) return notify('Ви вже в клані!', 'error');
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return notify('Клан не знайдено', 'error');
    if(c.privacy === 'private') {
      db.ref('clans/' + clanId + '/joinRequests/' + currentUser).set({ name: currentUser, ts: Date.now() });
      notify('📩 Заявку надіслано, очікуйте на підтвердження', 'success');
      return;
    }
    db.ref('clans/' + clanId + '/members/' + currentUser).set({ role: 'member', joined: Date.now() });
    db.ref('users/' + currentUser).update({ clanId });
    notify('🛡️ Ви вступили до клану ' + c.name, 'success');
    loadClanTab();
  });
}

function toggleClanPrivacy(clanId) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    const role = c.members[currentUser] && c.members[currentUser].role;
    if(role !== 'leader' && role !== 'officer') return notify('Тільки лідер або офіцер', 'error');
    const next = c.privacy === 'private' ? 'open' : 'private';
    db.ref('clans/' + clanId + '/privacy').set(next);
    notify(next === 'private' ? '🔒 Клан тепер приватний' : '🌐 Клан тепер відкритий', 'info');
    loadMyClan(clanId);
  });
}

function respondToJoinRequest(clanId, uid, accept) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    const role = c.members[currentUser] && c.members[currentUser].role;
    if(role !== 'leader' && role !== 'officer') return notify('Тільки лідер або офіцер', 'error');
    const finish = () => {
      db.ref('clans/' + clanId + '/joinRequests/' + uid).remove();
      loadMyClan(clanId);
    };
    if(accept) {
      db.ref('users/' + uid + '/clanId').once('value', clanIdSnap => {
        const existingClanId = clanIdSnap.val();
        if(existingClanId && existingClanId !== clanId) {
          notify('❌ ' + uid + ' вже вступив до іншого клану', 'info');
          finish();
          return;
        }
        db.ref('clans/' + clanId + '/members/' + uid).set({ role: 'member', joined: Date.now() });
        db.ref('users/' + uid).update({ clanId });
        notify('✅ ' + uid + ' прийнято до клану', 'success');
        finish();
      });
    } else {
      notify('❌ Заявку від ' + uid + ' відхилено', 'info');
      finish();
    }
  });
}

function promoteOfficer(clanId, uid) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    if(c.leader !== currentUser) return notify('Тільки лідер', 'error');
    const targetRole = c.members[uid] && c.members[uid].role;
    if(!targetRole) return;
    if(targetRole === 'officer') {
      // Transfer leadership: target becomes leader, caller becomes officer.
      db.ref('clans/' + clanId).update({
        leader: uid,
        ['members/' + uid + '/role']: 'leader',
        ['members/' + currentUser + '/role']: 'officer'
      });
      notify('👑 Лідерство передано ' + uid, 'success');
    } else {
      db.ref('clans/' + clanId + '/members/' + uid + '/role').set('officer');
      notify('🎖️ ' + uid + ' підвищено до офіцера', 'success');
    }
    loadMyClan(clanId);
  });
}

function demoteOfficer(clanId, uid) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    if(c.leader !== currentUser) return notify('Тільки лідер', 'error');
    db.ref('clans/' + clanId + '/members/' + uid + '/role').set('member');
    notify('🛡️ ' + uid + ' понижено до учасника', 'info');
    loadMyClan(clanId);
  });
}

function kickMember(clanId, uid) {
  if(uid === currentUser) return;
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    const myRole = c.members[currentUser] && c.members[currentUser].role;
    const targetRole = c.members[uid] && c.members[uid].role;
    if(myRole !== 'leader' && myRole !== 'officer') return notify('Немає прав', 'error');
    if(targetRole === 'leader' || (targetRole === 'officer' && myRole !== 'leader')) return notify('Немає прав кікнути цього гравця', 'error');
    if(!confirm('Кікнути ' + uid + ' з клану?')) return;
    db.ref('clans/' + clanId + '/members/' + uid).remove();
    db.ref('users/' + uid + '/clanId').remove();
    notify('👢 ' + uid + ' виключено з клану', 'info');
    loadMyClan(clanId);
  });
}

function disbandClan(clanId) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    if(c.leader !== currentUser) return notify('Тільки лідер', 'error');
    if(!confirm('Розпустити клан "' + c.name + '"? Це незворотньо, банк клану (' + formatNumber(c.bank||0) + '₴) буде втрачено.')) return;
    const members = c.members ? Object.keys(c.members) : [];
    members.forEach(uid => db.ref('users/' + uid + '/clanId').remove());
    db.ref('clans/' + clanId).remove();
    notify('Клан розпущено', 'info');
    loadClanTab();
  });
}

function leaveClan() {
  if(!userData.clanId) return;
  const clanId = userData.clanId;
  db.ref('clans/' + clanId + '/leader').once('value', snap => {
    if(snap.val() === currentUser) {
      return notify('Лідер не може покинути клан — передай лідерство (👑 на офіцері) або розпусти клан', 'error');
    }
    db.ref('clans/' + clanId + '/members/' + currentUser).remove();
    db.ref('users/' + currentUser + '/clanId').remove();
    if (_clanChatListener) { db.ref('clan_chats/' + clanId).off('value', _clanChatListener); _clanChatListener = null; }
    notify('Ви покинули клан', 'info');
    loadClanTab();
  });
}

const CLAN_TASK_DEFS = [
  { id: 'wager5k',  goal: 5000,  reward: 500,  key: 'wager' },
  { id: 'wager25k', goal: 25000, reward: 2000, key: 'wager' },
  { id: 'games3pp', goal: 0 /* computed per-clan */, reward: 1000, key: 'games' }
];

function claimClanTask(clanId, taskId) {
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) return;
    const myRole = c.members[currentUser] && c.members[currentUser].role;
    if(myRole !== 'leader' && myRole !== 'officer') return notify('Тільки лідер або офіцер', 'error');
    const week = getWeekStr();
    const wk = (c.weekly && c.weekly[week]) || { wager: 0, games: 0 };
    const members = Object.keys(c.members || {});
    const def = CLAN_TASK_DEFS.find(t => t.id === taskId);
    if(!def) return;
    const goal = taskId === 'games3pp' ? members.length * 3 : def.goal;
    const already = wk.paid && wk.paid[taskId];
    if(already) return notify('Вже виплачено цього тижня', 'info');
    if((wk[def.key] || 0) < goal) return notify('Завдання ще не виконано', 'error');
    if((c.bank || 0) < def.reward) return notify('Недостатньо в банку клану', 'error');

    const share = Math.floor(def.reward / members.length);
    const updates = {
      ['bank']: firebase.database.ServerValue.increment(-def.reward),
      ['weekly/' + week + '/paid/' + taskId]: true
    };
    db.ref('clans/' + clanId).update(updates);
    members.forEach(uid => db.ref('users/' + uid + '/balance').set(firebase.database.ServerValue.increment(share)));
    notify('🎁 Нагороду виплачено: +' + share + '₴ кожному учаснику', 'success');
    recalcClanScore(clanId);
    loadMyClan(clanId);
  });
}

function loadMyClan(clanId) {
  const week = getWeekStr();
  db.ref('clans/' + clanId).once('value', snap => {
    const c = snap.val();
    if(!c) { leaveClan(); return; }
    const wk = (c.weekly && c.weekly[week]) || { wager: 0, games: 0 };
    const banner = document.getElementById('myClanBanner');
    const members = c.members ? Object.keys(c.members) : [];
    banner.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<div><span style="font-size:11px;color:var(--green);border:1px solid var(--green);padding:1px 6px;border-radius:var(--r-sm);">[' + escapeHtml(c.tag) + ']</span>' +
        '<span class="clan-name" style="font-size:18px;margin-left:8px;">' + escapeHtml(c.name) + '</span></div>' +
        '<span style="font-size:20px;">' + (c.leader===currentUser?'👑':'') + '</span>' +
      '</div>' +
      '<div style="color:var(--fg-2);font-size:13px;margin-bottom:10px;">' + (c.desc||'') + '</div>' +
      '<div class="clan-stats">' +
        '<div class="clan-stat"><div class="clan-stat-v">' + members.length + '</div><div class="clan-stat-l">Учасників</div></div>' +
        '<div class="clan-stat"><div class="clan-stat-v">' + formatNumber(c.bank||0) + '₴</div><div class="clan-stat-l">Банк клану</div></div>' +
        '<div class="clan-stat"><div class="clan-stat-v">' + formatNumber(wk.wager||0) + '₴</div><div class="clan-stat-l">Ставки/тиж</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;margin-top:8px;">' +
        '<input id="clanBankDepositInput" type="number" min="100" placeholder="Сума (мін. 100₴)" style="flex:1;min-width:0;margin:0;">' +
        '<button class="btn-gold" style="width:auto;flex-shrink:0;padding:0 16px;" onclick="depositToClanBank(\'' + clanId + '\', parseInt(document.getElementById(\'clanBankDepositInput\').value))">🏦 Внести</button>' +
      '</div>';
    if(c.leader === currentUser) {
      banner.innerHTML += '<button class="btn-outline" style="width:auto;margin-top:8px;color:var(--neg);" onclick="disbandClan(\'' + clanId + '\')">💥 Розпустити клан</button>';
    }

    const myRole = c.members[currentUser] && c.members[currentUser].role || 'member';
    const isLeaderOrOfficer = myRole === 'leader' || myRole === 'officer';

    const privacyEl = document.getElementById('clanPrivacySection');
    if(privacyEl) {
      privacyEl.innerHTML = isLeaderOrOfficer
        ? '<button class="btn-outline" style="margin:8px 0;" onclick="toggleClanPrivacy(\'' + clanId + '\')">' +
            (c.privacy === 'private' ? '🔒 Приватний — натисни щоб відкрити' : '🌐 Відкритий — натисни щоб зробити приватним') +
          '</button>'
        : '';
    }

    const reqEl = document.getElementById('clanJoinRequestsSection');
    if(reqEl) {
      const reqs = c.joinRequests ? Object.keys(c.joinRequests) : [];
      reqEl.innerHTML = (isLeaderOrOfficer && reqs.length)
        ? '<div class="section-header">📩 Заявки на вступ (' + reqs.length + ')</div>' +
          reqs.map(uid => '<div class="clan-member-row"><div style="flex:1;">' + uid + '</div>' +
            '<button class="btn-green" style="width:auto;padding:4px 10px;font-size:11px;" onclick="respondToJoinRequest(\'' + clanId + '\',' + jsArg(uid) + ',true)">✅</button>' +
            '<button class="btn-outline" style="width:auto;padding:4px 10px;font-size:11px;margin-left:4px;" onclick="respondToJoinRequest(\'' + clanId + '\',' + jsArg(uid) + ',false)">❌</button>' +
          '</div>').join('')
        : '';
    }

    const tier = getClanBankTier(c.bank || 0);
    const nextTier = CLAN_BANK_TIERS.slice().reverse().find(t => t.min > (c.bank || 0));
    const perkEl = document.getElementById('clanPerkSection');
    if(perkEl) {
      perkEl.innerHTML = '<div class="section-header">💎 Кланові перки</div>' +
        '<div class="box" style="padding:10px;">' +
          '<div style="font-size:13px;">' + tier.label + ': <b style="color:var(--accent);">+' + (tier.cashback*100).toFixed(2) + '%</b> кешбеку для всіх учасників' + (tier.min>=25000?' + колір тегу/банера':'') + (tier.min>=100000?' + знижка 50% на створення клану':tier.min>=25000?' + знижка 25% на створення клану':'') + '</div>' +
          (nextTier ? '<div style="font-size:11px;color:var(--fg-3);margin-top:4px;">До наступного тіру: ' + formatNumber(nextTier.min - (c.bank||0)) + '₴</div>' : '<div style="font-size:11px;color:var(--green);margin-top:4px;">Максимальний тір!</div>') +
        '</div>';
    }

    const mList = document.getElementById('clanMembersList');
    mList.innerHTML = '';
    members.forEach(name => {
      const role = c.members[name] && c.members[name].role || 'member';
      const iAmLeader = myRole === 'leader';
      const canKick = isLeaderOrOfficer && name !== currentUser && role !== 'leader' && !(role === 'officer' && !iAmLeader);
      const canPromoteDemote = iAmLeader && name !== currentUser && role !== 'leader';
      mList.innerHTML += '<div class="clan-member-row">' +
        '<div class="clan-member-avatar">' + (name===currentUser?'🙋':'👤') + '</div>' +
        '<div style="flex:1;"><div style="font-weight:bold;font-size:14px;">' + name + '</div></div>' +
        '<span class="clan-role ' + role + '">' + (role==='leader'?'👑 Лідер':role==='officer'?'🎖️ Офіцер':'🛡️ Учасник') + '</span>' +
        (canPromoteDemote ?
          '<button class="btn-outline" style="width:auto;padding:2px 8px;font-size:10px;margin-left:6px;" onclick="' +
            (role==='member' ? 'promoteOfficer' : 'demoteOfficer') + '(\'' + clanId + '\',' + jsArg(name) + ')">' +
            (role==='member' ? '⬆️' : '⬇️') + '</button>' : '') +
        (canPromoteDemote && role==='officer' ?
          '<button class="btn-outline" style="width:auto;padding:2px 8px;font-size:10px;margin-left:4px;" onclick="promoteOfficer(\'' + clanId + '\',' + jsArg(name) + ')">👑</button>'
          : '') +
        (canKick ?
          '<button class="btn-outline" style="width:auto;padding:2px 8px;font-size:10px;margin-left:4px;color:var(--neg);" onclick="kickMember(\'' + clanId + '\',' + jsArg(name) + ')">👢</button>'
          : '') +
      '</div>';
    });

    const tList = document.getElementById('clanTasksList');
    const paid = (c.weekly && c.weekly[week] && c.weekly[week].paid) || {};
    const CLAN_TASKS = [
      { id: 'wager5k',  goal: 5000,  label: 'Поставити 5 000₴ спільно',  reward: 500,  key: 'wager' },
      { id: 'wager25k', goal: 25000, label: 'Поставити 25 000₴ спільно', reward: 2000, key: 'wager' },
      { id: 'games3pp', goal: members.length * 3, label: 'Кожен грає 3 ігри (' + (members.length*3) + ' разів)', reward: 1000, key: 'games' }
    ];
    tList.innerHTML = CLAN_TASKS.map(t => {
      const prog = Math.min(t.goal, wk[t.key] || 0);
      const pct  = Math.min(100, (prog/t.goal)*100);
      const done = prog >= t.goal;
      const isPaid = !!paid[t.id];
      return '<div class="clan-task ' + (done?'done':'') + '">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">' +
          '<span style="font-size:13px;">' + t.label + '</span>' +
          '<span style="color:var(--accent);font-size:12px;font-weight:bold;">+' + t.reward + '₴</span>' +
        '</div>' +
        '<div class="quest-prog-bar"><div class="quest-prog-fill" style="width:' + pct + '%"></div></div>' +
        '<div style="font-size:11px;color:var(--fg-3);">' + formatNumber(prog) + ' / ' + formatNumber(t.goal) + '</div>' +
        (isPaid ? '<div style="color:var(--green);font-size:12px;margin-top:4px;">✅ Виконано і виплачено</div>' :
          done ? (isLeaderOrOfficer
            ? '<button class="btn-gold" style="width:auto;padding:4px 12px;font-size:11px;margin-top:6px;" onclick="claimClanTask(\'' + clanId + '\',\'' + t.id + '\')">🎁 Забрати нагороду</button>'
            : '<div style="color:var(--fg-3);font-size:12px;margin-top:4px;">⏳ Очікує на лідера/офіцера</div>')
          : '') +
      '</div>';
    }).join('');
  });
  initClanChat(clanId);
}

// Трекінг вагера для клану
function trackClanWager(amount) {
  if(!userData.clanId) return;
  const week = getWeekStr();
  db.ref('clans/' + userData.clanId + '/weekly/' + week + '/wager').transaction(v => (v||0) + amount);
  db.ref('clans/' + userData.clanId + '/weekly/' + week + '/games').transaction(v => (v||0) + 1);
  recalcClanScore(userData.clanId);
}

function recalcClanScore(clanId) {
  const week = getWeekStr();
  Promise.all([
    db.ref('clans/' + clanId + '/bank').once('value'),
    db.ref('clans/' + clanId + '/weekly/' + week + '/wager').once('value')
  ]).then(([bankSnap, wagerSnap]) => {
    const score = (bankSnap.val() || 0) + (wagerSnap.val() || 0) * 3;
    db.ref('clans/' + clanId + '/score').set(score);
  });
}

function loadClanLeague() {
  const el = document.getElementById('clanLeagueList');
  if(!el) return;
  db.ref('clans').orderByChild('score').limitToLast(20).once('value', snap => {
    const data = snap.val();
    if(!data) { el.innerHTML = '<div style="color:var(--fg-3);font-size:13px;padding:10px 0;text-align:center;">Ліга поки порожня</div>'; return; }
    const ranked = Object.entries(data).sort((a,b) => (b[1].score||0) - (a[1].score||0));
    el.innerHTML = ranked.map(([id, c], i) => {
      const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':('#'+(i+1));
      return '<div class="clan-member-row">' +
        '<div style="width:28px;text-align:center;font-weight:bold;">' + medal + '</div>' +
        '<div style="flex:1;"><span style="color:var(--green);">[' + escapeHtml(c.tag) + ']</span> ' + escapeHtml(c.name) + '</div>' +
        '<div style="font-weight:bold;color:var(--accent);">' + formatNumber(c.score||0) + '</div>' +
      '</div>';
    }).join('');
  });
}

var clanCashbackBonus = 0;
var _clanBankListener = null;
var _clanBankListenerClanId = null;
function syncClanBankListener() {
  const clanId = userData && userData.clanId;
  if(clanId === _clanBankListenerClanId) return;
  if(_clanBankListener && _clanBankListenerClanId) {
    db.ref('clans/' + _clanBankListenerClanId + '/bank').off('value', _clanBankListener);
  }
  _clanBankListenerClanId = clanId || null;
  clanCashbackBonus = 0;
  if(!clanId) return;
  _clanBankListener = db.ref('clans/' + clanId + '/bank').on('value', snap => {
    clanCashbackBonus = getClanBankTier(snap.val() || 0).cashback;
  });
}

// ============================================
// ===== ЛІДЕРБОРД =====
// ============================================
// loadLeaderboard replaced by loadLeaderboardNew

// ============================================
// ===== МОНОПОЛІЯ =====
// ============================================
const MONO_COLORS = {
  brown:'#8B4513', lightblue:'#87CEEB', pink:'#FF69B4', orange:'#FFA500',
  red:'#FF3B30', yellow:'#FFD700', green:'#4CD964', blue:'#0070C9'
};

const MONO_CELLS = [
  {type:'corner',  label:'GO\n+200₴', pos:0},
  {type:'prop',    label:'Київ\nСтарий',   color:'brown',     price:60,  rent:4,  pos:1},
  {type:'special', label:'Скарб',  icon:'🏆', pos:2},
  {type:'prop',    label:'Київ\nНовий',    color:'brown',     price:60,  rent:4,  pos:3},
  {type:'tax',     label:'Податок\n-100₴',  icon:'💸', pos:4},
  {type:'station', label:'Вокзал\nПд',      price:200, rent:25, pos:5},
  {type:'prop',    label:'Харків\nСх',      color:'lightblue', price:100, rent:6,  pos:6},
  {type:'special', label:'Шанс',   icon:'❓', pos:7},
  {type:'prop',    label:'Харків\nЗх',      color:'lightblue', price:100, rent:6,  pos:8},
  {type:'prop',    label:'Харків\nЦентр',   color:'lightblue', price:120, rent:8,  pos:9},
  {type:'corner',  label:'В\'ЯЗНИЦЯ', pos:10},
  {type:'prop',    label:'Одеса\nЦентр',    color:'pink',      price:140, rent:10, pos:11},
  {type:'utility', label:'Елект-\nростанція', icon:'⚡', price:150, pos:12},
  {type:'prop',    label:'Одеса\nМорська',  color:'pink',      price:140, rent:10, pos:13},
  {type:'prop',    label:'Одеса\nКурорт',   color:'pink',      price:160, rent:12, pos:14},
  {type:'station', label:'Вокзал\nСх',       price:200, rent:25, pos:15},
  {type:'prop',    label:'Дніпро\nСтарий',  color:'orange',    price:180, rent:14, pos:16},
  {type:'special', label:'Скарб',  icon:'🏆', pos:17},
  {type:'prop',    label:'Дніпро\nЦентр',   color:'orange',    price:180, rent:14, pos:18},
  {type:'prop',    label:'Дніпро\nАтракції', color:'orange',   price:200, rent:16, pos:19},
  {type:'corner',  label:'ПАРК', pos:20},
  {type:'prop',    label:'Запоріжжя',        color:'red',       price:220, rent:18, pos:21},
  {type:'special', label:'Шанс',   icon:'❓', pos:22},
  {type:'prop',    label:'Суми\nЦентр',      color:'red',       price:220, rent:18, pos:23},
  {type:'prop',    label:'Суми\nСупер',      color:'red',       price:240, rent:20, pos:24},
  {type:'station', label:'Вокзал\nЗх',       price:200, rent:25, pos:25},
  {type:'prop',    label:'Полтава\nСтара',   color:'yellow',    price:260, rent:22, pos:26},
  {type:'prop',    label:'Полтава\nНова',    color:'yellow',    price:260, rent:22, pos:27},
  {type:'utility', label:'Водо-\nпостачання', icon:'💧', price:150, pos:28},
  {type:'prop',    label:'Полтава\nМодерн',  color:'yellow',    price:280, rent:24, pos:29},
  {type:'corner',  label:'ЙДИ У\nВ\'ЯЗНИЦЮ', pos:30},
  {type:'prop',    label:'Lviv\nСтаре',      color:'green',     price:300, rent:26, pos:31},
  {type:'prop',    label:'Lviv\nЦентр',      color:'green',     price:300, rent:26, pos:32},
  {type:'special', label:'Скарб',  icon:'🏆', pos:33},
  {type:'prop',    label:'Lviv\nПрем\'єр',   color:'green',     price:320, rent:28, pos:34},
  {type:'station', label:'Вокзал\nПн',       price:200, rent:25, pos:35},
  {type:'special', label:'Шанс',   icon:'❓', pos:36},
  {type:'prop',    label:'Kyiv\nПрайм',      color:'blue',      price:350, rent:35, pos:37},
  {type:'tax',     label:'Розкіш\n-150₴',    icon:'💎', pos:38},
  {type:'prop',    label:'Kyiv\nPrestige',   color:'blue',      price:400, rent:50, pos:39},
];

function cellGridPos(pos) {
  if(pos === 0)  return [10,10];
  if(pos <= 9)   return [10-pos, 10];
  if(pos === 10) return [0, 10];
  if(pos <= 19)  return [0, 10-(pos-10)];
  if(pos === 20) return [0, 0];
  if(pos <= 29)  return [pos-20, 0];
  if(pos === 30) return [10, 0];
  if(pos <= 39)  return [10, pos-30];
  return [0,0];
}

let monoState = null;

function startMonopoly() {
  const bet = parseInt(document.getElementById('monoEntryBet').value) || 500;
  if(bet < 100) return notify('Мінімальна ставка 100₴', 'error');
  if(userData.balance < bet) return notify('Недостатньо коштів', 'error');

  db.ref('users/' + currentUser).update({ balance: firebase.database.ServerValue.increment(-bet) });
  addWager(bet);
  trackQuest('totalGames', 1);
  trackQuest('weekWager', bet);
  if(userData.clanId) trackClanWager(bet);

  monoState = {
    bet, playerMoney:3000, aiMoney:3000,
    playerPos:0, aiPos:0, props:{},
    turn:'player', jailPlayer:0, jailAi:0, gameOver:false
  };

  document.getElementById('monoStartScreen').classList.add('hidden');
  document.getElementById('monoGameScreen').classList.remove('hidden');
  renderMonoBoard();
  updateMonoInfo();
  monoLog('🎩 Гра почалась! Ваш хід.', 'info');
}

function renderMonoBoard() {
  const board = document.getElementById('monoBoard');
  if(!board) return;
  const grid = Array.from({length:11}, () => Array(11).fill(null));
  MONO_CELLS.forEach(cell => { const [c,r] = cellGridPos(cell.pos); grid[r][c] = cell; });

  board.innerHTML = '';
  board.style.display = 'grid';
  board.style.gridTemplateColumns = '1fr repeat(9,1fr) 1fr';
  board.style.gridTemplateRows = '1fr repeat(9,1fr) 1fr';

  for(let r = 0; r < 11; r++) {
    for(let c = 0; c < 11; c++) {
      // Skip center cells — handled by center div
      if(r >= 1 && r <= 9 && c >= 1 && c <= 9) {
        if(r === 1 && c === 1) {
          // Place center spanning element
          const ctr = document.createElement('div');
          ctr.className = 'mono-center';
          ctr.style.gridColumn = '2 / 11';
          ctr.style.gridRow = '2 / 11';
          ctr.innerHTML = '<div style="font-size:16px;letter-spacing:2px;">МОНОПОЛІЯ</div><div style="font-size:36px;margin-top:5px;">🎩</div>';
          board.appendChild(ctr);
        }
        continue;
      }

      const cell = grid[r][c];
      const div = document.createElement('div');

      if(!cell) {
        div.style.cssText = 'background:transparent;border:none;';
        board.appendChild(div);
        continue;
      }

      let stripeClass = '';
      if(cell.pos >= 1 && cell.pos <= 9)   stripeClass = 'prop-top';
      if(cell.pos >= 11 && cell.pos <= 19)  stripeClass = 'prop-right';
      if(cell.pos >= 21 && cell.pos <= 29)  stripeClass = 'prop-bottom';
      if(cell.pos >= 31 && cell.pos <= 39)  stripeClass = 'prop-left';

      let ownerClass = '';
      if(monoState && monoState.props[cell.pos]) ownerClass = 'owned-' + monoState.props[cell.pos];

      div.className = 'mono-cell ' + (cell.type==='corner'?'corner':'') + ' ' + stripeClass + ' ' + ownerClass;
      div.dataset.pos = cell.pos;

      if(cell.color) div.style.borderColor = MONO_COLORS[cell.color]||'var(--fg-3)';

      const cornerIcons = {0:'🏁',10:'⛓️',20:'🌳',30:'👮'};
      if(cell.type === 'corner') {
        div.innerHTML = '<span style="font-size:12px;">' + (cornerIcons[cell.pos]||'') + '</span><span style="font-size:8px;white-space:pre-line;">' + cell.label + '</span>';
      } else if(cell.type === 'prop') {
        div.innerHTML = '<span style="font-size:7px;white-space:pre-line;line-height:1.1;">' + cell.label + '</span><span class="cell-price">' + cell.price + '₴</span>';
      } else if(cell.type === 'station') {
        div.innerHTML = '<span style="font-size:12px;">🚂</span><span style="font-size:7px;white-space:pre-line;">' + cell.label + '</span><span class="cell-price">' + cell.price + '₴</span>';
      } else if(cell.type === 'utility') {
        div.innerHTML = '<span style="font-size:14px;">' + (cell.icon||'') + '</span><span style="font-size:7px;white-space:pre-line;">' + cell.label + '</span>';
      } else if(cell.type === 'special') {
        div.innerHTML = '<span style="font-size:16px;">' + (cell.icon||'?') + '</span>';
      } else if(cell.type === 'tax') {
        div.innerHTML = '<span style="font-size:12px;">' + (cell.icon||'') + '</span><span style="font-size:7px;white-space:pre-line;">' + cell.label + '</span>';
      }

      board.appendChild(div);
    }
  }
  placeMonoPlayers();
}

function placeMonoPlayers() {
  document.querySelectorAll('.mono-player').forEach(e => e.remove());
  if(!monoState) return;
  const wrap = document.getElementById('monoBoardWrap');
  if(!wrap) return;
  const W = wrap.offsetWidth;
  const cellW = W / 11;

  [
    { pos: monoState.playerPos, color:'#4CD964', label:'🧑', offset:0 },
    { pos: monoState.aiPos,     color:'#FF3B30', label:'🤖', offset:6 }
  ].forEach(p => {
    const [col, row] = cellGridPos(p.pos);
    const el = document.createElement('div');
    el.className = 'mono-player';
    el.style.background = p.color;
    el.style.left = (col * cellW + p.offset + 2) + 'px';
    el.style.top  = (row * cellW + 2) + 'px';
    el.title = p.label;
    wrap.appendChild(el);
  });
}

function updateMonoInfo() {
  if(!monoState) return;
  const pm = document.getElementById('monoPlayerMoney');
  const am = document.getElementById('monoAiMoney');
  if(pm) pm.textContent = monoState.playerMoney + '₴';
  if(am) am.textContent = monoState.aiMoney + '₴';
}

const DICE_EMOJI = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
function monoRollDie() { return Math.floor(Math.random()*6)+1; }

function monoRoll() {
  if(!monoState || monoState.gameOver || monoState.turn !== 'player') return;
  const rollBtn = document.getElementById('monoRollBtn');
  if(rollBtn) rollBtn.disabled = true;

  const d1 = monoRollDie(), d2 = monoRollDie();
  const die1 = document.getElementById('die1');
  const die2 = document.getElementById('die2');
  if(die1) { die1.classList.add('rolling'); die1.textContent = DICE_EMOJI[d1]; }
  if(die2) { die2.classList.add('rolling'); die2.textContent = DICE_EMOJI[d2]; }
  setTimeout(() => {
    if(die1) die1.classList.remove('rolling');
    if(die2) die2.classList.remove('rolling');
  }, 500);

  if(monoState.jailPlayer > 0) {
    monoState.jailPlayer--;
    monoLog('⛓️ Ви у в\'язниці. Залишилось: ' + monoState.jailPlayer, 'bad');
    setTimeout(monoAiTurn, 1000); return;
  }

  const steps = d1 + d2;
  monoLog('🎲 Ви кинули ' + d1 + ' + ' + d2 + ' = ' + steps);
  const oldPos = monoState.playerPos;
  monoState.playerPos = (monoState.playerPos + steps) % 40;
  if(monoState.playerPos < oldPos) {
    monoState.playerMoney += 200;
    monoLog('🏁 Ви пройшли GO! +200₴', 'good');
  }
  updateMonoInfo();
  renderMonoBoard();
  setTimeout(monoLandPlayer, 600);
}

function monoLandPlayer() {
  const cell = MONO_CELLS[monoState.playerPos];
  if(!cell) { setTimeout(monoAiTurn, 500); return; }

  const buyBtn = document.getElementById('monoBuyBtn');
  if(buyBtn) buyBtn.disabled = true;

  if(cell.pos === 30) {
    monoState.playerPos = 10; monoState.jailPlayer = 2;
    monoLog('👮 Іди у в\'язницю!', 'bad');
    renderMonoBoard(); setTimeout(monoAiTurn, 1000); return;
  }
  if(cell.type === 'tax') {
    const tax = cell.pos === 4 ? 100 : 150;
    monoState.playerMoney -= tax;
    monoLog('💸 Податок: -' + tax + '₴', 'bad');
    updateMonoInfo();
    if(monoState.playerMoney <= 0) return monoGameOver('ai');
    setTimeout(monoAiTurn, 1000); return;
  }
  if(cell.type === 'special') {
    monoSpecialCard('player');
    setTimeout(monoAiTurn, 1200); return;
  }
  if((cell.type === 'prop' || cell.type === 'station') && cell.price) {
    const owner = monoState.props[cell.pos];
    if(!owner) {
      monoLog('🏠 ' + cell.label.replace('\n',' ') + ' — вільна (' + cell.price + '₴). Купити?', 'info');
      const passBtn = document.getElementById('monoPassBtn');
      if(buyBtn) { buyBtn.disabled = false; buyBtn.onclick = () => monoPlayerBuy(cell); }
      if(passBtn) { passBtn.disabled = false; passBtn.onclick = () => monoPass(); }
      return;
    } else if(owner === 'ai') {
      const rent = cell.rent || 25;
      monoState.playerMoney -= rent; monoState.aiMoney += rent;
      monoLog('🏠 Рента AI: -' + rent + '₴', 'bad');
      updateMonoInfo();
      if(monoState.playerMoney <= 0) return monoGameOver('ai');
    } else {
      monoLog('✅ Ваша власність!', 'good');
    }
  }
  setTimeout(monoAiTurn, 800);
}

function monoPlayerBuy(cell) {
  if(monoState.playerMoney < cell.price) { notify('Недостатньо коштів!', 'error'); setTimeout(monoAiTurn, 500); return; }
  monoState.playerMoney -= cell.price;
  monoState.props[cell.pos] = 'player';
  monoLog('✅ Куплено: ' + cell.label.replace('\n',' ') + ' (-' + cell.price + '₴)', 'good');
  const buyBtn = document.getElementById('monoBuyBtn');
  if(buyBtn) buyBtn.disabled = true;
  renderMonoBoard(); updateMonoInfo();
  setTimeout(monoAiTurn, 800);
}

function monoAiTurn() {
  if(!monoState || monoState.gameOver) return;
  monoState.turn = 'ai';
  setTimeout(() => {
    const d1 = monoRollDie(), d2 = monoRollDie();
    const die1 = document.getElementById('die1');
    const die2 = document.getElementById('die2');
    if(die1) die1.textContent = DICE_EMOJI[d1];
    if(die2) die2.textContent = DICE_EMOJI[d2];
    const steps = d1 + d2;
    monoLog('🤖 AI кидає: ' + d1 + '+' + d2 + '=' + steps);

    if(monoState.jailAi > 0) {
      monoState.jailAi--;
      monoLog('⛓️ AI у в\'язниці. Залишилось: ' + monoState.jailAi);
      monoEndAiTurn(); return;
    }

    const oldPos = monoState.aiPos;
    monoState.aiPos = (monoState.aiPos + steps) % 40;
    if(monoState.aiPos < oldPos) {
      monoState.aiMoney += 200; monoLog('🤖 AI пройшов GO +200₴');
    }
    renderMonoBoard(); updateMonoInfo();
    setTimeout(monoAiAction, 700);
  }, 800);
}

function monoAiAction() {
  if(!monoState || monoState.gameOver) return;
  const cell = MONO_CELLS[monoState.aiPos];
  if(!cell) { monoEndAiTurn(); return; }

  if(cell.pos === 30) {
    monoState.aiPos = 10; monoState.jailAi = 2;
    monoLog('👮 AI у в\'язниці!');
    renderMonoBoard(); monoEndAiTurn(); return;
  }
  if(cell.type === 'tax') {
    const tax = cell.pos === 4 ? 100 : 150;
    monoState.aiMoney -= tax;
    monoLog('💸 AI платить податок: -' + tax + '₴');
    updateMonoInfo();
    if(monoState.aiMoney <= 0) { monoGameOver('player'); return; }
    monoEndAiTurn(); return;
  }
  if(cell.type === 'special') { monoSpecialCard('ai'); monoEndAiTurn(); return; }
  if((cell.type === 'prop' || cell.type === 'station') && cell.price) {
    const owner = monoState.props[cell.pos];
    if(!owner && monoState.aiMoney >= cell.price && Math.random() > 0.25) {
      monoState.aiMoney -= cell.price;
      monoState.props[cell.pos] = 'ai';
      monoLog('🤖 AI купив: ' + cell.label.replace('\n',' '), 'info');
      renderMonoBoard(); updateMonoInfo();
    } else if(owner === 'player') {
      const rent = cell.rent || 25;
      monoState.aiMoney -= rent; monoState.playerMoney += rent;
      monoLog('💰 AI платить ренту: +' + rent + '₴ вам!', 'good');
      updateMonoInfo();
      if(monoState.aiMoney <= 0) { monoGameOver('player'); return; }
    }
  }
  monoEndAiTurn();
}

function monoEndAiTurn() {
  monoState.turn = 'player';
  const rollBtn = document.getElementById('monoRollBtn');
  if(rollBtn) rollBtn.disabled = false;
  monoLog('— Ваш хід —', 'info');
}

function monoSpecialCard(who) {
  const cards = [
    { text:'+100₴ Знахідка!',        dm: 1, da: 0, extra:100 },
    { text:'-75₴ Штраф',             dm:-1, da: 0, extra:75  },
    { text:'+50₴ від банку',         dm: 1, da: 0, extra:50  },
    { text:'+150₴ Дивіденди',        dm: 1, da: 0, extra:150 },
    { text:'-50₴ Ремонт',            dm:-1, da: 0, extra:50  },
    { text:'Вийди з в\'язниці!',     jail:true               },
    { text:'+200₴ Велика удача!',    dm: 1, da: 0, extra:200 },
  ];
  const card = cards[Math.floor(Math.random()*cards.length)];
  if(card.jail) {
    if(who==='player') monoState.jailPlayer=0; else monoState.jailAi=0;
  } else {
    const sign = card.dm;
    if(who==='player') monoState.playerMoney += sign * (card.extra||0);
    else monoState.aiMoney += sign * (card.extra||0);
  }
  monoLog('🃏 ' + (who==='player'?'Ви':'AI') + ': ' + card.text, who==='player'?'good':'info');
  updateMonoInfo(); renderMonoBoard();
  if(monoState.playerMoney <= 0) monoGameOver('ai');
  if(monoState.aiMoney <= 0) monoGameOver('player');
}


function surrenderMonopoly() {
  if(!monoState || monoState.gameOver) return;
  if(confirm('Здатись і програти ставку?')) monoGameOver('ai');
}

function monoGameOver(winner) {
  if(!monoState || monoState.gameOver) return;
  monoState.gameOver = true;
  const rollBtn = document.getElementById('monoRollBtn');
  if(rollBtn) rollBtn.disabled = true;

  const isWin = winner === 'player';
  const prize = Math.floor(monoState.bet * 1.9);
  if(isWin) {
    db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(prize));
    monoLog('🏆 ВИ ПЕРЕМОГЛИ! +' + prize + '₴', 'good');
    addToHistory('Монополія: +' + prize + '₴');
    playSound('win');
    notify('🎩 Перемога в Монополії! +' + prize + '₴', 'success');
  } else {
    monoLog('💀 AI переміг. Гру завершено.', 'bad');
    addToHistory('Монополія: -' + monoState.bet + '₴');
    notify('😔 AI переміг у Монополії', 'error');
  }
  setTimeout(() => {
    const ss = document.getElementById('monoStartScreen');
    const gs = document.getElementById('monoGameScreen');
    if(ss) ss.classList.remove('hidden');
    if(gs) gs.classList.add('hidden');
    monoState = null;
  }, 3000);
}

function monoLog(text, cls) {
  const log = document.getElementById('monoLog');
  if(!log) return;
  const item = document.createElement('div');
  item.className = 'mono-log-item ' + (cls||'');
  item.textContent = text;
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}


