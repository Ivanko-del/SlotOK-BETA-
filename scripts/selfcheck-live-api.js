// Self-check для lib/live.js і api/live.js (колеса за розкладом, Краш наживо).
// Запуск: node scripts/selfcheck-live-api.js
//
// Час подаємо явно (now) — так перевіряємо закриття ставок, розрахунок після
// спіну, кешаут до і після падіння. Мок бази — як у selfcheck-room-api.
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
global.fetch = async (url, opts = {}) => {
  if (url.startsWith("https://oauth2.googleapis.com")) return { ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) };
  const p = decodeURIComponent(new URL(url).pathname.replace(/\.json$/, ""));
  const method = opts.method || "GET";
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
const live = require("../lib/live");
const handler = require("../api/live.js");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function tok(uid) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", kid: "k" }), pl = b64({ sub: uid, aud: "nye-slotok", iss: "https://securetoken.google.com/nye-slotok", iat: now, auth_time: now, exp: now + 600 });
  return `${h}.${pl}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${pl}`), gKey).toString("base64url")}`;
}
const call = (uid, body) => new Promise((resolve) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(d) { resolve({ status: this.statusCode, data: d }); }, end() { resolve({ status: this.statusCode, data: null }); } };
  handler({ method: "POST", headers: { authorization: "Bearer " + tok(uid) }, body }, res);
});
const bal = (u) => tree.users[u].balance;

(async () => {
  tree = { users: { ann: { balance: 100000 }, ben: { balance: 100000 } } };

  // ── Колесо фортуни: склад і RTP ──
  const counts = {};
  live.FORTUNE_LAYOUT.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
  for (const [k, c, m] of live.FORTUNE) {
    assert.strictEqual(counts[k], c, `кількість секторів ${k}`);
    const rtp = (c * m) / 54;
    assert.ok(rtp > 0.92 && rtp < 0.97, `RTP ${k} = ${rtp}`);
  }
  assert.ok((18 * 2) / 37 < 0.98 && (1 * 36) / 37 < 0.98, "рулетка ≤ 97,3%");

  // ── Ставка, закриття, розрахунок рівно раз ──
  const P = live.WHEELS.w5.period;
  const t0 = Math.floor(Date.now() / P) * P + 1000; // початок раунду
  const n = Math.floor(t0 / P);
  const res = live.wheelResult("w5", n);
  assert.strictEqual(live.wheelResult("w5", n).seed, res.seed, "результат детермінований");
  const st = await live.state(t0, "w5");
  assert.strictEqual(st.wheels.w5.commit, crypto.createHash("sha256").update(res.seed).digest("hex"), "хеш сіда опубліковано до спіну");
  assert.ok(!JSON.stringify(st.wheels.w5).includes(res.seed), "сам сід до спіну не видно");
  const winK = res.win, loseK = ["a", "b", "c", "d", "e"].find((k) => k !== winK);
  let r = await live.wheelBet("ann", "w5", winK, 1000, t0);
  assert.strictEqual(r.round, n);
  await live.wheelBet("ann", "w5", loseK, 500, t0 + 1000);
  await live.wheelBet("ann", "w5", winK, 200, t0 + 2000); // докласти на той самий сектор
  assert.strictEqual(bal("ann"), 100000 - 1700);
  r = await live.wheelBet("ann", "w5", winK, 100, (n + 1) * P - 5000);
  assert.strictEqual(r.error.error, "locked", "за 15 с до спіну ставки закрито");
  assert.strictEqual((await live.wheelBet("ann", "w5", "zz", 100, t0)).error.error, "bad_choice");
  assert.deepStrictEqual(await live.settleMine("ann", (n + 1) * P - 1), [], "до спіну розрахунку нема");
  const done = await live.settleMine("ann", (n + 1) * P + 10);
  assert.strictEqual(done.length, 1);
  const mult = live.PAYS.fortune[winK];
  assert.strictEqual(done[0].win, Math.floor(1200 * mult));
  assert.strictEqual(bal("ann"), 100000 - 1700 + Math.floor(1200 * mult), "виграш лише на сектор, що випав");
  assert.deepStrictEqual(await live.settleMine("ann", (n + 1) * P + 20), [], "вдруге не платить");
  tree.live_open = { ann: { [`w5_${n}`]: (n + 1) * P } }; // навіть якщо відкритий запис повернувся
  await live.settleMine("ann", (n + 1) * P + 30);
  assert.strictEqual(bal("ann"), 100000 - 1700 + Math.floor(1200 * mult), "live_paid не дає заплатити двічі");

  // ── Рулетка за годину ──
  const R = live.WHEELS.r60.period;
  const rn = Math.floor(t0 / R);
  const rr = live.wheelResult("r60", rn);
  assert.strictEqual(live.ROULETTE_NUMS[rr.seg], rr.num);
  await live.wheelBet("ben", "r60", rr.win, 100, rn * R + 1000);
  const rd = await live.settleMine("ben", (rn + 1) * R + 1);
  assert.strictEqual(rd[0].win, 100 * live.PAYS.roulette[rr.win]);

  // ── Краш: розподіл ──
  let ge2 = 0, ge10 = 0;
  for (let k = 0; k < 40000; k++) { const p = live.crashPoint(k).point; if (p >= 2) ge2++; if (p >= 10) ge10++; }
  assert.ok(Math.abs(ge2 / 40000 - 0.48) < 0.015, `P(≥2) ≈ 0,48: ${ge2 / 40000}`);
  assert.ok(Math.abs(ge10 / 40000 - 0.096) < 0.01, `P(≥10) ≈ 0,096: ${ge10 / 40000}`);

  // ── Краш: ставка, кешаут до падіння, після — ні ──
  let now = Date.now();
  // шукаємо раунд з точкою ≥ 2 (щоб було куди кешаутити)
  for (;;) {
    const cur = await live.crashCurrent(now);
    if (live.crashPoint(cur.n).point >= 2) break;
    now = cur.startAt + 60000 * 60; // пропускаємо раунд
  }
  let cur = await live.crashCurrent(now);
  const point = live.crashPoint(cur.n).point;
  assert.strictEqual(cur.point, null, "точка падіння прихована до падіння");
  const b0 = bal("ann");
  r = await live.crashBet("ann", 1000, null, now);
  assert.strictEqual(r.round, cur.n);
  assert.strictEqual((await live.crashBet("ann", 1000, null, now)).error.error, "already", "одна ставка на раунд");
  await live.crashBet("ben", 1000, 1.5, now + 100); // автокешаут 1.5
  assert.strictEqual((await live.crashBet("ann", 100, null, cur.startAt + 10)).error.error, "flying", "під час польоту ставок нема");
  const t15 = cur.startAt + (Math.log(1.6) / live.CRASH.rate) * 1000;
  r = await live.crashCashout("ann", cur.n, t15);
  assert.ok(r.mult >= 1.59 && r.mult <= 1.61, "кешаут за часом сервера: " + r.mult);
  assert.strictEqual(bal("ann"), b0 - 1000 + r.win);
  assert.strictEqual((await live.crashCashout("ann", cur.n, t15 + 100)).error.error, "no_bet", "вдруге не забрати");
  const afterCrash = cur.startAt + (Math.log(point) / live.CRASH.rate) * 1000 + 50;
  const benBefore = bal("ben");
  await live.settleMine("ben", afterCrash);
  assert.strictEqual(bal("ben"), benBefore + 1500, "автокешаут 1.5 спрацював (точка ≥ 2)");
  // Наступний раунд і кешаут після падіння
  cur = await live.crashCurrent(afterCrash + live.CRASH.pauseMs + 10);
  const p2 = live.crashPoint(cur.n).point;
  await live.crashBet("ann", 500, null, afterCrash + live.CRASH.pauseMs + 20);
  const late = cur.startAt + (Math.log(p2) / live.CRASH.rate) * 1000 + 100;
  assert.strictEqual((await live.crashCashout("ann", cur.n, late)).error.error, "crashed", "після падіння — пізно");
  const c2 = await live.crashCurrent(late);
  assert.strictEqual(c2.point, p2, "після падіння точку й сід відкрито");

  // ── API ──
  r = await call("ann", { action: "state" });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.wheels.w5 && r.data.wheels.r60 && r.data.crash);
  assert.strictEqual(r.data.crash._point, undefined, "внутрішнє не їде клієнту");
  if (r.data.crash.point === null) assert.strictEqual(r.data.crash.seed, null);
  r = await call("ann", { action: "wheelBet", game: "w10", choice: "a", amount: 5 });
  assert.strictEqual(r.status, 400, "мінімальна ставка");
  tree.users.ben.balance = 50;
  r = await call("ben", { action: "wheelBet", game: "w10", choice: "a", amount: 100 });
  assert.ok(r.status === 402 || r.status === 409);

  console.log("OK — api/live: колеса (ставки до спіну, виплата раз, RTP), Краш (кешаут за часом сервера, автокешаут, точка прихована), розподіл падінь");
})().catch((e) => { console.error(e); process.exit(1); });
