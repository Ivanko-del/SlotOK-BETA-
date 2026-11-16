// ============================================================
// Рейтингові ліги — екран «Ліги», картка на Головній, значок у профілі.
//
// Рейтинг рахує СЕРВЕР (lib/leagues.js; дії league / leagueClaim в api/reward.js)
// після розрахунку онлайн-кімнат. Тут лише показ:
//  - стан — відповідь сервера; таблиця топ-50 сезону — одноразове читання
//    league_pub/<сезон> (orderByChild('rating').limitToLast(50));
//  - власний вузол league/<нік> слухаємо, поки вкладка браузера видима, лише щоб
//    показати «+12 рейтингу» після партії; прихована — слухач знімається.
// Ігри, ліги й сезон — shared/leagues.js (той самий файл читає сервер).
// ============================================================

let _lg = { st: null, offset: 0, ref: null, lastT: null, busy: false, at: 0, board: null };

function leagueGameName(g) { return (typeof LEAGUE_GAMES !== 'undefined' && LEAGUE_GAMES[g]) || g; }
function leagueSeasonId() { return leagueSeason(Date.now() + _lg.offset).id; }
function leagueBadge(tierId, rating) {
  const t = LEAGUE_TIERS.find(x => x.id === tierId) || LEAGUE_TIERS[0];
  return `<span class="badge league-badge tier-${t.id}"><span class="ic i-${t.icon}" aria-hidden="true"></span>${escapeHtml(t.name)}${rating != null ? ` · <span class="num">${rating | 0}</span>` : ''}</span>`;
}

async function leagueLoad(force) {
  if(_lg.busy || !currentUser) return _lg.st;
  if(!force && _lg.st && Date.now() - _lg.at < 30000) return _lg.st;
  _lg.busy = true;
  try {
    const res = await serverApi('/api/reward', { action: 'league' });
    if(res.mode === 'server' && res.r) { _lg.st = res.r; _lg.offset = res.r.serverNow - Date.now(); _lg.at = Date.now(); }
    else if(res.mode === 'legacy') _lg.st = null;
  } finally { _lg.busy = false; }
  return _lg.st;
}

function openLeagues() { switchTab('leagues'); leaguesShow(); }

async function leaguesShow() {
  const el = document.getElementById('leaguesBody');
  if(!el) return;
  if(!_lg.st) el.innerHTML = '<div class="room-empty">Завантаження…</div>';
  const st = await leagueLoad(true);
  if(!st) { el.innerHTML = '<div class="room-empty">Ліги з’являться, щойно сервер буде налаштований.</div>'; return; }
  leaguesRender(st);
  leaguesBoard();
}

function leaguesRender(st) {
  const el = document.getElementById('leaguesBody');
  if(!el) return;
  const t = LEAGUE_TIERS.find(x => x.id === st.tier) || LEAGUE_TIERS[0];
  const days = Math.max(0, Math.ceil((st.season.end - (Date.now() + _lg.offset)) / 86400000));
  const idx = LEAGUE_TIERS.indexOf(t), nxt = LEAGUE_TIERS[idx + 1];
  const pct = nxt ? Math.max(0, Math.min(100, Math.round((st.rating - t.from) / (nxt.from - t.from) * 100))) : 100;
  const pend = (st.pending || []);
  const recent = (st.recent || []).map(e => `<div class="list-row league-res">
      <span class="list-row-main"><span class="list-row-title">${escapeHtml(leagueGameName(e.game))}</span><span class="list-row-sub">${e.res === 'w' ? 'Перемога' : 'Поразка'} · ${(e.opp || []).map(escapeHtml).join(', ')}</span></span>
      <span class="num league-delta ${e.d >= 0 ? 'is-pos' : 'is-neg'}">${e.d >= 0 ? '+' : ''}${e.d}</span></div>`).join('');
  el.innerHTML = `
    <section class="panel is-featured league-hero tier-${t.id}">
      <div class="league-hero-top"><span class="ic i-${t.icon} league-hero-ic" aria-hidden="true"></span>
        <div><div class="league-tier-name">${escapeHtml(t.name)}</div><div class="league-rating num">${st.rating | 0}</div></div></div>
      <div class="league-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      <div class="league-sub">${nxt ? `До ліги «${escapeHtml(nxt.name)}» — ${nxt.from - st.rating}` : 'Найвища ліга'} · Сезон ${escapeHtml(st.season.id)}, ще ${days} дн.</div>
      <div class="league-sub">Партій: <span class="num">${st.games}</span> · перемог <span class="num">${st.wins}</span> · поразок <span class="num">${st.losses}</span></div>
    </section>
    ${pend.length ? `<section class="panel league-claim"><div class="panel-head"><h2 class="panel-title">Нагорода за сезон</h2></div>
      ${pend.map(p => `<div class="league-sub">${escapeHtml(p.season)}: ${leagueBadge(p.tier)} · ₴<span class="num">${formatNumber(p.coins)}</span>${p.badge ? ' + значок' : ''}</div>`).join('')}
      <button type="button" class="btn btn-primary" onclick="leagueClaim(this)">Забрати</button></section>` : ''}
    <section class="panel"><div class="panel-head"><h2 class="panel-title">Останні партії</h2></div>
      ${recent ? `<div class="list">${recent}</div>` : '<div class="room-empty">Ще немає рейтингових партій — зіграй у Дурня, Вісімку, Лудо, Морський бій, Сапер-дуель чи Texas Hold’em з живим суперником.</div>'}</section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">Топ-50 сезону</h2></div><div id="leaguesBoard" class="list"><div class="room-empty">Завантаження…</div></div></section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">Ліги й нагороди</h2></div>
      <div class="list">${LEAGUE_TIERS.map(x => `<div class="list-row"><span class="ic i-${x.icon}" aria-hidden="true"></span><span class="list-row-main"><span class="list-row-title">${escapeHtml(x.name)}</span><span class="list-row-sub">від ${x.from}</span></span><span class="num">₴${formatNumber(x.coins)}${x.badge ? ' + значок' : ''}</span></div>`).join('')}</div>
      <div class="league-sub">Рейтинг рахує сервер за партіями з живими суперниками (ставка не впливає). Нагороду за сезон дають від ${LEAGUE_MIN_GAMES} партій; новий сезон — щомісяця, рейтинг наполовину повертається до ${LEAGUE_START}. Проти одного суперника — до ${LEAGUE_PAIR_DAILY} рейтингових партій за добу.</div></section>`;
}

function leaguesBoard() {
  const el = document.getElementById('leaguesBoard');
  if(!el || !db) return;
  db.ref('league_pub/' + leagueSeasonId()).orderByChild('rating').limitToLast(LEAGUE_TOP).once('value').then(snap => {
    const rows = [];
    snap.forEach(c => { const v = c.val(); if(v && typeof v.nick === 'string') rows.push(v); });
    rows.sort((a, b) => b.rating - a.rating || b.games - a.games);
    const me = rows.findIndex(r => r.nick === currentUser);
    if(!rows.length) { el.innerHTML = '<div class="room-empty">Таблиця сезону поки порожня.</div>'; return; }
    el.innerHTML = (me < 0 && _lg.st ? `<div class="league-sub">Твоє місце: поза топ-${LEAGUE_TOP} · <span class="num">${_lg.st.rating | 0}</span></div>` : me >= 0 ? `<div class="league-sub">Твоє місце: <span class="num">${me + 1}</span></div>` : '')
      + rows.map((r, i) => `<button type="button" class="list-row${r.nick === currentUser ? ' is-mine' : ''}" onclick="openPublicProfile(${jsArg(r.nick)})"><span class="num league-pos">${i + 1}</span><span class="list-row-main"><span class="list-row-title" data-pn="${escapeHtml(r.nick)}">${escapeHtml(r.nick)}</span><span class="list-row-sub">Партій: ${r.games | 0}</span></span>${leagueBadge(r.tier, r.rating)}</button>`).join('');
    if(typeof applyPlayerStyles === 'function') try { applyPlayerStyles(); } catch(e) {}
  }, () => { el.innerHTML = '<div class="room-empty">Таблиця з’явиться після публікації правил бази.</div>'; });
}

async function leagueClaim(btn) {
  if(btn) btn.disabled = true;
  const res = await serverApi('/api/reward', { action: 'leagueClaim' });
  if(res.mode === 'server') {
    notify(`Нагороду отримано: ₴${formatNumber(res.r.coins)}${res.r.badges && res.r.badges.length ? ' і значок' : ''}`, 'success');
    if(typeof res.r.balance === 'number' && typeof updateBalanceUI === 'function') try { updateBalanceUI(); } catch(e) {}
    await leaguesShow();
  } else if(btn) btn.disabled = false;
}

// «+12 рейтингу» після партії: слухаємо власний вузол, поки вкладка видима.
function leaguesWatch() {
  const want = !!(currentUser && db && document.visibilityState === 'visible');
  if(!want) { if(_lg.ref) { try { _lg.ref.off('value', _lg.onValue); } catch(e) {} _lg.ref = null; } return; }
  if(_lg.ref) return;
  _lg.ref = db.ref('league/' + currentUser);
  _lg.onValue = (snap) => {
    const v = snap.val();
    const rec = (v && v.recent) || [];
    const top = rec.length ? Math.max.apply(null, rec.map(e => e.t || 0)) : 0;
    if(_lg.lastT === null) { _lg.lastT = top; return; }
    rec.filter(e => (e.t || 0) > _lg.lastT).sort((a, b) => a.t - b.t).forEach(e => {
      notify(`${e.d >= 0 ? '+' : ''}${e.d} рейтингу · ${leagueGameName(e.game)}`, e.d >= 0 ? 'success' : 'info');
    });
    _lg.lastT = Math.max(_lg.lastT, top);
    _lg.at = 0;
    if(!document.getElementById('tab-leagues').classList.contains('hidden')) leaguesShow(); else leagueCardRender();
  };
  _lg.ref.on('value', _lg.onValue, () => { _lg.ref = null; });
}
document.addEventListener('visibilitychange', leaguesWatch);
setInterval(() => { if(!_lg.ref) leaguesWatch(); }, 5000);

// Картка на Головній (показується лише коли сервер відповів).
async function leagueCardRender() {
  const el = document.getElementById('leagueCard');
  if(!el || !currentUser || document.visibilityState !== 'visible' || !el.parentElement || el.parentElement.offsetParent === null) return;
  const st = await leagueLoad(false);
  if(!st) return;
  el.classList.remove('hidden');
  el.innerHTML = `<button type="button" class="list-row league-card-btn" onclick="openLeagues()"><span class="ic i-trophy" aria-hidden="true"></span><span class="list-row-main"><span class="list-row-title">Ліги</span><span class="list-row-sub">Сезон ${escapeHtml(st.season.id)} · партій ${st.games}</span></span>${leagueBadge(st.tier, st.rating)}${(st.pending || []).length ? '<span class="badge is-accent">нагорода</span>' : ''}</button>`;
}
setInterval(leagueCardRender, 20000);
setTimeout(leagueCardRender, 3000);

// Значок ліги в публічному профілі (викликає openPublicProfile).
function leagueProfileBadge(name) {
  if(!db) return;
  db.ref('league_pub/' + leagueSeasonId() + '/' + name).once('value').then(s => {
    const v = s.val(), box = document.querySelector('#pubProfileContent .pub-badges');
    if(!v || !box || typeof v.tier !== 'string') return;
    box.insertAdjacentHTML('afterbegin', `<span onclick="closeTabModal('pub-profile-modal');openLeagues()" role="button" tabindex="0">${leagueBadge(v.tier, v.rating | 0)}</span>`);
  }, () => {});
}
