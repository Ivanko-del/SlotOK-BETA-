// Сапер-дуель: однакове поле в обох, хто перший відкриє всі безпечні
// клітинки — виграв; хто підірвався — програв. Старт — однаковий безпечний
// «острів» для обох, тож удачі першого кліку немає. Ліміт часу: по ньому
// перемагає той, хто відкрив більше.

const LEVELS = {
  easy: { w: 9, h: 9, m: 10, limit: 4 * 60000 },
  medium: { w: 12, h: 12, m: 24, limit: 7 * 60000 },
};

const clone = (s) => JSON.parse(JSON.stringify(s));

function neighbours(w, h, i) {
  const x = i % w, y = Math.floor(i / w), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
  }
  return out;
}

function counts(w, h, mines) {
  const set = new Set(mines);
  return Array.from({ length: w * h }, (_, i) => (set.has(i) ? 9 : neighbours(w, h, i).filter((n) => set.has(n)).length));
}

// Відкрити клітинку (з поширенням по нулях). rev — рядок '0'/'1'.
function reveal(st, rev, i) {
  const arr = rev.split("");
  const stack = [i];
  while (stack.length) {
    const c = stack.pop();
    if (arr[c] === "1") continue;
    arr[c] = "1";
    if (st.num[c] === 0) neighbours(st.w, st.h, c).forEach((n) => { if (arr[n] !== "1" && st.num[n] !== 9) stack.push(n); });
  }
  return arr.join("");
}
const opened = (rev) => rev.split("").filter((c) => c === "1").length;

module.exports = {
  sizes: [2],
  parseOpts(o) { return { level: LEVELS[o.level] ? o.level : "easy" }; },
  pubOpts(o) { return { level: o.level }; },
  LEVELS,
  init(n, opts, rng, now) {
    const L = LEVELS[opts.level];
    const total = L.w * L.h;
    const start = rng.int(0, total);
    const safe = new Set([start, ...neighbours(L.w, L.h, start)]);
    const pool = [];
    for (let i = 0; i < total; i++) if (!safe.has(i)) pool.push(i);
    const mines = [];
    for (let k = 0; k < L.m; k++) mines.push(pool.splice(rng.int(0, pool.length), 1)[0]);
    const st = { w: L.w, h: L.h, m: L.m, level: opts.level, mines: mines.sort((a, b) => a - b), start, until: now + L.limit, boom: [false, false], fin: [0, 0], over: false, winners: null };
    st.num = counts(L.w, L.h, st.mines);
    const first = reveal(st, "0".repeat(total), start);
    st.rev = [first, first];
    return st;
  },
  act(state, seat, move, rng, now) {
    const i = move && Number.isInteger(move.c) ? move.c : -1;
    if (state.over || now > state.until || i < 0 || i >= state.w * state.h) return null;
    if (state.rev[seat][i] === "1") return null;
    const st = clone(state);
    if (st.num[i] === 9) {
      st.boom[seat] = true;
      st.rev[seat] = st.rev[seat].slice(0, i) + "1" + st.rev[seat].slice(i + 1);
      st.over = true; st.winners = [1 - seat]; st.why = "boom";
      return st;
    }
    st.rev[seat] = reveal(st, st.rev[seat], i);
    if (opened(st.rev[seat]) === st.w * st.h - st.m) { st.fin[seat] = now; st.over = true; st.winners = [seat]; st.why = "cleared"; }
    return st;
  },
  tick(state, now) {
    if (state.over || now < state.until) return null;
    const st = clone(state);
    const a = opened(st.rev[0]), b = opened(st.rev[1]);
    st.over = true; st.why = "time";
    st.winners = a === b ? [] : [a > b ? 0 : 1];
    return st;
  },
  forfeit(state, seat) {
    if (state.over) return state;
    return { ...clone(state), over: true, winners: [1 - seat], why: "left" };
  },
  over: (s) => s.over,
  result(s) {
    const text = s.why === "boom" ? "Суперник підірвався на міні" : s.why === "cleared" ? "Поле розміновано першим" : s.why === "left" ? "Суперник вийшов" : "Час вийшов — перемагає той, хто відкрив більше";
    return { winners: s.winners || [], draw: !s.winners || !s.winners.length, text };
  },
  pub(s) {
    return {
      w: s.w, h: s.h, m: s.m, level: s.level, until: s.until, over: s.over, why: s.why || null,
      winners: s.winners, boom: s.boom, progress: s.rev.map(opened), total: s.w * s.h - s.m,
      mines: s.over ? s.mines : undefined,
    };
  },
  priv(s, seat) {
    // Рядок клітинок: '.' закрита, '0'–'8' число, '*' міна (на якій підірвався)
    const rev = s.rev[seat];
    return { cells: s.num.map((n, i) => (rev[i] === "1" ? (n === 9 ? "*" : String(n)) : ".")).join("") };
  },
  _internal: { reveal, counts, neighbours },
};
