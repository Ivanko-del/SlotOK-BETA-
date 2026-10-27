// Спільні ігри за розкладом для всіх гравців одразу (api/live.js):
//   колеса w5 / w10 / w15 / w30 (раунд 5, 10, 15, 30 хв) і рулетка r60 (година);
//   Краш наживо (один політ для всіх, раунди один за одним).
//
// Результат раунду — HMAC(секрет сервера, "<гра>:<номер>"): його не знає
// ніхто, поки раунд не скінчився; хеш сіда показується заздалегідь, сід —
// після, тож гравець може перевірити, що результат не підмінили.
// Розрахунок «лінивий»: виграш нараховується, коли гравець наступного разу
// звернеться до сервера (будь-яка дія) — нічого не зависає, навіть якщо в
// момент спіну на сторінці не було нікого.

const crypto = require("crypto");
const { dbGet, dbUpdate, dbTransaction } = require("./firebase");
const { moveBalance } = require("./player");
const { getServiceAccount } = require("./google-auth");

const MIN = 60000;
// Колесо фортуни на 54 сектори: [тип, к-ть, виплата (разом зі ставкою)].
// RTP кожного типу 92,6–96,3%.
const FORTUNE = [["a", 26, 2], ["b", 17, 3], ["c", 6, 8.5], ["d", 3, 17], ["e", 2, 25]];
// Порядок секторів: розкидані рівномірно, а не купками
const FORTUNE_LAYOUT = (() => {
  const out = [];
  const left = Object.fromEntries(FORTUNE.map(([k, c]) => [k, c]));
  for (let i = 0; i < 54; i++) {
    // На кожному кроці беремо тип, що найбільше «відстав» від своєї частки
    let best = null, bestScore = -Infinity;
    for (const [k, c] of FORTUNE) {
      if (!left[k]) continue;
      const placed = c - left[k];
      const score = (i + 1) * (c / 54) - placed;
      if (score > bestScore) { bestScore = score; best = k; }
    }
    out.push(best); left[best]--;
  }
  return out;
})();
const ROULETTE_NUMS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const rColor = (n) => (n === 0 ? "green" : REDS.has(n) ? "red" : "black");

const WHEELS = {
  w5: { period: 5 * MIN, kind: "fortune" },
  w10: { period: 10 * MIN, kind: "fortune" },
  w15: { period: 15 * MIN, kind: "fortune" },
  w30: { period: 30 * MIN, kind: "fortune" },
  r60: { period: 60 * MIN, kind: "roulette" },
};
const LOCK_MS = 15000; // ставки закриваються за 15 с до спіну
const PAYS = {
  fortune: Object.fromEntries(FORTUNE.map(([k, , m]) => [k, m])),
  roulette: { red: 2, black: 2, green: 36 },
};

let _secret = null;
function secret() {
  if (_secret) return _secret;
  const sa = getServiceAccount();
  const base = (sa && sa.private_key) || process.env.LIVE_SECRET || "";
  if (!base) throw Object.assign(new Error("no secret"), { code: "not_configured" });
  _secret = crypto.createHash("sha256").update("slotok-live:" + base).digest();
  return _secret;
}
const seedOf = (game, n) => crypto.createHmac("sha256", secret()).update(`${game}:${n}`).digest("hex");
const commitOf = (seed) => crypto.createHash("sha256").update(seed).digest("hex");
const unit = (seed) => parseInt(seed.slice(0, 13), 16) / 2 ** 52; // [0, 1)

// ── Колеса ────────────────────────────────────────────────────────────
function wheelRound(game, now) {
  const w = WHEELS[game];
  const n = Math.floor(now / w.period);
  return { n, endsAt: (n + 1) * w.period, lockAt: (n + 1) * w.period - LOCK_MS, period: w.period };
}
function wheelResult(game, n) {
  const w = WHEELS[game];
  const seed = seedOf(game, n);
  if (w.kind === "fortune") {
    const seg = Math.floor(unit(seed) * 54);
    return { seg, win: FORTUNE_LAYOUT[seg], seed };
  }
  const seg = Math.floor(unit(seed) * 37);
  const num = ROULETTE_NUMS[seg];
  return { seg, num, win: rColor(num), seed };
}

async function wheelBet(nick, game, choice, amount, now) {
  const w = WHEELS[game];
  if (!w) return { error: { status: 400, error: "bad_game", message: "Невідоме колесо" } };
  if (!PAYS[w.kind][choice]) return { error: { status: 400, error: "bad_choice", message: "Невірна ставка" } };
  const r = wheelRound(game, now);
  if (now >= r.lockAt) return { error: { status: 409, error: "locked", message: "Ставки закрито — колесо от-от закрутиться" } };
  const debit = await moveBalance(nick, -amount);
  if (!debit.ok) return { error: { status: 402, error: "insufficient", message: "Недостатньо коштів", balance: debit.balance } };
  const path = `live_bets/${game}/${r.n}/${nick}`;
  await dbTransaction(path, (cur) => {
    const next = { ...(cur || {}) };
    next[choice] = (next[choice] || 0) + amount;
    return next;
  });
  await dbUpdate(`live_open/${nick}`, { [`${game}_${r.n}`]: r.endsAt });
  return { round: r.n, balance: debit.balance };
}

// ── Краш наживо ───────────────────────────────────────────────────────
const CRASH = { betMs: 9000, pauseMs: 4000, rate: 0.11, edge: 0.96, max: 1000 };
const crashMultAt = (ms) => Math.floor(Math.exp(CRASH.rate * Math.max(0, ms) / 1000) * 100) / 100;
function crashPoint(n) {
  const seed = seedOf("crash", n);
  const u = unit(seed);
  const raw = CRASH.edge / (1 - u);
  const point = Math.min(CRASH.max, Math.max(1, Math.floor(raw * 100) / 100));
  return { point, seed };
}
const crashAtMs = (point) => (Math.log(point) / CRASH.rate) * 1000;

// Поточний раунд; якщо попередній уже впав і пауза минула — створюємо новий.
async function crashCurrent(now) {
  const tx = await dbTransaction("live_crash/cur", (cur) => {
    if (cur && cur.n !== undefined) {
      const { point } = crashPoint(cur.n);
      if (now < cur.startAt + crashAtMs(point) + CRASH.pauseMs) return undefined;
      const n = cur.n + 1;
      return { n, startAt: now + CRASH.betMs, commit: commitOf(seedOf("crash", n)) };
    }
    const n = Math.floor(now / 1000);
    return { n, startAt: now + CRASH.betMs, commit: commitOf(seedOf("crash", n)) };
  });
  const cur = tx.value;
  const { point, seed } = crashPoint(cur.n);
  const crashAt = cur.startAt + crashAtMs(point);
  const crashed = now >= crashAt;
  // Попередній раунд — публікуємо його результат (для історії й перевірки)
  if (tx.committed && cur.n > 0) {
    const prev = crashPoint(cur.n - 1);
    dbUpdate(`live_crash/hist`, { [cur.n - 1]: { p: prev.point, seed: prev.seed } }).catch(() => {});
  }
  return { ...cur, crashAt: crashed ? crashAt : null, point: crashed ? point : null, seed: crashed ? seed : null, _point: point, _crashAt: crashAt };
}

async function crashBet(nick, amount, auto, now) {
  const cur = await crashCurrent(now);
  if (now >= cur.startAt) return { error: { status: 409, error: "flying", message: "Раунд уже летить — ставка на наступний" } };
  const path = `live_crash/r/${cur.n}/${nick}`;
  if (await dbGet(path)) return { error: { status: 409, error: "already", message: "Ставку в цьому раунді вже зроблено" } };
  const debit = await moveBalance(nick, -amount);
  if (!debit.ok) return { error: { status: 402, error: "insufficient", message: "Недостатньо коштів", balance: debit.balance } };
  const a = Number(auto);
  const tx = await dbTransaction(path, (c) => (c ? undefined : { bet: amount, ...(a >= 1.01 && a <= CRASH.max ? { auto: Math.floor(a * 100) / 100 } : {}) }));
  if (!tx.committed) { await moveBalance(nick, amount); return { error: { status: 409, error: "already", message: "Ставку в цьому раунді вже зроблено" } }; }
  await dbUpdate(`live_open/${nick}`, { [`crash_${cur.n}`]: cur.startAt });
  return { round: cur.n, balance: debit.balance };
}

async function crashCashout(nick, n, now) {
  const cur = await crashCurrent(now);
  if (cur.n !== n || now < cur.startAt) return { error: { status: 409, error: "not_flying", message: "Раунд не летить" } };
  const m = crashMultAt(now - cur.startAt);
  if (m >= cur._point) return { error: { status: 409, error: "crashed", message: "Не встиг — вже впало" } };
  let won = 0;
  const tx = await dbTransaction(`live_crash/r/${n}/${nick}`, (b) => {
    won = 0;
    if (!b || b.out) return undefined;
    // автокешаут нижчий за поточний множник уже спрацював би раніше
    const at = b.auto && b.auto <= m ? b.auto : m;
    won = Math.floor(b.bet * at);
    return { ...b, out: at, win: won };
  });
  if (!tx.committed) return { error: { status: 409, error: "no_bet", message: "Ставки немає або вже забрано" } };
  await dbTransaction(`live_paid/crash/${n}/${nick}`, (c) => (c ? undefined : Date.now()));
  const { balance } = await moveBalance(nick, won);
  return { round: n, mult: tx.value.out, win: won, balance };
}

// ── Розрахунок моїх завершених раундів ───────────────────────────────
async function settleMine(nick, now) {
  const open = (await dbGet(`live_open/${nick}`)) || {};
  const done = [];
  for (const [key, endsAt] of Object.entries(open)) {
    const [game, ns] = key.split("_");
    const n = Number(ns);
    let pay = 0, info = null;
    if (game === "crash") {
      const { point, seed } = crashPoint(n);
      if (now < endsAt + crashAtMs(point)) continue; // ще летить
      const b = await dbGet(`live_crash/r/${n}/${nick}`);
      if (b && !b.out && b.auto && b.auto <= point) pay = Math.floor(b.bet * b.auto);
      info = { game, round: n, point, seed, bet: b ? b.bet : 0, out: b ? (b.out || (pay ? b.auto : null)) : null, win: b ? (b.win || pay) : 0 };
      if (pay) await dbUpdate(`live_crash/r/${n}/${nick}`, { out: b.auto, win: pay });
    } else {
      if (!WHEELS[game] || now < endsAt) continue;
      const res = wheelResult(game, n);
      const bets = (await dbGet(`live_bets/${game}/${n}/${nick}`)) || {};
      const mult = PAYS[WHEELS[game].kind][res.win] || 0;
      pay = Math.floor((bets[res.win] || 0) * mult);
      info = { game, round: n, result: res, bets, win: pay, staked: Object.values(bets).reduce((a, b) => a + b, 0) };
    }
    if (pay > 0) {
      const claim = await dbTransaction(`live_paid/${game}/${n}/${nick}`, (c) => (c ? undefined : Date.now()));
      if (claim.committed) await moveBalance(nick, pay);
    }
    await dbUpdate(`live_open/${nick}`, { [key]: null });
    done.push(info);
  }
  return done;
}

// Перехід зі старої Global Roulette (браузерної): ставки останніх годин без
// результату повертаємо — їх уже ніхто не розкрутить.
async function legacyRefund(nick, now) {
  const H = 60 * MIN;
  const out = [];
  for (let k = 0; k <= 2; k++) {
    const id = `round_${Math.floor(now / H) - k}`;
    const bet = await dbGet(`global_roulette/rounds/${id}/bets/${nick}`);
    if (!bet || !bet.amount || bet.refunded) continue;
    if (await dbGet(`global_roulette/rounds/${id}/result`)) continue;
    const tx = await dbTransaction(`global_roulette/rounds/${id}/bets/${nick}/refunded`, (c) => (c ? undefined : Date.now()));
    if (!tx.committed) continue;
    await moveBalance(nick, bet.amount);
    out.push({ game: "legacy", round: id, refund: bet.amount });
  }
  return out;
}

// Стан для екрана: поточні раунди всіх коліс (+ хеші), результати
// щойно завершених, поточний Краш.
async function state(now, which) {
  const out = { now, wheels: {}, layout: FORTUNE_LAYOUT.join(""), pays: PAYS, roulette: ROULETTE_NUMS, lockMs: LOCK_MS, crashCfg: { rate: CRASH.rate, betMs: CRASH.betMs, pauseMs: CRASH.pauseMs } };
  for (const game of Object.keys(WHEELS)) {
    if (which && which !== game && which !== "all") continue;
    const r = wheelRound(game, now);
    const prev = wheelResult(game, r.n - 1);
    out.wheels[game] = { n: r.n, endsAt: r.endsAt, lockAt: r.lockAt, period: r.period, commit: commitOf(seedOf(game, r.n)), prev: { n: r.n - 1, ...prev } };
  }
  return out;
}

// Публікуємо результат щойно завершеного раунду колеса (для історії в базі)
async function publishWheel(game, n, now) {
  const w = WHEELS[game];
  if (!w || (n + 1) * w.period > now) return null;
  const res = wheelResult(game, n);
  await dbUpdate(`live_results/${game}`, { [n]: { seg: res.seg, win: res.win, ...(res.num !== undefined ? { num: res.num } : {}), seed: res.seed } });
  return res;
}

module.exports = {
  WHEELS, FORTUNE, FORTUNE_LAYOUT, PAYS, LOCK_MS, ROULETTE_NUMS, CRASH,
  wheelRound, wheelResult, wheelBet, legacyRefund, crashCurrent, crashBet, crashCashout, crashMultAt, crashPoint, settleMine, state, publishWheel,
  _resetSecretForTests: () => { _secret = null; },
};
