// Бінго на 75 куль, картка 5×5 (центр вільний). Кулі тягне сервер за
// таймером (порядок — секрет до кожного витягу), картки позначаються самі.
// Два призи: перша повна лінія (рядок, стовпець чи діагональ) — 40% банку,
// перша повністю закрита картка — 60%. Одночасні переможці ділять приз.

const DRAW_MS = 3500, LEAD_MS = 4000;
const clone = (s) => JSON.parse(JSON.stringify(s));
const LINES = (() => {
  const L = [];
  for (let r = 0; r < 5; r++) L.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) L.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  L.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return L;
})();

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Картка: 25 чисел рядками; стовпець c — числа 15c+1..15c+15; центр 0 (вільно)
function makeCard(rng) {
  const cols = [0, 1, 2, 3, 4].map((c) => shuffle(Array.from({ length: 15 }, (_, k) => c * 15 + k + 1), rng).slice(0, 5));
  const card = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) card.push(r === 2 && c === 2 ? 0 : cols[c][r]);
  return card;
}
const marked = (card, set) => card.map((n) => n === 0 || set.has(n));
const hasLine = (m) => LINES.some((l) => l.every((i) => m[i]));
const isFull = (m) => m.every(Boolean);
const toLine = (m) => Math.min(...LINES.map((l) => l.filter((i) => !m[i]).length));

function advance(st, now) {
  if (st.over || now < st.start) return null;
  const k = Math.min(75, Math.floor((now - st.start) / DRAW_MS) + 1);
  if (k <= st.drawn) return null;
  const s = clone(st);
  for (let d = s.drawn + 1; d <= k && !s.over; d++) {
    s.drawn = d;
    const set = new Set(s.order.slice(0, d));
    const ms = s.cards.map((c) => marked(c, set));
    if (!s.lineW) {
      const w = ms.map((m, seat) => (!s.left[seat] && hasLine(m) ? seat : -1)).filter((x) => x >= 0);
      if (w.length) { s.lineW = w; s.lineAt = d; }
    }
    const f = ms.map((m, seat) => (!s.left[seat] && isFull(m) ? seat : -1)).filter((x) => x >= 0);
    if (f.length) { s.fullW = f; s.fullAt = d; s.over = true; }
  }
  return s;
}

module.exports = {
  sizes: [30], minPlayers: 2, lobbyMs: 45000,
  parseOpts: () => ({}),
  init(n, opts, rng, now) {
    return { order: shuffle(Array.from({ length: 75 }, (_, k) => k + 1), rng), cards: Array.from({ length: n }, () => makeCard(rng)), left: Array(n).fill(false), start: now + LEAD_MS, drawn: 0, lineW: null, fullW: null, over: false };
  },
  act: () => null,
  tick: (st, now) => advance(st, now),
  forfeit(st, seat) { const s = clone(st); s.left[seat] = true; if (s.left.filter((x) => !x).length === 0) s.over = true; return s; },
  over: (s) => s.over,
  result(s) {
    const shares = {};
    (s.lineW || []).forEach((seat) => { shares[seat] = (shares[seat] || 0) + 40 / s.lineW.length; });
    (s.fullW || []).forEach((seat) => { shares[seat] = (shares[seat] || 0) + 60 / s.fullW.length; });
    const winners = Object.keys(shares).map(Number);
    if (!winners.length) return { winners: [], draw: true, text: "Усі вийшли — ставки повернено" };
    return { winners, shares, text: `Лінія на ${s.lineAt}-й кулі, бінго на ${s.fullAt}-й` };
  },
  pub(s) {
    const set = new Set(s.order.slice(0, s.drawn));
    return {
      start: s.start, drawn: s.order.slice(0, s.drawn), until: s.over ? null : s.start + s.drawn * DRAW_MS,
      lineW: s.lineW, fullW: s.fullW, over: s.over, left: s.left,
      // прогрес кожного: скільки до лінії і до повної картки
      prog: s.cards.map((c) => { const m = marked(c, set); return [toLine(m), m.filter((x) => !x).length]; }),
    };
  },
  priv: (s, seat) => ({ card: s.cards[seat] }),
  _internal: { makeCard, LINES, DRAW_MS },
};
