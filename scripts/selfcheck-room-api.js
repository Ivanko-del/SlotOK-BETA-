// Self-check для api/room.js, lib/rooms.js і lib/room-games/* (онлайн-кімнати).
// Запуск: node scripts/selfcheck-room-api.js
//
// Мок бази поводиться як справжня RTDB (порожні масиви й null не зберігає,
// ETag для транзакцій). Перевіряємо: ставки списуються при вході й платяться
// переможцю рівно раз; секрети (міни, кораблі, ходи, загадане число) не
// потрапляють у публічний і чужий приватний вигляд; одночасні входи/ходи не
// ламають банк; таймери й вихід з гри; гроші зберігаються (мінус комісія).
const assert = require("assert");
const crypto = require("crypto");

const { privateKey: saKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: gKey, publicKey: gPub } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({ project_id: "nye-slotok", client_email: "svc@x", private_key: saKey.export({ type: "pkcs8", format: "pem" }) });

let tree = {};
const strip = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x === null || (Array.isArray(x) && x.length === 0) ? undefined : x)) ?? "null");
const getPath = (p) => p.split("/").filter(Boolean).reduce((n, k) => (n == null ? null : n[k]), tree) ?? null;
function setPath(p, value) {
  const parts = p.split("/").filter(Boolean);
  const last = parts.pop();
  const parent = parts.reduce((n, k) => (n[k] ??= {}), tree);
  const v = strip(value);
  if (v === null || v === undefined) delete parent[last]; else parent[last] = v;
}
let delay = 0;
global.fetch = async (url, opts = {}) => {
  if (url.startsWith("https://oauth2.googleapis.com")) return { ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) };
  const p = decodeURIComponent(new URL(url).pathname.replace(/\.json$/, ""));
  const method = opts.method || "GET";
  if (delay) await new Promise((r) => setTimeout(r, delay * Math.random()));
  const etag = JSON.stringify(getPath(p));
  if (method === "GET") return { ok: true, status: 200, headers: { get: () => etag }, json: async () => JSON.parse(JSON.stringify(getPath(p))) };
  if (method === "PUT") {
    const im = (opts.headers || {})["if-match"];
    if (im !== undefined && im !== JSON.stringify(getPath(p))) return { ok: false, status: 412, text: async () => "" };
    setPath(p, JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => getPath(p) };
  }
  if (method === "PATCH") {
    for (const [k, v] of Object.entries(JSON.parse(opts.body))) setPath(`${p}/${k}`, v);
    return { ok: true, status: 200, json: async () => getPath(p) };
  }
  throw new Error("unexpected " + method);
};
require("../lib/id-token")._setCertsForTests({ k: gPub.export({ type: "spki", format: "pem" }) });
require("../lib/player")._resetRateLimitForTests();
const handler = require("../api/room.js");
const { ROOM_GAMES } = require("../lib/room-games");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function tok(uid) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", kid: "k" }), pl = b64({ sub: uid, aud: "nye-slotok", iss: "https://securetoken.google.com/nye-slotok", iat: now, auth_time: now, exp: now + 600 });
  return `${h}.${pl}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${pl}`), gKey).toString("base64url")}`;
}
const resetRate = require("../lib/player")._resetRateLimitForTests;
let calls = 0;
const call = (uid, body) => new Promise((resolve) => {
  if (++calls % 40 === 0) resetRate();
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(d) { resolve({ status: this.statusCode, data: d }); }, end() { resolve({ status: this.statusCode, data: null }); } };
  handler({ method: "POST", headers: { authorization: "Bearer " + tok(uid) }, body }, res);
});
const bal = (u) => tree.users[u].balance;
const full = (id) => JSON.parse(tree.room_state[id].j);
const pubOf = (game, id) => tree.rooms[game][id];
const privOf = (id, nick) => tree.room_private && tree.room_private[id] && tree.room_private[id][nick];
const total = () => Object.values(tree.users).reduce((a, u) => a + u.balance, 0);
const rng = { int: (a, b) => crypto.randomInt(a, b) };

(async () => {
  const names = ["ann", "ben", "cid", "dan", "eve"];
  tree = { users: Object.fromEntries(names.map((n) => [n, { balance: 10000 }])) };

  // ── Coinflip: сервер кидає монету при вході суперника ──
  let r = await call("ann", { action: "create", game: "coinflip", bet: 1000, opts: { side: "heads" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const cf = r.data.id;
  assert.strictEqual(bal("ann"), 9000, "ставку творця списано");
  assert.strictEqual(pubOf("coinflip", cf).status, "waiting");
  assert.strictEqual((await call("ann", { action: "join", id: cf })).status, 200, "повторний вхід — без нового списання");
  assert.strictEqual(bal("ann"), 9000);
  r = await call("ben", { action: "join", id: cf });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.status, "finished");
  const cfWinner = r.data.result.winners[0];
  assert.ok(["ann", "ben"].includes(cfWinner));
  assert.strictEqual(bal(cfWinner), 9000 + 1900, "банк 2000 мінус 5%");
  assert.strictEqual(total(), 50000 - 100, "гроші не з'являються з нізвідки");
  assert.strictEqual((await call("cid", { action: "join", id: cf })).status, 409, "у завершену кімнату не зайти");

  // ── Одночасний вхід трьох у кімнату на двох: зайде один, решті повернуть ──
  tree.users.cid.balance = tree.users.dan.balance = tree.users.eve.balance = 10000;
  const before = total();
  r = await call("ann", { action: "create", game: "coinflip", bet: 500, opts: { side: "tails" } });
  const race = r.data.id;
  delay = 15;
  const joins = await Promise.all(["cid", "dan", "eve"].map((n) => call(n, { action: "join", id: race })));
  delay = 0;
  assert.strictEqual(joins.filter((x) => x.status === 200).length, 1, "зайшов рівно один");
  assert.strictEqual(total(), before - 50, "зайві входи повернуто, комісія лише з одного банку");

  // ── Камінь-ножиці: хід суперника прихований ──
  r = await call("ann", { action: "create", game: "rps", bet: 200 });
  const rps = r.data.id;
  await call("ben", { action: "join", id: rps });
  assert.strictEqual((await call("ann", { action: "act", id: rps, move: { m: "rock" } })).status, 200);
  assert.ok(!JSON.stringify(pubOf("rps", rps)).includes("rock"), "хід не видно в публічному вигляді");
  assert.ok(!JSON.stringify(privOf(rps, "ben")).includes("rock"), "хід не видно супернику");
  assert.strictEqual((await call("ann", { action: "act", id: rps, move: { m: "paper" } })).status, 400, "двічі не ходять");
  const pb = bal("ann"), pben = bal("ben");
  r = await call("ben", { action: "act", id: rps, move: { m: "scissors" } });
  assert.strictEqual(r.data.status, "finished");
  assert.deepStrictEqual(r.data.result.winners, ["ann"]);
  assert.strictEqual(bal("ann"), pb + 380);
  assert.strictEqual(bal("ben"), pben);

  // ── RPS: нічия повертає ставки; таймаут — програє той, хто не походив ──
  r = await call("ann", { action: "create", game: "rps", bet: 100 });
  let id = r.data.id;
  await call("ben", { action: "join", id });
  const a0 = bal("ann"), b0 = bal("ben");
  await call("ann", { action: "act", id, move: { m: "rock" } });
  await call("ben", { action: "act", id, move: { m: "rock" } });
  assert.strictEqual(bal("ann"), a0 + 100, "нічия — повернення");
  assert.strictEqual(bal("ben"), b0 + 100);
  r = await call("ann", { action: "create", game: "rps", bet: 100 });
  id = r.data.id;
  await call("ben", { action: "join", id });
  await call("ben", { action: "act", id, move: { m: "paper" } });
  assert.strictEqual((await call("ann", { action: "tick", id })).data.status, "playing", "до дедлайну таймер нічого не робить");
  const st = JSON.parse(tree.room_state[id].j); st.state.until = Date.now() - 1; tree.room_state[id].j = JSON.stringify(st);
  r = await call("cid", { action: "tick", id });
  assert.strictEqual(r.data.status, "finished");
  assert.deepStrictEqual(r.data.result.winners, ["ben"], "не встиг — програв");

  // ── Prediction: загадане й чужий вибір приховані ──
  r = await call("ann", { action: "create", game: "predict", bet: 300, opts: { guess: 50 } });
  id = r.data.id;
  assert.strictEqual((await call("ann", { action: "create", game: "predict", bet: 300, opts: { guess: 500 } })).status, 400);
  await call("ben", { action: "join", id });
  const secret = full(id).state.secret;
  assert.ok(!JSON.stringify(pubOf("predict", id)).includes('"secret"'), "загадане число не публікується");
  assert.ok(!JSON.stringify(privOf(id, "ben")).includes("50"), "вибір творця не видно супернику");
  assert.strictEqual((await call("ann", { action: "act", id, move: { g: 10 } })).status, 400, "творець вже назвав число");
  r = await call("ben", { action: "act", id, move: { g: secret } });
  assert.deepStrictEqual(r.data.result.winners, secret === 50 ? [] : ["ben"]);

  // ── Вихід: до старту — повернення, під час гри — поразка ──
  r = await call("ann", { action: "create", game: "minesweeper", bet: 400, opts: { level: "easy" } });
  id = r.data.id;
  const ann1 = bal("ann");
  await call("ann", { action: "leave", id });
  assert.strictEqual(bal("ann"), ann1 + 400, "вийшов до старту — ставку повернено");
  assert.strictEqual(pubOf("minesweeper", id).status, "cancelled");

  // ── Сапер: міни не видно до кінця; підрив = поразка; повний прохід = перемога ──
  r = await call("ann", { action: "create", game: "minesweeper", bet: 400, opts: { level: "easy" } });
  id = r.data.id;
  await call("ben", { action: "join", id });
  let s = full(id).state;
  const pubM = JSON.parse(pubOf("minesweeper", id).v);
  assert.strictEqual(pubM.mines, undefined, "міни приховані");
  assert.ok(!privOf(id, "ann").v.includes("*"));
  assert.strictEqual(JSON.parse(privOf(id, "ann").v).cells, JSON.parse(privOf(id, "ben").v).cells, "однаковий старт");
  assert.ok(JSON.parse(privOf(id, "ann").v).cells.includes("0"), "стартовий острів відкрито");
  const mine0 = s.mines[0];
  const ben0 = bal("ben");
  // Анна відкриває всі безпечні клітинки, Бен тим часом підривається? — ні: спершу Анна йде до кінця
  const safe = s.num.map((n, i) => (n === 9 ? -1 : i)).filter((i) => i >= 0);
  let last = null;
  for (const c of safe) {
    const cur = JSON.parse(privOf(id, "ann").v).cells;
    if (cur[c] !== ".") continue;
    last = await call("ann", { action: "act", id, move: { c } });
    if (last.data.status === "finished") break;
  }
  assert.strictEqual(last.data.status, "finished");
  assert.deepStrictEqual(last.data.result.winners, ["ann"]);
  assert.ok(JSON.parse(pubOf("minesweeper", id).v).mines.includes(mine0), "після кінця міни відкрито");
  assert.strictEqual((await call("ben", { action: "act", id, move: { c: mine0 } })).status, 409, "після кінця ходів нема");
  assert.strictEqual(bal("ben"), ben0);
  // Підрив
  r = await call("ann", { action: "create", game: "minesweeper", bet: 400, opts: { level: "medium" } });
  id = r.data.id;
  await call("ben", { action: "join", id });
  s = full(id).state;
  assert.strictEqual(s.w, 12);
  r = await call("ben", { action: "act", id, move: { c: s.mines[3] } });
  assert.deepStrictEqual(r.data.result.winners, ["ann"], "підірвався — програв");

  // ── Морський бій: флоти приховані; невалідна розстановка; гра до кінця ──
  const bs = ROOM_GAMES.battleship._internal;
  assert.ok(bs.validFleet(bs.randomFleet(rng)), "випадковий флот валідний");
  assert.strictEqual(bs.validFleet([{ x: 0, y: 0, len: 4, dir: "h" }]), null, "неповний флот");
  const H = (x, y, len) => ({ x, y, len, dir: "h" });
  const fixed = [H(0, 0, 4), H(0, 2, 3), H(5, 0, 3), H(5, 2, 2), H(8, 2, 2), H(0, 4, 2), H(3, 4, 1), H(5, 4, 1), H(7, 4, 1), H(9, 4, 1)];
  assert.ok(bs.validFleet(fixed), "ручна розстановка валідна");
  const touching = fixed.map((x, i) => (i === 9 ? H(9, 3, 1) : x)); // кутом до корабля (8,2)
  assert.strictEqual(bs.validFleet(touching), null, "кораблі, що торкаються — ні");
  r = await call("ann", { action: "create", game: "battleship", bet: 1000 });
  id = r.data.id;
  await call("ben", { action: "join", id });
  assert.strictEqual((await call("ann", { action: "act", id, move: { ships: touching } })).status, 400);
  const fleetA = bs.randomFleet(rng);
  assert.strictEqual((await call("ann", { action: "act", id, move: { ships: fleetA } })).status, 200);
  assert.strictEqual((await call("ann", { action: "act", id, move: { auto: true } })).status, 400, "двічі не розставляють");
  await call("ben", { action: "act", id, move: { auto: true } });
  let bp = JSON.parse(pubOf("battleship", id).v);
  assert.strictEqual(bp.phase, "fire");
  assert.strictEqual(bp.fleets, undefined, "флоти приховані");
  assert.ok(!privOf(id, "ben").v.includes(JSON.stringify(fleetA[0])), "свій флот бачиш лише ти");
  const balA = bal("ann"), balB = bal("ben");
  for (let k = 0; k < 400; k++) {
    s = full(id);
    if (s.status !== "playing") break;
    const seat = s.state.turn;
    const shooter = s.players[seat];
    const board = s.state.shots[1 - seat];
    const free = [...board].map((c, i) => (c === "." ? i : -1)).filter((i) => i >= 0);
    const wrong = s.players[1 - seat];
    if (k === 3) assert.strictEqual((await call(wrong, { action: "act", id, move: { c: free[0] } })).status, 400, "не твій хід");
    r = await call(shooter, { action: "act", id, move: { c: free[crypto.randomInt(0, free.length)] } });
    assert.strictEqual(r.status, 200);
  }
  s = full(id);
  assert.strictEqual(s.status, "finished", "гра дійшла до кінця");
  const bw = s.result.winners[0];
  assert.strictEqual(bal(bw), (bw === "ann" ? balA : balB) + 1900);
  assert.ok(JSON.parse(pubOf("battleship", id).v).fleets, "після кінця флоти відкрито");
  // Таймаути: три прострочені ходи — поразка
  r = await call("ann", { action: "create", game: "battleship", bet: 100 });
  id = r.data.id;
  await call("ben", { action: "join", id });
  for (let k = 0; k < 10; k++) {
    const x = full(id);
    if (x.status !== "playing") break;
    x.state.until = Date.now() - 1;
    tree.room_state[id].j = JSON.stringify(x);
    await call("cid", { action: "tick", id });
  }
  s = full(id);
  assert.ok(s.status === "finished" || s.state.phase === "fire", "розстановку зробив сервер, потім таймаути");

  // ── Розрахунок рівно раз: повторний settle нічого не платить ──
  const snap = total();
  const rooms = require("../lib/rooms");
  await rooms.tick(id); await rooms.tick(cf);
  assert.strictEqual(total(), snap);

  // ── Кімната без суперника скасовується по часу з поверненням ──
  r = await call("dan", { action: "create", game: "rps", bet: 700 });
  id = r.data.id;
  const d0 = bal("dan");
  const w = full(id); w.created = Date.now() - rooms.WAIT_MS - 1000; tree.room_state[id].j = JSON.stringify(w);
  await call("eve", { action: "tick", id });
  assert.strictEqual(bal("dan"), d0 + 700, "скасовано й повернено");
  await call("eve", { action: "tick", id });
  assert.strictEqual(bal("dan"), d0 + 700, "повернення рівно раз");

  // ── mine: після перезавантаження видно свої відкриті кімнати ──
  r = await call("eve", { action: "create", game: "battleship", bet: 100 });
  const mineList = (await call("eve", { action: "mine" })).data.rooms;
  assert.ok(mineList.some((x) => x.id === r.data.id));
  assert.strictEqual((await call("eve", { action: "create", game: "nope", bet: 100 })).status, 400);
  assert.strictEqual((await call("eve", { action: "create", game: "rps", bet: 5 })).status, 400, "мінімальна ставка");
  tree.users.eve.balance = 50;
  assert.strictEqual((await call("eve", { action: "create", game: "rps", bet: 100 })).status, 402, "без грошей не створити");

  // ── Масові ігри: швидкий вхід, старт за таймером лобі ──
  const ROOMS = require("../lib/rooms");
  const setState = (id, fn) => { const x = full(id); fn(x); tree.room_state[id].j = JSON.stringify(x); };
  ["ann", "ben", "cid", "dan"].forEach((n) => { tree.users[n].balance = 10000; });
  let q1 = await call("ann", { action: "quick", game: "bingo", bet: 100 });
  assert.strictEqual(q1.status, 200, JSON.stringify(q1.data));
  const bingoId = q1.data.id;
  assert.strictEqual((await call("ben", { action: "quick", game: "bingo", bet: 100 })).data.id, bingoId, "той самий стіл");
  assert.strictEqual((await call("cid", { action: "quick", game: "bingo", bet: 100 })).data.id, bingoId);
  assert.notStrictEqual((await call("dan", { action: "quick", game: "bingo", bet: 500 })).data.id, bingoId, "інша ставка — інший стіл");
  assert.strictEqual((await call("ann", { action: "quick", game: "minesweeper", bet: 100 })).status, 400);
  assert.strictEqual(full(bingoId).status, "waiting");
  assert.strictEqual((await call("eve", { action: "tick", id: bingoId })).data.status, "waiting", "до кінця лобі не стартує");
  setState(bingoId, (x) => { x.startBy = Date.now() - 1; });
  await call("eve", { action: "tick", id: bingoId });
  assert.strictEqual(full(bingoId).status, "playing", "лобі минуло, гравців ≥ 2 — старт");
  assert.ok(!pubOf("bingo", bingoId).v.includes('"order"'), "порядок куль — секрет");
  assert.ok(JSON.parse(privOf(bingoId, "ann").v).card.length === 25);
  const before3 = bal("ann") + bal("ben") + bal("cid");
  setState(bingoId, (x) => { x.state.start = Date.now() - 80 * 3500; }); // усі 75 куль уже мали вийти
  await call("eve", { action: "tick", id: bingoId });
  let fb = full(bingoId);
  assert.strictEqual(fb.status, "finished", "бінго дограно");
  const paid = Object.values(fb.result.payouts).reduce((a, b) => a + b, 0);
  assert.ok(paid <= 285 && paid >= 283, "банк 300 мінус 5%: " + paid);
  assert.strictEqual(bal("ann") + bal("ben") + bal("cid"), before3 + paid);
  assert.ok(fb.state.lineAt <= fb.state.fullAt);
  // Одинокий гравець — кімнату скасовано з поверненням
  const lone = (await call("dan", { action: "tick", id: (await call("dan", { action: "mine" })).data.rooms[0].id })).data;
  setState(lone.id, (x) => { x.startBy = Date.now() - 1; });
  const d1 = bal("dan");
  await call("eve", { action: "tick", id: lone.id });
  assert.strictEqual(full(lone.id).status, "cancelled");
  assert.strictEqual(bal("dan"), d1 + 500, "сам за столом — ставку повернено");

  // ── Королівська битва ──
  ["ann", "ben", "cid", "dan"].forEach((n) => { tree.users[n].balance = 10000; });
  q1 = await call("ann", { action: "quick", game: "royale", bet: 200 });
  const roy = q1.data.id;
  for (const n of ["ben", "cid", "dan"]) await call(n, { action: "quick", game: "royale", bet: 200 });
  setState(roy, (x) => { x.startBy = Date.now() - 1; });
  await call("eve", { action: "tick", id: roy });
  for (let k = 0; k < 60 && full(roy).status === "playing"; k++) {
    const x = full(roy);
    if (x.state.phase === "pick") {
      for (const [seat, n] of x.players.entries()) if (x.state.alive[seat]) await call(n, { action: "act", id: roy, move: { door: crypto.randomInt(0, 4) } });
    } else { setState(roy, (y) => { y.state.until = Date.now() - 1; }); await call("eve", { action: "tick", id: roy }); }
  }
  const fr = full(roy);
  assert.strictEqual(fr.status, "finished", "битва дограна");
  assert.ok(fr.state.history.every((h) => h.out.length < h.counts.reduce((a, b) => a + b, 0)), "пастка ніколи не забирає всіх");
  assert.ok(fr.result.winners.length >= 1);

  // ── Вікторина ──
  ["ann", "ben"].forEach((n) => { tree.users[n].balance = 10000; });
  q1 = await call("ann", { action: "quick", game: "quizbattle", bet: 300 });
  const qb = q1.data.id;
  await call("ben", { action: "quick", game: "quizbattle", bet: 300 });
  setState(qb, (x) => { x.startBy = Date.now() - 1; });
  await call("eve", { action: "tick", id: qb });
  setState(qb, (x) => { x.state.start = Date.now() - 500; });
  const qs = full(qb).state.qs;
  assert.ok(!pubOf("quizbattle", qb).v.includes('"qs"'), "питання наперед не видно");
  await call("eve", { action: "tick", id: qb });
  const p0 = JSON.parse(pubOf("quizbattle", qb).v);
  assert.strictEqual(p0.phase, "ask");
  assert.strictEqual(p0.q.a, undefined, "правильна відповідь прихована під час питання");
  assert.strictEqual((await call("ann", { action: "act", id: qb, move: { q: 0, a: qs[0].a } })).status, 200);
  assert.strictEqual((await call("ann", { action: "act", id: qb, move: { q: 0, a: 0 } })).status, 400, "відповідь одна");
  await call("ben", { action: "act", id: qb, move: { q: 0, a: (qs[0].a + 1) % 4 } });
  const a0q = bal("ann");
  setState(qb, (x) => { x.state.start = Date.now() - 10 * 15000; });
  await call("eve", { action: "tick", id: qb });
  const fq = full(qb);
  assert.strictEqual(fq.status, "finished");
  assert.strictEqual(fq.result.winners[0], "ann", "правильна відповідь перемагає");
  assert.strictEqual(bal("ann"), a0q + Math.floor(600 * 0.95), "хто з нулем очок — без призу, увесь банк першому");

  // ── Столи 2–4: старт господарем, повні партії Вісімки, Дурня й Лудо ──
  const RG = require("../lib/room-games");
  const pick = (a) => a[crypto.randomInt(0, a.length)];
  const BOT = {
    eights(x, seat) {
      const st = x.state; if (st.turn !== seat) return null;
      const can = RG.ROOM_GAMES.eights.priv(st, seat).can;
      return can.length ? { a: "play", card: pick(can), suit: "s" } : { a: st.drew ? "pass" : "draw" };
    },
    durak(x, seat) {
      const st = x.state, I = RG.ROOM_GAMES.durak._internal;
      const open = st.table.findIndex((p) => !p.d);
      if (st.defender === seat && open >= 0) { const c = st.hands[seat].find((c) => I.beats(st.table[open].a, c, st.trump)); return c ? { a: "defend", i: open, card: c } : { a: "take" }; }
      if (st.attacker === seat && !st.table.length) return { a: "attack", card: st.hands[seat][0] };
      if (st.defender !== seat && !st.out[seat] && st.table.length && open < 0 && !st.passed.includes(seat)) return { a: "pass" };
      return null;
    },
    ludo(x, seat) {
      const st = x.state; if (st.turn !== seat) return null;
      if (st.phase === "roll") return { a: "roll" };
      const l = RG.ROOM_GAMES.ludo._internal.legal(st, seat, st.dice);
      return l.length ? { a: "move", t: l[0] } : null;
    },
  };
  for (const game of ["eights", "durak", "ludo"]) {
    ["ann", "ben", "cid", "dan"].forEach((n) => { tree.users[n].balance = 10000; });
    r = await call("ann", { action: "create", game, bet: 400, size: 4 });
    const tid = r.data.id;
    await call("ben", { action: "join", id: tid });
    assert.strictEqual((await call("ben", { action: "start", id: tid })).status, 403, "почати може лише господар");
    await call("cid", { action: "join", id: tid });
    assert.strictEqual((await call("ann", { action: "start", id: tid })).data.status, "playing", "господар стартує 3 з 4");
    assert.strictEqual((await call("dan", { action: "join", id: tid })).status, 409, "після старту не зайти");
    const t0 = ["ann", "ben", "cid"].reduce((a, n) => a + bal(n), 0);
    if (game !== "ludo") assert.ok(!pubOf(game, tid).v.includes('"hands"'), "чужі карти не публікуються");
    for (let k = 0; k < 4000 && full(tid).status === "playing"; k++) {
      const x = full(tid);
      let moved = false;
      for (const [seat, n] of x.players.entries()) {
        const mv = BOT[game](x, seat);
        if (mv) { const rr = await call(n, { action: "act", id: tid, move: mv }); if (rr.status === 200) { moved = true; break; } }
      }
      if (!moved) { setState(tid, (y) => { y.state.until = Date.now() - 1; }); await call("eve", { action: "tick", id: tid }); }
    }
    const ft = full(tid);
    assert.strictEqual(ft.status, "finished", game + " дограно");
    const paidT = Object.values(ft.result.payouts).reduce((a, b) => a + b, 0);
    assert.ok(paidT <= 1140 && paidT >= 1138, game + ": банк 1200 мінус 5%: " + paidT);
    assert.strictEqual(["ann", "ben", "cid"].reduce((a, n) => a + bal(n), 0), t0 + paidT);
  }

  console.log("OK — api/room: ставки, виплата рівно раз, секрети приховані, таймери, вихід, гонки входу; масові ігри (Бінго, Битва, Вікторина) зі швидким входом; столи 2–4 (Вісімка, Дурень, Лудо) до кінця");
})().catch((e) => { console.error(e); process.exit(1); });
