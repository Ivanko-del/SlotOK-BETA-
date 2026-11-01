// ============================================================
// SlotOK — магазин Слотіків: каталог, ціни, бусти, скрині.
//
// Як і shared/rewards.js, файл спільний: браузер вантажить його <script>
// перед app.js, сервер (lib/shop.js, lib/progress.js) — через require().
// Купівля, бусти, скрині й предмети рахує сервер; браузер лише малює.
//
// Типи товарів:
//   frame / nick / plate / badge — косметика назавжди (видно всім гравцям);
//   boost — тимчасовий множник на days днів (продовжується повторною купівлею);
//   item  — витратний предмет: лічильник у users/<нік>/<counter> += qty.
// ============================================================

const SLOTIKY_PRICE = 1000000; // ₴ за 1 Слотік
const SLOTIKY_PACKS = [
  { n: 1, price: 1000000 },
  { n: 5, price: 5000000 },
  { n: 10, price: 9500000, tag: '−5%' },
  { n: 50, price: 45000000, tag: '−10%' },
];

const SHOP_ITEMS = [
  // ── Рамки аватара ──
  { id: 'avatar_silver',  type: 'frame', name: 'Рамка «Срібло»',   desc: 'Стримана срібна окантовка аватара',        icon: 'medal-2',  price: 1 },
  { id: 'avatar_gold',    type: 'frame', name: 'Рамка «Золото»',   desc: 'Золота окантовка аватара',                  icon: 'medal-1',  price: 2 },
  { id: 'avatar_fire',    type: 'frame', name: 'Рамка «Жар»',      desc: 'Тепле світіння, що повільно пульсує',       icon: 'fire',     price: 4 },
  { id: 'avatar_diamond', type: 'frame', name: 'Рамка «Платина»',  desc: 'Холодний платиновий відблиск',              icon: 'diamond',  price: 5 },
  { id: 'avatar_cosmic',  type: 'frame', name: 'Рамка «Обсидіан»', desc: 'Темне скло з фіолетовим переливом',         icon: 'gem',      price: 8 },
  // ── Колір ніку ──
  { id: 'username_red',     type: 'nick', name: 'Нік «Багряний»', desc: 'Глибокий червоний колір ніку в чатах і профілі', icon: 'type', price: 1 },
  { id: 'username_gold',    type: 'nick', name: 'Нік «Золотий»',  desc: 'Золотий колір ніку в чатах і профілі',           icon: 'type', price: 2 },
  { id: 'username_rainbow', type: 'nick', name: 'Нік «Перелив»',  desc: 'Повільний градієнт кольору ніку',                icon: 'type', price: 4 },
  // ── Табличка імені ──
  { id: 'name_frame_neon', type: 'plate', name: 'Табличка «Неон»',    desc: 'Нік у світній рамці',                 icon: 'bolt',  price: 7 },
  { id: 'name_frame',      type: 'plate', name: 'Табличка «Supreme»', desc: 'Найвища відзнака: нік у золотій плашці', icon: 'crown', price: 15 },
  // ── Значки біля ніку ──
  { id: 'badge_shark',  type: 'badge', name: 'Значок «Акула»',    desc: 'Для тих, хто полює на великі множники', icon: 'target',   price: 6 },
  { id: 'badge_crown',  type: 'badge', name: 'Значок «Корона»',   desc: 'Корона біля ніку',                      icon: 'crown',    price: 8 },
  { id: 'badge_whale',  type: 'badge', name: 'Значок «Хайролер»', desc: 'Для великих ставок',                   icon: 'gem',      price: 10 },
  { id: 'badge_dragon', type: 'badge', name: 'Значок «Дракон»',   desc: 'Рідкісний значок',                      icon: 'dragon',   price: 12 },
  // ── Бусти (рахує сервер) ──
  { id: 'vip_boost_3d', type: 'boost', name: 'Прогрес VIP ×2 · 3 дні',   desc: 'Кожна ставка йде у VIP-рівень подвійно',       icon: 'chart-up',  price: 4,  days: 3,  fx: { wager: 2 } },
  { id: 'vip_boost_7d', type: 'boost', name: 'Прогрес VIP ×2 · 7 днів',  desc: 'Кожна ставка йде у VIP-рівень подвійно',       icon: 'chart-up',  price: 8,  days: 7,  fx: { wager: 2 } },
  { id: 'cashback_x2',  type: 'boost', name: 'Кешбек ×2 · 3 дні',        desc: 'Подвійний кешбек і подвійні ліміти кешбеку',   icon: 'coins',     price: 4,  days: 3,  fx: { cashback: 2 } },
  { id: 'cashback_x3',  type: 'boost', name: 'Кешбек ×3 · 7 днів',       desc: 'Потрійний кешбек і потрійні ліміти кешбеку',   icon: 'coins',     price: 9,  days: 7,  fx: { cashback: 3 } },
  { id: 'daily_x2',     type: 'boost', name: 'Щоденний бонус ×2 · 7 днів', desc: 'Щоденний бонус удвічі більший',               icon: 'calendar',  price: 2,  days: 7,  fx: { daily: 2 } },
  { id: 'daily_x3',     type: 'boost', name: 'Щоденний бонус ×3 · 7 днів', desc: 'Щоденний бонус утричі більший',               icon: 'calendar',  price: 4,  days: 7,  fx: { daily: 3 } },
  { id: 'xp_boost',     type: 'boost', name: 'Досвід Battle Pass ×2 · 3 дні', desc: 'Подвійний досвід за ставки',              icon: 'bolt',      price: 3,  days: 3,  fx: { xp: 2 } },
  { id: 'vip_trial',    type: 'boost', name: 'VIP +1 рівень · 7 днів',   desc: 'Бонуси й кешбек як на наступному VIP-рівні',   icon: 'crown',     price: 10, days: 7,  fx: { vipUp: 1 } },
  { id: 'monthly_pass', type: 'boost', name: 'Місячний пропуск · 30 днів', desc: 'VIP-прогрес, кешбек, щоденний бонус і досвід — усе ×2', icon: 'ticket', price: 30, days: 30, fx: { wager: 2, cashback: 2, daily: 2, xp: 2 } },
  // ── Предмети (лічильники; витрачаються в іграх) ──
  { id: 'slot_free_5',     type: 'item', name: '10 фріспінів по 100 000 ₴', desc: 'Слоти «777»: спін на 100 000 ₴ без списання ставки', icon: 'slot',     price: 1, counter: 'shopSpins',     qty: 10 },
  { id: 'slot_free_20',    type: 'item', name: '50 фріспінів по 100 000 ₴', desc: 'Слоти «777»: спін на 100 000 ₴ без списання ставки', icon: 'slot',     price: 5, counter: 'shopSpins',     qty: 50 },
  { id: 'fortune_free',    type: 'item', name: '10 прокруток Колеса по 100 000 ₴', desc: 'Колесо фортуни без списання ставки',        icon: 'wheel',    price: 1, counter: 'shopFortune',   qty: 10 },
  { id: 'mines_hint',      type: 'item', name: '3 підказки в Мінах',        desc: 'Підсвічує одну безпечну клітинку в поточному раунді', icon: 'bulb',     price: 1, counter: 'minesHints',    qty: 3 },
  { id: 'crash_insurance', type: 'item', name: '3 страховки Крашу',         desc: 'Якщо застрахований раунд вибухне до ×1.20 — ставка повертається', icon: 'shield-check', price: 1, counter: 'crashInsurance', qty: 3 },
  { id: 'lootbox_basic',   type: 'item', name: 'Скриня «Бронза»',  desc: 'Виграш до ×10 від ціни скрині (1 млн ₴)', icon: 'package',  price: 1, counter: 'lootboxInv/basic',  qty: 1 },
  { id: 'lootbox_ultra',   type: 'item', name: 'Скриня «Срібло»',  desc: 'Виграш до ×12 від ціни скрині (3 млн ₴)', icon: 'package',  price: 3, counter: 'lootboxInv/rare',   qty: 1 },
  { id: 'lootbox_legend',  type: 'item', name: 'Скриня «Золото»',  desc: 'Виграш до ×15 від ціни скрині (8 млн ₴)', icon: 'package',  price: 8, counter: 'lootboxInv/legend', qty: 1 },
];

// Прибрано з магазину у v121 — тим, хто купував, повертаємо Слотіки (lib/shop.js → migrate).
// Причина в коментарі: що робило б товар, і чому він не має сенсу.
const SHOP_REMOVED = {
  badge_alien: 4,       // «Прибулець» — дитячий значок
  chat_emoji_pack: 1,   // емодзі в чаті доступні всім і так
  chat_emoji_pro: 3,
  chat_gif: 5,          // GIF у чаті доступні всім і так
  chat_sticker: 4,      // стікерів у чаті немає
  lucky_boost: 6,       // «+50% шанс» — змінює шанси ігор, цього не буде
  guaranteed_win: 25,   // «100% виграш» — те саме
  sport_bet_free: 4,    // розрахунок спортставок ще не готовий (ROADMAP.md)
  nickname_change: 5,   // нік — це ідентифікатор акаунта, змінити його не можна
  profile_bio: 2,       // біо в профілі безкоштовне
  transfer_free: 2,     // перекази й так без комісії
  private_room: 20,     // приватних кімнат немає
  custom_bet_limit: 15, // максимальна ставка однакова для всіх
};

// «Ефекти профілю» (окреме вікно в Налаштуваннях) ніде не показувались —
// прибрано, ціну повертаємо тим, у кого ефект стоїть (users/<нік>/profileEffect).
const PROFILE_EFFECT_REFUND = { gold_glow: 500, fire: 750, ice: 750, rainbow: 1000, vip_crown: 1500 };

// Скрині: виграш = ціна скрині (у ₴) × mult. Таблиці — як у звичайних ящиках
// (23-vip-hourly-lootbox-quests.js), RTP ≈ 89% / 92% / 96%.
const SHOP_BOXES = {
  basic:  { name: 'Скриня «Бронза»', value: 1 * SLOTIKY_PRICE, prizes: [
    { weight: 70, mult: 0.5 }, { weight: 20, mult: 1.0 }, { weight: 6, mult: 2.0 }, { weight: 3, mult: 4.0 }, { weight: 1, mult: 10.0 } ] },
  rare:   { name: 'Скриня «Срібло»', value: 3 * SLOTIKY_PRICE, prizes: [
    { weight: 75, mult: 0.5 }, { weight: 17, mult: 1.2 }, { weight: 5, mult: 2.5 }, { weight: 2, mult: 5.0 }, { weight: 1, mult: 12.0 } ] },
  legend: { name: 'Скриня «Золото»', value: 8 * SLOTIKY_PRICE, prizes: [
    { weight: 85, mult: 0.6 }, { weight: 10, mult: 1.5 }, { weight: 3, mult: 3.0 }, { weight: 1, mult: 6.0 }, { weight: 1, mult: 15.0 } ] },
  // Бонусна скриня Battle Pass (після 50 рівня) — менша, бо безкоштовна.
  bp:     { name: 'Скриня Battle Pass', value: 10000, prizes: [
    { weight: 70, mult: 0.5 }, { weight: 20, mult: 1.0 }, { weight: 6, mult: 2.0 }, { weight: 3, mult: 4.0 }, { weight: 1, mult: 10.0 } ] },
};

// Ставка спіну, купленого за Слотіки (shopSpins / shopFortune) і безкоштовної
// прокрутки Колеса з Battle Pass (freeFortune).
const SHOP_SPIN_STAKE = 100000;
const FREE_FORTUNE_STAKE = 1000;
// Страховка Крашу: раунд, що вибухнув нижче цього множника, повертає ставку.
const CRASH_INSURANCE_BELOW = 1.2;

const COSMETIC_SLOTS = ['frame', 'nick', 'plate', 'badge'];

function shopItem(id) {
  for (let i = 0; i < SHOP_ITEMS.length; i++) if (SHOP_ITEMS[i].id === id) return SHOP_ITEMS[i];
  return null;
}

// Чи діє буст: { boughtAt, expires } з expires у майбутньому.
function boostActive(rec, now) {
  return !!(rec && typeof rec === 'object' && Number(rec.expires) > now);
}

// Сукупні множники від активних бустів: беремо найбільший у кожній категорії.
function boostEffects(items, now) {
  const fx = { wager: 1, cashback: 1, daily: 1, xp: 1, vipUp: 0 };
  if (!items || typeof items !== 'object') return fx;
  for (let i = 0; i < SHOP_ITEMS.length; i++) {
    const it = SHOP_ITEMS[i];
    if (it.type !== 'boost' || !boostActive(items[it.id], now)) continue;
    for (const k in it.fx) fx[k] = Math.max(fx[k], it.fx[k]);
  }
  return fx;
}

// Що надіто: явний вибір (users/<нік>/cosmetics), якщо цей товар куплено;
// без вибору — найдорожчий куплений у слоті. null у виборі — «нічого».
function resolveCosmetics(items, chosen) {
  const out = {};
  items = items || {};
  chosen = chosen || {};
  COSMETIC_SLOTS.forEach(function (slot) {
    if (Object.prototype.hasOwnProperty.call(chosen, slot)) {
      const id = chosen[slot];
      const it = id && shopItem(id);
      out[slot] = it && it.type === slot && items[id] ? id : null;
      return;
    }
    let best = null;
    SHOP_ITEMS.forEach(function (it) {
      if (it.type === slot && items[it.id] && (!best || it.price > best.price)) best = it;
    });
    out[slot] = best ? best.id : null;
  });
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SLOTIKY_PRICE, SLOTIKY_PACKS, SHOP_ITEMS, SHOP_REMOVED, PROFILE_EFFECT_REFUND, SHOP_BOXES,
    SHOP_SPIN_STAKE, FREE_FORTUNE_STAKE, CRASH_INSURANCE_BELOW, COSMETIC_SLOTS,
    shopItem, boostActive, boostEffects, resolveCosmetics,
  };
}
