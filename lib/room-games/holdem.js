// Покер Texas Hold'em на 2–6 гравців (турнір «до одного» на столі).
// Ставка кімнати — бай-ін: кожен отримує 1000 фішок. Сліпі 10/20 і ростуть
// у 1,5 раза кожні 5 роздач. Гра триває, доки фішки не зберуться в одного,
// або 30 роздач; банк кімнати ділиться пропорційно фішкам (мінус 5%).
// Кишенькові карти бачить лише власник (priv), на шоудауні їх відкриваємо.
// На дію 25 с: не встиг — чек, якщо можна, інакше фолд; тричі поспіль — поразка.

const SUITS = ["s", "h", "d", "c"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const START = 1000, SB0 = 10, LEVEL_HANDS = 5, MAX_HANDS = 30;
const ACT_MS = 25000, SHOW_MS = 6000, MAX_TIMEOUTS = 3;
const clone = (s) => JSON.parse(JSON.stringify(s));
const rv = (c) => RANKS.indexOf(c.slice(0, -1)) + 2; // 2..14
const sv = (c) => c.slice(-1);
function shuffle(a, rng) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ── Оцінка руки: масив [категорія, ...кікери], більше = краще ──
const CAT = ["Старша карта", "Пара", "Дві пари", "Сет", "Стрит", "Флеш", "Фул-хаус", "Каре", "Стрит-флеш"];
function eval5(cards) {
  const r = cards.map(rv).sort((a, b) => b - a);
  const flush = cards.every((c) => sv(c) === sv(cards[0]));
  const uniq = [...new Set(r)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (r[0] - r[4] === 4) straightHigh = r[0];
    else if (r.join() === "14,5,4,3,2") straightHigh = 5; // «колесо»
  }
  const cnt = {};
  r.forEach((x) => { cnt[x] = (cnt[x] || 0) + 1; });
  const groups = Object.entries(cnt).map(([k, v]) => [v, +k]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const byGroups = groups.map((g) => g[1]);
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][0] === 4) return [7, ...byGroups];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...byGroups];
  if (flush) return [5, ...r];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, ...byGroups];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...byGroups];
  if (groups[0][0] === 2) return [1, ...byGroups];
  return [0, ...r];
}
const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
function best7(cards) {
  let best = null, bestCards = null;
  for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++) {
    const five = cards.filter((_, i) => i !== a && i !== b);
    const v = eval5(five);
    if (!best || cmp(v, best) > 0) { best = v; bestCards = five; }
  }
  return { v: best, cards: bestCards, name: CAT[best[0]] };
}

// ── Стіл ──
const alive = (s) => s.stacks.map((x, i) => i).filter((i) => !s.out[i] && (s.stacks[i] > 0 || s.inHand[i]));
function nextFrom(s, from, pred) {
  const n = s.stacks.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (pred(i)) return i; }
  return -1;
}
const canAct = (s, i) => s.inHand[i] && !s.folded[i] && s.stacks[i] > 0;
const inPot = (s) => s.stacks.map((_, i) => i).filter((i) => s.inHand[i] && !s.folded[i]);

function blinds(s) {
  const lvl = Math.floor((s.hand - 1) / LEVEL_HANDS);
  const sb = Math.round((SB0 * Math.pow(1.5, lvl)) / 5) * 5;
  return [sb, sb * 2];
}
function post(s, i, amt) {
  const a = Math.min(amt, s.stacks[i]);
  s.stacks[i] -= a; s.bet[i] += a; s.contrib[i] += a;
  return a;
}

function startHand(s, rng, now) {
  s.hand++;
  const seats = s.stacks.map((_, i) => i).filter((i) => !s.out[i] && s.stacks[i] > 0);
  s.inHand = s.stacks.map((_, i) => seats.includes(i));
  s.folded = s.stacks.map(() => false);
  s.bet = s.stacks.map(() => 0);
  s.contrib = s.stacks.map(() => 0);
  s.acted = s.stacks.map(() => false);
  s.deck = shuffle(SUITS.flatMap((su) => RANKS.map((r) => r + su)), rng);
  s.hole = s.stacks.map((_, i) => (s.inHand[i] ? [s.deck.pop(), s.deck.pop()] : null));
  s.board = [];
  s.street = "preflop";
  s.showdown = null; s.winnersHand = null;
  s.dealer = nextFrom(s, s.dealer, (i) => s.inHand[i]);
  const [sb, bb] = blinds(s);
  s.blinds = [sb, bb];
  // На двох дилер — малий сліп і ходить першим до флопу
  const sbSeat = seats.length === 2 ? s.dealer : nextFrom(s, s.dealer, (i) => s.inHand[i]);
  const bbSeat = nextFrom(s, sbSeat, (i) => s.inHand[i]);
  post(s, sbSeat, sb); post(s, bbSeat, bb);
  s.sbSeat = sbSeat; s.bbSeat = bbSeat;
  s.toCall = Math.max(...s.bet);
  s.minRaise = bb;
  s.phase = "bet";
  s.turn = nextFrom(s, bbSeat, (i) => canAct(s, i));
  s.last = { hand: s.hand, blinds: [sb, bb] };
  s.until = now + ACT_MS;
  if (s.turn < 0 || roundDone(s)) advance(s, rng, now);
}

function roundDone(s) {
  const actors = s.stacks.map((_, i) => i).filter((i) => canAct(s, i));
  if (inPot(s).length <= 1) return true;
  if (!actors.length) return true;
  const top = Math.max(...s.bet);
  // Лишився один, хто може ходити, і йому нема що доплачувати
  if (actors.length === 1 && s.bet[actors[0]] >= top) return true;
  return actors.every((i) => s.acted[i] && s.bet[i] === top);
}

// Наступна вулиця або шоудаун
function advance(s, rng, now) {
  for (;;) {
    if (inPot(s).length <= 1) return finishHand(s, now);
    if (s.street === "river") return finishHand(s, now);
    s.bet = s.bet.map(() => 0);
    s.acted = s.acted.map(() => false);
    s.toCall = 0; s.minRaise = s.blinds[1];
    if (s.street === "preflop") { s.board.push(s.deck.pop(), s.deck.pop(), s.deck.pop()); s.street = "flop"; }
    else if (s.street === "flop") { s.board.push(s.deck.pop()); s.street = "turn"; }
    else { s.board.push(s.deck.pop()); s.street = "river"; }
    const actors = s.stacks.map((_, i) => i).filter((i) => canAct(s, i));
    if (actors.length >= 2) {
      s.turn = nextFrom(s, s.dealer, (i) => canAct(s, i));
      s.until = now + ACT_MS;
      return s;
    }
    // Усі (крім одного) в олині — докладаємо карти до кінця
  }
}

// Розрахунок банку з побічними банками
function finishHand(s, now) {
  const contenders = inPot(s);
  const pots = [];
  const levels = [...new Set(s.contrib.filter((x) => x > 0))].sort((a, b) => a - b);
  let prev = 0;
  for (const lvl of levels) {
    const amount = s.contrib.reduce((a, c) => a + Math.max(0, Math.min(c, lvl) - prev), 0);
    const eligible = contenders.filter((i) => s.contrib[i] >= lvl);
    pots.push({ amount, eligible });
    prev = lvl;
  }
  if (s.dead) { pots.length ? (pots[0].amount += s.dead) : pots.push({ amount: s.dead, eligible: contenders }); s.dead = 0; }
  const results = {};
  const showdown = contenders.length > 1 && s.board.length === 5;
  if (showdown) contenders.forEach((i) => { results[i] = best7([...s.hole[i], ...s.board]); });
  const won = s.stacks.map(() => 0);
  for (const p of pots) {
    let el = p.eligible.length ? p.eligible : contenders;
    if (!el.length) continue;
    if (showdown && el.length > 1) {
      const top = el.reduce((b, i) => (cmp(results[i].v, results[b].v) > 0 ? i : b), el[0]);
      el = el.filter((i) => cmp(results[i].v, results[top].v) === 0);
    }
    const share = Math.floor(p.amount / el.length);
    el.forEach((i) => { won[i] += share; });
    // залишок від ділення — першому після дилера
    const rest = p.amount - share * el.length;
    if (rest) won[nextFrom(s, s.dealer, (i) => el.includes(i))] += rest;
  }
  won.forEach((w, i) => { s.stacks[i] += w; });
  s.showdown = showdown ? Object.fromEntries(contenders.map((i) => [i, { cards: s.hole[i], name: results[i].name, best: results[i].cards }])) : null;
  s.winnersHand = won.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0);
  s.won = won;
  s.phase = "show";
  s.turn = -1;
  s.until = now + SHOW_MS;
  // Кінець гри: фішки в одного або ліміт роздач
  const withChips = s.stacks.map((x, i) => i).filter((i) => !s.out[i] && s.stacks[i] > 0);
  if (withChips.length <= 1 || s.hand >= MAX_HANDS) s.over = true;
  return s;
}

function act(s, seat, mv, rng, now) {
  if (s.phase !== "bet" || s.turn !== seat) return null;
  const top = Math.max(...s.bet);
  const need = top - s.bet[seat];
  const a = mv && mv.a;
  if (a === "fold") { s.folded[seat] = true; }
  else if (a === "check") { if (need > 0) return null; }
  else if (a === "call") { if (need <= 0) return null; post(s, seat, need); }
  else if (a === "raise" || a === "allin") {
    const max = s.bet[seat] + s.stacks[seat];
    const to = a === "allin" ? max : Math.floor(Number(mv.to));
    if (!Number.isFinite(to) || to > max) return null;
    if (to <= top) {
      // Олин на суму, не більшу за ставку, — це колл усім, що є
      if (a !== "allin") return null;
      post(s, seat, s.stacks[seat]);
    } else {
      const raiseBy = to - top;
      // Неповний рейз дозволено лише як олин
      if (raiseBy < s.minRaise && to !== max) return null;
      post(s, seat, to - s.bet[seat]);
      if (raiseBy >= s.minRaise) {
        s.minRaise = raiseBy;
        s.acted = s.acted.map((x, i) => (i === seat ? x : false)); // усім іншим знову ходити
      }
    }
  } else return null;
  s.acted[seat] = true;
  s.timeouts[seat] = 0;
  s.last = { seat, a, amount: s.bet[seat] };
  s.toCall = Math.max(...s.bet);
  if (roundDone(s)) return advance(s, rng, now);
  s.turn = nextFrom(s, seat, (i) => canAct(s, i));
  s.until = now + ACT_MS;
  return s;
}

module.exports = {
  sizes: [2, 3, 4, 5, 6], minPlayers: 2,
  START, eval5, best7, cmp, CAT,
  parseOpts: () => ({}),
  init(n, opts, rng, now) {
    const s = { stacks: Array(n).fill(START), out: Array(n).fill(false), timeouts: Array(n).fill(0), hand: 0, dealer: rng.int(0, n) - 1, dead: 0, over: false };
    if (s.dealer < 0) s.dealer = n - 1;
    startHand(s, rng, now + 2500);
    return s;
  },
  act(st, seat, mv, rng, now) {
    if (st.over) return null;
    return act(clone(st), seat, mv, rng, now);
  },
  tick(st, now, rng) {
    if (st.over || now < st.until) return null;
    const s = clone(st);
    if (s.phase === "show") { startHand(s, rng, now); return s; }
    const seat = s.turn;
    s.timeouts[seat]++;
    if (s.timeouts[seat] >= MAX_TIMEOUTS) return module.exports.forfeit(s, seat, now, rng);
    const need = Math.max(...s.bet) - s.bet[seat];
    const t = s.timeouts[seat];
    const r = act(s, seat, { a: need > 0 ? "fold" : "check" }, rng, now);
    if (r) r.timeouts[seat] = t;
    return r;
  },
  // Вийшов: фішки лишаються «мертвими» в банку наступного розіграшу
  forfeit(st, seat, now, rng) {
    if (st.over) return st;
    const s = clone(st);
    s.out[seat] = true;
    if (s.phase === "bet" && s.inHand[seat] && !s.folded[seat]) {
      s.folded[seat] = true;
      s.dead += s.stacks[seat]; s.stacks[seat] = 0;
      if (s.turn === seat) {
        if (roundDone(s)) advance(s, rng || { int: (a, b) => a + Math.floor(Math.random() * (b - a)) }, now || Date.now());
        else { s.turn = nextFrom(s, seat, (i) => canAct(s, i)); s.until = (now || Date.now()) + ACT_MS; }
      } else if (roundDone(s)) advance(s, rng || { int: (a, b) => a + Math.floor(Math.random() * (b - a)) }, now || Date.now());
    } else { s.dead += s.stacks[seat]; s.stacks[seat] = 0; }
    const left = s.stacks.map((x, i) => i).filter((i) => !s.out[i]);
    if (left.length <= 1) {
      // Лишився один — йому й мертві фішки, гра скінчилась
      if (left.length === 1) { s.stacks[left[0]] += s.dead + (s.phase === "bet" ? s.contrib.reduce((a, b) => a + b, 0) : 0); s.dead = 0; if (s.phase === "bet") s.contrib = s.contrib.map(() => 0); }
      s.over = true;
    }
    return s;
  },
  over: (s) => s.over,
  result(s) {
    const shares = {};
    s.stacks.forEach((x, i) => { if (x > 0 && !s.out[i]) shares[i] = x; });
    const winners = Object.keys(shares).map(Number);
    if (!winners.length) return { winners: [], draw: true, text: "Усі вийшли — ставки повернено" };
    return { winners, shares, text: winners.length === 1 ? "Усі фішки в одного" : `Після ${s.hand} роздач банк ділиться за фішками` };
  },
  pub(s) {
    const top = s.bet ? Math.max(...s.bet) : 0;
    return {
      hand: s.hand, phase: s.phase, street: s.street, board: s.board, stacks: s.stacks, bet: s.bet,
      folded: s.folded, inHand: s.inHand, out: s.out, dealer: s.dealer, sb: s.sbSeat, bb: s.bbSeat, blinds: s.blinds,
      pot: s.contrib.reduce((a, b) => a + b, 0) + (s.dead || 0), toCall: top, minRaise: s.minRaise, turn: s.turn,
      until: s.over ? null : s.until, over: s.over, last: s.last, timeouts: s.timeouts,
      showdown: s.phase === "show" ? s.showdown : null, won: s.phase === "show" ? s.won : null, maxHands: MAX_HANDS,
    };
  },
  priv: (s, seat) => ({ hole: s.hole ? s.hole[seat] : null }),
  _internal: { startHand, roundDone, finishHand },
};
