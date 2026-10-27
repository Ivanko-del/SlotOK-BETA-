// «Вісімка» на 2–4 гравців (як Uno на звичайній колоді, 52 карти).
// Ходи картою тієї ж масті або того ж значення, що й верхня на столі.
//   8 — будь-коли, обираєш масть;  2 — наступний бере 2 і пропускає хід;
//   A — наступний пропускає хід.
// Нема чим ходити — бери карту; якщо вона підходить — можеш зіграти, інакше пас.
// Хто першим скинув усі карти — забирає банк. На хід 25 с (не встиг — сервер
// ходить за тебе), тричі не встиг — поразка.

const SUITS = ["s", "h", "d", "c"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const TURN_MS = 25000, MAX_TIMEOUTS = 3;
const clone = (s) => JSON.parse(JSON.stringify(s));
const rankOf = (c) => c.slice(0, -1), suitOf = (c) => c.slice(-1);

function shuffle(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const playable = (s, c) => rankOf(c) === "8" || suitOf(c) === s.suit || rankOf(c) === rankOf(s.top);
const alive = (s) => s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
function nextSeat(s, from, steps = 1) {
  let seat = from;
  for (let k = 0; k < steps; k++) {
    do { seat = (seat + 1) % s.hands.length; } while (s.out[seat]);
  }
  return seat;
}
function draw(s, seat, n, rng) {
  for (let k = 0; k < n; k++) {
    if (!s.deck.length) {
      if (s.pile.length <= 1) break;
      const top = s.pile.pop();
      s.deck = shuffle(s.pile, rng); s.pile = [top];
    }
    s.hands[seat].push(s.deck.pop());
  }
}
function endTurn(s, now, skip) {
  s.drew = false;
  s.turn = nextSeat(s, s.turn, skip ? 2 : 1);
  s.until = now + TURN_MS;
}

function play(s, seat, card, suit, rng, now) {
  const k = s.hands[seat].indexOf(card);
  if (k < 0 || !playable(s, card)) return null;
  s.hands[seat].splice(k, 1);
  s.pile.push(card); s.top = card;
  const r = rankOf(card);
  s.suit = r === "8" ? (SUITS.includes(suit) ? suit : suitOf(card)) : suitOf(card);
  s.last = { seat, card, suit: s.suit };
  if (!s.hands[seat].length) { s.over = true; s.winners = [seat]; return s; }
  const active = alive(s).length;
  if (r === "2") {
    const victim = nextSeat(s, seat);
    draw(s, victim, 2, rng);
    s.last.hit = victim;
    endTurn(s, now, active > 1);
  } else if (r === "A") endTurn(s, now, active > 1);
  else endTurn(s, now, false);
  return s;
}

module.exports = {
  sizes: [2, 3, 4], minPlayers: 2,
  parseOpts: () => ({}),
  init(n, opts, rng, now) {
    const deck = shuffle(SUITS.flatMap((su) => RANKS.map((r) => r + su)), rng);
    const per = n === 2 ? 7 : 5;
    const hands = Array.from({ length: n }, () => deck.splice(0, per));
    // Перша карта на столі — не спецкарта
    let i = deck.findIndex((c) => !["8", "2", "A"].includes(rankOf(c)));
    const top = deck.splice(i, 1)[0];
    return { deck, pile: [top], top, suit: suitOf(top), hands, turn: rng.int(0, n), drew: false, until: now + TURN_MS + 3000, timeouts: Array(n).fill(0), out: Array(n).fill(false), over: false, winners: null, last: null };
  },
  act(st, seat, move, rng, now) {
    if (st.over || st.turn !== seat || !move) return null;
    const s = clone(st);
    if (move.a === "play") return play(s, seat, String(move.card), move.suit, rng, now);
    if (move.a === "draw") {
      if (s.drew) return null;
      draw(s, seat, 1, rng);
      s.drew = true;
      s.last = { seat, drew: 1 };
      // Нічого не підходить і взяв — хід переходить, якщо й нова не підходить
      if (!s.hands[seat].some((c) => playable(s, c))) endTurn(s, now, false);
      return s;
    }
    if (move.a === "pass") { if (!s.drew) return null; endTurn(s, now, false); return s; }
    return null;
  },
  tick(st, now, rng) {
    if (st.over || now < st.until) return null;
    const s = clone(st);
    const seat = s.turn;
    s.timeouts[seat]++;
    if (s.timeouts[seat] >= MAX_TIMEOUTS) return module.exports.forfeit(s, seat, now);
    const c = s.hands[seat].find((x) => playable(s, x));
    if (c) return play(s, seat, c, suitOf(c), rng, now);
    if (!s.drew) draw(s, seat, 1, rng);
    const c2 = s.hands[seat].find((x) => playable(s, x));
    if (c2) return play(s, seat, c2, suitOf(c2), rng, now);
    endTurn(s, now, false);
    return s;
  },
  forfeit(st, seat, now) {
    if (st.over) return st;
    const s = clone(st);
    s.out[seat] = true;
    s.pile.unshift(...s.hands[seat]); s.hands[seat] = [];
    const left = alive(s);
    if (left.length === 1) { s.over = true; s.winners = left; return s; }
    if (s.turn === seat) endTurn(s, now || Date.now(), false);
    return s;
  },
  over: (s) => s.over,
  result: (s) => ({ winners: s.winners || [], text: "Перший скинув усі карти" }),
  pub: (s) => ({
    top: s.top, suit: s.suit, turn: s.turn, until: s.over ? null : s.until, deck: s.deck.length,
    counts: s.hands.map((h) => h.length), out: s.out, over: s.over, winners: s.winners, last: s.last, drew: s.drew, timeouts: s.timeouts,
  }),
  priv: (s, seat) => ({ hand: s.hands[seat], can: s.turn === seat ? s.hands[seat].filter((c) => playable(s, c)) : [] }),
  _internal: { playable },
};
