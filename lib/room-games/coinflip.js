// Coinflip 1×1: творець обирає бік, монету кидає сервер у момент, коли
// приєднався суперник (раніше кидав браузер того, хто приєднався).
module.exports = {
  sizes: [2],
  parseOpts(o) { return { side: o.side === "tails" ? "tails" : "heads" }; },
  pubOpts(o) { return { side: o.side }; },
  init(n, opts, rng) {
    const result = rng.int(0, 2) ? "heads" : "tails";
    return { side: opts.side, result, over: true, winners: [result === opts.side ? 0 : 1] };
  },
  act: () => null,
  tick: () => null,
  forfeit: (s) => s,
  over: (s) => s.over,
  result: (s) => ({ winners: s.winners, text: s.result === "heads" ? "Орел" : "Решка" }),
  pub: (s) => ({ side: s.side, result: s.result, winners: s.winners }),
  priv: () => ({}),
};
