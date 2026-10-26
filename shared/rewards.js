// ============================================================
// SlotOK — таблиці нагород: VIP, кешбек, щоденні бонуси, Battle Pass.
//
// Один файл на двох: браузер вантажить його звичайним <script> перед app.js
// (усе нижче стає глобальним), а сервер (lib/progress.js, api/reward.js) —
// через require(). Тож суми, які показує екран, і суми, які реально
// нараховує сервер, не можуть розійтись. Змінюєш цифру — вона змінюється
// всюди одразу.
// ============================================================

// ── Щоденний бонус: сума за днем серії (×VIP dailyMult) ──
const DAILY_BONUSES = [100, 150, 200, 300, 500, 750, 1000];
const DAILY_BONUS_MS = 24 * 3600000;
const STREAK_7_BONUS = 500; // додатково на 7-й день поспіль

// ── Погодинний бонус (сума — VIP_LEVELS[].hourly) ──
const HOURLY_BONUS_MS = 3600000;

// ── Щоденне колесо (раз на календарний день UTC) ──
const DAILY_SPIN_PRIZES = [50,100,200,500,1000,2000,200,100,50,150,300,5000];
function todayStrUTC(now = Date.now()) { return new Date(now).toISOString().split('T')[0]; }

// ── Бонус повернення: якщо не грав 14+ днів ──
const WELCOME_BACK_MIN_DAYS = 14;
function welcomeBackBonus(days) { return Math.min(5000, 300 + days * 250); }

// ── VIP ──
const VIP_LEVELS = [
  { name: 'Iron',      icon: '⚙️',  min: 0,         cashback: 0,      hourly: 10,  dailyMult: 1.0,  class: 'bronze',   cssVar: '#555' },
  { name: 'Bronze',    icon: '🥉',  min: 1000,      cashback: 0,      hourly: 25,  dailyMult: 1.0,  class: 'bronze',   cssVar: 'var(--bronze)' },
  { name: 'Silver',    icon: '🥈',  min: 5000,      cashback: 0.001,  hourly: 50,  dailyMult: 1.1,  class: 'silver',   cssVar: 'var(--silver-c)' },
  { name: 'Gold',      icon: '🥇',  min: 20000,     cashback: 0.002,  hourly: 80,  dailyMult: 1.25, class: 'gold',     cssVar: 'var(--gold-c)' },
  { name: 'Emerald',   icon: '💚',  min: 60000,     cashback: 0.003,  hourly: 120, dailyMult: 1.4,  class: 'gold',     cssVar: '#2ecc71' },
  { name: 'Sapphire',  icon: '💙',  min: 150000,    cashback: 0.004,  hourly: 160, dailyMult: 1.6,  class: 'silver',   cssVar: '#3498db' },
  { name: 'Ruby',      icon: '❤️',  min: 350000,    cashback: 0.005,  hourly: 200, dailyMult: 1.75, class: 'gold',     cssVar: '#e74c3c' },
  { name: 'Platinum',  icon: '💎',  min: 700000,    cashback: 0.006,  hourly: 250, dailyMult: 1.9,  class: 'platinum', cssVar: 'var(--plat)' },
  { name: 'Master',    icon: '🔮',  min: 1500000,   cashback: 0.007,  hourly: 350, dailyMult: 2.0,  class: 'platinum', cssVar: '#9b59b6' },
  { name: 'Elite',     icon: '⭐',  min: 3000000,   cashback: 0.008,  hourly: 500, dailyMult: 2.2,  class: 'platinum', cssVar: '#f39c12' },
  { name: 'Diamond',   icon: '💠',  min: 7000000,   cashback: 0.009,  hourly: 750, dailyMult: 2.5,  class: 'platinum', cssVar: '#1abc9c' },
  { name: 'Legend',    icon: '🌟',  min: 15000000,  cashback: 0.010,  hourly: 1000,dailyMult: 3.0,  class: 'platinum', cssVar: '#e67e22' },
  { name: 'Mythic',    icon: '🔱',  min: 35000000,  cashback: 0.012,  hourly: 1500,dailyMult: 3.5,  class: 'platinum', cssVar: '#e91e63' },
  { name: 'Supreme',   icon: '👑',  min: 100000000, cashback: 0.015,  hourly: 3000,dailyMult: 5.0,  class: 'platinum', cssVar: 'linear-gradient(45deg,#d4af37,#fff)' },
];

function getVipLevel(wagered) {
  for(let i = VIP_LEVELS.length - 1; i >= 0; i--) {
    if(wagered >= VIP_LEVELS[i].min) return { ...VIP_LEVELS[i], index: i };
  }
  return { ...VIP_LEVELS[0], index: 0 };
}

// Кешбек — ліміт 50₴/ставка, 5000₴/тиждень.
const CASHBACK_MAX_PER_BET  = 50;    // грн
const CASHBACK_MAX_PER_WEEK = 5000;  // грн
const CASHBACK_MIN_CLAIM    = 2000;  // грн — мінімум для виводу

// Тіри кланового банку → бонус кешбеку для всіх учасників клану
const CLAN_BANK_TIERS = [
  { min: 100000, cashback: 0.005, label: 'Тір 3', tag: 'gold-animated' },
  { min: 25000,  cashback: 0.0025, label: 'Тір 2', tag: 'gold' },
  { min: 5000,   cashback: 0.001, label: 'Тір 1', tag: 'green' },
  { min: 0,      cashback: 0,     label: 'Без тіру', tag: 'none' }
];
function getClanBankTier(bank) {
  return CLAN_BANK_TIERS.find(t => (bank || 0) >= t.min) || CLAN_BANK_TIERS[CLAN_BANK_TIERS.length - 1];
}

// ── Battle Pass ──
const BP_XP_PER_LEVEL = 1000;
const BP_MAX_LEVEL    = 50;

// Seasons are pure date math (no server cron needed) — every client computes the
// same season number from a fixed epoch, so a season "ends" for everyone at the
// same instant without a scheduled job. Progress from a finished season is
// lazily wiped the next time the player earns XP (lib/progress.js ensureSeason,
// або addBpXP у браузері без сервера).
const BP_SEASON_EPOCH = Date.UTC(2026, 0, 1);
const BP_SEASON_DAYS  = 30;

// Назви й теми сезонів. Сезони самі йдуть по 30 днів від епохи й ніколи не
// закінчуються, тому таблиця лише дає їм обличчя: номер, якого тут немає,
// показується просто як «Сезон N» — нічого не ламається, коли список
// вичерпається. Щоб додати сезон — допиши рядок з наступним num.
const BP_SEASONS = [
  { num: 1,  name: 'Перший захід',     icon: '🎬', color: '#c9a0ff' },
  { num: 2,  name: 'Крижаний банк',    icon: '❄️', color: '#7fd4ff' },
  { num: 3,  name: 'Весняний ап',      icon: '🌱', color: '#6fe08a' },
  { num: 4,  name: 'Квітневий блеф',   icon: '🃏', color: '#ff8fa3' },
  { num: 5,  name: 'Травневий олл-ін', icon: '⚡', color: '#ffd24a' },
  { num: 6,  name: 'Літній заплив',    icon: '🌊', color: '#4ab8ff' },
  { num: 7,  name: 'Спека',            icon: '🔥', color: '#ff7a3d' },
  { num: 8,  name: 'Золотий берег',    icon: '🏝', color: '#ffc861' },
  { num: 9,  name: 'Осінній рейз',     icon: '🍂', color: '#e67e22' },
  { num: 10, name: 'Хелловін',         icon: '🎃', color: '#ff7518' },
  { num: 11, name: 'Нічна зміна',      icon: '🌌', color: '#8f7dff' },
  { num: 12, name: 'Зимове свято',     icon: '🎄', color: '#4cd964' },
  { num: 13, name: 'Новий заїзд',      icon: '🎆', color: '#ffe08a' },
  { num: 14, name: 'Крижаний джекпот', icon: '💎', color: '#9ad8ff' },
  { num: 15, name: 'Космічний рейс',   icon: '🚀', color: '#b18cff' },
  { num: 16, name: 'Корона',           icon: '👑', color: '#d4af37' },
  // 2027–2029 — теми під пору року, коли сезон іде (сезон = 30 днів від епохи).
  { num: 17, name: 'Квітучий джекпот', icon: '🌸', color: '#ff9ecf' },
  { num: 18, name: 'Піратська гавань', icon: '⚓', color: '#5aa0c8' },
  { num: 19, name: 'Сафарі',           icon: '🦁', color: '#e0a040' },
  { num: 20, name: 'Неонове місто',    icon: '🌃', color: '#ff3cac' },
  { num: 21, name: 'Дикий Захід',      icon: '🤠', color: '#c47a3a' },
  { num: 22, name: 'Шлях самурая',     icon: '⛩️', color: '#e04848' },
  { num: 23, name: 'Відьмин котел',    icon: '🧙', color: '#8e44ad' },
  { num: 24, name: 'Кіберпанк',        icon: '🤖', color: '#00e5ff' },
  { num: 25, name: 'Снігова казка',    icon: '⛄', color: '#b8e8ff' },
  { num: 26, name: 'Рік дракона',      icon: '🐉', color: '#ff5a36' },
  { num: 27, name: 'Валентинка',       icon: '💘', color: '#ff6b9a' },
  { num: 28, name: 'Глибокий океан',   icon: '🐙', color: '#1fb5c9' },
  { num: 29, name: 'Скарби фараона',   icon: '🏺', color: '#d9a441' },
  { num: 30, name: 'Орбітальна станція', icon: '🛰️', color: '#9aa9ff' },
  { num: 31, name: 'Тропічний коктейль', icon: '🍹', color: '#ff9f43' },
  { num: 32, name: 'Олімп',            icon: '🏛️', color: '#e6c87a' },
  { num: 33, name: 'Казкове королівство', icon: '🏰', color: '#c39bff' },
  { num: 34, name: 'Сага вікінгів',    icon: '🛡️', color: '#8fa3b8' },
  { num: 35, name: 'Ніч привидів',     icon: '👻', color: '#a0a0ff' },
  { num: 36, name: 'Золота лихоманка', icon: '⛏️', color: '#f5c542' },
  { num: 37, name: 'Північне сяйво',   icon: '🌠', color: '#6fffd2' },
  { num: 38, name: 'Ніч у Монако',     icon: '🎲', color: '#e74c3c' },
  { num: 39, name: 'Джунглі',          icon: '🌴', color: '#3ecf6e' },
  { num: 40, name: 'Арена чемпіонів',  icon: '🏆', color: '#ffd700' },
];
const BP_SEASON_DEFAULT = { name: '', icon: '🎫', color: '#c9a0ff' };

function getBpSeasonTheme(num) {
  return BP_SEASONS.find(s => s.num === num) || BP_SEASON_DEFAULT;
}

function getBpSeasonInfo(now = Date.now()) {
  const len = BP_SEASON_DAYS * 86400000;
  const num = Math.floor((now - BP_SEASON_EPOCH) / len) + 1;
  const endsAt = BP_SEASON_EPOCH + num * len;
  const theme = getBpSeasonTheme(num);
  return { num, endsAt, name: theme.name, icon: theme.icon, color: theme.color };
}

function bpLevelFromXp(xp) { return Math.min(Math.floor((Number(xp) || 0) / BP_XP_PER_LEVEL), BP_MAX_LEVEL); }
const BP_VIP_PRICE_SLOTIKY = 500;

// 50 levels of rewards
const BP_REWARDS = [
  // lv: level, free: free reward, vip: vip-only reward
  {lv:1,  free:{icon:'💰',label:'500 ₴',type:'balance',val:500},          vip:{icon:'🪙',label:'1 Слотік',type:'slotiky',val:1}},
  {lv:2,  free:{icon:'🎟️',label:'2 Спіни',type:'freeSlots',val:2},         vip:{icon:'💰',label:'1 000 ₴',type:'balance',val:1000}},
  {lv:3,  free:{icon:'💰',label:'1 000 ₴',type:'balance',val:1000},        vip:{icon:'🪙',label:'2 Слотіки',type:'slotiky',val:2}},
  {lv:4,  free:{icon:'🎡',label:'1 Прокрутка',type:'freeFortune',val:1},   vip:{icon:'💰',label:'2 000 ₴',type:'balance',val:2000}},
  {lv:5,  free:{icon:'💰',label:'2 000 ₴',type:'balance',val:2000},        vip:{icon:'🛡️',label:'Краш страх.',type:'crashInsurance',val:true}},
  {lv:6,  free:{icon:'🎟️',label:'5 Спінів',type:'freeSlots',val:5},        vip:{icon:'🪙',label:'3 Слотіки',type:'slotiky',val:3}},
  {lv:7,  free:{icon:'💰',label:'3 000 ₴',type:'balance',val:3000},        vip:{icon:'💰',label:'5 000 ₴',type:'balance',val:5000}},
  {lv:8,  free:{icon:'📦',label:'Лут-бокс',type:'lootbox',val:1},          vip:{icon:'🪙',label:'4 Слотіки',type:'slotiky',val:4}},
  {lv:9,  free:{icon:'💰',label:'5 000 ₴',type:'balance',val:5000},        vip:{icon:'🚀',label:'VIP Буст 3д',type:'vipBoost',val:3}},
  {lv:10, free:{icon:'🎡',label:'3 Прокрутки',type:'freeFortune',val:3},   vip:{icon:'💰',label:'10 000 ₴',type:'balance',val:10000}, milestone:true},
  {lv:11, free:{icon:'💰',label:'7 000 ₴',type:'balance',val:7000},        vip:{icon:'🪙',label:'5 Слотіків',type:'slotiky',val:5}},
  {lv:12, free:{icon:'🎟️',label:'10 Спінів',type:'freeSlots',val:10},      vip:{icon:'💰',label:'15 000 ₴',type:'balance',val:15000}},
  {lv:13, free:{icon:'💰',label:'10 000 ₴',type:'balance',val:10000},      vip:{icon:'🪙',label:'6 Слотіків',type:'slotiky',val:6}},
  {lv:14, free:{icon:'💡',label:'3 Підказки',type:'minesHints',val:3},     vip:{icon:'💰',label:'20 000 ₴',type:'balance',val:20000}},
  {lv:15, free:{icon:'💰',label:'15 000 ₴',type:'balance',val:15000},      vip:{icon:'🚀',label:'VIP Буст 7д',type:'vipBoost',val:7}},
  {lv:16, free:{icon:'📦',label:'Ultra Лут',type:'lootbox',val:2},          vip:{icon:'🪙',label:'8 Слотіків',type:'slotiky',val:8}},
  {lv:17, free:{icon:'💰',label:'20 000 ₴',type:'balance',val:20000},      vip:{icon:'💰',label:'30 000 ₴',type:'balance',val:30000}},
  {lv:18, free:{icon:'🎟️',label:'15 Спінів',type:'freeSlots',val:15},      vip:{icon:'🪙',label:'10 Слотіків',type:'slotiky',val:10}},
  {lv:19, free:{icon:'💰',label:'25 000 ₴',type:'balance',val:25000},      vip:{icon:'💰',label:'40 000 ₴',type:'balance',val:40000}},
  {lv:20, free:{icon:'🎡',label:'5 Прокрут.',type:'freeFortune',val:5},    vip:{icon:'🦈',label:'Значок "Акула"',type:'cosmetic',val:'badge_shark'}, milestone:true},
  {lv:21, free:{icon:'💰',label:'30 000 ₴',type:'balance',val:30000},      vip:{icon:'💰',label:'50 000 ₴',type:'balance',val:50000}},
  {lv:22, free:{icon:'🎟️',label:'20 Спінів',type:'freeSlots',val:20},      vip:{icon:'🪙',label:'15 Слотіків',type:'slotiky',val:15}},
  {lv:23, free:{icon:'💰',label:'40 000 ₴',type:'balance',val:40000},      vip:{icon:'💰',label:'70 000 ₴',type:'balance',val:70000}},
  {lv:24, free:{icon:'📦',label:'Legend Лут',type:'lootbox',val:3},         vip:{icon:'🪙',label:'18 Слотіків',type:'slotiky',val:18}},
  {lv:25, free:{icon:'💰',label:'50 000 ₴',type:'balance',val:50000},      vip:{icon:'💰',label:'100 000 ₴',type:'balance',val:100000}},
  {lv:26, free:{icon:'🎟️',label:'25 Спінів',type:'freeSlots',val:25},      vip:{icon:'🪙',label:'20 Слотіків',type:'slotiky',val:20}},
  {lv:27, free:{icon:'💰',label:'60 000 ₴',type:'balance',val:60000},      vip:{icon:'💰',label:'120 000 ₴',type:'balance',val:120000}},
  {lv:28, free:{icon:'🎡',label:'7 Прокрут.',type:'freeFortune',val:7},    vip:{icon:'🪙',label:'22 Слотіки',type:'slotiky',val:22}},
  {lv:29, free:{icon:'💰',label:'75 000 ₴',type:'balance',val:75000},      vip:{icon:'💰',label:'150 000 ₴',type:'balance',val:150000}},
  {lv:30, free:{icon:'💡',label:'5 Підказок',type:'minesHints',val:5},     vip:{icon:'🔥',label:'Вогняний аватар',type:'cosmetic',val:'avatar_fire'}, milestone:true},
  {lv:31, free:{icon:'💰',label:'90 000 ₴',type:'balance',val:90000},      vip:{icon:'💰',label:'180 000 ₴',type:'balance',val:180000}},
  {lv:32, free:{icon:'🎟️',label:'30 Спінів',type:'freeSlots',val:30},      vip:{icon:'🪙',label:'28 Слотіків',type:'slotiky',val:28}},
  {lv:33, free:{icon:'💰',label:'100 000 ₴',type:'balance',val:100000},    vip:{icon:'💰',label:'200 000 ₴',type:'balance',val:200000}},
  {lv:34, free:{icon:'📦',label:'×5 Лут',type:'lootbox',val:5},            vip:{icon:'🪙',label:'30 Слотіків',type:'slotiky',val:30}},
  {lv:35, free:{icon:'💰',label:'120 000 ₴',type:'balance',val:120000},    vip:{icon:'💰',label:'250 000 ₴',type:'balance',val:250000}},
  {lv:36, free:{icon:'🎡',label:'10 Прокрут.',type:'freeFortune',val:10},  vip:{icon:'🪙',label:'35 Слотіків',type:'slotiky',val:35}},
  {lv:37, free:{icon:'💰',label:'150 000 ₴',type:'balance',val:150000},    vip:{icon:'💰',label:'300 000 ₴',type:'balance',val:300000}},
  {lv:38, free:{icon:'🎟️',label:'40 Спінів',type:'freeSlots',val:40},      vip:{icon:'🪙',label:'40 Слотіків',type:'slotiky',val:40}},
  {lv:39, free:{icon:'💰',label:'200 000 ₴',type:'balance',val:200000},    vip:{icon:'💰',label:'400 000 ₴',type:'balance',val:400000}},
  {lv:40, free:{icon:'💡',label:'10 Підказок',type:'minesHints',val:10},   vip:{icon:'🐉',label:'Значок "Дракон"',type:'cosmetic',val:'badge_dragon'}, milestone:true},
  {lv:41, free:{icon:'💰',label:'250 000 ₴',type:'balance',val:250000},    vip:{icon:'💰',label:'500 000 ₴',type:'balance',val:500000}},
  {lv:42, free:{icon:'🎟️',label:'50 Спінів',type:'freeSlots',val:50},      vip:{icon:'🪙',label:'55 Слотіків',type:'slotiky',val:55}},
  {lv:43, free:{icon:'💰',label:'300 000 ₴',type:'balance',val:300000},    vip:{icon:'💰',label:'600 000 ₴',type:'balance',val:600000}},
  {lv:44, free:{icon:'📦',label:'×10 Лут',type:'lootbox',val:10},          vip:{icon:'🪙',label:'60 Слотіків',type:'slotiky',val:60}},
  {lv:45, free:{icon:'💰',label:'400 000 ₴',type:'balance',val:400000},    vip:{icon:'💰',label:'800 000 ₴',type:'balance',val:800000}},
  {lv:46, free:{icon:'🎡',label:'15 Прокрут.',type:'freeFortune',val:15},  vip:{icon:'🪙',label:'70 Слотіків',type:'slotiky',val:70}},
  {lv:47, free:{icon:'💰',label:'500 000 ₴',type:'balance',val:500000},    vip:{icon:'💰',label:'1 000 000 ₴',type:'balance',val:1000000}},
  {lv:48, free:{icon:'🎟️',label:'75 Спінів',type:'freeSlots',val:75},      vip:{icon:'🪙',label:'80 Слотіків',type:'slotiky',val:80}},
  {lv:49, free:{icon:'💰',label:'750 000 ₴',type:'balance',val:750000},    vip:{icon:'💰',label:'1 500 000 ₴',type:'balance',val:1500000}},
  {lv:50, free:{icon:'👑',label:'1 000 000 ₴',type:'balance',val:1000000}, vip:{icon:'🔱',label:'Рамка "Supreme"',type:'cosmetic',val:'name_frame'}, milestone:true},
];

// Після 50-го рівня сезон не «закінчується»: кожні BP_BONUS_XP досвіду дають
// бонусну скриню (лут-бокс; з VIP-пропуском — ще й 2 Слотіки).
const BP_BONUS_XP = 2000;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DAILY_BONUSES, DAILY_BONUS_MS, STREAK_7_BONUS, HOURLY_BONUS_MS,
    DAILY_SPIN_PRIZES, todayStrUTC, WELCOME_BACK_MIN_DAYS, welcomeBackBonus,
    VIP_LEVELS, getVipLevel, CASHBACK_MAX_PER_BET, CASHBACK_MAX_PER_WEEK, CASHBACK_MIN_CLAIM,
    CLAN_BANK_TIERS, getClanBankTier,
    BP_XP_PER_LEVEL, BP_MAX_LEVEL, BP_SEASON_EPOCH, BP_SEASON_DAYS, BP_SEASONS, BP_SEASON_DEFAULT,
    getBpSeasonTheme, getBpSeasonInfo, bpLevelFromXp, BP_VIP_PRICE_SLOTIKY, BP_REWARDS, BP_BONUS_XP,
  };
}
