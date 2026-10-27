// Камінь-ножиці-папір 1×1: ходи таємні, поки не походили обидва (раніше хід
// суперника лежав у базі відкрито). 30 с на хід: хто не походив — програв;
// не походив ніхто — нічия.
const BEATS = { rock: "scissors", scissors: "paper", paper: "rock" };
const TURN_MS = 30000;
module.exports = {
  sizes: [2],
  parseOpts: () => ({}),
  init(n, opts, rng, now) { return { moves: [null, null], until: now + TURN_MS, over: false, winners: null }; },
  act(state, seat, move) {
    if (state.over || state.moves[seat] || !move || !BEATS[move.m]) return null;
    const moves = state.moves.slice();
    moves[seat] = move.m;
    if (!moves[0] || !moves[1]) return { ...state, moves };
    const winners = moves[0] === moves[1] ? [] : [BEATS[moves[0]] === moves[1] ? 0 : 1];
    return { ...state, moves, over: true, winners, why: "played" };
  },
  tick(state, now) {
    if (state.over || now < state.until) return null;
    const done = [0, 1].filter((s) => state.moves[s]);
    return { ...state, over: true, winners: done.length === 1 ? done : [], why: "time" };
  },
  forfeit(state, seat) { return state.over ? state : { ...state, over: true, winners: [1 - seat], why: "left" }; },
  over: (s) => s.over,
  result: (s) => ({ winners: s.winners, draw: !s.winners.length, text: s.why === "time" ? "Час на хід вийшов" : s.why === "left" ? "Суперник вийшов" : "" }),
  pub: (s) => ({ until: s.until, over: s.over, winners: s.winners, moved: s.moves.map(Boolean), moves: s.over ? s.moves : undefined }),
  priv: (s, seat) => ({ my: s.moves[seat] }),
};
