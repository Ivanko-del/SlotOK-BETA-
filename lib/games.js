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
      return { result, mult, win, payout: win ? Math.floor(bet * mult) : 0 };
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
      return { result, mult: target, win, payout: win ? Math.floor(bet * target) : 0 };
    },
  },
};

// Лише справжнє число: рядки, NaN, Infinity, дроби, мінус і нуль — відмова.
function parseBet(v) {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= MAX_BET ? v : null;
}

module.exports = { GAMES, parseBet, MAX_BET, round2 };
