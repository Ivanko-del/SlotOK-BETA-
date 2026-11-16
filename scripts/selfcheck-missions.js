// Self-check для щоденних місій із серією (lib/missions.js, api/reward.js).
// Запуск: node scripts/selfcheck-missions.js
//
// Перевіряємо: місії детерміновані; прогрес — лише з серверних подій;
// нагороду не забрати двічі (паралельно); нову добу лічильники скидаються;
// серія росте, переривається пропуском і йде по 7-денній драбині;
// невиконану місію не забрати; збій виплати знімає позначку.
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
const play = require("../api/play.js");
const R = require("../shared/rewards");
const M = require("../shared/missions");
const L = require("../lib/missions");
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
// Ліміт частоти (20 за 10 с) тут не перевіряємо — скидаємо перед кожним запитом.
const claim = (nick, action, extra = {}) => { _resetRateLimitForTests(); return call(reward, nick, { action, ...extra }); };
const user = (nick) => tree.users[nick];
const HOUR = 3600000, DAY = 24 * HOUR;
const season = R.getBpSeasonInfo().num;


// Збій виплати: наступний PUT у баланс кидає помилку (лише раз).
let failBalanceOnce = false;
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  if (failBalanceOnce && (opts.method || "GET") === "PUT" && String(url).includes("/balance")) { failBalanceOnce = false; throw new Error("db down"); }
  return realFetch(url, opts);
};

// Усе, що виконує будь-які три місії: ставки в 6 іграх, партія в кімнаті, перемоги ×6 у Crash.
async function finishAll(nick, now) {
  for (const game of ["dice", "limbo", "mines", "tower", "hilo", "crash"]) for (let k = 0; k < 5; k++) await L.record(nick, { bet: 2500, game }, now);
  await L.record(nick, { bet: 100, game: "bingo", room: true }, now);
  for (let k = 0; k < 12; k++) await L.record(nick, { game: "crash", win: true, mult: 6 }, now);
}
const node = (nick) => tree.missions[nick];

(async () => {
  // ── детермінований добір ──
  const day = M.missionDay(Date.UTC(2026, 10, 16, 12));
  assert.strictEqual(day, "2026-11-16");
  assert.strictEqual(M.missionDay(Date.UTC(2026, 10, 16, 21, 59)), "2026-11-16", "до 22:00 UTC — ще та сама доба");
  assert.strictEqual(M.missionDay(Date.UTC(2026, 10, 16, 22, 0)), "2026-11-17", "о 22:00 UTC (00:00 UTC+2) — нова доба");
  assert.strictEqual(M.missionDayEnd(Date.UTC(2026, 10, 16, 12)), Date.UTC(2026, 10, 16, 22));
  const a1 = L.pick(day, "alice").map((t) => t.id);
  assert.deepStrictEqual(a1, L.pick(day, "alice").map((t) => t.id), "той самий гравець і доба — ті самі місії");
  assert.strictEqual(a1.length, 3);
  assert.strictEqual(new Set(L.pick(day, "alice").map((t) => t.kind)).size, 3, "три різні види місій");
  const variety = new Set();
  for (let d = 1; d <= 20; d++) variety.add(L.pick(`2026-12-${String(d).padStart(2, "0")}`, "alice").map((t) => t.id).join());
  assert.ok(variety.size > 5, "різні доби — різні набори");
  assert.notDeepStrictEqual(Array.from({ length: 10 }, (_, k) => L.pick(day, "u" + k).map((t) => t.id).join()).filter((v, i, a) => a.indexOf(v) === i).length, 1, "різні гравці — різні набори");

  // ── доступ, стан, невиконану не забрати ──
  tree = { users: { alice: { balance: 0 } } };
  assert.strictEqual((await claim(null, "missions")).status, 401);
  let r = await claim("alice", "missions");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.missions.length, 3);
  assert.ok(r.data.missions.every((m) => m.progress === 0 && !m.done && !m.claimed && m.reward.coins > 0));
  assert.ok(r.data.resetAt > r.data.serverNow && r.data.resetAt - r.data.serverNow <= M.MISSION_DAY_MS);
  assert.deepStrictEqual(r.data.missions.map((m) => m.id), node("alice").p, "екран і вузол збігаються");
  assert.strictEqual((await claim("alice", "missionClaim", { i: 0 })).status, 409, "невиконану не забрати");
  assert.strictEqual((await claim("alice", "missionClaim", { i: 7 })).status, 400);
  assert.strictEqual((await claim("alice", "missionClaim", { i: "0" })).status, 400);
  assert.strictEqual((await claim("alice", "streakClaim")).status, 409, "серії ще немає");
  assert.strictEqual(user("alice").balance, 0);

  // ── прогрес лише з серверних подій ──
  // Бонуси й клієнтські дані його не рухають, лічильники з тіла запиту ігноруються.
  await claim("alice", "daily", { c: { rounds: 999 }, progress: 999 });
  await claim("alice", "missions", { c: { rounds: 999 } });
  assert.ok(!node("alice").c || !node("alice").c.rounds, "бонус/стан не додають прогрес");
  // Платна ставка в api/play — рахується.
  tree.users.alice.balance = 100000;
  r = await call(play, "alice", { game: "dice", bet: 200, params: { target: 50, dir: "over" }, id: "mission-play-0001" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(node("alice").c.rounds, 1);
  assert.strictEqual(node("alice").c.wager, 200);
  assert.strictEqual(node("alice").g.dice, 1);
  assert.strictEqual(node("alice").c.wins || 0, r.data.payout > 200 ? 1 : 0, "перемога = виплата вища за ставку");
  // Повтор того самого раунду (replay) удруге не рахується.
  await call(play, "alice", { game: "dice", bet: 200, params: { target: 50, dir: "over" }, id: "mission-play-0001" });
  assert.strictEqual(node("alice").c.rounds, 1, "повтор запиту не додає раунд");
  // Безкоштовний спін ставкою не є.
  tree.users.alice.freeSlots = 1;
  await call(play, "alice", { game: "slots", bet: 50, params: { mode: "free" }, id: "mission-free-0001" });
  assert.strictEqual(node("alice").c.rounds, 1, "фріспін не рахується");

  // ── складені події ──
  const t = Date.now();
  let n = L.applyEvent({ day, p: a1, c: {}, g: {}, cl: {} }, { bet: 5, game: "dice" }, day);
  assert.ok(!n.c.rounds, "ставка менша за мінімум не рахується");
  n = L.applyEvent({ day, p: a1, c: {}, g: {}, cl: {} }, { win: true, game: "dice", mult: 9 }, day);
  assert.ok(!n.c.m2, "множник рахується лише в Crash/Limbo");
  n = L.applyEvent(n, { win: true, game: "limbo", mult: 2.5 }, day);
  assert.strictEqual(n.c.m2, 1);
  assert.ok(!n.c.m5);
  n = L.applyEvent(n, { win: true, game: "crash", mult: 5 }, day);
  assert.strictEqual(n.c.m2, 2);
  assert.strictEqual(n.c.m5, 1);
  n = L.applyEvent({ day, p: a1, c: {}, g: {} }, { bet: 100, game: "bingo", room: true }, day);
  assert.strictEqual(n.c.room, 1);

  // ── виконання, нагорода рівно раз ──
  tree = { users: { bob: { balance: 0 } } };
  await finishAll("bob", t);
  r = await claim("bob", "missions");
  assert.ok(r.data.missions.every((m) => m.done), "усі три виконані");
  assert.ok(r.data.missions.every((m) => m.progress === m.target), "прогрес не перевищує ціль");
  const first = r.data.missions[0];
  const many = await Promise.all(Array.from({ length: 6 }, () => claim("bob", "missionClaim", { i: 0 })));
  assert.strictEqual(many.filter((x) => x.status === 200).length, 1, "паралельні запити: платить рівно один");
  assert.strictEqual(user("bob").balance, first.reward.coins);
  assert.strictEqual(user("bob").bpXP, first.reward.xp, "XP Battle Pass");
  assert.strictEqual((await claim("bob", "missionClaim", { i: 0 })).status, 409, "вдруге — ні");
  assert.strictEqual(user("bob").balance, first.reward.coins);
  // Збій виплати: позначку знято, можна забрати знову, гроші один раз.
  failBalanceOnce = true;
  r = await claim("bob", "missionClaim", { i: 1 });
  assert.strictEqual(r.status, 500);
  assert.ok(!node("bob").cl[1], "позначку знято");
  r = await claim("bob", "missionClaim", { i: 1 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(user("bob").balance, first.reward.coins + r.data.coins);
  await claim("bob", "missionClaim", { i: 2 });

  // ── серія ──
  assert.strictEqual(node("bob").s.n, 1);
  assert.strictEqual(node("bob").s.pend, 1);
  let bal = user("bob").balance;
  const sc = await Promise.all(Array.from({ length: 5 }, () => claim("bob", "streakClaim")));
  assert.strictEqual(sc.filter((x) => x.status === 200).length, 1, "нагорода серії — рівно раз");
  assert.strictEqual(user("bob").balance, bal + M.MISSION_STREAK_LADDER[0].coins);
  r = await claim("bob", "missions");
  assert.strictEqual(r.data.streak.n, 1);
  assert.strictEqual(r.data.streak.pend, 0);
  assert.ok(r.data.streak.todayDone);
  // ще раз виконуємо ту саму добу — серія не росте вдруге
  await finishAll("bob", t + 1000);
  assert.strictEqual(node("bob").s.n, 1, "серія росте раз за добу");
  assert.strictEqual(node("bob").s.pend, 0);

  // ── нова доба: скидання лічильників, серія 2…7, скринь, обертання ──
  for (let d = 1; d <= 6; d++) {
    const now = t + d * DAY;
    // Спершу підглянемо стан: лічильники нової доби порожні, вчорашня серія жива.
    const st = await L.state("bob", now);
    assert.ok(st.missions.every((m) => m.progress === 0 && !m.claimed), "нова доба — чисті лічильники");
    assert.strictEqual(st.streak.n, d, "серія тримається, якщо доба не пропущена");
    await finishAll("bob", now);
    assert.strictEqual(node("bob").s.n, d + 1);
    const before = user("bob").balance;
    const sr = await L.claimStreak("bob", now);
    assert.strictEqual(sr.coins, M.MISSION_STREAK_LADDER[d].coins);
    assert.strictEqual(user("bob").balance, before + M.MISSION_STREAK_LADDER[d].coins);
    if (d === 6) {
      assert.strictEqual(sr.box, 1);
      assert.strictEqual(user("bob").lootboxInv.bp, 1, "день 7 — скриня Battle Pass");
    }
  }
  // Після 7-го дня — знову 1-й.
  await finishAll("bob", t + 7 * DAY);
  assert.strictEqual(node("bob").s.n, 1, "після 7-го — знову з першого");
  // Пропуск доби скидає серію.
  await L.claimStreak("bob", t + 7 * DAY);
  const gap = await L.state("bob", t + 9 * DAY);
  assert.strictEqual(gap.streak.n, 0, "пропущена доба — серія скинута");
  await finishAll("bob", t + 9 * DAY);
  assert.strictEqual(node("bob").s.n, 1, "після пропуску — знову з першого");
  // Невиконану місію на новій добі не забрати, вчорашню позначку не успадкувати.
  const fresh = await L.state("bob", t + 10 * DAY);
  assert.ok(fresh.missions.every((m) => !m.claimed && !m.done));
  assert.strictEqual((await L.claimMission("bob", 0, t + 10 * DAY)).status, 409);

  // ── нова доба посеред ставок: подія одразу відкриває чисту добу ──
  tree = { users: { cat: { balance: 0 } } };
  await L.record("cat", { bet: 100, game: "dice" }, t);
  await L.record("cat", { bet: 100, game: "dice" }, t + DAY);
  assert.strictEqual(node("cat").c.rounds, 1, "вчорашні раунди не переходять на нову добу");
  assert.strictEqual(node("cat").day, M.missionDay(t + DAY));

  console.log("OK — місії: добір детермінований, прогрес лише з серверних подій, нагороди й серія рівно раз, доба/серія/драбина");
})().catch((e) => { console.error(e); process.exit(1); });
