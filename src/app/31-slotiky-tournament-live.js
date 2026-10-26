// ============================================================
// ===== СЛОТІКИ — внутрішня валюта =====
// ============================================================
const SLOTIKY_PRICE = 10000000; // 10M UAH per 1 slotik

const SLOTIKY_SHOP_ITEMS = [
  // ── КОСМЕТИКА ──
  { id:'avatar_silver',   name:'Срібний аватар',       icon:'🥈', price:1,  desc:'Срібна рамка профілю',             type:'cosmetic' },
  { id:'avatar_gold',     name:'Золотий аватар',       icon:'👑', price:2,  desc:'Золота рамка профілю',             type:'cosmetic' },
  { id:'avatar_diamond',  name:'Diamond аватар',       icon:'💎', price:5,  desc:'Алмазна рамка профілю',            type:'cosmetic' },
  { id:'avatar_fire',     name:'Вогняний аватар',      icon:'🔥', price:4,  desc:'Вогняна анімація рамки',           type:'cosmetic' },
  { id:'avatar_cosmic',   name:'Космічний аватар',     icon:'🌌', price:8,  desc:'Зоряна рамка профілю',             type:'cosmetic' },
  { id:'username_gold',   name:'Золотий нік',          icon:'✨', price:2,  desc:'Золотий колір у чаті',             type:'cosmetic' },
  { id:'username_rainbow',name:'Веселковий нік',       icon:'🌈', price:4,  desc:'Анімований веселковий нік',        type:'cosmetic' },
  { id:'username_red',    name:'Червоний нік',         icon:'❤️', price:1,  desc:'Червоний колір нікнейму',          type:'cosmetic' },
  { id:'name_frame',      name:'Рамка "Supreme"',      icon:'🔱', price:15, desc:'Supreme рамка для імені',          type:'cosmetic' },
  { id:'name_frame_neon', name:'Неонова рамка',        icon:'💜', price:7,  desc:'Неонова анімована рамка',          type:'cosmetic' },
  { id:'badge_whale',     name:'Значок "Кит"',         icon:'🐋', price:10, desc:'Рідкісний значок у профілі',       type:'cosmetic' },
  { id:'badge_shark',     name:'Значок "Акула"',       icon:'🦈', price:6,  desc:'Значок Акули',                     type:'cosmetic' },
  { id:'badge_crown',     name:'Значок "Корона"',      icon:'👑', price:8,  desc:'Значок монарха',                   type:'cosmetic' },
  { id:'badge_dragon',    name:'Значок "Дракон"',      icon:'🐉', price:12, desc:'Легендарний значок',               type:'cosmetic' },
  { id:'badge_alien',     name:'Значок "Прибулець"',   icon:'👽', price:5,  desc:'Загадковий значок',                type:'cosmetic' },
  { id:'chat_emoji_pack', name:'Емодзі Пак 1',         icon:'😎', price:1,  desc:'+20 емодзі у чаті',                type:'feature'  },
  { id:'chat_emoji_pro',  name:'Емодзі Пак PRO',       icon:'🎭', price:3,  desc:'+50 преміум емодзі',               type:'feature'  },
  { id:'chat_gif',        name:'GIF у чаті',           icon:'📹', price:5,  desc:'Відправляй GIF у чаті',            type:'feature'  },
  { id:'chat_sticker',    name:'Стікери',              icon:'🎨', price:4,  desc:'10 ексклюзивних стікерів',         type:'feature'  },
  // ── БУСТИ ──
  { id:'vip_boost_3d',    name:'VIP Буст 3 дні',       icon:'🚀', price:4,  desc:'2x вагер 3 дні',                   type:'boost'    },
  { id:'vip_boost_7d',    name:'VIP Буст 7 днів',      icon:'🚀', price:8,  desc:'2x вагер 7 днів',                  type:'boost'    },
  { id:'cashback_x2',     name:'Кешбек x2',            icon:'💰', price:4,  desc:'Подвоєний кешбек 3 дні',           type:'boost'    },
  { id:'cashback_x3',     name:'Кешбек x3',            icon:'💸', price:9,  desc:'Потрійний кешбек 7 днів',          type:'boost'    },
  { id:'daily_x2',        name:'Щоденний бонус x2',    icon:'🎁', price:2,  desc:'Подвоєний щоденний 7 днів',        type:'boost'    },
  { id:'daily_x3',        name:'Щоденний бонус x3',    icon:'🎁', price:4,  desc:'Потрійний щоденний 7 днів',        type:'boost'    },
  { id:'lucky_boost',     name:'Везіння x2',           icon:'🍀', price:6,  desc:'+50% шанс виграшу 24 год',         type:'boost'    },
  { id:'xp_boost',        name:'XP Буст x2',           icon:'⚡', price:3,  desc:'2x досягнення очки 3 дні',          type:'boost'    },
  { id:'transfer_free',   name:'Переказ без комісії',  icon:'🔄', price:2,  desc:'10 переказів без комісії',         type:'feature'  },
  // ── ПРЕДМЕТИ ──
  { id:'lootbox_basic',   name:'Лут-бокс Basic',       icon:'📦', price:1,  desc:'Звичайний лут-бокс',               type:'item'     },
  { id:'lootbox_ultra',   name:'Ultra Лут-бокс',       icon:'🎁', price:3,  desc:'Рідкісний лут-бокс',               type:'item'     },
  { id:'lootbox_legend',  name:'Legendary Лут-бокс',   icon:'🔮', price:8,  desc:'Легендарний лут-бокс',             type:'item'     },
  { id:'slot_free_5',     name:'5 Безкоштовних Спінів',icon:'🎰', price:2,  desc:'5 безкоштовних ставок у слотах',   type:'item'     },
  { id:'slot_free_20',    name:'20 Безкоштов. Спінів', icon:'🎰', price:6,  desc:'20 безкоштовних ставок у слотах',  type:'item'     },
  { id:'fortune_free',    name:'Безкошт. Прокрутка',   icon:'🎡', price:2,  desc:'3 безкоштовних прокруток Колеса',  type:'item'     },
  { id:'crash_insurance', name:'Краш-страховка',       icon:'🛡️', price:5,  desc:'Повернення ставки при краші <1.2',  type:'item'     },
  { id:'mines_hint',      name:'Підказка в Майнері',   icon:'💡', price:3,  desc:'3 підказки безпечної клітинки',    type:'item'     },
  { id:'sport_bet_free',  name:'Безкошт. Спортставка', icon:'⚽', price:4,  desc:'1 безкоштовна спортивна ставка',   type:'item'     },
  { id:'nickname_change', name:'Зміна нікнейму',       icon:'✏️', price:5,  desc:'Змінити нікнейм без перереєстр.',  type:'feature'  },
  { id:'profile_bio',     name:'Біографія профілю',    icon:'📝', price:2,  desc:'Додати опис до профілю',           type:'feature'  },
  // ── ЕКСКЛЮЗИВ ──
  { id:'vip_trial',       name:'VIP Пробний тиждень',  icon:'💠', price:10, desc:'Всі VIP бонуси на 7 днів',         type:'exclusive'},
  { id:'private_room',    name:'Приватна кімната',     icon:'🏠', price:20, desc:'Власна кімната для гри з друзями', type:'exclusive'},
  { id:'custom_bet_limit',name:'Підвищений Max-Bet',   icon:'📈', price:15, desc:'Max ставка x10 на 7 днів',         type:'exclusive'},
  { id:'guaranteed_win',  name:'Гарантований виграш',  icon:'🎯', price:25, desc:'100% виграш у наступній грі',      type:'exclusive'},
  { id:'monthly_pass',    name:'Місячний Пропуск',     icon:'📅', price:30, desc:'Всі буст бонуси на місяць',        type:'exclusive'},
];

function initSlotiky() {
  const bal = document.getElementById('slotikyBalance');
  if(bal) bal.textContent = formatNumber(userData.slotiky || 0);
  renderSlotikyShop();
}

function buySlotiky(amount) {
  const prices = { 1: 10000000, 5: 50000000, 10: 95000000, 50: 450000000 };
  const cost = prices[amount] || amount * SLOTIKY_PRICE;
  const bal = userData.balance || 0;
  if(bal < cost) {
    notify(`❌ Недостатньо коштів! Потрібно ${formatNumber(cost)} ₴`, 'error');
    return;
  }
  // Confirm
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgb(var(--recess-rgb) / calc(0.85 * var(--recess-k)));z-index:9900;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  modal.innerHTML = `
    <div style="background:var(--surface-1);border:1px solid var(--special);border-radius:var(--r-xl);padding:24px;max-width:320px;width:100%;text-align:center;">
      <div style="font-size:40px;margin-bottom:12px;">🪙</div>
      <div style="font-size:18px;font-weight:bold;color:var(--special);margin-bottom:8px;">Купити ${amount} Слотік${amount>1?'ів':''}?</div>
      <div style="font-size:14px;color:var(--fg-3);margin-bottom:20px;">Вартість: <b style="color:var(--fg);">${formatNumber(cost)} ₴</b></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <button onclick="this.parentElement.parentElement.parentElement.remove()" style="padding:12px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-md);color:var(--fg-2);cursor:pointer;">Скасувати</button>
        <button onclick="confirmBuySlotiky(${amount},${cost});this.closest('div[style*=fixed]').remove();" style="padding:12px;background:var(--special);border:none;border-radius:var(--r-md);color:var(--on-special);font-weight:bold;cursor:pointer;">✅ Купити</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function confirmBuySlotiky(amount, cost) {
  db.ref('users/'+currentUser).update({
    balance:  (userData.balance  || 0) - cost,
    slotiky:  (userData.slotiky  || 0) + amount,
  });
  playSound('bonus');
  notify(`🪙 Куплено ${amount} Слотік${amount>1?'ів':''}!`, 'success');
  addToHistory(`Куплено ${amount} Слотік${amount>1?'ів':''}: -${formatNumber(cost)}₴`);
  setTimeout(()=>{ const b=document.getElementById('slotikyBalance'); if(b) b.textContent=formatNumber((userData.slotiky||0)+amount); }, 300);
}


let _shopFilter = null;
function filterShop(type, btn) {
  _shopFilter = type;
  document.querySelectorAll('[onclick^="filterShop"]').forEach(b => {
    b.style.background = 'var(--surface-2)';
    b.style.color = 'var(--fg-2)';
    b.style.border = '1px solid var(--line)';
  });
  if(btn) { btn.style.background='var(--accent)'; btn.style.color='var(--on-accent)'; btn.style.border='none'; }
  renderSlotikyShop();
}

function renderSlotikyShop() {
  const grid = document.getElementById('slotikyShopGrid'); if(!grid) return;
  const owned = userData.slotikyItems || {};
  const filteredItems = _shopFilter
    ? SLOTIKY_SHOP_ITEMS.filter(i => i.type === _shopFilter)
    : SLOTIKY_SHOP_ITEMS;
  grid.innerHTML = filteredItems.map(item => {
    const isOwned = owned[item.id];
    const typeColor = item.type==='boost'?'#f39c12':item.type==='cosmetic'?'#c9a0ff':item.type==='feature'?'#27ae60':'#4a90e2';
    return `<div style="background:linear-gradient(180deg,var(--surface-1),var(--bg));border:1px solid ${isOwned?'var(--pos)':'var(--special)'};border-radius:var(--r-lg);padding:14px;position:relative;">
      ${isOwned?'<div style="position:absolute;top:6px;right:8px;font-size:10px;color:var(--pos);font-weight:bold;">✅ Є</div>':''}
      <div style="font-size:28px;margin-bottom:6px;">${item.icon}</div>
      <div style="font-size:12px;font-weight:bold;color:var(--fg);margin-bottom:3px;">${item.name}</div>
      <div style="font-size:10px;color:var(--fg-3);margin-bottom:8px;">${item.desc}</div>
      <div style="font-size:11px;color:var(--special);font-weight:bold;margin-bottom:8px;">🪙 ${item.price} Слотік${item.price>1?'ів':''}</div>
      <button onclick="buyShopItem('${item.id}',${item.price})" ${isOwned?'disabled':''} style="width:100%;padding:7px;background:${isOwned?'var(--surface-2)':'var(--special)'};border:none;border-radius:var(--r-md);color:${isOwned?'var(--fg-4)':'var(--fg)'};font-size:11px;font-weight:bold;cursor:${isOwned?'default':'pointer'};">${isOwned?'Придбано':'Купити'}</button>
    </div>`;
  }).join('');
}

function buyShopItem(itemId, price) {
  const currentSlotiky = userData.slotiky || 0;
  if(currentSlotiky < price) { notify(`❌ Недостатньо слотіків! Потрібно ${price} 🪙`, 'error'); return; }
  const item = SLOTIKY_SHOP_ITEMS.find(i=>i.id===itemId); if(!item) return;
  const owned = userData.slotikyItems || {};
  if(owned[itemId] && item.type !== 'boost' && item.type !== 'item') {
    notify('Вже придбано!', 'info'); return;
  }
  owned[itemId] = { boughtAt: Date.now(), expires: getItemExpiry(item) };
  const updates = {
    slotiky:       currentSlotiky - price,
    slotikyItems:  owned,
    slotikySpent:  (userData.slotikySpent||0) + price
  };
  // Apply instant effects
  applyShopItemEffect(itemId, item, updates);
  db.ref('users/'+currentUser).update(updates);
  playSound('bonus');
  notify(`🎉 Придбано: ${item.icon} ${item.name}!
${getItemEffectDesc(item)}`, 'success');
  setTimeout(()=>{ renderSlotikyShop(); applyAllShopEffects(); }, 300);
}

function getItemExpiry(item) {
  const durations = {
    vip_boost_3d:3*86400000, vip_boost_7d:7*86400000,
    cashback_x2:3*86400000, cashback_x3:7*86400000,
    daily_x2:7*86400000, daily_x3:7*86400000,
    lucky_boost:86400000, xp_boost:3*86400000
  };
  return durations[item.id] ? Date.now() + durations[item.id] : null;
}

function getItemEffectDesc(item) {
  const effects = {
    avatar_silver:'✓ Срібна рамка активована в профілі',
    avatar_gold:'✓ Золота рамка активована в профілі',
    avatar_diamond:'✓ Алмазна рамка активована в профілі',
    avatar_fire:'✓ Вогняна рамка активована',
    avatar_cosmic:'✓ Космічна рамка активована',
    username_gold:'✓ Золотий нікнейм у чаті',
    username_rainbow:'✓ Веселковий нікнейм активовано',
    username_red:'✓ Червоний нікнейм активовано',
    vip_boost_3d:'✓ 2× вагер зараховується 3 дні',
    vip_boost_7d:'✓ 2× вагер зараховується 7 днів',
    cashback_x2:'✓ Подвійний кешбек на 3 дні',
    cashback_x3:'✓ Потрійний кешбек на 7 днів',
    daily_x2:'✓ Подвоєний щоденний бонус 7 днів',
    daily_x3:'✓ Потрійний щоденний бонус 7 днів',
    lucky_boost:'✓ +50% шанс виграшу на 24 год',
    slot_free_5:'✓ Додано 5 безкоштовних спінів',
    slot_free_20:'✓ Додано 20 безкоштовних спінів',
    fortune_free:'✓ Додано 3 безкоштовні прокрутки',
    mines_hint:'✓ Додано 3 підказки в майнер',
    guaranteed_win:'✓ Наступна гра — 100% виграш!',
    crash_insurance:'✓ Страховка краша <1.2 активна',
    lootbox_basic:'✓ Відкрий лут-бокс у розділі Бонуси',
    lootbox_ultra:'✓ Відкрий лут-бокс у розділі Бонуси',
    lootbox_legend:'✓ Відкрий лут-бокс у розділі Бонуси',
    vip_trial:'✓ VIP бонуси активні на 7 днів',
    monthly_pass:'✓ Місячний пропуск активовано',
  };
  return effects[item.id] || '✓ Предмет додано до акаунту';
}

function applyShopItemEffect(itemId, item, updates) {
  // Items with immediate stat effects
  if(itemId === 'slot_free_5')   updates.freeSlots = (userData.freeSlots||0) + 5;
  if(itemId === 'slot_free_20')  updates.freeSlots = (userData.freeSlots||0) + 20;
  if(itemId === 'fortune_free')  updates.freeFortune = (userData.freeFortune||0) + 3;
  if(itemId === 'mines_hint')    updates.minesHints = (userData.minesHints||0) + 3;
  if(itemId === 'sport_bet_free')updates.freeSportBet = (userData.freeSportBet||0) + 1;
  if(itemId === 'guaranteed_win')updates.guaranteedWin = true;
  if(itemId === 'crash_insurance')updates.crashInsurance = true;
}

let _applyShopTimer = null;
function applyAllShopEffects() {
  clearTimeout(_applyShopTimer);
  _applyShopTimer = setTimeout(_doApplyShopEffects, 300);
}
function _doApplyShopEffects() {
  const items = userData.slotikyItems || {};
  const now = Date.now();

  // Avatar frames
  const frames = ['avatar_cosmic','avatar_fire','avatar_diamond','avatar_gold','avatar_silver'];
  let activeFrame = null;
  for(const f of frames) {
    const it = items[f];
    if(it && (it === true || !it.expires || it.expires > now)) { activeFrame = f; break; }
  }
  const frameColors = {
    avatar_cosmic: 'linear-gradient(135deg,#1a0a2e,#4a1080)',
    avatar_fire:   'linear-gradient(135deg,#8b0000,#ff4500)',
    avatar_diamond:'linear-gradient(135deg,#0a2a4a,#00b4d8)',
    avatar_gold:   'linear-gradient(135deg,#6b4c00,var(--accent))',
    avatar_silver: 'linear-gradient(135deg,#333,#aaa)',
  };
  const avatarEl = document.getElementById('currentAvatar');
  if(avatarEl && activeFrame) {
    avatarEl.style.background = frameColors[activeFrame] || '';
    avatarEl.style.border = '3px solid ' + (activeFrame==='avatar_gold'?'var(--accent)':activeFrame==='avatar_diamond'?'var(--primary)':activeFrame==='avatar_fire'?'var(--accent)':'var(--fg-3)');
    avatarEl.style.borderRadius = '50%';
  }

  // Nick colors in chat
  const nickColorItems = { username_rainbow:'rainbow', username_gold:'#d4af37', username_red:'#e74c3c' };
  let activeNick = null;
  for(const [id, color] of Object.entries(nickColorItems)) {
    if(items[id]) { activeNick = color; break; }
  }
  window._chatNickColor = activeNick;

  // Active boosts display
  updateActiveBoostsUI(items, now);
}

function updateActiveBoostsUI(items, now) {
  const el = document.getElementById('activeBoostsList');
  if(!el) return;
  const boostLabels = {
    vip_boost_3d:'🚀 VIP Буст', vip_boost_7d:'🚀 VIP Буст',
    cashback_x2:'💰 Кешбек ×2', cashback_x3:'💸 Кешбек ×3',
    daily_x2:'🎁 Щоден. ×2', daily_x3:'🎁 Щоден. ×3',
    lucky_boost:'🍀 Везіння', monthly_pass:'📅 Місяч. пропуск',
    vip_trial:'💠 VIP Пробний',
  };
  const active = Object.entries(items).filter(([id, val]) => {
    if(!boostLabels[id]) return false;
    const expires = val?.expires;
    return !expires || expires > now;
  });
  if(!active.length) { el.innerHTML = '<div style="color:var(--fg-4);font-size:11px;">Немає активних бустів</div>'; return; }
  el.innerHTML = active.map(([id, val]) => {
    const expires = val?.expires;
    const left = expires ? Math.max(0, Math.ceil((expires - now) / 86400000)) : null;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg);border:1px solid rgb(var(--accent-rgb) / .35);border-radius:var(--r-md);margin-bottom:5px;">
      <span style="font-size:12px;color:var(--fg-2);">${boostLabels[id]}</span>
      <span style="font-size:10px;color:var(--accent);">${left!==null?left+'д':'Активно'}</span>
    </div>`;
  }).join('');
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



