// Self-check для api/play.js і lib/games.js. Запуск: node scripts/selfcheck-play-api.js
//
// Перевіряємо головне, заради чого гра переїхала на сервер:
//   - без справжнього ID token (чужий підпис, чужий проєкт, прострочений) — 401;
//   - ставка/параметри з тіла запиту валідуються (мінус, NaN, дріб, завелика);
//   - списання й виграш — один атомарний запис, баланс не йде в мінус;
//   - повтор того самого id не грає вдруге (подвійний клік / ретрай);
//   - паралельні ставки на весь баланс не проходять обидві;
//   - бан / автозаморожування / само-виключення блокують гру;
//   - математика Dice і Limbo збігається з клієнтською (RTP ≈ 97%).
const assert = require("assert");
const crypto = require("crypto");

const { privateKey: saKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: googleKey, publicKey: googlePub } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: evilKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
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
let delayGets = 0;
global.fetch = async (url, opts = {}) => {
  if (url === "https://oauth2.googleapis.com/token") return { ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) };
  const u = new URL(url);
  const p = decodeURIComponent(u.pathname.replace(/\.json$/, ""));
  const method = opts.method || "GET";
  const etag = JSON.stringify(getPath(p));
  if (method === "GET") {
    if (delayGets) await new Promise((r) => setTimeout(r, delayGets));
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
  throw new Error("unexpected " + method + " " + url);
};

const { _setCertsForTests } = require("../lib/id-token");
_setCertsForTests({ kid1: googlePub.export({ type: "spki", format: "pem" }) });
const handler = require("../api/play.js");
const { GAMES } = require("../lib/games");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function idToken(uid, { key = googleKey, aud = "nye-slotok", exp = 3600, kid = "kid1" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", kid, typ: "JWT" });
  const p = b64({ sub: uid, aud, iss: `https://securetoken.google.com/${aud}`, iat: now - 10, auth_time: now - 10, exp: now + exp });
  return `${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), key).toString("base64url")}`;
}

let seq = 0;
function play(token, body) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(d) { resolve({ status: this.statusCode, data: d }); },
      end() { resolve({ status: this.statusCode, data: null }); },
    };
    handler({ method: "POST", headers: { authorization: token ? "Bearer " + token : "" }, body: { id: "round" + String(++seq).padStart(4, "0"), ...body } }, res);
  });
}
const dice = (extra = {}) => ({ game: "dice", bet: 100, params: { target: 50, dir: "over" }, ...extra });

(async () => {
  tree = { users: { alice: { balance: 1000 }, bob: { balance: 100 } } };
  const alice = idToken("alice");

  // ── автентифікація ──
  assert.strictEqual((await play(null, dice())).status, 401, "без токена");
  assert.strictEqual((await play(idToken("alice", { key: evilKey }), dice())).status, 401, "підроблений підпис");
  assert.strictEqual((await play(idToken("alice", { aud: "other-project" }), dice())).status, 401, "токен чужого проєкту");
  assert.strictEqual((await play(idToken("alice", { exp: -60 }), dice())).status, 401, "прострочений токен");
  assert.strictEqual((await play(idToken("alice", { kid: "nope" }), dice())).status, 401, "невідомий ключ");
  assert.strictEqual(tree.users.alice.balance, 1000);

  // ── валідація ──
  for (const bet of [-100, 0, 1.5, "100", NaN, Infinity, 1e7, null]) {
    assert.strictEqual((await play(alice, dice({ bet }))).status, 400, `ставка ${bet}`);
  }
  assert.strictEqual((await play(alice, dice({ params: { target: 99, dir: "over" } }))).status, 400, "ціль поза межами");
  assert.strictEqual((await play(alice, dice({ params: { target: 50, dir: "sideways" } }))).status, 400);
  assert.strictEqual((await play(alice, dice({ game: "slots" }))).status, 400, "невідома гра");
  assert.strictEqual((await play(alice, dice({ id: "../../users" }))).status, 400, "id з шляхом");
  assert.strictEqual(tree.users.alice.balance, 1000, "жодна невалідна ставка не змінила баланс");

  // ── гра й атомарний баланс ──
  let r = await play(alice, dice());
  assert.strictEqual(r.status, 200);
  assert.strictEqual(tree.users.alice.balance, 1000 - 100 + r.data.payout);
  assert.strictEqual(r.data.balance, tree.users.alice.balance);
  assert.ok(r.data.result >= 1 && r.data.result <= 99);
  assert.strictEqual(r.data.win, r.data.result > 50);
  const logged = tree.game_rounds.alice[r.data.id];
  assert.strictEqual(logged.status, "done", "раунд записано в журнал");

  // ── ідемпотентність ──
  const before = tree.users.alice.balance;
  const again = await new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(d) { resolve({ status: this.statusCode, data: d }); } };
    handler({ method: "POST", headers: { authorization: "Bearer " + alice }, body: { ...dice(), id: r.data.id } }, res);
  });
  assert.strictEqual(again.status, 200);
  assert.strictEqual(again.data.replay, true);
  assert.strictEqual(again.data.result, r.data.result, "повтор повертає той самий результат");
  assert.strictEqual(tree.users.alice.balance, before, "повтор не списує вдруге");

  // ── недостатньо коштів і паралельні ставки на весь баланс ──
  assert.strictEqual((await play(idToken("bob"), dice({ bet: 101 }))).status, 402);
  delayGets = 5;
  const loseAll = { game: "dice", bet: 100, params: { target: 98, dir: "over" } }; // виграш лише на 99
  const both = await Promise.all([play(idToken("bob"), loseAll), play(idToken("bob"), loseAll), play(idToken("bob"), loseAll)]);
  delayGets = 0;
  const ok = both.filter((x) => x.status === 200);
  assert.ok(ok.length >= 1, "хоча б одна ставка пройшла");
  assert.ok(tree.users.bob.balance >= 0, "баланс не пішов у мінус при паралельних ставках");
  assert.strictEqual(tree.users.bob.balance, 100 - 100 * ok.length + ok.reduce((s, x) => s + x.data.payout, 0), "кожне списання враховано рівно раз");

  // ── обмеження акаунта ──
  tree.users.carol = { balance: 500, banned: true };
  assert.strictEqual((await play(idToken("carol"), dice())).status, 403);
  tree.users.carol = { balance: 500, autoFrozen: true };
  assert.strictEqual((await play(idToken("carol"), dice())).status, 403);
  tree.users.carol = { balance: 500, selfExcludeUntil: Date.now() + 3600000 };
  assert.strictEqual((await play(idToken("carol"), dice())).status, 403);
  assert.strictEqual(tree.users.carol.balance, 500);

  // ── Limbo через API ──
  tree.users.dave = { balance: 1000 };
  r = await play(idToken("dave"), { game: "limbo", bet: 100, params: { target: 2 } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.win, r.data.result >= 2);
  assert.strictEqual(tree.users.dave.balance, 900 + (r.data.win ? 200 : 0));

  // ── математика: RTP і межі (200k раундів; похибка середнього ~0,3%) ──
  const rng = { int: (min, max) => crypto.randomInt(min, max) };
  const N = 200000;
  let paidDice = 0, paidLimbo = 0;
  for (let i = 0; i < N; i++) {
    paidDice += GAMES.dice.play(100, GAMES.dice.parse({ target: 50, dir: i % 2 ? "over" : "under" }), rng).payout;
    paidLimbo += GAMES.limbo.play(100, GAMES.limbo.parse({ target: 2 }), rng).payout;
  }
  const rtpDice = paidDice / (N * 100), rtpLimbo = paidLimbo / (N * 100);
  assert.ok(rtpDice > 0.93 && rtpDice < 1.0, "RTP Dice " + rtpDice);
  assert.ok(rtpLimbo > 0.93 && rtpLimbo < 1.0, "RTP Limbo " + rtpLimbo);
  assert.strictEqual(GAMES.limbo.parse({ target: 1.001 }), null);
  assert.strictEqual(GAMES.limbo.parse({ target: "abc" }), null);

  console.log(`OK — api/play: ID token, валідація, атомарний баланс, ідемпотентність, блокування; RTP dice ${rtpDice.toFixed(3)}, limbo ${rtpLimbo.toFixed(3)}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
