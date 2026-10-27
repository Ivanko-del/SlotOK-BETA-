// Дурень підкидний на 2–4 гравців, колода 36 карт (6–A), козир — остання
// карта колоди. Першим ходить той, у кого найменший козир.
//   Відбій: ходить атакуючий, підкидати можуть усі, крім того, хто
//   відбивається, — карти тих рангів, що вже на столі; на столі не більше
//   6 атак і не більше, ніж карт у руці того, хто відбивається.
//   Відбився (усі «бито») — він ходить наступним; взяв — хід через нього.
// Добір до 6: спершу атакуючий, далі за колом, захисник останній.
// Хто без карт, коли колода скінчилась, — вийшов; останній із картами — дурень.
// Банк ділять усі, крім дурня. Таймери: на атаку й захист 30 с (не встиг —
// сервер ходить найменшою картою / бере), на підкидання 12 с, потім «бито».

const SUITS = ["s", "h", "d", "c"];
const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const MOVE_MS = 30000, THROW_MS = 12000;
const clone = (s) => JSON.parse(JSON.stringify(s));
const rankOf = (c) => c.slice(0, -1), suitOf = (c) => c.slice(-1);
const rv = (c) => RANKS.indexOf(rankOf(c));
function shuffle(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const beats = (att, def, trump) => (suitOf(def) === suitOf(att) && rv(def) > rv(att)) || (suitOf(def) === trump && suitOf(att) !== trump);
const active = (s) => s.hands.map((_, i) => i).filter((i) => !s.out[i]);
function nextActive(s, from) {
  const n = s.hands.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (!s.out[i]) return i; }
  return from;
}
const open = (s) => s.table.filter((p) => !p.d).length;
const tableRanks = (s) => new Set(s.table.flatMap((p) => [p.a, p.d].filter(Boolean).map(rankOf)));
const lowest = (cards, trump) => cards.slice().sort((x, y) => (suitOf(x) === trump) - (suitOf(y) === trump) || rv(x) - rv(y))[0];

function setTimer(s, now) {
  if (!s.table.length) { s.wait = "attack"; s.until = now + MOVE_MS; }
  else if (open(s)) { s.wait = "defend"; s.until = now + MOVE_MS; }
  else { s.wait = "throw"; s.until = now + THROW_MS; }
}

function refill(s) {
  const order = [s.attacker];
  let i = s.attacker;
  for (let k = 0; k < s.hands.length; k++) { i = nextActive(s, i); if (i !== s.defender && !order.includes(i)) order.push(i); }
  order.push(s.defender);
  for (const seat of order) while (s.hands[seat].length < 6 && s.deck.length) s.hands[seat].push(s.deck.shift());
}

// Після кінця відбою: добір, хто вийшов, хто ходить далі
function endBout(s, took, now) {
  const def = s.defender;
  if (took) s.hands[def].push(...s.table.flatMap((p) => [p.a, p.d].filter(Boolean)));
  else s.discard += s.table.length * 2;
  s.last = { bout: took ? "take" : "bito", by: def, cards: s.table };
  s.table = []; s.passed = [];
  refill(s);
  if (!s.deck.length) s.hands.forEach((h, i) => { if (!s.out[i] && !h.length) { s.out[i] = true; s.finish.push(i); } });
  const left = active(s);
  if (left.length <= 1) { s.over = true; s.durak = left.length ? left[0] : null; return s; }
  // Хто ходить: відбився — сам захисник; взяв — наступний після нього
  let att = took ? nextActive(s, def) : (s.out[def] ? nextActive(s, def) : def);
  if (s.out[att]) att = nextActive(s, att);
  s.attacker = att;
  s.defender = nextActive(s, att);
  s.limit = Math.min(6, s.hands[s.defender].length);
  setTimer(s, now);
  return s;
}

function attack(s, seat, card, now) {
  const k = s.hands[seat].indexOf(card);
  if (k < 0 || seat === s.defender || s.out[seat]) return null;
  if (!s.table.length) { if (seat !== s.attacker) return null; }
  else if (!tableRanks(s).has(rankOf(card))) return null;
  if (s.table.length >= s.limit || open(s) >= s.hands[s.defender].length) return null;
  s.hands[seat].splice(k, 1);
  s.table.push({ a: card, d: null, by: seat });
  s.passed = [];
  setTimer(s, now);
  return s;
}

module.exports = {
  sizes: [2, 3, 4], minPlayers: 2,
  parseOpts: () => ({}),
  init(n, opts, rng, now) {
    const deck = shuffle(SUITS.flatMap((su) => RANKS.map((r) => r + su)), rng);
    const hands = Array.from({ length: n }, () => deck.splice(0, 6));
    const trumpCard = deck[deck.length - 1];
    const trump = suitOf(trumpCard);
    // Першим ходить власник найменшого козиря (нема козирів — випадковий)
    let attacker = rng.int(0, n), best = 99;
    hands.forEach((h, i) => h.forEach((c) => { if (suitOf(c) === trump && rv(c) < best) { best = rv(c); attacker = i; } }));
    const s = { deck, hands, trump, trumpCard, table: [], attacker, defender: (attacker + 1) % n, passed: [], out: Array(n).fill(false), finish: [], discard: 0, over: false, durak: null, last: null, left: [] };
    s.limit = Math.min(6, s.hands[s.defender].length);
    setTimer(s, now + 3000);
    return s;
  },
  act(st, seat, move, rng, now) {
    if (st.over || !move) return null;
    const s = clone(st);
    if (move.a === "attack") return attack(s, seat, String(move.card), now);
    if (move.a === "defend") {
      if (seat !== s.defender) return null;
      const p = s.table[move.i | 0];
      const card = String(move.card);
      const k = s.hands[seat].indexOf(card);
      if (!p || p.d || k < 0 || !beats(p.a, card, s.trump)) return null;
      s.hands[seat].splice(k, 1);
      p.d = card;
      // Усе відбито й більше підкинути не можна — одразу «бито»
      if (!open(s) && (s.table.length >= s.limit || !s.hands[seat].length)) return endBout(s, false, now);
      setTimer(s, now);
      return s;
    }
    if (move.a === "take") { if (seat !== s.defender || !open(s)) return null; return endBout(s, true, now); }
    if (move.a === "pass") {
      if (seat === s.defender || s.out[seat] || !s.table.length || open(s) || s.passed.includes(seat)) return null;
      s.passed.push(seat);
      const throwers = active(s).filter((i) => i !== s.defender);
      if (throwers.every((i) => s.passed.includes(i))) return endBout(s, false, now);
      return s;
    }
    return null;
  },
  tick(st, now) {
    if (st.over || now < st.until) return null;
    const s = clone(st);
    if (s.wait === "attack") return attack(s, s.attacker, lowest(s.hands[s.attacker], s.trump), now) || endBout(s, false, now);
    if (s.wait === "defend") return endBout(s, true, now);
    return endBout(s, false, now); // час на підкидання вийшов — бито
  },
  // Вийшов посеред гри — він і дурень (решта ділять банк)
  forfeit(st, seat) {
    if (st.over) return st;
    return { ...clone(st), over: true, durak: seat, left: [...(st.left || []), seat] };
  },
  over: (s) => s.over,
  result(s) {
    const winners = s.hands.map((_, i) => i).filter((i) => i !== s.durak && !(s.left || []).includes(i));
    if (s.durak === null) return { winners: [], draw: true, text: "Останні вийшли разом — нічия" };
    return { winners, text: "Дурень визначився" };
  },
  pub: (s) => ({
    table: s.table, trump: s.trump, trumpCard: s.trumpCard, deck: s.deck.length, counts: s.hands.map((h) => h.length),
    attacker: s.attacker, defender: s.defender, passed: s.passed, out: s.out, limit: s.limit, wait: s.wait,
    until: s.over ? null : s.until, over: s.over, durak: s.durak, last: s.last, discard: s.discard,
  }),
  priv: (s, seat) => ({ hand: s.hands[seat] }),
  _internal: { beats, lowest, open, tableRanks },
};
