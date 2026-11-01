// ============================================================
// ===== СЛОТІКИ — магазин =====
// Каталог, ціни й ефекти — shared/shop.js (SHOP_ITEMS, SLOTIKY_PACKS, …),
// той самий файл читає сервер. Купівлю, бусти, скрині й предмети рахує
// api/reward.js (lib/shop.js); тут лише екран. Без сервера (503) працює
// старий шлях у браузері — тоді бусти не діють (їх рахує лише сервер).
// ============================================================
let _shopTab = 'style';

const SHOP_TAB_TYPES = { style: ['frame', 'nick', 'plate', 'badge'], boost: ['boost'], item: ['item'] };
const SHOP_TYPE_TITLES = { frame: 'Рамка аватара', nick: 'Колір ніку', plate: 'Табличка імені', badge: 'Значок біля ніку', boost: 'Бусти', item: 'Предмети' };

function slotikyWord(n) {
  n = Math.abs(n) % 100;
  const d = n % 10;
  if(n > 10 && n < 20) return 'Слотіків';
  if(d === 1) return 'Слотік';
  if(d >= 2 && d <= 4) return 'Слотіки';
  return 'Слотіків';
}

function initSlotiky() {
  const bal = document.getElementById('slotikyBalance');
  if(bal) bal.textContent = formatNumber(userData.slotiky || 0);
  const rate = document.getElementById('slotikyRateLbl');
  if(rate) rate.textContent = SLOTIKY_PRICE.toLocaleString('uk-UA');
  renderSlotikyPacks();
  renderSlotikyShop();
}

function renderSlotikyPacks() {
  const el = document.getElementById('slotikyPacks');
  if(!el) return;
  el.innerHTML = SLOTIKY_PACKS.map(p => `
    <button type="button" class="shop-pack" onclick="buySlotiky(${p.n})">
      ${p.tag ? `<span class="badge is-pos">${p.tag}</span>` : ''}
      <span class="shop-pack-n num">${p.n} <span class="ic i-coin" aria-hidden="true"></span></span>
      <span class="shop-pack-price num">${p.price.toLocaleString('uk-UA')} ₴</span>
    </button>`).join('');
}

function setShopTab(tab) {
  _shopTab = tab;
  document.querySelectorAll('#tab-slotiky [data-shop-tab]').forEach(b => {
    const on = b.dataset.shopTab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  renderSlotikyShop();
}

async function buySlotiky(n) {
  const pack = SLOTIKY_PACKS.find(p => p.n === n);
  if(!pack) return;
  if((userData.balance || 0) < pack.price) return notify('Недостатньо коштів: потрібно ' + formatNumber(pack.price) + ' ₴', 'error');
  const ok = await confirmAction({
    title: 'Купити ' + n + ' ' + slotikyWord(n) + '?',
    text: 'З балансу спишеться ' + pack.price.toLocaleString('uk-UA') + ' ₴.',
    confirm: 'Купити',
  });
  if(!ok) return;
  const srv = await serverReward('buySlotiky', { n });
  if(srv.mode === 'error') return;
  if(srv.mode === 'legacy') {
    const tx = await db.ref('users/' + currentUser + '/balance').transaction(b => (b == null || b < pack.price) ? undefined : b - pack.price);
    if(!tx.committed) return notify('Недостатньо коштів', 'error');
    await db.ref('users/' + currentUser + '/slotiky').set(firebase.database.ServerValue.increment(n));
    addToHistory('Куплено ' + n + ' ' + slotikyWord(n) + ': -' + formatNumber(pack.price) + '₴');
  }
  userData.slotiky = srv.mode === 'server' ? srv.r.slotiky : (userData.slotiky || 0) + n;
  playSound('bonus');
  notify('Куплено ' + n + ' ' + slotikyWord(n), 'success');
  initSlotiky();
}

function shopItemState(it, items, now) {
  const rec = items[it.id];
  if(SHOP_TAB_TYPES.style.includes(it.type)) return rec ? 'owned' : 'buy';
  if(it.type === 'boost') return boostActive(rec, now) ? 'active' : 'buy';
  return 'buy';
}

function shopCounterOf(it) {
  if(!it.counter) return 0;
  return it.counter.split('/').reduce((o, k) => (o && typeof o === 'object') ? o[k] : 0, userData) || 0;
}

function shopCardHtml(it, items, worn, now) {
  const st = shopItemState(it, items, now);
  const isWorn = worn[it.type] === it.id;
  let meta = '', action = '';
  if(st === 'owned') {
    action = isWorn
      ? `<button type="button" class="btn btn-secondary btn-sm btn-block" onclick="equipCosmetic('${it.type}', null)">Зняти</button>`
      : `<button type="button" class="btn btn-primary btn-sm btn-block" onclick="equipCosmetic('${it.type}', '${it.id}')">Надіти</button>`;
    meta = isWorn ? '<span class="badge is-pos">Надіто</span>' : '<span class="badge">Куплено</span>';
  } else {
    if(st === 'active') {
      const left = Math.max(1, Math.ceil((items[it.id].expires - now) / 86400000));
      meta = `<span class="badge is-pos">Діє ще ${left} дн.</span>`;
    }
    const have = shopCounterOf(it);
    if(it.type === 'item' && have > 0) meta = `<span class="badge">У вас: ${have}</span>`;
    action = `<button type="button" class="btn ${st === 'active' ? 'btn-secondary' : 'btn-primary'} btn-sm btn-block" onclick="buyShopItem('${it.id}')">
      ${st === 'active' ? 'Продовжити' : 'Купити'} · ${it.price} <span class="ic i-coin" aria-hidden="true"></span></button>`;
  }
  const preview = SHOP_TAB_TYPES.style.includes(it.type)
    ? `<div class="shop-preview">${cosmeticPreviewHtml(it)}</div>`
    : `<span class="shop-card-ic"><span class="ic i-${it.icon}" aria-hidden="true"></span></span>`;
  return `<div class="shop-card${isWorn ? ' is-worn' : ''}">
    ${preview}
    <div class="shop-card-body">
      <div class="shop-card-title">${it.name}</div>
      <div class="shop-card-desc">${it.desc}</div>
      ${meta}
    </div>
    ${action}
  </div>`;
}

function renderSlotikyShop() {
  const grid = document.getElementById('slotikyShopGrid');
  if(!grid) return;
  const items = userData.slotikyItems || {};
  const now = Date.now();
  const worn = resolveCosmetics(items, userData.cosmetics);
  if(_shopTab === 'inv') { grid.innerHTML = shopInventoryHtml(items, worn, now); return; }
  const types = SHOP_TAB_TYPES[_shopTab] || [];
  grid.innerHTML = types.map(type => {
    const list = SHOP_ITEMS.filter(i => i.type === type);
    return (types.length > 1 ? `<h3 class="shop-group-title">${SHOP_TYPE_TITLES[type]}</h3>` : '') + `
      <div class="shop-grid">${list.map(it => shopCardHtml(it, items, worn, now)).join('')}</div>`;
  }).join('') + (_shopTab === 'boost' ? '<p class="field-hint">Бусти рахує сервер: множник діє на ставки й бонуси, поки буст активний. Повторна купівля продовжує строк.</p>' : '');
}

// «Моє»: надіте, активні бусти, предмети з кількістю, скрині з кнопкою «Відкрити».
function shopInventoryHtml(items, worn, now) {
  const rows = [];
  const wornList = COSMETIC_SLOTS.map(s => worn[s] && shopItem(worn[s])).filter(Boolean);
  rows.push(`<h3 class="shop-group-title">Надіто</h3>` + (wornList.length
    ? `<div class="list">${wornList.map(it => `<div class="list-row"><span class="list-row-main"><span class="list-row-title">${it.name}</span><span class="list-row-sub">${SHOP_TYPE_TITLES[it.type]}</span></span></div>`).join('')}</div>`
    : '<p class="field-hint">Нічого. Рамки, кольори ніку й значки — у розділі «Стиль».</p>'));
  const boosts = SHOP_ITEMS.filter(it => it.type === 'boost' && boostActive(items[it.id], now));
  rows.push(`<h3 class="shop-group-title">Активні бусти</h3>` + (boosts.length
    ? `<div class="list">${boosts.map(it => `<div class="list-row"><span class="list-row-main"><span class="list-row-title">${it.name}</span><span class="list-row-sub">до ${new Date(items[it.id].expires).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></span></div>`).join('')}</div>`
    : '<p class="field-hint">Немає активних бустів.</p>'));
  const counters = [
    { label: 'Фріспіни по ' + formatNumber(SHOP_SPIN_STAKE) + ' ₴', where: 'Слоти «777»', n: userData.shopSpins || 0, go: 'slots' },
    { label: 'Прокрутки Колеса по ' + formatNumber(SHOP_SPIN_STAKE) + ' ₴', where: 'Колесо фортуни', n: userData.shopFortune || 0, go: 'fortune' },
    { label: 'Прокрутки Колеса по ' + formatNumber(FREE_FORTUNE_STAKE) + ' ₴', where: 'Колесо фортуни · з Battle Pass', n: userData.freeFortune || 0, go: 'fortune' },
    { label: 'Підказки в Мінах', where: 'Міни', n: userData.minesHints || 0, go: 'mines' },
    { label: 'Страховки Крашу', where: 'Краш', n: Number(userData.crashInsurance) || 0, go: 'crash' },
  ].filter(c => c.n > 0);
  rows.push(`<h3 class="shop-group-title">Предмети</h3>` + (counters.length
    ? `<div class="list">${counters.map(c => `<button type="button" class="list-row" onclick="openGame('${c.go}')"><span class="list-row-main"><span class="list-row-title">${c.label}</span><span class="list-row-sub">${c.where}</span></span><span class="badge num">${c.n}</span><span class="ic i-chevron-right list-row-end" aria-hidden="true"></span></button>`).join('')}</div>`
    : '<p class="field-hint">Предметів немає.</p>'));
  const inv = userData.lootboxInv || {};
  const boxes = Object.keys(SHOP_BOXES).filter(t => inv[t] > 0);
  rows.push(`<h3 class="shop-group-title">Скрині</h3>` + (boxes.length
    ? `<div class="list">${boxes.map(t => `<div class="list-row"><span class="list-row-main"><span class="list-row-title">${SHOP_BOXES[t].name}</span><span class="list-row-sub">Виграш до ×${Math.max.apply(null, SHOP_BOXES[t].prizes.map(p => p.mult))} від ${formatNumber(SHOP_BOXES[t].value)} ₴</span></span><span class="badge num">${inv[t]}</span><button type="button" class="btn btn-primary btn-sm btn-inline" onclick="openShopBox('${t}')">Відкрити</button></div>`).join('')}</div>`
    : '<p class="field-hint">Скринь немає. Їх можна купити в «Предметах» або отримати в Battle Pass.</p>'));
  return rows.join('');
}

async function buyShopItem(itemId) {
  const it = shopItem(itemId);
  if(!it) return;
  const have = userData.slotiky || 0;
  if(have < it.price) return notify('Потрібно ' + it.price + ' ' + slotikyWord(it.price) + '. У вас: ' + have, 'error');
  const ok = await confirmAction({ title: it.name, text: it.desc + '. Ціна: ' + it.price + ' ' + slotikyWord(it.price) + '.', confirm: 'Купити' });
  if(!ok) return;
  const srv = await serverReward('shopBuy', { item: itemId });
  if(srv.mode === 'error') return;
  const items = userData.slotikyItems = userData.slotikyItems || {};
  const now = Date.now();
  if(srv.mode === 'legacy') {
    const tx = await db.ref('users/' + currentUser + '/slotiky').transaction(c => (c == null || c < it.price) ? undefined : c - it.price);
    if(!tx.committed) return notify('Недостатньо Слотіків', 'error');
    const rec = it.type === 'boost'
      ? { boughtAt: now, expires: Math.max((items[itemId] || {}).expires || 0, now) + it.days * 86400000 }
      : { boughtAt: now };
    await db.ref('users/' + currentUser + '/slotikyItems/' + itemId).set(rec);
    if(it.counter) await db.ref('users/' + currentUser + '/' + it.counter).set(firebase.database.ServerValue.increment(it.qty));
    items[itemId] = rec;
    userData.slotiky = have - it.price;
  } else {
    userData.slotiky = srv.r.slotiky;
    items[itemId] = it.type === 'boost' ? { boughtAt: now, expires: srv.r.expires } : { boughtAt: now };
    if(it.counter && srv.r.count !== undefined) {
      const path = it.counter.split('/');
      let o = userData;
      for(let i = 0; i < path.length - 1; i++) o = o[path[i]] = o[path[i]] || {};
      o[path[path.length - 1]] = srv.r.count;
    }
  }
  playSound('bonus');
  notify('Придбано: ' + it.name, 'success');
  initSlotiky();
  invalidatePlayerStyle(currentUser);
}

function equipCosmetic(slot, id) {
  if(!currentUser || !COSMETIC_SLOTS.includes(slot)) return;
  if(id && !(userData.slotikyItems || {})[id]) return;
  userData.cosmetics = Object.assign({}, userData.cosmetics || {}, { [slot]: id || null });
  // null у виборі — «нічого не надіто», тож пишемо false, щоб база не стерла ключ
  db.ref('users/' + currentUser + '/cosmetics/' + slot).set(id || false);
  userData.cosmetics[slot] = id || false;
  invalidatePlayerStyle(currentUser);
  renderSlotikyShop();
}

let _boxOpening = false;
async function openShopBox(tier) {
  const box = SHOP_BOXES[tier];
  if(!box || _boxOpening) return;
  _boxOpening = true;
  try {
    const srv = await serverReward('openBox', { tier });
    if(srv.mode === 'error') return;
    let win;
    if(srv.mode === 'server') {
      win = srv.r.win;
      userData.lootboxInv = Object.assign({}, userData.lootboxInv, { [tier]: srv.r.left });
    } else {
      const tx = await db.ref('users/' + currentUser + '/lootboxInv/' + tier).transaction(c => (c > 0 ? c - 1 : undefined));
      if(!tx.committed) return notify('Таких скринь немає', 'error');
      const total = box.prizes.reduce((s, p) => s + p.weight, 0);
      let r = Math.random() * total, prize = box.prizes[box.prizes.length - 1];
      for(const p of box.prizes) { if(r < p.weight) { prize = p; break; } r -= p.weight; }
      win = Math.floor(box.value * prize.mult);
      await db.ref('users/' + currentUser + '/balance').set(firebase.database.ServerValue.increment(win));
      addToHistory(box.name + ': +' + formatNumber(win) + '₴');
    }
    playSound(win >= box.value ? 'win' : 'click');
    notify(box.name + ': +' + formatNumber(win) + ' ₴', win >= box.value ? 'success' : 'info');
    renderSlotikyShop();
  } finally { _boxOpening = false; }
}

// ── Предмети в самих іграх: панель над головною кнопкою ──
const GAME_ITEM_ANCHORS = { slots: 'slotsSpinBtn', fortune: 'fortuneBtn', mines: 'minesGrid', crash: 'crashBtn' };
function renderGameItems(game) {
  const anchor = document.getElementById(GAME_ITEM_ANCHORS[game]);
  if(!anchor || !userData) return;
  let bar = document.getElementById('gameItems-' + game);
  if(!bar) {
    bar = document.createElement('div');
    bar.id = 'gameItems-' + game;
    bar.className = 'game-items';
    anchor.before(bar);
  }
  const btn = (fn, label, n) => `<button type="button" class="btn btn-secondary btn-sm btn-inline" onclick="${fn}">${label}<span class="badge num">${n}</span></button>`;
  const parts = [];
  if(game === 'slots' && userData.shopSpins > 0) parts.push(btn('spinSlotsShop()', 'Фріспін ' + formatNumber(SHOP_SPIN_STAKE) + ' ₴', userData.shopSpins));
  if(game === 'fortune') {
    if(userData.shopFortune > 0) parts.push(btn("spinFortune('shop')", 'Прокрутка ' + formatNumber(SHOP_SPIN_STAKE) + ' ₴', userData.shopFortune));
    if(userData.freeFortune > 0) parts.push(btn("spinFortune('free')", 'Прокрутка ' + formatNumber(FREE_FORTUNE_STAKE) + ' ₴', userData.freeFortune));
  }
  if(game === 'mines' && userData.minesHints > 0) parts.push(btn('minesHint()', '<span class="ic i-bulb" aria-hidden="true"></span> Підказка', userData.minesHints));
  const ins = Number(userData.crashInsurance) || 0;
  if(game === 'crash' && ins > 0) parts.push(`<label class="game-items-check"><input type="checkbox" id="crashInsure"> Застрахувати раунд: вибух до ×${CRASH_INSURANCE_BELOW.toFixed(2)} — ставка повертається <span class="badge num">${ins}</span></label>`);
  bar.innerHTML = parts.join('');
  bar.classList.toggle('hidden', !parts.length);
}

// Разове повернення Слотіків за прибрані товари (v121) — робить сервер.
async function runShopMigration() {
  if(!currentUser || userData.shopV2) return;
  const srv = await serverReward('shopMigrate');
  if(srv.mode === 'server' && srv.r.refund > 0) {
    notify('Магазин оновлено: за прибрані товари повернуто ' + srv.r.refund + ' ' + slotikyWord(srv.r.refund), 'info');
  }
}

// ============================================================
// ===== ТУРНІР — ПОВНА СИСТЕМА =====
// ============================================================
let activeTournament = null; // tournament the user joined

const TOURNEY_GAMES = [
  { id:'t_crash',   name:'Турнір Краш',   icon:'🚀', desc:'Множник × точки',    game:'crash',   pointMult: 1    },
  { id:'t_slots',   name:'Турнір Слоти',  icon:'🎰', desc:'Виграш → очки',      game:'slots',   pointMult: 0.5  },
  { id:'t_mines',   name:'Турнір Міни',   icon:'💣', desc:'Відкрий клітинки',   game:'mines',   pointMult: 2    },
  { id:'t_plinko',  name:'Турнір Плінко', icon:'🔻', desc:'Множник × ставку',   game:'plinko',  pointMult: 1.5  },
  { id:'t_tower',   name:'Турнір Вежа',   icon:'🗼', desc:'Рівень × ставку',    game:'tower',   pointMult: 3    },
  { id:'t_limbo',   name:'Турнір Лімбо',  icon:'🎯', desc:'Мета × точки',       game:'limbo',   pointMult: 1    },
  { id:'t_dice',    name:'Турнір Кубик',  icon:'🎲', desc:'Виграш → очки',      game:'dice',    pointMult: 1    },
  { id:'t_hilo',    name:'Турнір Hi-Lo',  icon:'🃏', desc:'Серія → очки',       game:'hilo',    pointMult: 2    },
];

function switchTourneyTab(tab, el) {
  document.querySelectorAll('#tab-tournaments .cashier-tab-btn').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  ['active','mine','games'].forEach(t => {
    const p = document.getElementById('tourney-panel-'+t);
    if(p) p.classList.toggle('hidden', t!==tab);
  });
  if(tab==='active') loadTournamentsV2();
  if(tab==='mine')   loadMyTournaments();
  if(tab==='games')  renderTourneyGames();
}

function loadTournamentsV2() {
  db.ref('tournaments').once('value', snap => {
    const data = snap.val();
    const list = document.getElementById('tournamentsList');
    if(!list) return;
    if(!data) { list.innerHTML = '<div style="color:var(--fg-4);padding:30px;text-align:center;">Немає активних турнірів</div>'; return; }
    list.innerHTML = '';
    Object.entries(data).forEach(([id, t]) => {
      const endTime = t.startTime + t.duration * 3600000;
      const msLeft = endTime - Date.now();
      const hoursLeft = Math.max(0, Math.floor(msLeft / 3600000));
      const minsLeft  = Math.max(0, Math.floor((msLeft % 3600000) / 60000));
      const isActive  = msLeft > 0;
      const card = document.createElement('div');
      card.className = 'tournament-card';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-size:16px;font-weight:bold;">${t.icon||'🏆'} ${t.name}</div>
          <span style="font-size:10px;background:${isActive?'rgb(var(--pos-rgb) / 0.2)':'rgb(var(--neg-rgb) / 0.2)'};color:${isActive?'var(--green)':'var(--red)'};padding:3px 8px;border-radius:var(--r-md);font-weight:bold;">${isActive?'🟢 LIVE':'🔴 Завершено'}</span>
        </div>
        <div style="background:linear-gradient(135deg,var(--surface-1),var(--bg));border-radius:var(--r-md);padding:12px;margin-bottom:10px;">
          <div style="font-size:24px;font-weight:900;color:var(--accent);text-align:center;">🏆 ${formatNumber(t.prize)} ₴</div>
          <div style="font-size:10px;color:var(--fg-4);text-align:center;margin-top:2px;">Перше місце</div>
        </div>
        <div style="font-size:11px;color:var(--fg-3);margin-bottom:10px;">
          ⏱ ${isActive ? `Залишилось: ${hoursLeft}год ${minsLeft}хв` : 'Турнір завершено'} •
          👥 Ігри: ${(t.allowedGames||['crash','slots','mines']).join(', ')}
        </div>
        <div id="t-lb-${id}" style="margin-bottom:10px;"></div>
        ${isActive ? `<button class="btn-gold" style="padding:10px;" onclick="joinTournamentV2('${id}','${t.name}',${t.prize})">🎯 Взяти участь</button>` : ''}
      `;
      list.appendChild(card);
      loadTournamentLeaderboard(id);
    });
  });
}

function loadMyTournaments() {
  const el = document.getElementById('myTournamentsList'); if(!el) return;
  db.ref('tournament_scores').once('value', snap => {
    const all = snap.val() || {};
    const mine = Object.entries(all).filter(([tid,scores]) => scores && scores[currentUser] !== undefined);
    if(!mine.length) { el.innerHTML = '<div style="color:var(--fg-4);padding:30px;text-align:center;">Ви не берете участі в жодному турнірі</div>'; return; }
    el.innerHTML = mine.map(([tid, scores]) => {
      const sorted = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
      const myPos  = sorted.findIndex(([u])=>u===currentUser)+1;
      const myScore= scores[currentUser]||0;
      return `<div class="tournament-card">
        <div style="font-size:13px;font-weight:bold;margin-bottom:6px;">Турнір: ${tid}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div><div style="font-size:11px;color:var(--fg-4);">Ваші очки</div><div style="font-size:22px;font-weight:900;color:var(--accent);">${formatNumber(myScore)}</div></div>
          <div><div style="font-size:11px;color:var(--fg-4);">Позиція</div><div style="font-size:22px;font-weight:900;color:${myPos===1?'var(--accent)':'var(--fg-2)'};">#${myPos}</div></div>
          <div><div style="font-size:11px;color:var(--fg-4);">Учасників</div><div style="font-size:22px;font-weight:900;color:var(--fg-3);">${sorted.length}</div></div>
        </div>
      </div>`;
    }).join('');
  });
}

// Add tournament points after any win
function addTournamentPoints(gameId, winAmount, multiplier) {
  if(!currentUser) return;
  db.ref('tournament_scores').once('value', snap => {
    const all = snap.val() || {};
    Object.entries(all).forEach(([tid, scores]) => {
      if(scores && scores[currentUser] !== undefined) {
        // Check if game is allowed for this tournament
        const tGame = TOURNEY_GAMES.find(g=>g.game===gameId);
        const pts = tGame ? Math.floor((winAmount || 0) * tGame.pointMult / 100) : Math.floor((winAmount||0)/100);
        if(pts > 0) {
          db.ref('tournament_scores/'+tid+'/'+currentUser).set(firebase.database.ServerValue.increment(pts));
          // Brief notification
          const t = document.createElement('div');
          t.className = 'toast success';
          t.innerHTML = `<span>🏆 +${pts} очків турніру!</span>`;
          document.getElementById('toast-container').appendChild(t);
          setTimeout(()=>t.remove(), 2000);
        }
      }
    });
  });
}

function renderTourneyGames() {
  const grid = document.getElementById('tourneyGamesGrid'); if(!grid) return;
  // Check if user is in any active tournament
  db.ref('tournament_scores').once('value', snap => {
    const all = snap.val() || {};
    const inTournament = Object.values(all).some(scores => scores && scores[currentUser] !== undefined);
    if(!inTournament) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--fg-4);padding:30px;">
        <div style="font-size:36px;margin-bottom:12px;">🔒</div>
        <div style="font-size:13px;color:var(--fg-3);margin-bottom:8px;">Спочатку приєднайся до турніру</div>
        <button class="btn-gold" onclick="switchTourneyTab('active',document.getElementById('ttb-active'))">🏆 Переглянути турніри</button>
      </div>`;
      return;
    }
    grid.innerHTML = TOURNEY_GAMES.map(g => `
      <div onclick="openTourneyGame('${g.game}')" style="background:linear-gradient(135deg,var(--surface-1),var(--bg));border:1px solid rgb(var(--accent-rgb) / .35);border-radius:var(--r-lg);padding:14px;cursor:pointer;position:relative;overflow:hidden;">
        <div style="position:absolute;top:-10px;right:-10px;font-size:50px;opacity:0.08;">${g.icon}</div>
        <div style="font-size:28px;margin-bottom:6px;">${g.icon}</div>
        <div style="font-size:12px;font-weight:bold;color:var(--fg);margin-bottom:2px;">${g.name}</div>
        <div style="font-size:10px;color:var(--fg-3);margin-bottom:6px;">${g.desc}</div>
        <div style="font-size:9px;background:rgb(var(--accent-rgb) / 0.2);color:var(--accent);border-radius:var(--r-sm);padding:2px 6px;display:inline-block;">×${g.pointMult} очки</div>
      </div>`).join('');
  });
}

function openTourneyGame(gameId) {
  // Check if user is in tournament
  db.ref('tournament_scores').once('value', snap => {
    const all = snap.val() || {};
    const inT = Object.values(all).some(s => s && s[currentUser] !== undefined);
    if(!inT) { notify('❌ Спочатку приєднайся до турніру!', 'error'); return; }
    openGame(gameId);
    notify(`🏆 Турнірний режим! Виграш → очки`, 'info');
    activeTournament = 'active';
  });
}

function joinTournamentV2(id, name, prize) {
  db.ref('tournament_scores/'+id+'/'+currentUser).once('value', snap => {
    if(!snap.exists()) {
      db.ref('tournament_scores/'+id+'/'+currentUser).set(0);
      notify(`🏆 Ви приєднались до "${name}"! Грай і заробляй очки!`, 'success');
      activeTournament = id;
    } else {
      notify(`Ви вже в турнірі "${name}"`, 'info');
    }
  });
}

function loadTourneyStatsBar() {
  const el = document.getElementById('myTourneyStats'); if(!el) return;
  db.ref('tournament_scores').once('value', snap => {
    const all = snap.val() || {};
    let totalPoints = 0, bestPos = 999, tourCount = 0;
    Object.entries(all).forEach(([tid, scores]) => {
      if(!scores || scores[currentUser] === undefined) return;
      tourCount++;
      totalPoints += scores[currentUser]||0;
      const sorted = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
      const pos = sorted.findIndex(([u])=>u===currentUser)+1;
      if(pos < bestPos) bestPos = pos;
    });
    el.innerHTML = tourCount ? `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div style="text-align:center;"><div style="font-size:9px;color:var(--fg-4);margin-bottom:2px;">Турнірів</div><div style="font-size:20px;font-weight:900;color:var(--accent);">${tourCount}</div></div>
        <div style="text-align:center;"><div style="font-size:9px;color:var(--fg-4);margin-bottom:2px;">Всього очків</div><div style="font-size:20px;font-weight:900;color:var(--green);">${formatNumber(totalPoints)}</div></div>
        <div style="text-align:center;"><div style="font-size:9px;color:var(--fg-4);margin-bottom:2px;">Кращий результат</div><div style="font-size:20px;font-weight:900;color:var(--accent);">#${bestPos===999?'—':bestPos}</div></div>
      </div>` : '<div style="font-size:11px;color:var(--fg-4);text-align:center;">Ще не брали участі в турнірах</div>';
  });
}


// ═══════════════════════════════════════
// CASINO LOBBY v2 — Jackpot + Wins feed
// ═══════════════════════════════════════
let _lobbyJackpot = 4287341 + Math.floor(Math.random()*500000);
let _lobbyJackpotTimer = null;
let _lobbyWinsTimer    = null;

const LOBBY_WIN_POOL = [
  {user:'Дмитро Л.', game:'Plinko',       avatar:'🦅'},
  {user:'Оля Т.',    game:'Mines',         avatar:'🦋'},
  {user:'Саша П.',   game:'Crash Aviator', avatar:'🐬'},
  {user:'Вова Д.',   game:'Classic 777',   avatar:'🦜'},
  {user:'Юля К.',    game:'Blackjack',     avatar:'🐱'},
  {user:'Петро М.',  game:'Limbo',         avatar:'🦊'},
];

function startLobbyTimers() {
  try { renderFavoriteHearts(); applyLobbyFilters(); renderRecentGames(); } catch(e) { console.warn(e); }
  // Jackpot counter
  _lobbyJackpotTimer = setInterval(() => {
    _lobbyJackpot += Math.floor(Math.random()*180 + 40);
    const el = document.getElementById('lobbyJackpotNum');
    if(el) el.textContent = _lobbyJackpot.toLocaleString('uk');
  }, 1200);

  // Wins feed rotation
  const pushWin = () => {
    const feed = document.getElementById('lobbyWinsFeed');
    if(!feed) return;
    const p = LOBBY_WIN_POOL[Math.floor(Math.random()*LOBBY_WIN_POOL.length)];
    const amt = (Math.random()*18000+400).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
    const row = document.createElement('div');
    row.className = 'win-feed-row list-row';
    row.innerHTML = `<div class="win-feed-avatar">${p.avatar}</div><div class="list-row-main"><div class="win-feed-user list-row-title">${p.user}</div><div class="win-feed-game list-row-sub">${p.game}</div></div><div class="win-feed-amount num">+₴ ${amt}</div>`;
    feed.insertBefore(row, feed.firstChild);
    const rows = feed.querySelectorAll('.win-feed-row');
    if(rows.length > 5) rows[rows.length-1].remove();
  };
  const feedEl = document.getElementById('lobbyWinsFeed');
  if(feedEl && !feedEl.children.length) { for(let i = 0; i < 4; i++) pushWin(); }
  _lobbyWinsTimer = setInterval(pushWin, 3000);
}

function stopLobbyTimers() {
  clearInterval(_lobbyJackpotTimer);
  clearInterval(_lobbyWinsTimer);
}

// ── Фільтри лоббі ────────────────────────────────────────────────
// Один стан на пошук, категорію й режим (усі/популярні/нові/обрані),
// щоб фільтри поєднувались, а не скидали одне одного.
const lobbyState = { cat: 'all', mode: 'all', q: '' };

function lobbyCardId(card) {
  const m = (card.getAttribute('onclick') || '').match(/(?:openGame|switchTab)\('(\w+)'\)/);
  return m ? m[1] : '';
}

function applyLobbyFilters() {
  const grid = document.getElementById('casinoGamesGrid');
  if(!grid) return;
  const favs = JSON.parse(localStorage.getItem('slotok_favs') || '[]');
  const q = lobbyState.q;
  let shown = 0;
  grid.querySelectorAll('.casino-game-card').forEach(card => {
    const cat = card.getAttribute('data-cat') || 'all';
    const name = (card.querySelector('.casino-game-card-name')?.textContent || '').toLowerCase();
    const sub = (card.querySelector('.casino-game-card-prov')?.textContent || '').toLowerCase();
    const okCat = lobbyState.cat === 'all' || cat === lobbyState.cat;
    const okQ = !q || name.includes(q) || sub.includes(q);
    let okMode = true;
    if(lobbyState.mode === 'hot') okMode = !!card.querySelector('.casino-badge-hot');
    else if(lobbyState.mode === 'new') okMode = !!card.querySelector('.casino-badge-new');
    else if(lobbyState.mode === 'fav') okMode = favs.includes(lobbyCardId(card));
    const ok = okCat && okQ && okMode;
    card.style.display = ok ? '' : 'none';
    if(ok) shown++;
  });
  const count = document.getElementById('lobbyGridCount');
  if(count) count.textContent = shown;
  const empty = document.getElementById('lobbyEmpty');
  if(empty) {
    empty.classList.toggle('hidden', shown > 0);
    const t = empty.querySelector('.empty-state-title');
    if(t) t.textContent = lobbyState.mode === 'fav' && !favs.length ? 'Обраних поки немає' : 'Нічого не знайдено';
  }
  const title = document.getElementById('lobbyGridTitle');
  if(title) title.textContent = { all: 'Усі ігри', hot: 'Популярні', new: 'Нові', fav: 'Обрані' }[lobbyState.mode];
}

function setChipGroup(selector, el) {
  document.querySelectorAll(selector).forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
  if(el) { el.classList.add('active'); el.setAttribute('aria-pressed', 'true'); }
}

// Категорія; повторне натискання знімає фільтр.
function filterCasinoGames(cat, btn) {
  if(btn && btn.classList.contains('active') && cat !== 'all') { cat = 'all'; btn = null; }
  lobbyState.cat = cat;
  setChipGroup('.casino-cat-btn', btn);
  applyLobbyFilters();
}

function lobbySetMode(mode, el) {
  lobbyState.mode = mode;
  setChipGroup('.game-sort-btn', el);
  applyLobbyFilters();
}

function lobbyReset() {
  lobbyState.cat = 'all'; lobbyState.mode = 'all'; lobbyState.q = '';
  const inp = document.getElementById('lobbySearch');
  if(inp) inp.value = '';
  setChipGroup('.casino-cat-btn', null);
  setChipGroup('.game-sort-btn', document.querySelector('.game-sort-btn'));
  applyLobbyFilters();
}

// Casino game info modal
function openCasinoGameCard(gameId, emoji, name, meta) {
  const modal = document.getElementById('casinoGameModal');
  if(!modal) return;
  document.getElementById('casinoGameModalTitle').textContent  = name;
  document.getElementById('casinoGameModalEmoji').textContent  = emoji;
  document.getElementById('casinoGameModalName').textContent   = name;
  document.getElementById('casinoGameModalMeta').textContent   = meta;
  document.getElementById('casinoGameModalPlayBtn').onclick    = () => { closeCasinoModal(); openGame(gameId); };
  modal.style.display = 'flex';
  modal.classList.remove('hidden');
}

function closeCasinoModal() {
  const modal = document.getElementById('casinoGameModal');
  if(modal) { modal.style.display = 'none'; modal.classList.add('hidden'); }
}

// Hook into tab switching to start/stop timers
(function() {
  const _orig = window.switchTab;
  window.switchTab = function(tab) {
    if(tab === 'lobby') startLobbyTimers();
    else stopLobbyTimers();
    if(_orig) _orig(tab);
  };
})();


// ============================================================
// ===== LIVE MATCH TRACKER — animated pitch =====
// ============================================================
let trackerMatchId  = null;
let trackerInterval = null;
let trackerMinute   = 0;
let trackerHomeScore = 0;
let trackerAwayScore = 0;
let trackerEvents   = [];
let trackerBallX    = 0.5;  // 0–1 normalized
let trackerBallY    = 0.5;
let trackerBallTargetX = 0.5;
let trackerBallTargetY = 0.5;
let pitchAnimFrame  = null;

const SPORT_PITCH_CONFIGS = {
  soccer:     { field:'football', color:'#2d5a27', lineColor:'rgba(255,255,255,0.5)', events:['⚽ Гол','🟡 Жовта','🔴 Червона','↔️ Заміна','⛳ Кутовий','🛡️ Сейв'] },
  ucl:        { field:'football', color:'#1a3a7a', lineColor:'rgba(255,255,255,0.5)', events:['⚽ Гол','🟡 Жовта','↔️ Заміна'] },
  basketball: { field:'basketball', color:'#8B4513', lineColor:'rgba(255,255,255,0.4)', events:['🏀 М\u02BCяч у кільці','🚫 Фол','⏱️ Тайм-аут'] },
  hockey:     { field:'hockey', color:'#c0d8e8', lineColor:'rgba(0,0,0,0.4)', events:['🏒 Гол!','🚫 Пенальті','↔️ Заміна'] },
  tennis:     { field:'tennis', color:'#2d6a4f', lineColor:'rgba(255,255,255,0.5)', events:['🎾 Ейс!','🚫 Подвійна','🏆 Гейм'] },
  csgo:       { field:'esport', color:'#1a1a2e', lineColor:'rgba(0,200,255,0.4)', events:['💀 Вбивство','💣 Бомба посаджена','🛡️ Раунд виграно'] },
  default:    { field:'football', color:'#2d5a27', lineColor:'rgba(255,255,255,0.5)', events:['⚽ Гол','🟡 Жовта','↔️ Заміна'] },
};

function openMatchTracker(matchId) {
  if(!realMatches || Object.keys(realMatches).length === 0) {
    notify('⏳ Матчі ще завантажуються, спробуй через секунду', 'info'); return;
  }
  const m = realMatches[matchId];
  if(!m) { notify('Матч не знайдено', 'error'); return; }

  trackerMatchId    = matchId;
  trackerMinute     = m.isLive ? (30 + Math.floor(Math.random()*30)) : 0;
  trackerHomeScore  = m.isLive ? (Math.floor(Math.random()*3)) : 0;
  trackerAwayScore  = m.isLive ? (Math.floor(Math.random()*3)) : 0;
  trackerEvents     = [];
  trackerBallX = trackerBallY = 0.5;

  // Set UI info
  const sportCfg = SPORT_PITCH_CONFIGS[m.sport] || SPORT_PITCH_CONFIGS.default;
  const sportEmoji = { soccer:'⚽', ucl:'🏆', basketball:'🏀', hockey:'🏒', tennis:'🎾', csgo:'🎮', dota2:'⚔️', lol:'🏆', valorant:'🔫', efootball:'⚡', football:'🏈', baseball:'⚾' };

  document.getElementById('trackerMatchTitle').textContent = m.home + ' vs ' + m.away;
  document.getElementById('trackerHomeName').textContent   = m.home;
  document.getElementById('trackerAwayName').textContent   = m.away;
  document.getElementById('trackerHomeEmoji').textContent  = sportEmoji[m.sport] || '🏅';
  document.getElementById('trackerAwayEmoji').textContent  = sportEmoji[m.sport] || '🏅';
  document.getElementById('trackerSport').textContent      = (m.league || m.sport || '').toUpperCase();
  document.getElementById('trackerStatus').textContent     = m.isLive ? '🟢 LIVE' : '⏳ Очікується';

  updateTrackerScore();
  renderTrackerEvents();
  renderMatchStats(m);
  renderTrackerBets(m);

  // Populate initial events if live
  if(m.isLive && trackerHomeScore + trackerAwayScore > 0) {
    const totalGoals = trackerHomeScore + trackerAwayScore;
    for(let i = 0; i < totalGoals; i++) {
      const isHome = i < trackerHomeScore;
      const min = 5 + Math.floor(Math.random() * (trackerMinute - 5));
      trackerEvents.push({ min, icon:'⚽', title:'Гол!', sub: isHome ? m.home : m.away, side: isHome ? 'home' : 'away', score: (isHome?i+1:trackerHomeScore)+'-'+(isHome?trackerAwayScore:i+1) });
    }
    trackerEvents.sort((a,b) => a.min - b.min);
    renderTrackerEvents();
  }

  // Show modal
  document.getElementById('matchTrackerModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Draw pitch
  drawPitch(sportCfg);

  // Start simulation
  if(trackerInterval) clearInterval(trackerInterval);
  trackerInterval = setInterval(() => simulateTrackerTick(m, sportCfg), 1500);

  // Animate ball
  animateBall();
}

function closeMatchTracker() {
  document.getElementById('matchTrackerModal').classList.add('hidden');
  document.body.style.overflow = '';
  if(trackerInterval) { clearInterval(trackerInterval); trackerInterval = null; }
  if(pitchAnimFrame)  { cancelAnimationFrame(pitchAnimFrame); pitchAnimFrame = null; }
}

function drawPitch(cfg) {
  const canvas = document.getElementById('pitchCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = cfg.color;
  ctx.fillRect(0,0,W,H);

  for(let i = 0; i < 8; i++) {
    ctx.fillStyle = i%2===0 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(i * W/8, 0, W/8, H);
  }

  ctx.strokeStyle = cfg.lineColor;
  ctx.lineWidth = 1.5;

  if(cfg.field === 'football') {
    ctx.strokeRect(12, 8, W-24, H-16);
    ctx.beginPath(); ctx.moveTo(W/2, 8); ctx.lineTo(W/2, H-8); ctx.stroke();
    ctx.beginPath(); ctx.arc(W/2, H/2, 32, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W/2, H/2, 3, 0, Math.PI*2);
    ctx.fillStyle = cfg.lineColor; ctx.fill();
    ctx.strokeRect(12, H/2-24, 30, 48);
    ctx.strokeRect(12, H/2-44, 56, 88);
    ctx.strokeRect(W-42, H/2-24, 30, 48);
    ctx.strokeRect(W-68, H/2-44, 56, 88);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(6, H/2-20, 6, 40);
    ctx.fillRect(W-12, H/2-20, 6, 40);
    ctx.strokeRect(6, H/2-20, 6, 40);
    ctx.strokeRect(W-12, H/2-20, 6, 40);
  } else if(cfg.field === 'basketball') {
    ctx.strokeRect(12, 8, W-24, H-16);
    ctx.beginPath(); ctx.moveTo(W/2, 8); ctx.lineTo(W/2, H-8); ctx.stroke();
    ctx.beginPath(); ctx.arc(W/2, H/2, 40, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(50, H/2, 18, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W-50, H/2, 18, 0, Math.PI*2); ctx.stroke();
  } else if(cfg.field === 'esport') {
    ctx.strokeStyle = 'rgba(0,200,255,0.2)';
    for(let x = 0; x < W; x+=30) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y = 0; y < H; y+=30) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.strokeStyle = cfg.lineColor; ctx.strokeRect(12,8,W-24,H-16);
  }
}

function drawBall(x, y, sport) {
  const canvas = document.getElementById('pitchCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const bx = x * W, by = y * H;
  // Без емодзі на canvas (на різних телефонах вони різні) — м'яч малюємо самі.
  ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI*2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI*2); ctx.fill();

  ctx.beginPath(); ctx.ellipse(bx, by+8, 6, 2, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
}

function animateBall() {
  const canvas = document.getElementById('pitchCanvas');
  if(!canvas) return;
  const m = realMatches[trackerMatchId];
  const cfg = m ? (SPORT_PITCH_CONFIGS[m.sport] || SPORT_PITCH_CONFIGS.default) : SPORT_PITCH_CONFIGS.default;

  // Lerp ball toward target
  trackerBallX += (trackerBallTargetX - trackerBallX) * 0.08;
  trackerBallY += (trackerBallTargetY - trackerBallY) * 0.08;

  drawPitch(cfg);
  drawBall(trackerBallX, trackerBallY, m?.sport);
  pitchAnimFrame = requestAnimationFrame(animateBall);
}

function simulateTrackerTick(m, cfg) {
  if(!m) return;
  trackerMinute = Math.min(trackerMinute + 1, 90);
  document.getElementById('trackerMinute').textContent = trackerMinute + "'";
  if(trackerMinute >= 90) {
    document.getElementById('trackerStatus').textContent = '🏁 Завершено';
    clearInterval(trackerInterval); trackerInterval = null;
  }

  // Move ball randomly
  trackerBallTargetX = 0.1 + Math.random() * 0.8;
  trackerBallTargetY = 0.05 + Math.random() * 0.9;

  // Update shot stats
  const homeShots = parseInt(document.getElementById('statHomeVal')?.textContent || '0');
  const awayShots = parseInt(document.getElementById('statAwayVal')?.textContent || '0');
  if(Math.random() < 0.15) {
    const isHome = Math.random() < 0.5;
    if(isHome) document.getElementById('statHomeVal').textContent = homeShots + 1;
    else       document.getElementById('statAwayVal').textContent = awayShots + 1;
    renderMatchStatsLive(homeShots + (isHome?1:0), awayShots + (isHome?0:1));
  }

  // Random events (5% chance per tick)
  if(Math.random() < 0.05) {
    const eventIdx = Math.floor(Math.random() * cfg.events.length);
    const evText   = cfg.events[eventIdx];
    const isGoal   = evText.includes('Гол') || evText.includes('кільце');
    const isHome   = Math.random() < 0.5;

    if(isGoal) {
      if(isHome) trackerHomeScore++;
      else trackerAwayScore++;
      updateTrackerScore();

      // Ball fly to goal
      trackerBallTargetX = isHome ? 0.97 : 0.03;
      trackerBallTargetY = 0.4 + Math.random() * 0.2;

      // Particle burst
      goalBurst(isHome);
    }

    const eventIcons = { '⚽':1,'🟡':2,'🔴':3,'↔️':4,'⛳':5,'🛡️':6,'🏀':7,'🏒':8,'🎾':9,'💀':10,'💣':11 };
    const parts = evText.split(' ');
    const ev = {
      min:   trackerMinute,
      icon:  parts[0] || '⚽',
      title: parts.slice(1).join(' ') || evText,
      sub:   isHome ? m.home : m.away,
      side:  isHome ? 'home' : 'away',
    };
    trackerEvents.unshift(ev);
    if(trackerEvents.length > 15) trackerEvents.pop();
    renderTrackerEvents();

    // Show overlay
    showEventOverlay(ev.icon, ev.title, ev.sub);
  }
}

function updateTrackerScore() {
  const el = document.getElementById('trackerScore');
  if(el) el.textContent = trackerHomeScore + ' – ' + trackerAwayScore;
}

function renderTrackerEvents() {
  const el = document.getElementById('trackerEventsList');
  if(!el) return;
  if(!trackerEvents.length) {
    el.innerHTML = '<div style="color:var(--fg-4);font-size:11px;text-align:center;padding:10px 0;">Подій ще немає</div>';
    return;
  }
  el.innerHTML = trackerEvents.map(ev => `
    <div class="tracker-event-row">
      <span class="ev-min">${ev.min}'</span>
      <span style="font-size:16px;">${ev.icon}</span>
      <span class="ev-text ${ev.side==='home'?'ev-side-home':'ev-side-away'}">${ev.title} — <b>${ev.sub}</b></span>
      ${ev.score ? `<span class="ev-score">${ev.score}</span>` : ''}
    </div>`).join('');
}

function renderMatchStats(m) {
  const el = document.getElementById('matchStatsGrid');
  if(!el) return;
  const stats = [
    { label:'Удари', home: Math.floor(Math.random()*8)+1, away: Math.floor(Math.random()*8)+1 },
    { label:'У ціль', home: Math.floor(Math.random()*5), away: Math.floor(Math.random()*5) },
    { label:'Кутові', home: Math.floor(Math.random()*6), away: Math.floor(Math.random()*6) },
    { label:'Офсайди', home: Math.floor(Math.random()*4), away: Math.floor(Math.random()*4) },
    { label:'Жовті', home: Math.floor(Math.random()*3), away: Math.floor(Math.random()*3) },
    { label:'Воло\u02BCяч', home: null, away: null, pct: true },
  ];
  el.innerHTML = stats.map(s => {
    const pctHome = s.pct ? (40+Math.floor(Math.random()*20)) : null;
    const hVal = s.pct ? pctHome+'%' : s.home;
    const aVal = s.pct ? (100-pctHome)+'%' : s.away;
    const pctW  = s.pct ? pctHome : (s.home+s.away > 0 ? Math.round(s.home/(s.home+s.away)*100) : 50);
    return `<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--fg-2);margin-bottom:3px;">
        <span style="font-weight:bold;">${hVal}</span>
        <span style="color:var(--fg-4);">${s.label}</span>
        <span style="font-weight:bold;">${aVal}</span>
      </div>
      <div style="height:4px;background:var(--surface-1);border-radius:var(--r-xs);overflow:hidden;">
        <div style="height:100%;width:${pctW}%;background:linear-gradient(90deg,var(--info),var(--primary));border-radius:var(--r-xs);"></div>
      </div>
    </div>`;
  }).join('');
}

function renderMatchStatsLive(hShots, aShots) {
  const el = document.getElementById('statHomeVal');
  const el2 = document.getElementById('statAwayVal');
  if(el) el.textContent = hShots;
  if(el2) el2.textContent = aShots;
}

function renderTrackerBets(m) {
  const el = document.getElementById('trackerBetButtons');
  if(!el || !m) return;
  el.innerHTML = [
    { label: '1 ' + (m.home.split(' ')[0]||'Хазяїн'), odds: m.homeOdds, outcome:'home' },
    ...(m.drawOdds ? [{ label: 'X Нічия', odds: m.drawOdds, outcome:'draw' }] : []),
    { label: '2 ' + (m.away.split(' ')[0]||'Гість'), odds: m.awayOdds, outcome:'away' },
  ].map(b => `
    <div onclick="openBetSlip('${m.id}','${b.outcome}','${b.outcome==='home'?m.home:b.outcome==='away'?m.away:'Нічия'}')"
         style="background:var(--surface-1);border:1px solid var(--line);border-radius:var(--r-md);padding:10px;text-align:center;cursor:pointer;transition:all 0.15s;"
         onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform=''">
      <div style="font-size:10px;color:var(--fg-3);margin-bottom:3px;">${b.label}</div>
      <div style="font-size:18px;font-weight:900;color:var(--accent);">${b.odds}</div>
    </div>`).join('');
}

function showEventOverlay(icon, title, sub) {
  const ov = document.getElementById('eventOverlay');
  const ic = document.getElementById('evIcon');
  const ti = document.getElementById('evTitle');
  const su = document.getElementById('evSub');
  if(!ov) return;
  if(ic) ic.textContent = icon;
  if(ti) ti.textContent = title;
  if(su) su.textContent = sub;
  ov.classList.add('show');
  setTimeout(()=>ov.classList.remove('show'), 2500);
}

function goalBurst(isHome) {
  const canvas = document.getElementById('pitchCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const bx = isHome ? W-20 : 20;
  const by = H/2;
  ctx.fillStyle = 'rgba(255,220,0,0.3)';
  ctx.fillRect(0,0,W,H);
}



