// Вікторина-баттл наживо: 8 питань, усі відповідають одночасно, на питання
// 12 с, потім 3 с — правильна відповідь. Правильно = 100 очок + до 50 за
// швидкість. Банк ділять перші три місця: 50/30/20 (на двох — 70/30).
// Питання й порядок варіантів обирає сервер; правильну відповідь клієнт
// бачить лише після кінця питання.

const BANK = require("./quiz-bank");
const Q_COUNT = 8, ASK_MS = 12000, SHOW_MS = 3000, LEAD_MS = 4000;
const clone = (s) => JSON.parse(JSON.stringify(s));

function qIndexAt(s, now) {
  if (now < s.start) return { i: -1, phase: "lead", until: s.start };
  const t = now - s.start, slot = ASK_MS + SHOW_MS;
  const i = Math.floor(t / slot);
  if (i >= Q_COUNT) return { i: Q_COUNT, phase: "end", until: null };
  const inSlot = t - i * slot;
  return inSlot < ASK_MS ? { i, phase: "ask", until: s.start + i * slot + ASK_MS } : { i, phase: "show", until: s.start + (i + 1) * slot };
}
const total = (s, seat) => s.points[seat].reduce((a, b) => a + b, 0);

module.exports = {
  sizes: [40], minPlayers: 2, lobbyMs: 45000,
  BANK, Q_COUNT,
  parseOpts: () => ({}),
  init(n, opts, rng, now) {
    const pool = BANK.map((_, k) => k);
    const qs = [];
    for (let k = 0; k < Q_COUNT; k++) {
      const [q, right, ...wrong] = BANK[pool.splice(rng.int(0, pool.length), 1)[0]];
      const opts4 = [right, ...wrong];
      for (let a = 3; a > 0; a--) { const b = rng.int(0, a + 1); [opts4[a], opts4[b]] = [opts4[b], opts4[a]]; }
      qs.push({ q, o: opts4, a: opts4.indexOf(right) });
    }
    return {
      qs, start: now + LEAD_MS,
      answers: Array.from({ length: n }, () => Array(Q_COUNT).fill(-1)),
      points: Array.from({ length: n }, () => Array(Q_COUNT).fill(0)),
      ms: Array(n).fill(0), left: Array(n).fill(false), over: false, lastKey: "",
    };
  },
  act(st, seat, move, rng, now) {
    const at = qIndexAt(st, now);
    const a = move && Number(move.a);
    if (st.over || st.left[seat] || at.phase !== "ask" || move.q !== at.i || !Number.isInteger(a) || a < 0 || a > 3) return null;
    if (st.answers[seat][at.i] !== -1) return null;
    const s = clone(st);
    s.answers[seat][at.i] = a;
    const left = at.until - now;
    s.points[seat][at.i] = a === s.qs[at.i].a ? 100 + Math.round((50 * left) / ASK_MS) : 0;
    s.ms[seat] += ASK_MS - left;
    return s;
  },
  tick(st, now) {
    if (st.over) return null;
    const at = qIndexAt(st, now);
    if (at.phase === "end") return { ...clone(st), over: true };
    // Нова фаза (питання / показ відповіді) — новий стан, щоб його опублікувати
    const key = at.i + ":" + at.phase;
    if (key === st.lastKey) return null;
    return { ...clone(st), lastKey: key };
  },
  forfeit(st, seat) { const s = clone(st); s.left[seat] = true; if (s.left.every(Boolean)) s.over = true; return s; },
  over: (s) => s.over,
  result(s) {
    const order = s.points.map((_, seat) => seat).filter((seat) => !s.left[seat] && total(s, seat) > 0)
      .sort((a, b) => total(s, b) - total(s, a) || s.ms[a] - s.ms[b]);
    if (!order.length) return { winners: [], draw: true, text: "Ніхто не набрав очок — ставки повернено" };
    const weights = s.points.length === 2 ? [70, 30] : [50, 30, 20];
    const shares = {};
    order.slice(0, weights.length).forEach((seat, k) => { shares[seat] = weights[k]; });
    return { winners: Object.keys(shares).map(Number), shares, text: `Переможець набрав ${total(s, order[0])} очок` };
  },
  pub(s, now) {
    const at = qIndexAt(s, now);
    const cur = at.i >= 0 && at.i < Q_COUNT ? s.qs[at.i] : null;
    return {
      start: s.start, phase: s.over ? "end" : at.phase, i: at.i, n: Q_COUNT, until: s.over ? null : at.until,
      q: cur ? { q: cur.q, o: cur.o, ...(at.phase === "show" || s.over ? { a: cur.a } : {}) } : null,
      // хто вже відповів на поточне — без самої відповіді
      answered: cur ? s.answers.map((x) => x[at.i] !== -1) : null,
      scores: s.points.map((p) => p.reduce((a, b) => a + b, 0)), left: s.left, over: s.over,
      // клієнт сам перемикає фази за часом: розклад, без відповідей
      ask: ASK_MS, show: SHOW_MS,
    };
  },
  priv: (s, seat) => ({ answers: s.answers[seat], points: s.points[seat] }),
};
