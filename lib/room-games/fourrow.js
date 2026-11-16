// «Чотири в ряд» 1×1: сітка 7×6, фішки падають у колонку на найнижчу вільну
// клітинку; перший, хто зібрав чотири свої підряд (рядок, стовпчик, діагональ),
// виграє; повна сітка без лінії — нічия. 30 с на хід: не встиг — сервер кидає
// фішку у випадкову колонку; тричі підряд пропустив — поразка.
// Сітка — рядок із 42 символів, індекс = рядок*7 + колонка, рядок 0 — верхній;
// '.' порожньо, '0'/'1' — фішка місця. Усе рахує сервер, клієнт лише малює.
const W = 7, H = 6, TURN_MS = 30000, MAX_TIMEOUTS = 3;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function dropRow(board, c) {
  for (let r = H - 1; r >= 0; r--) if (board[r * W + c] === ".") return r;
  return -1;
}
// Лінія з 4+ фішок через клітинку (r,c) → масив індексів або null
function lineAt(board, r, c) {
  const me = board[r * W + c];
  if (me === ".") return null;
  for (const [dx, dy] of DIRS) {
    const cells = [r * W + c];
    for (const s of [1, -1]) {
      let x = c + dx * s, y = r + dy * s;
      while (x >= 0 && x < W && y >= 0 && y < H && board[y * W + x] === me) { cells.push(y * W + x); x += dx * s; y += dy * s; }
    }
    if (cells.length >= 4) return cells.sort((a, b) => a - b);
  }
  return null;
}
function drop(state, seat, c, now) {
  const r = dropRow(state.board, c);
  if (r < 0) return null;
  const board = state.board.slice(0, r * W + c) + seat + state.board.slice(r * W + c + 1);
  const st = { ...state, board, last: { r, c, by: seat }, timeouts: state.timeouts.slice(), until: now + TURN_MS };
  st.timeouts[seat] = 0; // таймаути лічимо підряд
  const line = lineAt(board, r, c);
  if (line) return { ...st, over: true, winners: [seat], line, why: "four" };
  if (!board.includes(".")) return { ...st, over: true, winners: [], line: null, why: "full" };
  return { ...st, turn: 1 - seat };
}

module.exports = {
  sizes: [2],
  W, H,
  parseOpts: () => ({}),
  init(n, opts, rng, now) {
    return { board: ".".repeat(W * H), turn: rng.int(0, 2), until: now + TURN_MS, timeouts: [0, 0], last: null, line: null, over: false, winners: null };
  },
  act(state, seat, move, rng, now) {
    if (state.over || state.turn !== seat || !move || !Number.isInteger(move.c) || move.c < 0 || move.c >= W) return null;
    return drop(state, seat, move.c, now);
  },
  tick(state, now, rng) {
    if (state.over || now < state.until) return null;
    const seat = state.turn;
    const timeouts = state.timeouts.slice();
    timeouts[seat]++;
    if (timeouts[seat] >= MAX_TIMEOUTS) return { ...state, timeouts, over: true, winners: [1 - seat], why: "afk" };
    const free = [];
    for (let c = 0; c < W; c++) if (dropRow(state.board, c) >= 0) free.push(c);
    const next = drop({ ...state, timeouts }, seat, free[rng.int(0, free.length)], now);
    next.timeouts[seat] = timeouts[seat]; // автохід не обнуляє лічильник пропусків
    return next;
  },
  forfeit(state, seat) { return state.over ? state : { ...state, over: true, winners: [1 - seat], why: "left" }; },
  over: (s) => s.over,
  result(s) {
    const text = s.why === "four" ? "Чотири в ряд" : s.why === "afk" ? "Суперник тричі пропустив хід" : s.why === "full" ? "Поле заповнено" : "Суперник вийшов";
    return { winners: s.winners || [], draw: !(s.winners || []).length, text };
  },
  pub: (s) => ({ board: s.board, turn: s.turn, until: s.until, over: s.over, winners: s.winners, why: s.why || null, last: s.last, line: s.line, timeouts: s.timeouts }),
  priv: () => ({}),
  _internal: { dropRow, lineAt },
};
