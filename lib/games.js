// Серверні правила ігор: чисті функції (bet, params, rng) → результат.
// RNG передається параметром, щоб selfcheck міг перевірити математику, а в
// проді — це crypto.randomInt (див. api/play.js).
//
// Формули — ті самі, що в app.js до переносу (rollDice, playLimbo), щоб
// гравець не помітив різниці в коефіцієнтах.

const MAX_BET = 1000000;

function round2(x) {
  return Number.parseFloat(x.toFixed(2));
}

// Виплата = ставка × множник, округлена вниз до гривні. Епсилон — бо в JS
// 100 × 1.16 = 115.99999…, і гравець отримав би 115 замість показаних 116.
function payFor(bet, mult) {
  return Math.floor(bet * mult + 1e-6);
}

const GAMES = {
  // Кості: число 1..99, ставка «більше/менше» за ціль 2..98.
  dice: {
    parse(p) {
      const target = p && p.target;
      const dir = p && p.dir;
      if (typeof target !== "number" || !Number.isInteger(target) || target < 2 || target > 98) return null;
      if (dir !== "over" && dir !== "under") return null;
      return { target, dir };
    },
    play(bet, { target, dir }, rng) {
      const result = rng.int(1, 100); // 1..99
      const chance = dir === "over" ? (99 - target) / 99 : (target - 1) / 99;
      const mult = round2(0.97 / chance);
      const win = dir === "over" ? result > target : result < target;
      return { result, mult, win, payout: win ? payFor(bet, mult) : 0 };
    },
  },

  // Limbo: множник з розподілом як у Crash (RTP 97%), виграш — ставка × ціль.
  limbo: {
    parse(p) {
      const target = p && p.target;
      if (typeof target !== "number" || !Number.isFinite(target) || target < 1.01 || target > 1000000) return null;
      return { target: round2(target) };
    },
    play(bet, { target }, rng) {
      const rand = rng.int(1, 1000000001) / 1000000000; // (0, 1]
      const result = round2(Math.max(1, 97 / (rand * 100)));
      const win = result >= target;
      return { result, mult: target, win, payout: win ? payFor(bet, target) : 0 };
    },
  },

  // Sic Bo: три кубики. type: big/small (×2, трипл програє), triple (×24),
  // sum — точна сума 4..17 з таблицею коефіцієнтів.
  sicbo: {
    SUM_MULT: { 4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17, 16: 30, 17: 60 },
    parse(p) {
      const type = p && p.type;
      if (type === "big" || type === "small" || type === "triple") return { type };
      if (type === "sum" && Number.isInteger(p.sum) && p.sum >= 4 && p.sum <= 17) return { type, sum: p.sum };
      return null;
    },
    play(bet, { type, sum: target }, rng) {
      const dice = [rng.int(1, 7), rng.int(1, 7), rng.int(1, 7)];
      const sum = dice[0] + dice[1] + dice[2];
      const triple = dice[0] === dice[1] && dice[1] === dice[2];
      let win = false, mult = 0;
      if (type === "big") { win = sum >= 11 && !triple; mult = 2; }
      if (type === "small") { win = sum <= 10 && !triple; mult = 2; }
      if (type === "triple") { win = triple; mult = 24; }
      if (type === "sum") { win = sum === target; mult = this.SUM_MULT[target]; }
      return { dice, sum, triple, win, mult, payout: win ? payFor(bet, mult) : 0 };
    },
  },

  // Card War: карта гравця проти карти дилера; вища — ×2, нічия — повернення ставки.
  cardwar: {
    parse() { return {}; },
    play(bet, _p, rng) {
      const player = { rank: rng.int(0, 13), suit: rng.int(0, 4) };
      const dealer = { rank: rng.int(0, 13), suit: rng.int(0, 4) };
      const outcome = player.rank > dealer.rank ? "win" : player.rank < dealer.rank ? "lose" : "tie";
      const payout = outcome === "win" ? bet * 2 : outcome === "tie" ? bet : 0;
      return { player, dealer, outcome, win: outcome !== "lose", payout };
    },
  },

  // Plinko: 7 кошиків. До ребалансу RTP був вищий за 100% на всіх рівнях, а ваги low/med давали в сумі 1,2 і 1,05.
  // Ваги low/med збережено, коефіцієнти знижено; у high збережено великі
  // коефіцієнти (×20 по краях), натомість зменшено шанс туди потрапити.
  // Таблиця дублюється в app.js (PLINKO_TABLE) — тест звіряє, що вони однакові.
  plinko: {
    TABLE: {
      low: { weights: [0.04, 0.12, 0.20, 0.28, 0.20, 0.12, 0.04], mults: [1.4, 1.2, 1.0, 0.6, 1.0, 1.2, 1.4] },
      med: { weights: [0.07, 0.11, 0.19, 0.26, 0.19, 0.11, 0.07], mults: [3, 1.3, 0.6, 0.1, 0.6, 1.3, 3] },
      high: { weights: [0.008, 0.03, 0.115, 0.694, 0.115, 0.03, 0.008], mults: [20, 5, 1.5, 0, 1.5, 5, 20] },
    },
    parse(p) {
      return p && this.TABLE[p.risk] ? { risk: p.risk } : null;
    },
    play(bet, { risk }, rng) {
      const { weights, mults } = this.TABLE[risk];
      const r = rng.int(0, 1000000) / 1000000;
      let acc = 0, bucket = weights.length - 1;
      for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (r < acc) { bucket = i; break; } }
      const mult = mults[bucket];
      const payout = payFor(bet, mult);
      return { bucket, mult, win: payout >= bet, payout };
    },
  },

  // Keno: 20 кульок із 40. Стара таблиця була від Keno «20 із 80», тож при
  // 20 із 40 RTP виходив 150–763%. Нова таблиця — RTP 92–96% для кожної
  // кількості обраних чисел (тест рахує точно, гіпергеометрично).
  keno: {
    PAY: {
      1: [0, 1.9], 2: [0, 0.5, 2.8], 3: [0, 0, 1, 5], 4: [0, 0, 0.4, 1.5, 8],
      5: [0, 0, 0.3, 0.8, 2.2, 10], 6: [0, 0, 0, 0.5, 1.2, 4, 16], 7: [0, 0, 0, 0.2, 0.7, 2, 6, 24],
      8: [0, 0, 0, 0.2, 0.4, 1, 3, 10, 40], 9: [0, 0, 0, 0, 0.3, 0.6, 1.5, 5, 16, 80],
      10: [0, 0, 0, 0, 0.1, 0.4, 1, 2.5, 7.5, 25, 125],
    },
    parse(p) {
      const picks = p && p.picks;
      if (!Array.isArray(picks) || picks.length < 1 || picks.length > 10) return null;
      if (!picks.every((n) => Number.isInteger(n) && n >= 1 && n <= 40)) return null;
      if (new Set(picks).size !== picks.length) return null;
      return { picks: picks.slice() };
    },
    play(bet, { picks }, rng) {
      const pool = Array.from({ length: 40 }, (_, i) => i + 1);
      for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(0, i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const drawn = pool.slice(0, 20);
      const hits = picks.filter((n) => drawn.includes(n)).length;
      const mult = this.PAY[picks.length][hits] || 0;
      const payout = payFor(bet, mult);
      return { drawn, hits, mult, win: payout > 0, payout };
    },
  },

  // Скретч-картка: три однакові символи — ×20 / ×5 / ×3. Було рівно 100% RTP
  // (2% + 6% + 10%); зірку зменшено до 8,8% → 96,4%. luck — «удача новачка»
  // (перші ігри після реєстрації), як і в клієнті.
  scratch: {
    PRIZES: [{ sym: "💎", chance: 0.02, mult: 20 }, { sym: "💰", chance: 0.06, mult: 5 }, { sym: "⭐", chance: 0.088, mult: 3 }],
    parse() { return {}; },
    play(bet, _p, rng, ctx) {
      const r = rng.int(0, 1000000) / 1000000;
      const x = ctx && ctx.luck ? r * 0.4 : r;
      let acc = 0, prize = null;
      for (const p of this.PRIZES) { acc += p.chance; if (x < acc) { prize = p; break; } }
      const payout = prize ? payFor(bet, prize.mult) : 0;
      return { symbol: prize ? prize.sym : null, mult: prize ? prize.mult : 0, win: !!prize, payout };
    },
  },

  // Double: червоне/чорне ×2 (по 46,5%), зелене ×14 (7%) — RTP 93% / 98%.
  // «Удача новачка»: 48% / 48% / 4%, як у клієнті.
  double: {
    parse(p) {
      return p && ["red", "black", "green"].includes(p.color) ? { color: p.color } : null;
    },
    play(bet, { color }, rng, ctx) {
      const r = rng.int(0, 1000000) / 1000000;
      const [a, b] = ctx && ctx.luck ? [0.48, 0.96] : [0.465, 0.93];
      const result = r < a ? "red" : r < b ? "black" : "green";
      const mult = result === "green" ? 14 : 2;
      const win = color === result;
      return { result, mult, win, payout: win ? payFor(bet, mult) : 0 };
    },
  },

  // Колесо фортуни: 24 рівноймовірні сегменти (RTP 97,9%). Таблиця — та сама,
  // що FORTUNE_SEGMENTS в app.js (тест звіряє).
  fortune: {
    MULTS: [0, 0.2, 0, 0.5, 0, 1, 0, 0.2, 0, 0.5, 0, 2, 0, 0.2, 0, 0.5, 0, 3, 0, 0.2, 0, 5, 0.2, 10],
    parse() { return {}; },
    play(bet, _p, rng) {
      const segment = rng.int(0, this.MULTS.length);
      const mult = this.MULTS[segment];
      return { segment, mult, win: mult > 0, payout: payFor(bet, mult) };
    },
  },

  // Magic Chests: відкрита скриня — 40% на ×2.4 (RTP 96%).
  chests: {
    parse() { return {}; },
    play(bet, _p, rng) {
      const win = rng.int(0, 1000000) < 400000;
      return { win, mult: 2.4, payout: win ? payFor(bet, 2.4) : 0 };
    },
  },

  // Classic 777. Раніше разом з бонус-раундом і фріспінами RTP був ≈158%, а
  // фріспін грався на будь-яку ставку з поля вводу. Тепер (точний розрахунок у
  // тесті): звичайні виграші 64%, бонус-раунд 1% (10 спінів з кращим шансом і
  // ×2–×3), фріспіни 2,5% (+5, ставка до 100 ₴) — разом ≈96%.
  // mode: paid | free | bonus — режим перевіряє api/play.js (чи є фріспін /
  // активний бонус-раунд); тут лише математика спіну.
  slots: {
    LINES: [
      { upTo: 0.005, reels: ["7️", "7️", "7️"], mult: 50 },
      { upTo: 0.015, reels: ["💎", "💎", "💎"], mult: 15 },
      { upTo: 0.06, reels: ["🍒", "🍒", "🍒"], mult: 3 },
      { upTo: 0.13, reels: ["🔔", "🔔", "🍋"], mult: 1.5 },
    ],
    BONUS_UPTO: 0.14,
    FREE_UPTO: 0.165,
    BONUS_ODDS: 0.8, // у бонус-раунді adj = r × 0.8
    BONUS_SPINS: 10,
    FREE_SPINS: 5,
    FREE_SPIN_MAX_BET: 100,
    parse(p) {
      const mode = p && p.mode;
      return ["paid", "free", "bonus"].includes(mode) ? { mode } : null;
    },
    play(bet, { mode, bonusMult }, rng, ctx) {
      const r = rng.int(0, 1000000) / 1000000;
      const adj = mode === "bonus" ? r * this.BONUS_ODDS : ctx && ctx.luck ? r * 0.35 : r;
      const line = this.LINES.find((l) => adj < l.upTo);
      const m = mode === "bonus" ? bonusMult || 1 : 1;
      if (line) return { reels: line.reels, mult: line.mult * m, win: true, payout: payFor(bet, line.mult * m), trigger: null };
      if (mode !== "bonus" && adj < this.BONUS_UPTO) return { reels: ["🎰", "🎰", "🎰"], mult: 0, win: false, payout: 0, trigger: "bonus", bonusMult: 2 + rng.int(0, 2) };
      if (mode !== "bonus" && adj < this.FREE_UPTO) return { reels: ["⭐", "⭐", "⭐"], mult: 0, win: false, payout: 0, trigger: "free" };
      return { reels: ["🍒", "🍋", "🔔"], mult: 0, win: false, payout: 0, trigger: null };
    },
  },

  // Diamond Rush: та сама таблиця, що в app.js (RTP 93,5%); новачкам adj = r × 0.6.
  diamond: {
    LINES: [
      { upTo: 0.004, reels: ["🎩", "🎩", "🎩"], mult: 45 },
      { upTo: 0.016, reels: ["👑", "👑", "👑"], mult: 15 },
      { upTo: 0.046, reels: ["💍", "💍", "💍"], mult: 6 },
      { upTo: 0.126, reels: ["🔷", "🔷", "🔷"], mult: 2.5 },
      { upTo: 0.276, reels: ["✨", "✨", "🥂"], mult: 1.3 },
    ],
    parse() { return {}; },
    play(bet, _p, rng, ctx) {
      const r = rng.int(0, 1000000) / 1000000;
      const adj = ctx && ctx.luck ? r * 0.6 : r;
      const line = this.LINES.find((l) => adj < l.upTo);
      if (!line) return { reels: ["🔷", "✨", "🥂"], mult: 0, win: false, payout: 0 };
      return { reels: line.reels, mult: line.mult, win: true, payout: payFor(bet, line.mult) };
    },
  },
  // ── Нові ігри v110 (3D) ─────────────────────────────────────────────

  // Plinko 3D: дошка Гальтона на 12 рядів. Кулька на кожному рядку йде
  // ліворуч/праворуч 50/50 — сервер віддає весь шлях, клієнт його програє в 3D.
  // Кошик = кількість «праворуч» (0..12), ймовірність C(12,k)/4096.
  // RTP (точно, тест рахує): low 96,7%, med 96,7%, high 96,9%.
  plinko3d: {
    ROWS: 12,
    MULTS: {
      low: [10, 3, 1.6, 1.4, 1.1, 1, 0.4, 1, 1.1, 1.4, 1.6, 3, 10],
      med: [33, 11, 4, 2, 1.1, 0.6, 0.2, 0.6, 1.1, 2, 4, 11, 33],
      high: [170, 24, 8.1, 2, 0.7, 0.2, 0.1, 0.2, 0.7, 2, 8.1, 24, 170],
    },
    parse(p) {
      return p && this.MULTS[p.risk] ? { risk: p.risk } : null;
    },
    play(bet, { risk }, rng) {
      const path = Array.from({ length: this.ROWS }, () => rng.int(0, 2));
      const bucket = path.reduce((a, b) => a + b, 0);
      const mult = this.MULTS[risk][bucket];
      const payout = payFor(bet, mult);
      return { path, bucket, mult, win: payout >= bet, payout };
    },
  },

  // Колесо удачі 3D: 30 рівноймовірних сегментів, один — «БОНУС»: тоді
  // крутиться друге колесо з множниками ×1…×30 (середнє ×7,5). RTP 96,7%.
  wheel3d: {
    SEGMENTS: [0, 1.2, 0, 2, 0, 1.5, 0, 3, 0, 1.2, 0, 2, 0, 5, 0, 1.2, 0, 2, 0, 0, 0, 1.2, 0, 0, 1.2, 0, 0, 0, "B", 0],
    BONUS: [1, 2, 2, 3, 3, 4, 5, 6, 8, 10, 16, 30],
    parse() { return {}; },
    play(bet, _p, rng) {
      const segment = rng.int(0, this.SEGMENTS.length);
      const v = this.SEGMENTS[segment];
      if (v === "B") {
        const bonusSegment = rng.int(0, this.BONUS.length);
        const mult = this.BONUS[bonusSegment];
        return { segment, bonus: true, bonusSegment, mult, win: true, payout: payFor(bet, mult) };
      }
      return { segment, bonus: false, mult: v, win: v > 0, payout: payFor(bet, v) };
    },
  },

  // Craps 3D (одна кидка двох кубиків): мала сума 2–6 / велика 8–12 (×2,3),
  // сімка (×5,8), дубль (×5,8), точна сума 2..12 (≈0,97 / ймовірність).
  // RTP 95,8–96,9% для будь-якої ставки (тест рахує точно).
  craps: {
    SUM_MULT: { 2: 34.9, 3: 17.4, 4: 11.6, 5: 8.7, 6: 6.9, 7: 5.8, 8: 6.9, 9: 8.7, 10: 11.6, 11: 17.4, 12: 34.9 },
    TYPE_MULT: { small: 2.3, big: 2.3, seven: 5.8, doubles: 5.8 },
    parse(p) {
      const type = p && p.type;
      if (this.TYPE_MULT[type]) return { type };
      if (type === "sum" && Number.isInteger(p.sum) && p.sum >= 2 && p.sum <= 12) return { type, sum: p.sum };
      return null;
    },
    play(bet, { type, sum: target }, rng) {
      const dice = [rng.int(1, 7), rng.int(1, 7)];
      const sum = dice[0] + dice[1];
      const win = type === "small" ? sum <= 6 : type === "big" ? sum >= 8 : type === "seven" ? sum === 7
        : type === "doubles" ? dice[0] === dice[1] : sum === target;
      const mult = type === "sum" ? this.SUM_MULT[target] : this.TYPE_MULT[type];
      return { dice, sum, win, mult, payout: win ? payFor(bet, mult) : 0 };
    },
  },

  // Слот 5×3, 10 ліній. Символи: 0 вишня, 1 лимон, 2 дзвін, 3 конюшина,
  // 4 діамант, 5 корона, 6 сімка, 7 вайлд (замінює всі, крім скатера),
  // 8 скатер (подарунок: 3/4/5 будь-де — ×3/×10/×50 від усієї ставки).
  // Виплата лінії — множник × (ставка / 10), лише зліва направо підряд.
  // RTP 96,05% — тест рахує точно: на кожній лінії символи барабанів
  // незалежні й рівномірні за стрічкою, тож лінії рахуються аналітично.
  slot5: {
    REELS: [
      [3, 2, 2, 0, 1, 2, 5, 7, 1, 1, 1, 0, 2, 8, 5, 1, 0, 4, 3, 3, 1, 6, 2, 0, 8, 0, 3, 0, 4, 1, 7, 0, 0, 2],
      [2, 6, 1, 4, 3, 0, 0, 8, 5, 0, 1, 2, 1, 8, 3, 4, 0, 3, 1, 2, 2, 7, 0, 1, 2, 0, 0, 7, 2, 1, 5, 1, 3, 0],
      [0, 0, 4, 1, 6, 4, 0, 5, 1, 3, 0, 0, 2, 5, 7, 2, 2, 3, 8, 3, 1, 0, 7, 0, 2, 3, 1, 1, 2, 8, 0, 1, 1, 2],
      [3, 6, 1, 8, 5, 1, 2, 0, 0, 4, 3, 1, 5, 2, 1, 2, 3, 1, 0, 1, 8, 1, 0, 7, 0, 0, 4, 2, 7, 0, 2, 2, 3, 0],
      [7, 2, 2, 2, 3, 2, 8, 4, 3, 3, 1, 1, 0, 8, 0, 2, 0, 0, 5, 6, 0, 1, 7, 0, 0, 4, 1, 1, 0, 3, 1, 5, 1, 2],
    ],
    // рядок (0 верх, 1 центр, 2 низ) для кожного з 5 барабанів
    LINES: [
      [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
      [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
    ],
    PAY: [[5, 15, 40], [5, 15, 40], [8, 20, 60], [10, 25, 80], [15, 40, 120], [25, 75, 250], [50, 150, 750], [100, 300, 1000]],
    WILD: 7,
    SCATTER: 8,
    SCATTER_PAY: { 3: 3, 4: 10, 5: 50 },
    parse() { return {}; },
    // Найкраща виплата лінії (множник лінійної ставки) і скільки символів зіграло.
    lineWin(sy) {
      const { WILD, SCATTER, PAY } = this;
      let w = 0;
      while (w < 5 && sy[w] === WILD) w++;
      let best = { mult: w >= 3 ? PAY[WILD][w - 3] : 0, sym: WILD, count: w };
      const base = sy.find((s) => s !== WILD);
      if (base !== undefined && base !== SCATTER) {
        let n = 0;
        while (n < 5 && (sy[n] === base || sy[n] === WILD)) n++;
        if (n >= 3 && PAY[base][n - 3] > best.mult) best = { mult: PAY[base][n - 3], sym: base, count: n };
      }
      return best.mult > 0 ? best : null;
    },
    play(bet, _p, rng) {
      const stops = this.REELS.map((r) => rng.int(0, r.length));
      const grid = this.REELS.map((r, i) => [0, 1, 2].map((row) => r[(stops[i] + row) % r.length]));
      const lines = [];
      let lineMult = 0;
      this.LINES.forEach((rows, line) => {
        const w = this.lineWin(rows.map((row, reel) => grid[reel][row]));
        if (w) { lines.push({ line, sym: w.sym, count: w.count, mult: w.mult }); lineMult += w.mult / 10; }
      });
      const scatters = grid.flat().filter((s) => s === this.SCATTER).length;
      const scatterMult = this.SCATTER_PAY[Math.min(scatters, 5)] || 0;
      const mult = round2(lineMult + scatterMult);
      const payout = payFor(bet, lineMult + scatterMult);
      return { stops, grid, lines, scatters, scatterMult, mult, win: payout > 0, payout };
    },
  },

  // «Три в ряд» (каскад): поле 6×6, 8 видів фішок. Ряди й стовпці з 3+
  // однакових зникають і платять, згори падають нові; кожен наступний каскад
  // множить виграш (×1, ×2 … ×5). Хід гри повністю визначає сервер — клієнт
  // лише програє кроки. RTP ≈ 95,5% (тест — симуляція 200 тис. раундів).
  match3: {
    SIZE: 6,
    WEIGHTS: [14, 13, 13, 12, 12, 11, 10, 8],
    PAY: [[0.29, 0.88, 2.3, 6], [0.34, 1.05, 2.9, 7], [0.49, 1.45, 3.4, 9], [0.58, 1.75, 4.9, 12],
      [0.88, 2.3, 5.9, 18], [1.15, 3.4, 8.8, 23], [1.75, 4.9, 11.7, 35], [2.9, 8.8, 23, 68]],
    MAX_CASCADE_MULT: 5,
    parse() { return {}; },
    pick(rng) {
      const total = this.WEIGHTS.reduce((a, b) => a + b, 0);
      let r = rng.int(0, total);
      for (let i = 0; i < this.WEIGHTS.length; i++) { if ((r -= this.WEIGHTS[i]) < 0) return i; }
      return this.WEIGHTS.length - 1;
    },
    // Усі ряди/стовпці з 3+ однакових: { cells, runs: [{ sym, len }] }
    findRuns(g) {
      const N = this.SIZE, cells = new Set(), runs = [];
      for (const horiz of [true, false]) {
        for (let a = 0; a < N; a++) {
          let b = 0;
          while (b < N) {
            const at = (k) => (horiz ? g[a * N + k] : g[k * N + a]);
            let e = b;
            while (e + 1 < N && at(e + 1) === at(b)) e++;
            const len = e - b + 1;
            if (len >= 3) {
              runs.push({ sym: at(b), len });
              for (let k = b; k <= e; k++) cells.add(horiz ? a * N + k : k * N + a);
            }
            b = e + 1;
          }
        }
      }
      return { cells: [...cells].sort((x, y) => x - y), runs };
    },
    play(bet, _p, rng) {
      const N = this.SIZE;
      const g = Array.from({ length: N * N }, () => this.pick(rng));
      const start = g.slice();
      const steps = [];
      let total = 0;
      for (let step = 1; step <= 40; step++) {
        const { cells, runs } = this.findRuns(g);
        if (!cells.length) break;
        const cascade = Math.min(step, this.MAX_CASCADE_MULT);
        const base = runs.reduce((a, r) => a + this.PAY[r.sym][r.len - 3], 0);
        total += base * cascade;
        // Гравітація: у кожному стовпці фішки, що лишились, падають донизу,
        // зверху — нові (fills[c] — нові згори вниз).
        const hit = new Set(cells), fills = [];
        for (let c = 0; c < N; c++) {
          const keep = [];
          for (let r = N - 1; r >= 0; r--) if (!hit.has(r * N + c)) keep.push(g[r * N + c]);
          const add = [];
          while (keep.length + add.length < N) add.push(this.pick(rng));
          fills.push(add.slice().reverse());
          const col = keep.concat(add); // знизу вгору
          for (let r = N - 1, i = 0; r >= 0; r--, i++) g[r * N + c] = col[i];
        }
        steps.push({ cells, runs, cascade, mult: round2(base * cascade), grid: g.slice(), fills });
      }
      const payout = payFor(bet, total);
      return { start, steps, mult: round2(total), win: payout > 0, payout };
    },
  },
};

// Лише справжнє число: рядки, NaN, Infinity, дроби, мінус і нуль — відмова.
function parseBet(v) {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= MAX_BET ? v : null;
}

module.exports = { GAMES, parseBet, MAX_BET, round2, payFor };
