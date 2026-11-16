// ============================================================
// Щоденні місії з серією — картка на Головній.
//
// Три місії доби, прогрес і нагороди рахує СЕРВЕР (lib/missions.js, дії
// missions / missionClaim / streakClaim в api/reward.js). Тут лише екран:
//  - стан читаємо слухачем власного вузла missions/<нік> (правила — лише читання);
//  - слухач живе, поки картка видима, а вкладка відкрита; інакше знімається;
//  - час до скидання — за годинником сервера (поправка serverNow − Date.now()).
// Пул місій і межа доби — shared/missions.js (той самий файл читає сервер).
//
// Старі браузерні «Завдання» (trackQuest/claimQuest у 23-…) замінені цією
// системою: нижче вони вимкнені й нічого не нараховують.
// ============================================================

let _ms = { node: null, ref: null, offset: 0, syncing: false, busy: {}, failedAt: 0, off: false };

// Старі квести: код лишається, але нічого не пише й не платить.
trackQuest = function() {};
loadQuests = function() {};
claimQuest = function() { if(typeof notify === 'function') notify('Завдання замінені щоденними місіями на Головній', 'info'); };

function missionsNow() { return Date.now() + _ms.offset; }
function missionsEl() { return document.getElementById('missionsCard'); }

// Перехід із меню «Ще»: на Головну, до картки.
function openMissions() {
  try { switchTab('home'); if(typeof switchHomeTab === 'function') switchHomeTab('main', document.getElementById('htb-main')); } catch(e) {}
  setTimeout(() => { const el = missionsEl(); if(el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
}

// Видима Головна (сама картка може бути прихована, поки немає даних) + відкрита вкладка браузера + є вхід.
function missionsVisible() {
  const el = missionsEl();
  return !!(currentUser && !_ms.off && el && document.visibilityState === 'visible' && el.parentElement && el.parentElement.offsetParent !== null);
}

function missionsDetach() {
  if(_ms.ref) { try { _ms.ref.off('value', _ms.onValue); } catch(e) {} }
  _ms.ref = null;
}

// Просить сервер створити/оновити вузол доби й повертає поправку годинника.
async function missionsRefresh() {
  if(_ms.syncing) return;
  _ms.syncing = true;
  try {
    const res = await serverApi('/api/reward', { action: 'missions' });
    if(res.mode === 'legacy') { _ms.off = true; missionsDetach(); const el = missionsEl(); if(el) el.classList.add('hidden'); return; }
    if(res.mode === 'server' && res.r) {
      _ms.offset = res.r.serverNow - Date.now();
      if(!_ms.ref) _ms.node = _ms.node || null;
      // Слухач ще не підключений (або мережі не було) — показуємо відповідь сервера.
      if(!_ms.node || _ms.node.day !== res.r.day) _ms.node = missionsNodeFromView(res.r);
      missionsRender();
    } else _ms.failedAt = Date.now();
  } finally { _ms.syncing = false; }
}

// Вузол із відповіді API (на випадок, коли слухач ще не встиг).
function missionsNodeFromView(v) {
  const node = { day: v.day, p: v.missions.map(m => m.id), c: {}, g: {}, cl: {}, s: { n: v.streak.n, last: v.streak.todayDone ? v.day : '', pend: v.streak.pend } };
  v.missions.forEach((m, i) => {
    if(m.kind === 'games') for(let k = 0; k < m.progress; k++) node.g['g' + k] = 1; else node.c[m.kind] = m.progress;
    if(m.claimed) node.cl[i] = true;
  });
  return node;
}

function missionsAttach() {
  if(_ms.ref || !currentUser || typeof db === 'undefined' || !db) return;
  _ms.onValue = snap => { _ms.node = snap.val(); missionsRender(); };
  _ms.ref = db.ref('missions/' + currentUser);
  _ms.ref.on('value', _ms.onValue, () => { missionsDetach(); });
}

function missionProgress(node, t) {
  if(t.kind === 'games') return Math.min(t.target, Object.keys(node.g || {}).length);
  return Math.min(t.target, Number((node.c || {})[t.kind]) || 0);
}

function missionsCountdown() {
  const left = Math.max(0, missionDayEnd(missionsNow()) - missionsNow());
  const h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000);
  return h + ' год ' + String(m).padStart(2, '0') + ' хв';
}

function missionsRender() {
  const el = missionsEl();
  if(!el || _ms.off) return;
  const day = missionDay(missionsNow());
  const node = _ms.node;
  // Вузол із вчорашньої доби (або ще порожній) — чекаємо оновлення від сервера.
  if(!node || node.day !== day || !Array.isArray(node.p)) { el.classList.add('hidden'); return; }
  const byId = {}; MISSION_POOL.forEach(t => { byId[t.id] = t; });
  const picks = node.p.map(id => byId[id]).filter(Boolean);
  if(picks.length !== node.p.length) { el.classList.add('hidden'); return; }

  const s = node.s || {};
  const prev = missionPrevDay(day);
  const streakN = (s.last === day || s.last === prev) ? (Number(s.n) || 0) : 0;
  const pend = Number(s.pend) || 0;
  const doneCount = picks.filter(t => missionProgress(node, t) >= t.target).length;
  const rewardTxt = r => '+' + formatNumber(r.coins) + ' ₴ · +' + r.xp + ' XP';

  const rows = picks.map((t, i) => {
    const prog = missionProgress(node, t);
    const done = prog >= t.target;
    const claimed = !!(node.cl && node.cl[i]);
    const pct = Math.round(prog / t.target * 100);
    const r = MISSION_REWARDS[t.tier];
    const val = t.amount ? '₴' + formatNumber(prog) + ' / ₴' + formatNumber(t.target) : prog + ' / ' + t.target;
    const act = claimed
      ? '<span class="badge is-pos"><span class="ic i-check" aria-hidden="true"></span>Забрано</span>'
      : done
        ? '<button type="button" class="btn btn-primary btn-sm" data-mission="' + i + '" onclick="missionClaim(' + i + ')"' + (_ms.busy['m' + i] ? ' disabled aria-busy="true"' : '') + '>Забрати</button>'
        : '<span class="mission-reward">' + rewardTxt(r) + '</span>';
    return '<li class="mission-row' + (claimed ? ' is-claimed' : done ? ' is-done' : '') + '">' +
      '<span class="mission-ic"><span class="ic i-' + escapeHtml(t.icon) + '" aria-hidden="true"></span></span>' +
      '<div class="mission-body"><div class="mission-title">' + escapeHtml(t.title) + '</div>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + t.target + '" aria-valuenow="' + prog + '"><span style="width:' + pct + '%"></span></div>' +
      '<div class="mission-meta"><span>' + val + '</span>' + (done && !claimed ? '<span class="mission-reward">' + rewardTxt(r) + '</span>' : '') + '</div></div>' +
      '<div class="mission-act">' + act + '</div></li>';
  }).join('');

  const steps = MISSION_STREAK_LADDER.map((st, k) => {
    const n = k + 1;
    const cls = n < streakN || (n === streakN && !pend) ? ' is-done' : n === streakN ? ' is-now' : '';
    return '<li class="streak-step' + cls + '" title="День ' + n + '"><span class="streak-n">' + n + '</span>' +
      '<span class="streak-v">' + (st.box ? '<span class="ic i-package" aria-hidden="true"></span>' : formatNumber(st.coins)) + '</span></li>';
  }).join('');
  const streakBtn = pend
    ? '<button type="button" class="btn btn-primary btn-sm" onclick="missionStreakClaim()"' + (_ms.busy.streak ? ' disabled aria-busy="true"' : '') + '>Забрати день ' + pend + '</button>'
    : '';

  el.classList.remove('hidden');
  el.innerHTML =
    '<div class="panel-head"><h2 class="panel-title"><span class="ic i-target" aria-hidden="true"></span> Місії дня</h2>' +
    '<span class="badge"><span class="ic i-timer" aria-hidden="true"></span><span data-mission-timer>' + missionsCountdown() + '</span></span></div>' +
    '<ul class="mission-list">' + rows + '</ul>' +
    '<div class="streak-box"><div class="streak-head"><span class="streak-title"><span class="ic i-fire" aria-hidden="true"></span> Серія: ' + streakN + ' ' + (streakN === 1 ? 'день' : 'дн.') + '</span>' +
    '<span class="streak-note">' + (doneCount === picks.length ? 'Сьогодні виконано' : 'Виконай усі три — серія зросте') + '</span></div>' +
    '<ol class="streak-ladder">' + steps + '</ol>' + (streakBtn ? '<div class="streak-act">' + streakBtn + '</div>' : '') + '</div>';
}

async function missionClaim(i) {
  if(_ms.busy['m' + i]) return;
  _ms.busy['m' + i] = true; missionsRender();
  try {
    const res = await serverReward('missionClaim', { i });
    if(res.mode === 'server' && res.r) {
      try { playSound('win'); } catch(e) {}
      notify('Місію виконано: +' + formatNumber(res.r.coins) + ' ₴ і ' + res.r.xp + ' XP Battle Pass', 'success');
    }
  } finally { delete _ms.busy['m' + i]; missionsRender(); }
}

async function missionStreakClaim() {
  if(_ms.busy.streak) return;
  _ms.busy.streak = true; missionsRender();
  try {
    const res = await serverReward('streakClaim');
    if(res.mode === 'server' && res.r) {
      try { playSound('win'); } catch(e) {}
      notify('Серія, день ' + res.r.day + ': +' + formatNumber(res.r.coins) + ' ₴' + (res.r.box ? ' і скриня Battle Pass' : ''), 'success');
    }
  } finally { delete _ms.busy.streak; missionsRender(); }
}

// Раз на секунду: слухач — лише поки картка видима; таймер; нова доба → оновлення.
let _msLastDay = '';
setInterval(() => {
  if(!missionsVisible()) { if(_ms.ref) missionsDetach(); return; }
  if(!_ms.ref) { missionsAttach(); if(!_ms.node && Date.now() - _ms.failedAt > 15000) missionsRefresh(); }
  const day = missionDay(missionsNow());
  if(day !== _msLastDay || !_ms.node || _ms.node.day !== day) {
    _msLastDay = day;
    if(Date.now() - _ms.failedAt > 15000) missionsRefresh();
  }
  const t = document.querySelector('#missionsCard [data-mission-timer]');
  if(t) t.textContent = missionsCountdown();
}, 1000);
document.addEventListener('visibilitychange', () => { if(document.visibilityState !== 'visible') missionsDetach(); });
