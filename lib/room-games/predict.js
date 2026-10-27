// Prediction Duel 1×1: сервер загадує число 1–100, творець називає своє при
// створенні, суперник — після входу; ближчий виграв. Число й чужий вибір
// тримаються в секреті до кінця (раніше загадане лежало в базі відкрито).
const TURN_MS = 60000;
module.exports = {
  sizes: [2],
  parseOpts(o) { const g = Number(o.guess); return Number.isInteger(g) && g >= 1 && g <= 100 ? { guess: g } : null; },
  pubOpts: () => ({}),
  init(n, opts, rng, now) { return { secret: rng.int(1, 101), guesses: [opts.guess, null], until: now + TURN_MS, over: false, winners: null }; },
  act(state, seat, move) {
    const g = move && Number(move.g);
    if (state.over || seat !== 1 || state.guesses[1] !== null || !Number.isInteger(g) || g < 1 || g > 100) return null;
    const guesses = [state.guesses[0], g];
    const d = guesses.map((x) => Math.abs(x - state.secret));
    return { ...state, guesses, over: true, winners: d[0] === d[1] ? [] : [d[0] < d[1] ? 0 : 1], why: "played" };
  },
  tick(state, now) {
    if (state.over || now < state.until) return null;
    return { ...state, over: true, winners: [0], why: "time" };
  },
  forfeit(state, seat) { return state.over ? state : { ...state, over: true, winners: [1 - seat], why: "left" }; },
  over: (s) => s.over,
  result: (s) => ({ winners: s.winners, draw: !s.winners.length, text: `Загадано ${s.secret}` }),
  pub: (s) => ({ until: s.until, over: s.over, winners: s.winners, secret: s.over ? s.secret : undefined, guesses: s.over ? s.guesses : undefined }),
  priv: (s, seat) => ({ my: s.guesses[seat] }),
};
