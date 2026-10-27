// Королівська битва «Чотири двері»: кожен раунд гравці за 10 с обирають
// одні з чотирьох дверей (не встиг — сервер обере навмання). Потім сервер
// відкриває пастку: хто стояв за нею — вибуває. Пастку обирає сервер після
// вибору всіх, але так, щоб хтось лишився живим. Останній живий (або всі,
// хто дожив до 15-го раунду) забирає банк.

const PICK_MS = 10000, SHOW_MS = 4000, DOORS = 4, MAX_ROUNDS = 15;
const clone = (s) => JSON.parse(JSON.stringify(s));

function reveal(s, rng, now) {
  const alive = s.alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
  alive.forEach((i) => { if (s.picks[i] === null) { s.picks[i] = rng.int(0, DOORS); s.auto[i] = true; } });
  const counts = Array(DOORS).fill(0);
  alive.forEach((i) => counts[s.picks[i]]++);
  // Пастка — лише двері, після яких хтось лишиться (усі за одними дверима → пастка деінде)
  const options = [];
  for (let d = 0; d < DOORS; d++) if (counts[d] < alive.length) options.push(d);
  const trap = options[rng.int(0, options.length)];
  const out = alive.filter((i) => s.picks[i] === trap);
  out.forEach((i) => { s.alive[i] = false; });
  s.history.push({ round: s.round, trap, counts, out });
  s.phase = "show";
  s.until = now + SHOW_MS;
  const left = s.alive.filter(Boolean).length;
  if (left <= 1 || s.round >= MAX_ROUNDS) s.over = true;
  return s;
}

module.exports = {
  sizes: [40], minPlayers: 2, lobbyMs: 45000,
  DOORS,
  parseOpts: () => ({}),
  init(n, opts, rng, now) {
    return { alive: Array(n).fill(true), picks: Array(n).fill(null), auto: Array(n).fill(false), round: 1, phase: "pick", until: now + PICK_MS + 3000, history: [], over: false };
  },
  act(st, seat, move, rng, now) {
    const d = move && Number(move.door);
    if (st.over || st.phase !== "pick" || !st.alive[seat] || !Number.isInteger(d) || d < 0 || d >= DOORS || now > st.until) return null;
    const s = clone(st);
    s.picks[seat] = d; s.auto[seat] = false;
    // усі живі обрали — не чекаємо таймера
    if (s.alive.every((a, i) => !a || s.picks[i] !== null)) return reveal(s, rng, now);
    return s;
  },
  tick(st, now, rng) {
    if (st.over || now < st.until) return null;
    const s = clone(st);
    if (s.phase === "pick") return reveal(s, rng, now);
    s.round++; s.phase = "pick"; s.until = now + PICK_MS;
    s.picks = s.picks.map(() => null); s.auto = s.auto.map(() => false);
    return s;
  },
  forfeit(st, seat) {
    const s = clone(st);
    s.alive[seat] = false;
    if (s.alive.filter(Boolean).length <= 1) s.over = true;
    return s;
  },
  over: (s) => s.over,
  result(s) {
    const winners = s.alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
    return { winners, text: winners.length > 1 ? `Дожили до ${s.round}-го раунду — банк навпіл` : `Останній живий після ${s.round} раундів` };
  },
  pub(s) {
    return {
      round: s.round, phase: s.phase, until: s.over ? null : s.until, over: s.over, alive: s.alive,
      picked: s.phase === "pick" ? s.picks.map((p) => p !== null) : undefined,
      last: s.history[s.history.length - 1] || null, picks: s.phase === "show" ? s.picks : undefined, auto: s.phase === "show" ? s.auto : undefined,
      rounds: s.history.length,
    };
  },
  priv: (s, seat) => ({ pick: s.picks[seat] }),
};
