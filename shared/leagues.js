// ============================================================
// SlotOK — Рейтингові ліги: ігри, що рейтингуються, ліги, сезон, нагороди.
//
// Файл спільний (як shared/missions.js): браузер вантажить його <script>
// перед app.js, сервер (lib/leagues.js) — через require(). Рейтинг рахує
// лише сервер (lib/leagues.js, з розрахунку онлайн-кімнати у lib/rooms.js).
//
// Формула (Elo, K = 24). У партії з n гравцями кожна пара (i, j) — окремий
// «поєдинок»: S = 1 за перемогу, 0 за поразку, 0.5 якщо обоє в переможцях
// (Texas Hold'em чи Вісімка з кількома місцями призових).
//   E = 1 / (1 + 10^((R_j − R_i) / 400))
//   Δ_i = округлення( K / (n − 1) × Σ_j (S − E) )
// Ділення на (n − 1) тримає зміну за партію в межах ±K незалежно від столу.
// Ставка в рейтинг не входить. Нічия (ставки повернено) і скасована кімната
// рейтинг не змінюють.
// ============================================================

// Ігри, де рішає гра, а не жереб: рейтингуються лише вони (і лише коли за
// столом 2+ живих гравців). Coinflip, Prediction, Бінго, колеса — не рейтингуються;
// Камінь-ножиці теж ні (там вирішує вгадування).
const LEAGUE_GAMES = {
  durak: 'Дурень', eights: 'Вісімка', ludo: 'Лудо', battleship: 'Морський бій', minesweeper: 'Сапер (дуель)', holdem: "Texas Hold'em", fourrow: 'Чотири в ряд',
};

const LEAGUE_START = 1000;      // стартовий рейтинг
const LEAGUE_K = 24;            // максимальна зміна за партію
const LEAGUE_PAIR_DAILY = 5;    // рейтингових партій проти того ж суперника за добу
const LEAGUE_MIN_MS = 20000;    // партія коротша за 20 с не рейтингується (штучні «здачі»)
const LEAGUE_SOFT_RESET = 0.5;  // новий сезон: рейтинг повертається на 50% до 1000
const LEAGUE_MIN_GAMES = 5;     // скільки рейтингових партій за сезон потрібно для нагороди
const LEAGUE_TOP = 50;          // розмір таблиці лідерів
const LEAGUE_RECENT = 10;       // скільки останніх результатів зберігаємо

// Ліги: from — мінімальний рейтинг. coins — нагорода за фінальну лігу сезону
// (₴, віртуальні; для порівняння щоденний бонус — 100…1000 ₴, три місії ≈ 400…900 ₴).
// badge — значок із shared/shop.js (видається назавжди, без Слотіків).
const LEAGUE_TIERS = [
  { id: 'bronze',   name: 'Бронза',  from: 0,    icon: 'medal-2',  coins: 200 },
  { id: 'silver',   name: 'Срібло',  from: 1050, icon: 'medal-1',  coins: 400 },
  { id: 'gold',     name: 'Золото',  from: 1200, icon: 'trophy',   coins: 700 },
  { id: 'platinum', name: 'Платина', from: 1350, icon: 'shield',   coins: 1100 },
  { id: 'diamond',  name: 'Діамант', from: 1500, icon: 'diamond',  coins: 1600, badge: 'badge_shark' },
  { id: 'legend',   name: 'Легенда', from: 1700, icon: 'crown',    coins: 2500, badge: 'badge_crown' },
];

function leagueTierIdx(rating) {
  const r = Number(rating) || 0;
  let idx = 0;
  LEAGUE_TIERS.forEach((t, i) => { if (r >= t.from) idx = i; });
  return idx;
}
function leagueTier(rating) { return LEAGUE_TIERS[leagueTierIdx(rating)]; }

// Сезон — календарний місяць за ФІКСОВАНИМ UTC+2 (як доба місій, без літнього часу).
const LEAGUE_TZ_OFFSET_MS = 2 * 3600000;
function leagueSeason(now = Date.now()) {
  const d = new Date(now + LEAGUE_TZ_OFFSET_MS);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  return {
    id: y + '-' + String(m + 1).padStart(2, '0'),
    start: Date.UTC(y, m, 1) - LEAGUE_TZ_OFFSET_MS,
    end: Date.UTC(y, m + 1, 1) - LEAGUE_TZ_OFFSET_MS,
  };
}

// Рейтинг після переходу в новий сезон.
function leagueSoftReset(rating) {
  return Math.max(0, Math.round(LEAGUE_START + ((Number(rating) || LEAGUE_START) - LEAGUE_START) * LEAGUE_SOFT_RESET));
}

// Elo для столу. ratings[i] — рейтинг місця i; winners — місця переможців;
// pairOk(i, j) — чи зараховується пара (ліміт проти одного суперника за добу).
// Повертає Δ для кожного місця (ціле) і для кого пара зарахована.
function leagueDeltas(ratings, winners, pairOk) {
  const n = ratings.length;
  const won = new Set(winners);
  const raw = ratings.map(() => 0);
  const opp = ratings.map(() => []);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j || (pairOk && !pairOk(i, j))) continue;
      const S = won.has(i) === won.has(j) ? 0.5 : won.has(i) ? 1 : 0;
      const E = 1 / (1 + Math.pow(10, (ratings[j] - ratings[i]) / 400));
      raw[i] += S - E;
      opp[i].push(j);
    }
  }
  return { deltas: raw.map((x) => Math.round((LEAGUE_K / (n - 1)) * x)), opp };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LEAGUE_GAMES, LEAGUE_START, LEAGUE_K, LEAGUE_PAIR_DAILY, LEAGUE_MIN_MS, LEAGUE_SOFT_RESET, LEAGUE_MIN_GAMES,
    LEAGUE_TOP, LEAGUE_RECENT, LEAGUE_TIERS, leagueTierIdx, leagueTier, leagueSeason, leagueSoftReset, leagueDeltas,
  };
}
