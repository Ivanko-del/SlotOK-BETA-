// Правила онлайн-ігор для арбітра кімнат (lib/rooms.js).
//
// Кожна гра — об'єкт із чистими функціями (без бази й мережі):
//   sizes            — скільки гравців може бути в кімнаті (перший — типовий);
//   parseOpts(o)     — параметри від творця кімнати → нормалізовані | null;
//   pubOpts(opts)    — що з параметрів можна показати в лобі;
//   init(n, opts, rng, now)          — стан на старті (n гравців, місця 0..n-1);
//   act(state, seat, move, rng, now) — новий стан | null (хід неможливий);
//   tick(state, now, rng)            — стан після простроченого таймера | null;
//   forfeit(state, seat, now)        — гравець вийшов;
//   over(state) / result(state)      — кінець і переможці { winners:[seat], draw, shares, text };
//   pub(state, now) / priv(state, seat) — що бачать усі / лише цей гравець.
// Стан не мутується: act/tick повертають копію.

module.exports.ROOM_GAMES = {
  minesweeper: require("./minesweeper"),
  battleship: require("./battleship"),
  coinflip: require("./coinflip"),
  rps: require("./rps"),
  predict: require("./predict"),
  bingo: require("./bingo"),
  quizbattle: require("./quizbattle"),
  royale: require("./royale"),
  eights: require("./eights"),
  durak: require("./durak"),
  ludo: require("./ludo"),
};
