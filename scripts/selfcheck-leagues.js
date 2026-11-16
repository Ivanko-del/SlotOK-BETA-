// Self-check для рейтингових ліг (lib/leagues.js, shared/leagues.js, api/reward.js, lib/rooms.js).
// Запуск: node scripts/selfcheck-leagues.js
//
// Перевіряємо: Elo; що рейтингується; рівно раз на кімнату (паралельно); ставка не впливає;
// ліміт проти одного суперника за добу; без рейтингу при поверненні ставок; рубіж сезону
// й м’яке скидання; нагорода раз; форма публічного вузла та правила.
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
const R = require("../shared/leagues");
const L = require("../lib/leagues");
const rooms = require("../lib/rooms");
const { _resetRateLimitForTests } = require("../lib/player");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function idToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", kid: "kid1", typ: "JWT" });
  const p = b64({ sub: uid, aud: "nye-slotok", iss: "https://securetoken.google.com/nye-slotok", iat: now - 10, auth_time: now - 10, exp: now + 3600 });
  return `${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), googleKey).toString("base64url")}`;
}
function call(handler, nick, body) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(d) { resolve({ status: this.statusCode, data: d }); },
      end() { resolve({ status: this.statusCode, data: null }); },
    };
    handler({ method: "POST", headers: { authorization: nick ? "Bearer " + idToken(nick) : "" }, body }, res);
  });
}
const api = (nick, action, extra = {}) => { _resetRateLimitForTests(); return call(reward, nick, { action, ...extra }); };
const node = (n) => tree.league && tree.league[n];
const bal = (n) => tree.users[n].balance;
const NOW = Date.UTC(2026, 10, 16, 12);

// Партія в кімнаті з готовим результатом (як після finishIfOver).
const mkRoom = (id, game, players, winners, extra = {}) => ({
  id, game, players, bet: 100, status: "settling", started: NOW - 120000, finishedAt: NOW,
  result: { winners, draw: false, payouts: {} }, ...extra,
});

(async () => {
  // ── Elo ──
  const eq = R.leagueDeltas([1000, 1000], [0], null);
  assert.deepStrictEqual(eq.deltas, [12, -12], "рівні суперники: ±K/2");
  const up = R.leagueDeltas([1000, 1400], [0], null).deltas;
  assert.ok(up[0] > 12 && up[0] === -up[1], "перемога над сильнішим дає більше, сума нульова");
  const fav = R.leagueDeltas([1400, 1000], [0], null).deltas;
  assert.ok(fav[0] < 12 && fav[0] > 0, "перемога над слабшим — менше");
  const t4 = R.leagueDeltas([1000, 1000, 1000, 1000], [2], null).deltas;
  assert.deepStrictEqual(t4, [-8, -8, 24, -8], "стіл на 4: переможець бере K, кожен програвший −K/3");
  const t4b = R.leagueDeltas([1000, 1000, 1000, 1000], [0, 1], null).deltas;
  assert.deepStrictEqual(t4b, [8, 8, -8, -8], "двоє переможців");
  assert.strictEqual(R.leagueDeltas([1000, 1000], [0], () => false).deltas.join(), "0,0", "пара не зарахована — нуль");
  assert.strictEqual(R.leagueTier(0).id, "bronze");
  assert.strictEqual(R.leagueTier(1049).id, "bronze");
  assert.strictEqual(R.leagueTier(1050).id, "silver");
  assert.strictEqual(R.leagueTier(5000).id, "legend");
  assert.strictEqual(R.leagueSoftReset(1800), 1400);
  assert.strictEqual(R.leagueSoftReset(200), 600);
  const s = R.leagueSeason(Date.UTC(2026, 10, 30, 21, 59));
  assert.strictEqual(s.id, "2026-11");
  assert.strictEqual(R.leagueSeason(Date.UTC(2026, 10, 30, 22, 0)).id, "2026-12", "рубіж — північ UTC+2");
  assert.strictEqual(s.end, Date.UTC(2026, 10, 30, 22));
  ["coinflip", "rps", "predict", "bingo", "royale", "quizbattle"].forEach((g) => assert.ok(!R.LEAGUE_GAMES[g], g + " не рейтингується"));
  assert.ok(R.LEAGUE_GAMES.durak && R.LEAGUE_GAMES.holdem);

  // ── що рейтингується ──
  assert.ok(L.rated(mkRoom("x", "durak", ["a", "b"], ["a"])));
  assert.ok(!L.rated(mkRoom("x", "coinflip", ["a", "b"], ["a"])), "чиста випадковість");
  assert.ok(!L.rated(mkRoom("x", "durak", ["a", "b"], [], { result: { winners: [], draw: true } })), "нічия — ставки повернено");
  assert.ok(!L.rated(mkRoom("x", "durak", ["a", "b"], ["a"], { finishedAt: NOW - 120000 + 5000 })), "занадто коротка партія");
  assert.ok(!L.rated(mkRoom("x", "durak", ["a"], ["a"])), "один гравець");
  assert.ok(!L.rated(mkRoom("x", "durak", ["a", "a"], ["a"])), "той самий нік двічі");

  // ── рівно раз, паралельно ──
  tree = { users: { ann: { balance: 0 }, ben: { balance: 0 }, cid: { balance: 0 } } };
  const room1 = mkRoom("r1", "durak", ["ann", "ben"], ["ann"]);
  const out = await Promise.all([1, 2, 3, 4].map(() => L.rateRoom(room1, NOW)));
  assert.ok(out.every((o) => o.rated));
  assert.strictEqual(node("ann").r, 1012);
  assert.strictEqual(node("ben").r, 988);
  assert.strictEqual(node("ann").g, 1);
  assert.strictEqual(node("ann").w, 1);
  assert.strictEqual(node("ben").l, 1);
  assert.strictEqual(node("ann").recent.length, 1);
  assert.deepStrictEqual(Object.keys(tree.league_done), ["r1"]);
  await L.rateRoom(room1, NOW + 5000);
  assert.strictEqual(node("ann").r, 1012, "повторний розрахунок нічого не змінює");
  // Форма публічного вузла: лише нік, рейтинг, ліга, ігри.
  assert.deepStrictEqual(tree.league_pub["2026-11"].ann, { nick: "ann", rating: 1012, tier: "bronze", games: 1 });
  assert.deepStrictEqual(Object.keys(tree.league_pub["2026-11"].ann).sort(), ["games", "nick", "rating", "tier"]);

  // ── ставка не впливає ──
  await L.rateRoom(mkRoom("r2", "durak", ["cid", "ben"], ["cid"], { bet: 1 }), NOW);
  await L.rateRoom(mkRoom("r3", "durak", ["cid", "ann"], ["cid"], { bet: 100000 }), NOW);
  assert.ok(node("cid").r > 1000);

  // ── ліміт: 5 рейтингових партій проти того ж суперника за добу ──
  tree = { users: { p: { balance: 0 }, q: { balance: 0 } } };
  for (let i = 0; i < 7; i++) await L.rateRoom(mkRoom("c" + i, "eights", ["p", "q"], ["p"]), NOW + i * 1000);
  assert.strictEqual(node("p").g, R.LEAGUE_PAIR_DAILY, "6-та й 7-ма не зараховані");
  assert.strictEqual(node("q").g, R.LEAGUE_PAIR_DAILY);
  assert.ok(tree.league_done.c6 && Object.keys(tree.league_done.c6.p).length === 0, "позначка є, а Δ немає");
  const before = node("p").r;
  await L.rateRoom(mkRoom("c9", "eights", ["p", "q"], ["p"]), NOW + 86400000 + 1000); // наступна доба
  assert.ok(node("p").r > before && node("p").g === 6, "наступної доби знову рейтингується");

  // ── справжній шлях: lib/rooms (settle) і повернення ставок ──
  tree = { users: { ann: { balance: 10000 }, ben: { balance: 10000 } } };
  let c = await rooms.create("ann", "durak", 100, 2, {});
  await rooms.leave("ann", c.room.id); // скасування до старту: повернення
  assert.strictEqual(bal("ann"), 10000);
  assert.ok(!tree.league, "скасована кімната рейтингу не дає");
  c = await rooms.create("ann", "durak", 100, 2, {});
  await rooms.join("ben", c.room.id);
  // Партія була довгою (штучно відсуваємо старт).
  const st = JSON.parse(tree.room_state[c.room.id].j);
  st.started -= 60000;
  tree.room_state[c.room.id].j = JSON.stringify(st);
  await Promise.all([rooms.leave("ben", c.room.id), rooms.tick(c.room.id), rooms.view("ann", c.room.id)]);
  assert.strictEqual(JSON.parse(tree.room_state[c.room.id].j).status, "finished");
  assert.strictEqual(node("ann").r, 1012, "переможець (суперник вийшов) отримав рейтинг");
  assert.strictEqual(node("ben").r, 988);
  assert.strictEqual(node("ann").g, 1);
  assert.strictEqual(bal("ann") + bal("ben"), 20000 - 10, "гроші: комісія 5% з банку 200");

  // ── сезон: рубіж, м'який скидання, нагорода раз ──
  tree = { users: { zed: { balance: 0 } }, league: { zed: { s: "2026-10", r: 1720, g: 9, w: 6, l: 3, recent: [] }, low: { s: "2026-10", r: 1300, g: 2, w: 1, l: 1, recent: [] } } };
  tree.users.low = { balance: 0 };
  let st1 = await api("zed", "league");
  assert.strictEqual(st1.status, 200);
  assert.strictEqual(st1.data.rating, R.leagueSoftReset(1720), "рейтинг повернуто на 50%");
  assert.strictEqual(st1.data.games, 0);
  assert.strictEqual(st1.data.prev.tier, "legend");
  assert.deepStrictEqual(st1.data.pending.map((p) => [p.season, p.tier, p.coins]), [["2026-10", "legend", 2500]]);
  assert.strictEqual((await api(null, "league")).status, 401);
  const cl = await Promise.all([api("zed", "leagueClaim"), api("zed", "leagueClaim"), api("zed", "leagueClaim")]);
  assert.strictEqual(cl.filter((x) => x.status === 200).length, 1, "нагороду забрати лише раз");
  assert.strictEqual(bal("zed"), 2500);
  assert.ok(tree.users.zed.slotikyItems.badge_crown, "значок виданий");
  assert.strictEqual((await api("zed", "leagueClaim")).status, 409);
  assert.strictEqual((await api("low", "leagueClaim")).status, 409 === 409 ? 409 : 0, "менше 5 партій — нагороди немає");
  assert.strictEqual(bal("zed"), 2500);
  // Збій виплати повертає нагороду в очікування.
  tree.league.zed.pend = { "2026-09": { tier: "gold", r: 1250 } };
  const realFetch = global.fetch;
  let failOnce = true;
  global.fetch = async (url, opts = {}) => {
    if (failOnce && (opts.method || "GET") === "PUT" && String(url).includes("/balance")) { failOnce = false; throw new Error("db down"); }
    return realFetch(url, opts);
  };
  assert.strictEqual((await api("zed", "leagueClaim")).status, 500);
  global.fetch = realFetch;
  assert.ok(tree.league.zed.pend["2026-09"], "нагороду не втрачено");
  const again = await api("zed", "leagueClaim");
  assert.strictEqual(again.status, 200);
  assert.strictEqual(again.data.coins, 700);
  assert.strictEqual(bal("zed"), 3200);

  // ── форма публічного вузла й індекс правил ──
  const rules = require("../database.rules.json").rules;
  assert.ok(rules.league_pub.$season[".indexOn"].includes("rating"));
  assert.strictEqual(rules.league_pub.$season[".read"], true);
  assert.ok(rules.league.$u[".read"].includes("auth.uid"));
  assert.ok(!rules.league_done, "league_done закритий (без правил)");

  console.log("selfcheck-leagues: ok");
})().catch((e) => { console.error(e); process.exit(1); });
