// Blackjack для api/round.js. Правила — як у app.js до переносу: одна колода
// на роздачу, дилер добирає до 17 (на soft 17 стоїть), blackjack 3:2, без
// «підгляду» дилера (европейський варіант), split одного разу, double на
// двох картах (і після split), surrender лише першим ходом, страховка 2:1.
//
// Колода тасується на старті й лежить у стані раунду на сервері, тож кожен хід
// детермінований: той самий стан + той самий хід = той самий результат. На цьому
// тримається двофазний хід з доплатою (double/split/insurance) в api/round.js.

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["♠", "♥", "♦", "♣"];

const cardVal = (c) => (c.r === 12 ? 11 : c.r >= 8 ? 10 : c.r + 2);
const isAce = (c) => c.r === 12;

function handValue(cards) {
  let v = 0, aces = 0;
  for (const c of cards) { v += cardVal(c); if (isAce(c)) aces++; }
  while (v > 21 && aces > 0) { v -= 10; aces--; }
  return v;
}
const isNatural = (cards) => cards.length === 2 && handValue(cards) === 21;

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Копія стану (рука — масив об'єктів, тож копіюємо на рівень глибше).
function clone(s) {
  return { ...s, hands: s.hands.map((h) => ({ ...h, cards: h.cards.slice() })), dealer: s.dealer.slice() };
}

function draw(s) {
  return s.deck[s.pos++];
}

// Наступна незавершена рука; якщо таких немає — хід дилера і кінець раунду.
function advance(s) {
  const next = s.hands.findIndex((h) => !h.done);
  if (next >= 0) { s.active = next; return; }
  const anyAlive = s.hands.some((h) => handValue(h.cards) <= 21);
  const allNatural = !s.split && isNatural(s.hands[0].cards);
  if (anyAlive && !allNatural) while (handValue(s.dealer) < 17) s.dealer.push(draw(s));
  s.over = true;
}

const blackjack = {
  parse() {
    return {};
  },

  init(_p, rng, ctx) {
    const deck = [];
    for (let r = 0; r < 13; r++) for (let su = 0; su < 4; su++) deck.push({ r, s: su });
    shuffle(deck, rng);
    const s = { deck, pos: 0, hands: [], dealer: [], active: 0, insurance: 0, split: false, surrendered: false, actions: 0, over: false };
    const p1 = draw(s), d1 = draw(s), p2 = draw(s), d2 = draw(s);
    s.hands = [{ cards: [p1, p2], bet: ctx.bet, done: false, doubled: false }];
    s.dealer = [d1, d2];
    if (isNatural(s.hands[0].cards)) { s.hands[0].done = true; advance(s); }
    return s;
  },

  // { state, bust: false, cost } або null, якщо хід неможливий.
  move(state, m) {
    const action = m && m.action;
    if (state.over) return null;
    const s = clone(state);
    const hand = s.hands[s.active];
    let cost = 0;
    switch (action) {
      case "hit": {
        hand.cards.push(draw(s));
        const v = handValue(hand.cards);
        if (v >= 21) hand.done = true;
        break;
      }
      case "stand":
        hand.done = true;
        break;
      case "double":
        if (hand.cards.length !== 2 || hand.doubled) return null;
        cost = hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
        hand.cards.push(draw(s));
        hand.done = true;
        break;
      case "split": {
        if (s.split || s.hands.length !== 1 || hand.cards.length !== 2) return null;
        if (Math.min(10, hand.cards[0].r + 2) !== Math.min(10, hand.cards[1].r + 2) && !(isAce(hand.cards[0]) && isAce(hand.cards[1]))) return null;
        cost = hand.bet;
        s.split = true;
        s.hands = [
          { cards: [hand.cards[0], draw(s)], bet: hand.bet, done: false, doubled: false },
          { cards: [hand.cards[1], draw(s)], bet: hand.bet, done: false, doubled: false },
        ];
        s.hands.forEach((h) => { if (handValue(h.cards) === 21) h.done = true; });
        break;
      }
      case "surrender":
        if (s.split || s.actions > 0 || hand.cards.length !== 2) return null;
        s.surrendered = true;
        s.hands[0].done = true;
        s.over = true;
        break;
      case "insurance":
        if (s.insurance || s.split || s.actions > 0 || !isAce(s.dealer[0])) return null;
        cost = Math.floor(s.hands[0].bet / 2);
        if (cost < 1) return null;
        s.insurance = cost;
        return { state: s, bust: false, cost }; // страховка не є «ходом» — далі можна все
      default:
        return null;
    }
    s.actions++;
    if (!s.over) advance(s);
    return { state: s, bust: false, cost };
  },

  finished(state) {
    return !!state.over;
  },

  // Скільки повернути гравцю наприкінці (ставки вже списані).
  payout(state) {
    const s = state;
    const first = s.hands[0];
    if (s.surrendered) return Math.floor(first.bet / 2);
    const d = handValue(s.dealer);
    const dealerNatural = isNatural(s.dealer);
    let pay = 0;
    for (const h of s.hands) {
      const v = handValue(h.cards);
      if (v > 21) continue;
      if (!s.split && isNatural(h.cards)) { pay += dealerNatural ? h.bet : h.bet + Math.floor(h.bet * 1.5); continue; }
      if (dealerNatural) continue;
      if (d > 21 || v > d) pay += h.bet * 2;
      else if (v === d) pay += h.bet;
    }
    if (s.insurance && dealerNatural) pay += s.insurance * 3; // 2:1 + повернення страховки
    return pay;
  },

  // Покинута роздача: усі незавершені руки — «стоп», дилер добирає, розрахунок.
  abandon(state) {
    if (state.over) return state;
    const s = clone(state);
    s.hands.forEach((h) => { h.done = true; });
    advance(s);
    return s;
  },

  mult() {
    return 0; // кешауту посеред роздачі немає
  },

  view(state, reveal) {
    const card = (c) => ({ rank: RANKS[c.r], suit: SUITS[c.s] });
    const showDealer = reveal || state.over;
    const hand = state.hands[state.active];
    const canSplit = !state.split && state.hands.length === 1 && hand.cards.length === 2 &&
      Math.min(10, hand.cards[0].r + 2) === Math.min(10, hand.cards[1].r + 2);
    return {
      hands: state.hands.map((h) => ({ cards: h.cards.map(card), value: handValue(h.cards), bet: h.bet, done: h.done })),
      active: state.active,
      dealer: showDealer ? state.dealer.map(card) : [card(state.dealer[0])],
      dealerValue: showDealer ? handValue(state.dealer) : null,
      over: !!state.over,
      split: state.split,
      insurance: state.insurance,
      surrendered: !!state.surrendered,
      can: state.over ? {} : {
        double: hand.cards.length === 2 && !hand.doubled,
        split: canSplit,
        surrender: !state.split && state.actions === 0,
        insurance: !state.insurance && !state.split && state.actions === 0 && isAce(state.dealer[0]),
      },
      ...(state.over ? { payout: this.payout(state) } : {}),
    };
  },

  fix(s) {
    const cards = (a) => (a || []).map((c) => ({ r: c.r || 0, s: c.s || 0 }));
    return {
      ...s,
      deck: cards(s.deck),
      pos: s.pos || 0,
      hands: (s.hands || []).map((h) => ({ cards: cards(h.cards), bet: h.bet, done: !!h.done, doubled: !!h.doubled })),
      dealer: cards(s.dealer),
      active: s.active || 0,
      insurance: s.insurance || 0,
      split: !!s.split,
      surrendered: !!s.surrendered,
      actions: s.actions || 0,
      over: !!s.over,
    };
  },
};

module.exports = { blackjack, handValue };
