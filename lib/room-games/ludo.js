// Лудо «Не сердься, людино» на 2–4 гравців. Коло з 52 клітинок, у кожного
// по 4 фішки й свій «будиночок» із 6 клітинок. Кубик кидає сервер.
//   Вийти з бази — лише на 6. Шістка — ще один кидок.
//   Став фішку на чужу — та повертається на базу (крім безпечних клітинок:
//   старти й зірочки). До фінішу — точним кидком.
// Хто першим завів усі 4 фішки — забирає банк. На хід 20 с (не встиг —
// сервер ходить за тебе), тричі не встиг — поразка.

const TRACK = 52, HOME = 56; // rel 0..50 — коло, 51..55 — будиночок, 56 — фініш
const TURN_MS = 20000, MAX_TIMEOUTS = 3;
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const COLORS_BY_N = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
const clone = (s) => JSON.parse(JSON.stringify(s));

const absOf = (color, rel) => (rel >= 0 && rel <= 50 ? (color * 13 + rel) % TRACK : null);
function target(s, seat, t, dice) {
  const rel = s.tokens[seat][t];
  if (rel === HOME) return null;
  if (rel < 0) return dice === 6 ? 0 : null;
  const to = rel + dice;
  return to > HOME ? null : to;
}
const legal = (s, seat, dice) => [0, 1, 2, 3].filter((t) => target(s, seat, t, dice) !== null);
function nextSeat(s, from) {
  const n = s.tokens.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (!s.out[i]) return i; }
  return from;
}
function passTurn(s, now) { s.turn = nextSeat(s, s.turn); s.phase = "roll"; s.dice = null; s.until = now + TURN_MS; }

function move(s, seat, t, now) {
  const to = target(s, seat, t, s.dice);
  if (to === null) return null;
  const from = s.tokens[seat][t];
  s.tokens[seat][t] = to;
  const color = s.colors[seat];
  const abs = absOf(color, to);
  const hit = [];
  if (abs !== null && !SAFE.has(abs)) {
    s.tokens.forEach((toks, o) => {
      if (o === seat || s.out[o]) return;
      toks.forEach((r, k) => { if (absOf(s.colors[o], r) === abs) { toks[k] = -1; hit.push(o); } });
    });
  }
  s.last = { seat, t, from, to, dice: s.dice, hit };
  if (s.tokens[seat].every((r) => r === HOME)) { s.over = true; s.winners = [seat]; return s; }
  if (s.dice === 6) { s.phase = "roll"; s.dice = null; s.until = now + TURN_MS; }
  else passTurn(s, now);
  return s;
}

function roll(s, seat, rng, now) {
  s.dice = rng.int(1, 7);
  s.rolls = (s.rolls || 0) + 1;
  const opts = legal(s, seat, s.dice);
  s.last = { seat, roll: s.dice, none: !opts.length };
  if (!opts.length) { passTurn(s, now); return s; }
  s.phase = "move"; s.until = now + TURN_MS;
  // Єдиний можливий хід (або всі фішки рівнозначні на базі) — робимо одразу
  const uniq = new Set(opts.map((t) => s.tokens[seat][t]));
  if (opts.length === 1 || uniq.size === 1) return move(s, seat, opts[0], now);
  return s;
}

// Автохід: побити > завести на фініш > вийти з бази > найдальша фішка
function bestMove(s, seat) {
  const opts = legal(s, seat, s.dice);
  const score = (t) => {
    const to = target(s, seat, t, s.dice);
    const abs = absOf(s.colors[seat], to);
    const hits = abs !== null && !SAFE.has(abs) && s.tokens.some((toks, o) => o !== seat && toks.some((r) => absOf(s.colors[o], r) === abs));
    return (hits ? 1000 : 0) + (to === HOME ? 500 : 0) + (s.tokens[seat][t] < 0 ? 300 : 0) + to;
  };
  return opts.sort((a, b) => score(b) - score(a))[0];
}

module.exports = {
  sizes: [2, 3, 4], minPlayers: 2,
  HOME, SAFE: [...SAFE],
  parseOpts: () => ({}),
  init(n, opts, rng, now) {
    return { colors: COLORS_BY_N[n], tokens: Array.from({ length: n }, () => [-1, -1, -1, -1]), turn: rng.int(0, n), phase: "roll", dice: null, until: now + TURN_MS + 3000, timeouts: Array(n).fill(0), out: Array(n).fill(false), over: false, winners: null, last: null };
  },
  act(st, seat, mv, rng, now) {
    if (st.over || st.turn !== seat || !mv) return null;
    const s = clone(st);
    if (mv.a === "roll" && s.phase === "roll") return roll(s, seat, rng, now);
    if (mv.a === "move" && s.phase === "move") return move(s, seat, mv.t | 0, now);
    return null;
  },
  tick(st, now, rng) {
    if (st.over || now < st.until) return null;
    const s = clone(st);
    const seat = s.turn;
    s.timeouts[seat]++;
    if (s.timeouts[seat] >= MAX_TIMEOUTS) return module.exports.forfeit(s, seat, now);
    if (s.phase === "roll") { roll(s, seat, rng, now); if (s.phase !== "move" || s.turn !== seat) return s; }
    return move(s, seat, bestMove(s, seat), now);
  },
  forfeit(st, seat, now) {
    if (st.over) return st;
    const s = clone(st);
    s.out[seat] = true;
    const left = s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
    if (left.length === 1) { s.over = true; s.winners = left; return s; }
    if (s.turn === seat) passTurn(s, now || Date.now());
    return s;
  },
  over: (s) => s.over,
  result: (s) => ({ winners: s.winners || [], text: "Усі чотири фішки вдома" }),
  pub: (s) => ({
    colors: s.colors, tokens: s.tokens, turn: s.turn, phase: s.phase, dice: s.dice, until: s.over ? null : s.until,
    legal: s.phase === "move" ? legal(s, s.turn, s.dice) : [], out: s.out, over: s.over, winners: s.winners, last: s.last, timeouts: s.timeouts,
  }),
  priv: () => ({}),
  _internal: { legal, target, absOf, bestMove },
};
