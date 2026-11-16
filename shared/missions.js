// ============================================================
// SlotOK — щоденні місії з серією: пул, нагороди, межа доби.
//
// Файл спільний (як shared/rewards.js): браузер вантажить його <script>
// перед app.js, сервер (lib/missions.js) — через require(). Які саме три місії
// отримує гравець, рахує лише сервер (lib/missions.js, хеш від доби й ніку);
// прогрес — теж лише сервер, із серверних подій (api/play, round, room, live).
// ============================================================

// Межа доби — ФІКСОВАНА, UTC+2 (без переходу на літній час): нова доба
// починається о 22:00 UTC, тобто о 00:00 за київською зимою й о 01:00 влітку.
const MISSION_TZ_OFFSET_MS = 2 * 3600000;
const MISSION_DAY_MS = 86400000;
function missionDay(now = Date.now()) { return new Date(now + MISSION_TZ_OFFSET_MS).toISOString().slice(0, 10); }
// Момент (мс від епохи), коли закінчується доба, що містить now.
function missionDayEnd(now = Date.now()) { return (Math.floor((now + MISSION_TZ_OFFSET_MS) / MISSION_DAY_MS) + 1) * MISSION_DAY_MS - MISSION_TZ_OFFSET_MS; }
function missionPrevDay(day) { return new Date(Date.parse(day + 'T00:00:00Z') - MISSION_DAY_MS).toISOString().slice(0, 10); }

// Мінімальна ставка, що зараховується в місії «раунди/ставки/різні ігри».
const MISSION_MIN_BET = 10;
// «Дійди до множника» зараховується лише в цих іграх.
const MISSION_MULT_GAMES = ['limbo', 'crash', 'livecrash'];

// Нагорода за складністю: ₴ і XP Battle Pass (1 XP = 100 ₴ ставок, рівень = 1000 XP).
// Для порівняння: щоденний бонус — 100…1000 ₴. Три місії ≈ 400…900 ₴ на день.
const MISSION_REWARDS = {
  easy: { coins: 100, xp: 10 },
  mid:  { coins: 200, xp: 20 },
  hard: { coins: 350, xp: 35 },
};

// Драбина серії за днями 1…7. День 7 — ще й скриня Battle Pass (lootboxInv/bp).
const MISSION_STREAK_LADDER = [
  { coins: 100 }, { coins: 150 }, { coins: 200 }, { coins: 300 },
  { coins: 400 }, { coins: 600 }, { coins: 500, box: 1 },
];

// kind: rounds — раунди; wager — сума ставок; wins — перемоги; games — різні ігри;
// room — партії в онлайн-кімнатах; m2/m5 — множник ×2 / ×5 у Crash/Limbo.
const MISSION_POOL = [
  { id: 'rounds_5',  kind: 'rounds', target: 5,     tier: 'easy', icon: 'dice',    title: 'Зіграй 5 раундів у серверних іграх' },
  { id: 'rounds_12', kind: 'rounds', target: 12,    tier: 'mid',  icon: 'dice',    title: 'Зіграй 12 раундів у серверних іграх' },
  { id: 'rounds_25', kind: 'rounds', target: 25,    tier: 'hard', icon: 'dice',    title: 'Зіграй 25 раундів у серверних іграх' },
  { id: 'wager_2k',  kind: 'wager',  target: 2000,  tier: 'easy', icon: 'coins',   title: 'Зроби ставок на ₴2 000', amount: true },
  { id: 'wager_10k', kind: 'wager',  target: 10000, tier: 'mid',  icon: 'coins',   title: 'Зроби ставок на ₴10 000', amount: true },
  { id: 'wager_50k', kind: 'wager',  target: 50000, tier: 'hard', icon: 'coins',   title: 'Зроби ставок на ₴50 000', amount: true },
  { id: 'wins_2',    kind: 'wins',   target: 2,     tier: 'easy', icon: 'trophy',  title: 'Виграй 2 рази' },
  { id: 'wins_5',    kind: 'wins',   target: 5,     tier: 'mid',  icon: 'trophy',  title: 'Виграй 5 разів' },
  { id: 'wins_10',   kind: 'wins',   target: 10,    tier: 'hard', icon: 'trophy',  title: 'Виграй 10 разів' },
  { id: 'games_3',   kind: 'games',  target: 3,     tier: 'mid',  icon: 'grid',    title: 'Зіграй у 3 різні ігри' },
  { id: 'games_5',   kind: 'games',  target: 5,     tier: 'hard', icon: 'grid',    title: 'Зіграй у 5 різних ігор' },
  { id: 'room_1',    kind: 'room',   target: 1,     tier: 'mid',  icon: 'users',   title: 'Зіграй партію в онлайн-кімнаті' },
  { id: 'm2_1',      kind: 'm2',     target: 1,     tier: 'mid',  icon: 'rocket',  title: 'Дійди до множника ×2 у Crash або Limbo' },
  { id: 'm5_1',      kind: 'm5',     target: 1,     tier: 'hard', icon: 'rocket',  title: 'Дійди до множника ×5 у Crash або Limbo' },
];
const MISSION_COUNT = 3;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MISSION_TZ_OFFSET_MS, MISSION_DAY_MS, missionDay, missionDayEnd, missionPrevDay,
    MISSION_MIN_BET, MISSION_MULT_GAMES, MISSION_REWARDS, MISSION_STREAK_LADDER, MISSION_POOL, MISSION_COUNT,
  };
}
