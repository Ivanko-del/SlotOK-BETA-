// Серверний арбітр онлайн-кімнат (api/room.js).
//
// Кімната — це гра на 2+ гравців зі ставкою. Сервер тримає повний стан у
// room_state/<id> (браузеру недоступний), а гравцям публікує:
//   rooms/<гра>/<id>            — публічний вигляд (лобі, хід, табло);
//   room_private/<id>/<нік>     — те, що бачить лише цей гравець (його карти,
//                                 кораблі, відкриті клітинки).
// Правила самої гри — чисті функції в lib/room-games/<гра>.js; тут лише
// життєвий цикл: створити → приєднатись → грати → розрахунок, плюс гроші.
//
// Гроші: ставка списується атомарно при вході (moveBalance), банк ділиться
// між переможцями мінус комісія RAKE; нічия чи скасування — повернення
// ставок. Кожна зміна стану — dbTransaction, тож два одночасні ходи не
// зіграють двічі, а розрахунок не заплатить двічі (позначки paid).

const crypto = require("crypto");
const { dbGet, dbUpdate, dbTransaction } = require("./firebase");
const { moveBalance, rng } = require("./player");
const { ROOM_GAMES } = require("./room-games");

const RAKE = 0.05;
const WAIT_MS = 10 * 60000;         // кімната без суперника живе 10 хв
const KEEP_FINISHED_MS = 30 * 60000; // завершені прибираються з лобі через 30 хв

const statePath = (id) => `room_state/${id}`;
const pubPath = (game, id) => `rooms/${game}/${id}`;

function newId() {
  return Date.now().toString(36) + crypto.randomBytes(5).toString("hex");
}

const parse = (raw) => (raw && typeof raw.j === "string" ? JSON.parse(raw.j) : null);
const pack = (room) => ({ j: JSON.stringify(room), status: room.status, game: room.game });

// ── Публікація: публічний вигляд з перевіркою версії (старий запис не
// перетре новіший), приватні — разом, з версією; якщо приватний відстав,
// клієнт дочитає його через action "view".
async function publish(room) {
  const def = ROOM_GAMES[room.game];
  const playing = room.state && room.status !== "waiting" && room.status !== "cancelled";
  const pub = {
    bet: room.bet, size: room.size, host: room.host, status: room.status,
    created: room.created, ver: room.ver, ...(room.startBy ? { startBy: room.startBy } : {}),
    players: Object.fromEntries(room.players.map((n, i) => [n, i + 1])),
    opts: JSON.stringify(def.pubOpts ? def.pubOpts(room.opts) : {}),
    v: playing ? JSON.stringify(def.pub(room.state, Date.now())) : "",
    ...(room.result ? { result: JSON.stringify(room.result) } : {}),
    ...(room.finishedAt ? { finishedAt: room.finishedAt } : {}),
  };
  await dbTransaction(pubPath(room.game, room.id), (cur) => (cur && cur.ver >= room.ver ? undefined : pub));
  if (playing) {
    const upd = {};
    room.players.forEach((n, seat) => { upd[`room_private/${room.id}/${n}`] = { ver: room.ver, v: JSON.stringify(def.priv(room.state, seat)) }; });
    await dbUpdate("", upd);
  }
}

// Змінити кімнату транзакцією. mutate(room) → нова кімната | undefined (без змін)
// | { error, message, status } (відмова). Повертає { room, error }.
async function mutateRoom(id, mutate) {
  let err = null;
  const tx = await dbTransaction(statePath(id), (raw) => {
    err = null;
    const room = parse(raw);
    if (!room) { err = { status: 404, error: "no_room", message: "Кімнату не знайдено" }; return undefined; }
    const out = mutate(room);
    if (!out) return undefined;
    if (out.error) { err = out; return undefined; }
    out.ver = (room.ver || 0) + 1;
    return pack(out);
  });
  const room = parse(tx.value);
  if (err) return { error: err, room };
  return { room, changed: tx.committed };
}

// Кінець гри → статус settling з виплатами; далі settle() платить і закриває.
function finishIfOver(room, now) {
  const def = ROOM_GAMES[room.game];
  if (room.status !== "playing" || !def.over(room.state)) return room;
  const res = def.result(room.state);
  const pot = room.bet * room.players.length;
  const payouts = {};
  if (res.draw || !res.winners || !res.winners.length) {
    room.players.forEach((n) => { payouts[n] = room.bet; });
  } else if (res.shares) {
    // Частки банку (масові ігри): { seat: вага }
    const prize = Math.floor(pot * (1 - RAKE));
    const total = Object.values(res.shares).reduce((a, b) => a + b, 0);
    Object.entries(res.shares).forEach(([seat, w]) => { payouts[room.players[seat]] = Math.floor((prize * w) / total); });
  } else {
    const each = Math.floor((pot * (1 - RAKE)) / res.winners.length);
    res.winners.forEach((seat) => { payouts[room.players[seat]] = each; });
  }
  return {
    ...room, status: "settling", finishedAt: now,
    result: { winners: (res.winners || []).map((s) => room.players[s]), draw: !!res.draw, text: res.text || "", payouts },
    paid: {},
  };
}

async function settle(id) {
  let room = parse(await dbGet(statePath(id)));
  if (!room || room.status !== "settling") return room;
  for (const [nick, amount] of Object.entries(room.result.payouts || {})) {
    if (room.paid && room.paid[nick]) continue;
    // Позначка «платимо» до грошей: повтор settle() не заплатить удруге.
    const claim = await dbTransaction(`room_paid/${id}/${nick}`, (cur) => (cur ? undefined : Date.now()));
    if (!claim.committed) continue;
    if (amount > 0) await moveBalance(nick, amount);
  }
  const r = await mutateRoom(id, (cur) => (cur.status === "settling" ? { ...cur, status: "finished", paid: Object.fromEntries(Object.keys(cur.result.payouts || {}).map((n) => [n, true])) } : undefined));
  room = r.room;
  await Promise.all(room.players.map((n) => dbUpdate(`room_of/${n}`, { [id]: null })));
  await publish(room);
  return room;
}

// Після будь-якої зміни: якщо гра скінчилась — платимо; публікуємо.
async function after(room) {
  if (!room) return room;
  if (room.status === "settling") return settle(room.id);
  await publish(room);
  return room;
}

// ── Дії гравця ────────────────────────────────────────────────────────

async function create(nick, game, bet, size, rawOpts) {
  const def = ROOM_GAMES[game];
  if (!def) return { error: { status: 400, error: "bad_game", message: "Невідома гра" } };
  size = def.sizes.includes(size) ? size : def.sizes[0];
  const opts = def.parseOpts ? def.parseOpts(rawOpts || {}) : {};
  if (!opts) return { error: { status: 400, error: "bad_opts", message: "Невірні параметри кімнати" } };
  const mine = (await dbGet(`room_of/${nick}`)) || {};
  if (Object.keys(mine).length >= 3) return { error: { status: 409, error: "too_many", message: "У тебе вже 3 відкриті кімнати — заверши їх" } };

  const debit = await moveBalance(nick, -bet);
  if (!debit.ok) return { error: { status: 402, error: "insufficient", message: "Недостатньо коштів", balance: debit.balance } };
  const now = Date.now();
  let room = { id: newId(), game, bet, size, opts, host: nick, players: [nick], status: "waiting", created: now, ver: 1 };
  // Масові ігри: збираємо гравців def.lobbyMs, далі старт, якщо їх ≥ def.minPlayers
  if (def.lobbyMs) room.startBy = now + def.lobbyMs;
  await dbUpdate("", { [statePath(room.id)]: pack(room), [`room_of/${nick}/${room.id}`]: game });
  await publish(room);
  sweep(game); // заодно прибрати прострочене в лобі цієї гри (не чекаємо)
  return { room, balance: debit.balance };
}

function startGame(room, now) {
  const def = ROOM_GAMES[room.game];
  // Деякі ігри завершуються вже на старті (Coinflip) — одразу до розрахунку.
  return finishIfOver({ ...room, status: "playing", started: now, state: def.init(room.players.length, room.opts, rng, now) }, now);
}

async function join(nick, id) {
  const peek = parse(await dbGet(statePath(id)));
  if (!peek) return { error: { status: 404, error: "no_room", message: "Кімнату не знайдено" } };
  if (peek.status !== "waiting") return { error: { status: 409, error: "started", message: "Гра вже почалась" } };
  if (peek.players.includes(nick)) return { room: peek };
  if (peek.players.length >= peek.size) return { error: { status: 409, error: "full", message: "Місць немає" } };

  const debit = await moveBalance(nick, -peek.bet);
  if (!debit.ok) return { error: { status: 402, error: "insufficient", message: "Недостатньо коштів", balance: debit.balance } };
  const now = Date.now();
  const r = await mutateRoom(id, (room) => {
    if (room.status !== "waiting") return { status: 409, error: "started", message: "Гра вже почалась" };
    if (room.players.includes(nick)) return { status: 409, error: "already", message: "Ти вже в кімнаті" };
    if (room.players.length >= room.size) return { status: 409, error: "full", message: "Місць немає" };
    const next = { ...room, players: [...room.players, nick] };
    return next.players.length >= next.size ? startGame(next, now) : next;
  });
  if (r.error) { await moveBalance(nick, peek.bet); return { error: r.error }; }
  await dbUpdate(`room_of/${nick}`, { [id]: r.room.game });
  return { room: await after(r.room), balance: debit.balance };
}

// «Грати в наступній грі»: зайти в кімнату, що збирається, з тією ж ставкою,
// або створити нову. Для масових ігор (def.lobbyMs).
async function quick(nick, game, bet) {
  const def = ROOM_GAMES[game];
  if (!def || !def.lobbyMs) return { error: { status: 400, error: "bad_game", message: "Ця гра без швидкого входу" } };
  const list = (await dbGet(`rooms/${game}`)) || {};
  const now = Date.now();
  const open = Object.entries(list)
    .filter(([, p]) => p.status === "waiting" && p.bet === bet && (p.startBy || 0) > now + 3000 && Object.keys(p.players || {}).length < p.size)
    .sort((a, b) => (a[1].startBy || 0) - (b[1].startBy || 0));
  for (const [id, p] of open) {
    if ((p.players || {})[nick]) return { room: parse(await dbGet(statePath(id))) };
    const r = await join(nick, id);
    if (!r.error) return r;
  }
  return create(nick, game, bet, def.sizes[0], {});
}

async function leave(nick, id) {
  let refund = 0;
  const now = Date.now();
  const r = await mutateRoom(id, (room) => {
    refund = 0;
    const seat = room.players.indexOf(nick);
    if (seat < 0) return { status: 403, error: "not_in_room", message: "Ти не в цій кімнаті" };
    if (room.status === "waiting") {
      refund = room.bet;
      const players = room.players.filter((n) => n !== nick);
      if (!players.length) return { ...room, players: room.players, status: "cancelled", finishedAt: now, leftAll: true };
      return { ...room, players, host: room.host === nick ? players[0] : room.host };
    }
    if (room.status === "playing") {
      const def = ROOM_GAMES[room.game];
      return finishIfOver({ ...room, state: def.forfeit(room.state, seat, now) }, now);
    }
    return undefined;
  });
  if (r.error) return { error: r.error };
  if (refund) await moveBalance(nick, refund);
  await dbUpdate(`room_of/${nick}`, { [id]: null });
  return { room: await after(r.room) };
}

async function act(nick, id, move) {
  const now = Date.now();
  const r = await mutateRoom(id, (room) => {
    if (room.status !== "playing") return { status: 409, error: "not_playing", message: "Гра не йде" };
    const seat = room.players.indexOf(nick);
    if (seat < 0) return { status: 403, error: "not_in_room", message: "Ти не в цій кімнаті" };
    const def = ROOM_GAMES[room.game];
    const due = def.tick ? def.tick(room.state, now, rng) : null;
    const state = def.act(due || room.state, seat, move, rng, now);
    if (!state) {
      if (due) return finishIfOver({ ...room, state: due }, now); // таймер спрацював — зберігаємо хоч його
      return { status: 400, error: "bad_move", message: "Такий хід неможливий" };
    }
    return finishIfOver({ ...room, state }, now);
  });
  if (r.error) return { error: r.error, room: r.room };
  return { room: await after(r.room) };
}

// Таймер: хід за того, хто не встиг (автохід/програш), або скасування
// кімнати, що задовго чекає суперника. Викликати може будь-хто.
async function tick(id) {
  const now = Date.now();
  let refunds = [];
  const r = await mutateRoom(id, (room) => {
    refunds = [];
    if (room.status === "settling") return undefined;
    if (room.status === "waiting") {
      const def = ROOM_GAMES[room.game];
      if (room.startBy && now >= room.startBy && room.players.length >= (def.minPlayers || room.size)) return startGame(room, now);
      if (room.startBy ? now < room.startBy : now - room.created < WAIT_MS) return undefined;
      refunds = room.players.slice();
      return { ...room, status: "cancelled", finishedAt: now };
    }
    if (room.status !== "playing") return undefined;
    const def = ROOM_GAMES[room.game];
    const due = def.tick ? def.tick(room.state, now, rng) : null;
    if (!due) return undefined;
    return finishIfOver({ ...room, state: due }, now);
  });
  if (r.error) return { error: r.error };
  for (const n of refunds) {
    const claim = await dbTransaction(`room_paid/${id}/${n}`, (cur) => (cur ? undefined : Date.now()));
    if (claim.committed) await moveBalance(n, r.room.bet);
    await dbUpdate(`room_of/${n}`, { [id]: null });
  }
  if (r.room && r.room.status === "settling") return { room: await settle(id) };
  if (r.changed) await publish(r.room);
  return { room: r.room };
}

async function view(nick, id) {
  const room = parse(await dbGet(statePath(id)));
  if (!room) return { error: { status: 404, error: "no_room", message: "Кімнату не знайдено" } };
  if (room.status === "settling") await settle(id);
  const def = ROOM_GAMES[room.game];
  const seat = room.players.indexOf(nick);
  return {
    room,
    pub: room.state ? def.pub(room.state, Date.now()) : null,
    priv: room.state && seat >= 0 ? def.priv(room.state, seat) : null,
  };
}

// Мої відкриті кімнати (після перезавантаження сторінки) + прибирання:
// прострочені таймери проганяються тут же.
async function mine(nick) {
  const ids = Object.keys((await dbGet(`room_of/${nick}`)) || {});
  const out = [];
  for (const id of ids.slice(0, 10)) {
    const t = await tick(id).catch(() => ({}));
    const room = t.room || parse(await dbGet(statePath(id)));
    if (!room || room.status === "finished" || room.status === "cancelled") { await dbUpdate(`room_of/${nick}`, { [id]: null }); continue; }
    out.push({ id, game: room.game, status: room.status });
  }
  return out;
}

// Прибирання лобі гри: кімнати, що задовго чекають, скасовуємо (з
// поверненням ставок), а давно завершені — прибираємо з публічного списку.
async function sweep(game) {
  try {
    const list = (await dbGet(`rooms/${game}`)) || {};
    const now = Date.now();
    const jobs = [];
    for (const [id, p] of Object.entries(list)) {
      if (p.status === "waiting" && now - (p.created || 0) > WAIT_MS) jobs.push(tick(id));
      else if ((p.status === "finished" || p.status === "cancelled") && now - (p.finishedAt || p.created || 0) > KEEP_FINISHED_MS) {
        jobs.push(dbUpdate("", { [pubPath(game, id)]: null, [`room_private/${id}`]: null, [statePath(id)]: null, [`room_paid/${id}`]: null }));
      }
      if (jobs.length >= 20) break;
    }
    await Promise.allSettled(jobs);
  } catch (e) { console.warn("rooms sweep", game, e.message); }
}

module.exports = { create, join, quick, leave, act, tick, view, mine, sweep, RAKE, WAIT_MS, _parse: parse };
