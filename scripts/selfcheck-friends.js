// Self-check для lib/friends.js через api/reward.js. Запуск: node scripts/selfcheck-friends.js
const assert = require("assert");
const crypto = require("crypto");

const { privateKey: saKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: googleKey, publicKey: googlePub } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
  project_id: "nye-slotok",
  client_email: "svc@nye-slotok.iam.gserviceaccount.com",
  private_key: saKey.export({ type: "pkcs8", format: "pem" }),
});

// ── база в пам'яті з ETag (як справжній REST RTDB) ──
let tree = {};
const getPath = (p) => p.split("/").filter(Boolean).reduce((n, k) => (n == null ? null : n[k]), tree) ?? null;
function setPath(p, value) {
  const parts = p.split("/").filter(Boolean);
  const last = parts.pop();
  const parent = parts.reduce((n, k) => (n[k] ??= {}), tree);
  if (value === null) delete parent[last]; else parent[last] = value;
}
let pushSeq = 0;
global.fetch = async (url, opts = {}) => {
  if (url === "https://oauth2.googleapis.com/token") return { ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) };
  const u = new URL(url);
  const p = decodeURIComponent(u.pathname.replace(/\.json$/, ""));
  const method = opts.method || "GET";
  const etag = JSON.stringify(getPath(p));
  // Невелика затримка на читанні — щоб паралельні запити справді перетинались.
  if (method === "GET") {
    await new Promise((r) => setTimeout(r, 1));
    return { ok: true, status: 200, headers: { get: () => etag }, json: async () => getPath(p) };
  }
  if (method === "PUT") {
    const ifMatch = (opts.headers || {})["if-match"];
    if (ifMatch !== undefined && ifMatch !== JSON.stringify(getPath(p))) return { ok: false, status: 412, text: async () => "" };
    setPath(p, JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => getPath(p) };
  }
  if (method === "PATCH") {
    for (const [k, v] of Object.entries(JSON.parse(opts.body))) setPath(`${p}/${k}`, v);
    return { ok: true, status: 200, json: async () => getPath(p) };
  }
  if (method === "POST") {
    const key = "k" + String(++pushSeq).padStart(6, "0");
    setPath(`${p}/${key}`, JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ name: key }) };
  }
  throw new Error("unexpected " + method + " " + url);
};

const { _setCertsForTests } = require("../lib/id-token");
_setCertsForTests({ kid1: googlePub.export({ type: "spki", format: "pem" }) });
const reward = require("../api/reward.js");
const FR = require("../lib/friends");
const { _resetRateLimitForTests } = require("../lib/player");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function idToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", kid: "kid1", typ: "JWT" });
  const p = b64({ sub: uid, aud: "nye-slotok", iss: "https://securetoken.google.com/nye-slotok", iat: now - 10, auth_time: now - 10, exp: now + 3600 });
  return `${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), googleKey).toString("base64url")}`;
}
function call(nick, body) {
  _resetRateLimitForTests();
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(d) { resolve({ status: this.statusCode, data: d }); },
      end() { resolve({ status: this.statusCode, data: null }); },
    };
    reward({ method: "POST", headers: { authorization: nick ? "Bearer " + idToken(nick) : "" }, body }, res);
  });
}
const act = (nick, action, extra = {}) => call(nick, { action, ...extra });
const RID = "abcdefghijkl1234";
const roomOf = (over) => ({ j: JSON.stringify({ id: RID, game: "coinflip", bet: 50, size: 2, host: "alice", players: ["alice"], status: "waiting", ver: 1, ...over }) });

(async () => {
  const base = () => ({ users: { alice: { balance: 1 }, bob: { balance: 1 }, carol: { balance: 1 }, dave: { balance: 1 } } });
  tree = base();
  assert.strictEqual((await act(null, "friendRequest", { nick: "bob" })).status, 401, "без токена");

  // ── запит / прийняття ──
  assert.strictEqual((await act("alice", "friendRequest", { nick: "alice" })).status, 400, "сам себе — ні");
  assert.strictEqual((await act("alice", "friendRequest", { nick: "ghost" })).status, 404, "немає такого гравця");
  assert.strictEqual((await act("alice", "friendRequest", { nick: "a/b" })).status, 400, "ключ із / — ні");
  assert.strictEqual((await act("alice", "friendRequest", { nick: "bob" })).data.state, "sent");
  assert.ok(tree.friend_requests.bob.alice, "запит записано адресату");
  assert.strictEqual((await act("alice", "friendRequest", { nick: "bob" })).data.state, "pending", "повторно — без дубля");
  assert.strictEqual((await act("alice", "friendAccept", { nick: "bob" })).status, 404, "приймає лише адресат (запиту від bob немає)");
  assert.strictEqual((await act("carol", "friendAccept", { nick: "alice" })).status, 404, "стороння людина не прийме");
  assert.strictEqual((await act("bob", "friendAccept", { nick: "alice" })).data.state, "friends");
  assert.ok(tree.friends.alice.bob && tree.friends.bob.alice, "дружба взаємна");
  assert.ok(!tree.friend_requests || !(tree.friend_requests.bob || {}).alice, "запит прибрано");
  assert.strictEqual((await act("alice", "friendRequest", { nick: "bob" })).status, 409, "уже друзі");

  // зустрічні запити склеюються в дружбу
  assert.strictEqual((await act("carol", "friendRequest", { nick: "dave" })).data.state, "sent");
  assert.strictEqual((await act("dave", "friendRequest", { nick: "carol" })).data.state, "friends");
  // відхилити / скасувати
  await act("carol", "friendRequest", { nick: "alice" });
  assert.strictEqual((await act("alice", "friendDecline", { nick: "carol" })).status, 200);
  assert.ok(!(tree.friend_requests.alice || {}).carol, "відхилений запит зник");
  await act("carol", "friendRequest", { nick: "alice" });
  await act("carol", "friendCancel", { nick: "alice" });
  assert.ok(!(tree.friend_requests.alice || {}).carol, "скасований запит зник");

  // блокування
  tree.users.bob.blocked = { carol: Date.now() };
  assert.strictEqual((await act("carol", "friendRequest", { nick: "bob" })).status, 403, "заблокований не може просити");
  tree.users.carol.blocked = { bob: Date.now() };
  assert.strictEqual((await act("carol", "friendRequest", { nick: "bob" })).status, 403);
  delete tree.users.bob.blocked; delete tree.users.carol.blocked;

  // ── запрошення за стіл ──
  tree.room_state = { [RID]: roomOf({}) };
  let r = await act("alice", "friendInvite", { nick: "bob", id: RID });
  assert.strictEqual(r.status, 200);
  const inv = tree.room_invites.bob[RID];
  assert.deepStrictEqual([inv.from, inv.game, inv.roomId, inv.bet], ["alice", "coinflip", RID, 50], "ставку й гру бере сервер із кімнати");
  assert.strictEqual((await act("alice", "friendInvite", { nick: "carol", id: RID })).status, 403, "не друг — ні");
  assert.strictEqual((await act("bob", "friendInvite", { nick: "alice", id: RID })).status, 403, "bob не в кімнаті");
  tree.room_state[RID] = roomOf({ status: "playing" });
  assert.strictEqual((await act("alice", "friendInvite", { nick: "bob", id: RID })).status, 409, "гра вже йде");
  tree.room_state[RID] = roomOf({ players: ["alice", "bob"] });
  assert.strictEqual((await act("alice", "friendInvite", { nick: "bob", id: RID })).status, 409, "друг уже за столом");
  assert.strictEqual((await act("alice", "friendInvite", { nick: "bob", id: "nope" })).status, 400, "кривий id");
  assert.strictEqual((await act("alice", "friendInvite", { nick: "bob", id: "zzzzzzzzzzzz9999" })).status, 404, "немає кімнати");

  // прострочені запрошення прибираються ліниво
  tree.room_state[RID] = roomOf({});
  tree.room_invites.bob.oldoldoldold1 = { from: "alice", game: "rps", roomId: "oldoldoldold1", bet: 10, at: Date.now() - FR.INVITE_TTL - 1000 };
  assert.strictEqual((await act("alice", "friendInvite", { nick: "bob", id: RID })).status, 200);
  assert.ok(!tree.room_invites.bob.oldoldoldold1, "прострочене прибрано");
  // ліміт запрошень адресату
  for (let i = 0; i < FR.MAX_INVITES; i++) tree.room_invites.bob["fillfillfill" + String(i).padStart(2, "0")] = { from: "x", at: Date.now() };
  assert.strictEqual((await act("alice", "friendInvite", { nick: "bob", id: RID })).status, 429, "забагато запрошень");
  // адресат прибирає лише своє
  assert.strictEqual((await act("bob", "friendInviteDismiss", { id: "fillfillfill00" })).status, 200);
  assert.ok(!tree.room_invites.bob.fillfillfill00);
  tree.room_invites.alice = { [RID]: { from: "bob" } };
  await act("bob", "friendInviteDismiss", { id: RID });
  assert.ok(tree.room_invites.alice[RID], "чужі запрошення не чіпає");

  // ── видалення з друзів ──
  assert.strictEqual((await act("alice", "friendRemove", { nick: "bob" })).status, 200);
  assert.ok(!(tree.friends.alice || {}).bob && !(tree.friends.bob || {}).alice, "видалення взаємне");

  // ── ліміти ──
  tree = base();
  tree.friends = { alice: Object.fromEntries(Array.from({ length: FR.MAX_FRIENDS }, (_, i) => ["f" + i, { since: 1 }])) };
  assert.strictEqual((await act("alice", "friendRequest", { nick: "bob" })).status, 409, "у мене повний список");
  tree = base();
  tree.friends = { bob: Object.fromEntries(Array.from({ length: FR.MAX_FRIENDS }, (_, i) => ["f" + i, { since: 1 }])) };
  assert.strictEqual((await act("alice", "friendRequest", { nick: "bob" })).status, 409, "у нього повний список");
  tree = base();
  tree.friend_requests = { bob: Object.fromEntries(Array.from({ length: FR.MAX_PENDING }, (_, i) => ["p" + i, { at: 1 }])) };
  assert.strictEqual((await act("alice", "friendRequest", { nick: "bob" })).status, 409, "забагато вхідних запитів");
  // ліміт частоти запитів (у БД, а не в пам'яті)
  tree = base();
  tree.notify_rate = { ["friendreq:alice"]: { n: 30, start: Date.now() } };
  assert.strictEqual((await act("alice", "friendRequest", { nick: "bob" })).status, 429, "ліміт запитів на годину");

  console.log("OK — друзі: запити, дружба, блокування, запрошення за стіл, ліміти");
})().catch((e) => { console.error(e); process.exit(1); });
