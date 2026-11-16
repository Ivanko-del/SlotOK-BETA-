// Self-check «Чотири в ряд» (lib/room-games/fourrow.js) через api/room.js: чисті правила,
// нелегальні ходи, повна партія до перемоги, виплата рівно раз, нічия, таймаути, вихід.
// Запуск: node scripts/selfcheck-fourrow.js
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

const FR = ROOM_GAMES.fourrow;
const { dropRow, lineAt } = FR._internal;
const W = 7, H = 6;
const mk = (cells) => { const b = Array(W * H).fill("."); Object.entries(cells).forEach(([k, v]) => { b[k] = v; }); return b.join(""); };

(async () => {
  // ── Чисті правила ──
  assert.strictEqual(dropRow(".".repeat(42), 3), 5, "фішка падає на дно");
  assert.deepStrictEqual(lineAt(mk({ 35: "0", 36: "0", 37: "0", 38: "0" }), 5, 2), [35, 36, 37, 38], "горизонталь");
  assert.deepStrictEqual(lineAt(mk({ 0: "1", 7: "1", 14: "1", 21: "1" }), 2, 0), [0, 7, 14, 21], "вертикаль");
  assert.ok(lineAt(mk({ 35: "0", 29: "0", 23: "0", 17: "0" }), 3, 2), "діагональ /");
  assert.ok(lineAt(mk({ 14: "0", 22: "0", 30: "0", 38: "0" }), 3, 1), "діагональ \\");
  assert.strictEqual(lineAt(mk({ 35: "0", 36: "0", 37: "0", 39: "0" }), 5, 2), null, "розрив — не лінія");
  // Нічия: візерунок без лінії, остання клітинка порожня
  const draw = Array.from({ length: W * H }, (_, i) => { const r = Math.floor(i / W), c = i % W; return String((c + (r >> 1)) % 2); }).join("");
  for (let i = 0; i < W * H; i++) assert.strictEqual(lineAt(draw, Math.floor(i / W), i % W), null, "візерунок без ліній, клітинка " + i);
  const nearly = "." + draw.slice(1);
  const dr = FR.act({ board: nearly, turn: 1, until: Date.now() + 9999, timeouts: [0, 0], over: false }, 1, { c: 0 }, rng, Date.now());
  assert.ok(dr && dr.over && dr.winners.length === 0 && FR.result(dr).draw, "повна сітка без лінії — нічия");

  const names = ["ann", "ben", "cid"];
  tree = { users: Object.fromEntries(names.map((n) => [n, { balance: 10000 }])) };

  // ── Повна партія до перемоги ──
  let r = await call("ann", { action: "create", game: "fourrow", bet: 500 });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  let id = r.data.id;
  assert.strictEqual(bal("ann"), 9500, "ставка списана");
  await call("ben", { action: "join", id });
  assert.strictEqual(bal("ben"), 9500);
  let x = full(id);
  assert.strictEqual(x.status, "playing");
  const first = x.players[x.state.turn], second = x.players[1 - x.state.turn];
  assert.strictEqual((await call(second, { action: "act", id, move: { c: 0 } })).status, 400, "не твій хід");
  for (const bad of [{ c: 7 }, { c: -1 }, { c: 1.5 }, { c: "2" }, {}, null]) assert.strictEqual((await call(first, { action: "act", id, move: bad })).status, 400, "нелегальний хід " + JSON.stringify(bad));
  assert.strictEqual((await call("cid", { action: "act", id, move: { c: 0 } })).status, 403, "сторонній");
  const pubStart = JSON.parse(pubOf("fourrow", id).v);
  assert.strictEqual(pubStart.board, ".".repeat(42));
  // перший ставить у колонку 0, другий у 1 — вертикаль із 4
  for (let k = 0; k < 3; k++) {
    assert.strictEqual((await call(first, { action: "act", id, move: { c: 0 } })).status, 200);
    assert.strictEqual((await call(second, { action: "act", id, move: { c: 1 } })).status, 200);
  }
  const pb = JSON.parse(pubOf("fourrow", id).v);
  assert.strictEqual(pb.board[35], String(x.players.indexOf(first)), "фішка першого на дні колонки 0");
  r = await call(first, { action: "act", id, move: { c: 0 } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.result.winners, [first], "чотири вертикально — перемога");
  assert.strictEqual(r.data.status, "finished");
  const pf = JSON.parse(pubOf("fourrow", id).v);
  assert.strictEqual(pf.line.length, 4, "лінію підсвічено");
  assert.strictEqual(bal(first), 9500 + 950, "переможець: банк 1000 мінус 5%");
  assert.strictEqual(bal(second), 9500, "програвший нічого не отримує");
  assert.strictEqual((await call(second, { action: "act", id, move: { c: 3 } })).status, 409, "після кінця ходів нема");
  const snap = total();
  const rooms = require("../lib/rooms");
  await rooms.tick(id); await rooms.tick(id);
  assert.strictEqual(total(), snap, "повторний розрахунок нічого не платить");
  assert.strictEqual(bal(first), 9500 + 950);

  // ── Таймаути: автохід, потім три пропуски підряд — поразка ──
  const setState = (rid, f) => { const y = full(rid); f(y); tree.room_state[rid].j = JSON.stringify(y); };
  r = await call("ann", { action: "create", game: "fourrow", bet: 100 });
  id = r.data.id;
  await call("ben", { action: "join", id });
  x = full(id);
  const loser = x.players[x.state.turn];
  setState(id, (y) => { y.state.until = Date.now() - 1; });
  await call("cid", { action: "tick", id });
  x = full(id);
  assert.strictEqual(x.state.board.replace(/\./g, "").length, 1, "сервер зробив автохід");
  assert.strictEqual(x.state.timeouts[x.players.indexOf(loser)], 1);
  assert.notStrictEqual(x.players[x.state.turn], loser, "хід перейшов");
  for (let k = 0; k < 6 && full(id).status === "playing"; k++) {
    setState(id, (y) => { y.state.until = Date.now() - 1; });
    await call("cid", { action: "tick", id });
  }
  x = full(id);
  assert.strictEqual(x.status, "finished", "три пропуски підряд — кінець");
  assert.deepStrictEqual(x.result.winners, [x.players.find((n) => n !== loser)], "програв той, хто пропускав");
  assert.strictEqual(x.state.why, "afk");

  // ── Вихід посеред партії: суперник виграє, виплата раз ──
  r = await call("ann", { action: "create", game: "fourrow", bet: 200 });
  id = r.data.id;
  await call("ben", { action: "join", id });
  const a0 = bal("ann"), b0 = bal("ben");
  r = await call("ann", { action: "leave", id });
  assert.strictEqual(r.status, 200);
  x = full(id);
  assert.strictEqual(x.status, "finished");
  assert.deepStrictEqual(x.result.winners, ["ben"]);
  assert.strictEqual(bal("ben"), b0 + 380);
  assert.strictEqual(bal("ann"), a0);

  // ── Ліга: гра рейтингується ──
  const L = require("../shared/leagues.js");
  assert.ok(L.LEAGUE_GAMES && L.LEAGUE_GAMES.fourrow, "є в LEAGUE_GAMES");
  console.log("OK — «Чотири в ряд»: правила (рядок/стовпчик/діагоналі/нічия), нелегальні ходи, перемога й виплата рівно раз, автохід і поразка за 3 пропуски, вихід");
})().catch((e) => { console.error(e); process.exit(1); });
