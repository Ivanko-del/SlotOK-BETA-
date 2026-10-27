// Морський бій 1×1. Поле 10×10, флот 4,3,3,2,2,2,1,1,1,1, кораблі не
// торкаються навіть кутами. Фаза розстановки (90 с, не встиг — сервер
// розставить сам), далі постріли: влучив — стріляєш ще, промах — хід
// суперника. На хід 30 с; не встиг — сервер стріляє за тебе навмання,
// три прострочені ходи — поразка.

const N = 10;
const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
const PLACE_MS = 90000, TURN_MS = 30000, MAX_TIMEOUTS = 3;
const clone = (s) => JSON.parse(JSON.stringify(s));

function cellsOf(ship) {
  const out = [];
  for (let k = 0; k < ship.len; k++) out.push(ship.dir === "v" ? (ship.y + k) * N + ship.x : ship.y * N + ship.x + k);
  return out;
}
function around(i) {
  const x = i % N, y = Math.floor(i / N), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < N && ny < N) out.push(ny * N + nx);
  }
  return out;
}

// Перевірка флоту: розміри як у FLEET, у межах поля, без дотиків.
function validFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return null;
  const lens = ships.map((s) => s && s.len).sort((a, b) => b - a);
  if (lens.join() !== FLEET.join()) return null;
  const taken = new Set(), halo = new Set();
  const norm = [];
  for (const s of ships) {
    const x = s.x | 0, y = s.y | 0, len = s.len | 0, dir = s.dir === "v" ? "v" : "h";
    if (x < 0 || y < 0 || (dir === "h" ? x + len > N || y >= N : y + len > N || x >= N)) return null;
    const ship = { x, y, len, dir };
    const cs = cellsOf(ship);
    if (cs.some((c) => halo.has(c))) return null;
    cs.forEach((c) => taken.add(c));
    cs.forEach((c) => around(c).forEach((a) => halo.add(a)));
    norm.push(ship);
  }
  return norm;
}

function randomFleet(rng) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ships = [], halo = new Set();
    let ok = true;
    for (const len of FLEET) {
      let placed = false;
      for (let t = 0; t < 300 && !placed; t++) {
        const dir = rng.int(0, 2) ? "v" : "h";
        const x = rng.int(0, dir === "h" ? N - len + 1 : N), y = rng.int(0, dir === "v" ? N - len + 1 : N);
        const ship = { x, y, len, dir };
        const cs = cellsOf(ship);
        if (cs.some((c) => halo.has(c))) continue;
        cs.forEach((c) => around(c).forEach((a) => halo.add(a)));
        ships.push(ship); placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  throw new Error("randomFleet failed");
}

// Постріл по полю гравця target. Дошка пострілів — рядок: '.', 'o' промах,
// 'x' влучання, '#' потоплений корабель.
function fire(st, target, c) {
  const board = st.shots[target].split("");
  if (board[c] !== ".") return null;
  const ship = st.fleets[target].find((s) => cellsOf(s).includes(c));
  if (!ship) { board[c] = "o"; st.shots[target] = board.join(""); return "miss"; }
  board[c] = "x";
  const cs = cellsOf(ship);
  if (cs.every((k) => board[k] === "x" || board[k] === "#")) {
    cs.forEach((k) => { board[k] = "#"; });
    cs.forEach((k) => around(k).forEach((a) => { if (board[a] === ".") board[a] = "o"; }));
    st.shots[target] = board.join("");
    return "sunk";
  }
  st.shots[target] = board.join("");
  return "hit";
}
const allSunk = (st, target) => st.fleets[target].every((s) => cellsOf(s).every((k) => st.shots[target][k] === "#"));

function shoot(st, seat, c, now) {
  const target = 1 - seat;
  const r = fire(st, target, c);
  if (!r) return null;
  st.last = { by: seat, c, r };
  if (allSunk(st, target)) { st.over = true; st.winners = [seat]; st.why = "fleet"; return st; }
  if (r === "miss") st.turn = target;
  st.until = now + TURN_MS;
  return st;
}

function startFire(st, rng, now) {
  st.phase = "fire";
  st.turn = rng.int(0, 2);
  st.until = now + TURN_MS;
  return st;
}

module.exports = {
  sizes: [2],
  N, FLEET,
  parseOpts() { return {}; },
  init(n, opts, rng, now) {
    return { phase: "place", fleets: [null, null], shots: [".".repeat(N * N), ".".repeat(N * N)], turn: null, until: now + PLACE_MS, timeouts: [0, 0], over: false, winners: null, last: null };
  },
  act(state, seat, move, rng, now) {
    if (state.over || !move) return null;
    if (state.phase === "place") {
      if (state.fleets[seat]) return null;
      const fleet = move.auto ? randomFleet(rng) : validFleet(move.ships);
      if (!fleet) return null;
      const st = clone(state);
      st.fleets[seat] = fleet;
      if (st.fleets[0] && st.fleets[1]) startFire(st, rng, now);
      return st;
    }
    if (state.turn !== seat || !Number.isInteger(move.c) || move.c < 0 || move.c >= N * N) return null;
    return shoot(clone(state), seat, move.c, now);
  },
  tick(state, now, rng) {
    if (state.over || now < state.until) return null;
    const st = clone(state);
    if (st.phase === "place") {
      [0, 1].forEach((s) => { if (!st.fleets[s]) st.fleets[s] = randomFleet(rng); });
      return startFire(st, rng, now);
    }
    const seat = st.turn;
    st.timeouts[seat]++;
    if (st.timeouts[seat] >= MAX_TIMEOUTS) { st.over = true; st.winners = [1 - seat]; st.why = "afk"; return st; }
    const free = [];
    for (let c = 0; c < N * N; c++) if (st.shots[1 - seat][c] === ".") free.push(c);
    return shoot(st, seat, free[rng.int(0, free.length)], now);
  },
  forfeit(state, seat) {
    if (state.over) return state;
    return { ...clone(state), over: true, winners: [1 - seat], why: "left" };
  },
  over: (s) => s.over,
  result(s) {
    const text = s.why === "fleet" ? "Увесь флот суперника потоплено" : s.why === "afk" ? "Суперник тричі пропустив хід" : "Суперник вийшов";
    return { winners: s.winners || [], text };
  },
  pub(s) {
    return {
      phase: s.phase, turn: s.turn, until: s.until, over: s.over, winners: s.winners, why: s.why || null,
      placed: s.fleets.map(Boolean), shots: s.shots, last: s.last, timeouts: s.timeouts,
      fleets: s.over ? s.fleets : undefined,
    };
  },
  priv(s, seat) { return { fleet: s.fleets[seat] }; },
  _internal: { validFleet, randomFleet, cellsOf },
};
