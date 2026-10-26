// Ігри з кількома ходами (Mines, Tower, Hi-Lo): правила як чисті функції над
// станом раунду. Секретна частина стану (де міни, порядок колоди) живе лише
// на сервері — у game_sessions/<нік>/<гра>, куди браузер не має доступу, — а
// клієнт отримує тільки view(): те, що гравець і так уже бачить.
//
// Кожна гра:
//   parse(params)              → нормалізовані параметри або null
//   init(params, rng)          → початковий стан
//   move(state, move, rng)     → { state, bust } або null (недозволений хід)
//   mult(state)                → поточний множник для кешауту (0 — ще нема чого забирати)
//   finished(state)            → true, якщо раунд завершився сам (усе відкрито)
//   view(state, reveal)        → публічний стан для клієнта; reveal — показати все (кінець раунду)
//   fix(state)                 → відновити порожні масиви / null після читання з RTDB
//                                (база їх не зберігає: [] і null просто зникають)
//
// Множники — ті самі формули, що в app.js до переносу (0.97 / шанс).

function round2(x) {
  return Number.parseFloat(x.toFixed(2));
}

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["♠", "♥", "♦", "♣"];

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const SESSION_GAMES = {
  // 5×5, гравець обирає кількість мін; кожна відкрита безпечна клітинка
  // підвищує множник до 0.97 / P(відкрити стільки безпечних поспіль).
  mines: {
    parse(p) {
      const mines = p && p.mines;
      return Number.isInteger(mines) && mines >= 1 && mines <= 24 ? { mines } : null;
    },
    init({ mines }, rng) {
      const cells = shuffle(Array.from({ length: 25 }, (_, i) => i), rng);
      return { mines: cells.slice(0, mines).sort((a, b) => a - b), opened: [], hit: null };
    },
    move(state, m) {
      const cell = m && m.cell;
      if (!Number.isInteger(cell) || cell < 0 || cell > 24 || state.opened.includes(cell)) return null;
      if (state.mines.includes(cell)) return { state: { ...state, hit: cell }, bust: true };
      return { state: { ...state, opened: [...state.opened, cell] }, bust: false };
    },
    mult(state) {
      const safe = 25 - state.mines.length;
      const n = state.opened.length;
      if (n === 0) return 0;
      let prob = 1;
      for (let i = 0; i < n; i++) prob *= (safe - i) / (25 - i);
      return round2(0.97 / prob);
    },
    finished(state) {
      return state.opened.length === 25 - state.mines.length;
    },
    view(state, reveal) {
      return { opened: state.opened, mineCount: state.mines.length, hit: state.hit, ...(reveal ? { mines: state.mines } : {}) };
    },
    fix(s) {
      return { ...s, mines: s.mines || [], opened: s.opened || [], hit: s.hit ?? null };
    },
  },

  // 10 поверхів по 4 клітинки, на кожному diff мін (1..3); міни поверху
  // визначаються в момент ходу — так само випадково, як і наперед.
  tower: {
    COLS: 4,
    LEVELS: 10,
    parse(p) {
      const diff = p && p.diff;
      return Number.isInteger(diff) && diff >= 1 && diff <= 3 ? { diff } : null;
    },
    init({ diff }) {
      return { diff, level: 0, rows: [] };
    },
    move(state, m, rng) {
      const col = m && m.col;
      if (!Number.isInteger(col) || col < 0 || col >= this.COLS || state.level >= this.LEVELS) return null;
      const mines = shuffle(Array.from({ length: this.COLS }, (_, i) => i), rng).slice(0, state.diff).sort();
      const row = { col, mines };
      const bust = mines.includes(col);
      return { state: { ...state, rows: [...state.rows, row], level: bust ? state.level : state.level + 1 }, bust };
    },
    mult(state) {
      if (state.level === 0) return 0;
      const prob = (this.COLS - state.diff) / this.COLS;
      return round2(Math.pow(1 / prob, state.level) * 0.97);
    },
    finished(state) {
      return state.level >= this.LEVELS;
    },
    view(state) {
      return { level: state.level, rows: state.rows, diff: state.diff };
    },
    fix(s) {
      return { ...s, level: s.level || 0, rows: (s.rows || []).map((r) => ({ col: r.col, mines: r.mines || [] })) };
    },
  },

  // Hi-Lo: колода з 52 карт; вгадуй, чи наступна вища/нижча. Нічия —
  // перетягування без зміни множника. Крок множника — 0.97 / P(вгадати)
  // по картах, що лишились у колоді.
  hilo: {
    parse() {
      return {};
    },
    init(_p, rng) {
      const deck = [];
      for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) deck.push({ r, s });
      shuffle(deck, rng);
      const current = deck.pop();
      return { deck, current, multiplier: 1, streak: 0, history: [] };
    },
    stepMult(curR, dir, deck) {
      let win = 0, lose = 0;
      for (const c of deck) {
        if (c.r === curR) continue;
        if ((dir === "high") === (c.r > curR)) win++; else lose++;
      }
      return win === 0 ? 0 : (0.97 * (win + lose)) / win;
    },
    move(state, m) {
      const dir = m && m.dir;
      if (dir !== "high" && dir !== "low") return null;
      const step = this.stepMult(state.current.r, dir, state.deck);
      if (step === 0) return null; // вгадати неможливо — хід не приймаємо
      const deck = state.deck.slice();
      let next = deck.pop();
      const history = [...state.history];
      let current = state.current;
      // Нічия: перетягуємо, поки не випаде інший ранг (колода точно не скінчиться,
      // бо step > 0 означає, що карта іншого рангу ще є).
      while (next.r === current.r) { history.push({ card: next, tie: true }); current = next; next = deck.pop(); }
      const ok = dir === "high" ? next.r > current.r : next.r < current.r;
      history.push({ card: next, dir, ok });
      if (!ok) return { state: { ...state, deck, current: next, history }, bust: true };
      return {
        state: { ...state, deck, current: next, history, streak: state.streak + 1, multiplier: round2(state.multiplier * step) },
        bust: false,
      };
    },
    mult(state) {
      return state.streak > 0 ? state.multiplier : 0;
    },
    finished(state) {
      return state.deck.length === 0;
    },
    view(state) {
      return {
        current: { rank: RANKS[state.current.r], suit: SUITS[state.current.s] },
        multiplier: state.multiplier,
        streak: state.streak,
        last: state.history.slice(-3).map((h) => ({ rank: RANKS[h.card.r], suit: SUITS[h.card.s], tie: !!h.tie, ok: h.ok })),
        // Підказка UI: скільки дасть кожен напрямок (і чи він взагалі можливий).
        next: { high: round2(this.stepMult(state.current.r, "high", state.deck)), low: round2(this.stepMult(state.current.r, "low", state.deck)) },
      };
    },
    fix(s) {
      return { ...s, deck: s.deck || [], history: s.history || [], streak: s.streak || 0, multiplier: s.multiplier || 1 };
    },
  },
};

// ── Ігри в реальному часі (Crash, Balloon) ──
// Множник росте з часом за серверним годинником; точка вибуху — секрет
// сервера з розподілом P(дожити до ×x) = 0.97 / x (RTP 97% за будь-якої
// стратегії). Клієнт лише анімує і питає «ще летить?» (poll).
//   multAt(state, elapsedMs)  → множник у цей момент
//   endsAt(state)             → мс від старту, коли все вибухне
function crashPointFrom(rng, luck) {
  if (luck) return round2(1.3 + (rng.int(0, 1000000) / 1000000) * 5); // «удача новачка», як у клієнті
  const u = rng.int(0, 1000000000) / 1000000000; // [0, 1)
  return Math.max(1, Math.floor((0.97 / (1 - u)) * 100) / 100);
}

const MAX_TICKS = 20000;

function timedGame({ tickMs, step }) {
  // Множник після n тіків (як setInterval у клієнті) — таблиця на MAX_TICKS
  // тіків, рахується один раз (без неї кожен хід був би O(n²)).
  const table = [1];
  for (let i = 1; i <= MAX_TICKS; i++) table.push(step(table[i - 1]));
  const multAfter = (n) => round2(table[Math.max(0, Math.min(n, MAX_TICKS))]);
  // Перший тік, на якому множник досягає value (двійковий пошук).
  const tickFor = (value) => {
    let lo = 0, hi = MAX_TICKS;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (multAfter(mid) >= value) hi = mid; else lo = mid + 1; }
    return lo;
  };
  return {
    timed: true,
    tickMs,
    parse(p) {
      const auto = p && p.auto;
      if (auto === undefined || auto === null || auto === 0) return { auto: 0 };
      return typeof auto === "number" && Number.isFinite(auto) && auto >= 1.01 && auto <= 1000 ? { auto: round2(auto) } : null;
    },
    init({ auto }, rng, ctx) {
      const point = crashPointFrom(rng, ctx && ctx.luck);
      // Перший тік, на якому множник досягне точки вибуху, — там і вибух.
      return { point, auto, crashTick: tickFor(point), startedAt: Date.now() };
    },
    multAt(state, elapsedMs) {
      return multAfter(Math.min(Math.floor(elapsedMs / tickMs), state.crashTick));
    },
    endsAt(state) {
      return state.crashTick * tickMs;
    },
    // Автокешаут спрацьовує, якщо ціль досягається раніше за вибух.
    autoHit(state) {
      return state.auto > 0 && tickFor(state.auto) < state.crashTick ? state.auto : 0;
    },
    autoAtMs(state) {
      return this.autoHit(state) ? tickFor(state.auto) * tickMs : Infinity;
    },
    // Стан раунду в момент now: вибух, автокешаут або ще летить.
    // claim — множник, на якому гравець натиснув «Забрати» (його екран
    // трохи відстає від сервера); платимо не більше, ніж є на сервері зараз.
    resolve(state, now, claim) {
      const elapsed = now - state.startedAt;
      if (elapsed >= this.autoAtMs(state)) return { status: "cashing", mult: state.auto };
      if (elapsed >= state.crashTick * tickMs) return { status: "lost" };
      const current = this.multAt(state, elapsed);
      if (claim === undefined) return { status: "active", mult: current };
      const m = typeof claim === "number" && claim >= 1 && claim <= current ? round2(claim) : current;
      return { status: "cashing", mult: m };
    },
    mult() {
      return 0; // для «звичайного» кешауту без часу не застосовується
    },
    move() { return null; },
    finished() { return false; },
    view(state, reveal) {
      return { startedAt: state.startedAt, tickMs, auto: state.auto, ...(reveal ? { point: multAfter(state.crashTick) } : {}) };
    },
    fix(s) {
      return { ...s, auto: s.auto || 0, crashTick: s.crashTick || 0 };
    },
  };
}

// Crash: кожні 100 мс m += 0.03 + m·0.002 (як у startCrash в app.js).
SESSION_GAMES.crash = timedGame({ tickMs: 100, step: (m) => m + 0.03 + m * 0.002 });
// Balloon: кожні 500 мс +0.12 (як updateBalloonMult в app.js).
SESSION_GAMES.balloon = timedGame({ tickMs: 500, step: (m) => m + 0.12 });

module.exports = { SESSION_GAMES, RANKS, SUITS };
