// Self-check для api/round.js і lib/sessions.js (Mines, Tower, Hi-Lo на сервері).
// Запуск: node scripts/selfcheck-round-api.js
//
// Мок бази поводиться як справжня RTDB: порожні масиви й null не зберігає.
// Перевіряємо: секрет раунду (де міни) не їде клієнту; ставка списується
// атомарно; хід/кешаут після кінця раунду не проходять; паралельні кешаути не
// платять двічі; незакінчений раунд закривається при старті нового; RTP ≤ 97%.
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
const handler = require("../api/round.js");
const { SESSION_GAMES } = require("../lib/sessions");

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
const secret = (u, g) => tree.game_sessions[u][g];

const rng = { int: (a, b) => crypto.randomInt(a, b) };

(async () => {
  tree = { users: { ann: { balance: 1000 }, ben: { balance: 1000 }, cid: { balance: 50 } } };

  // ── Mines ──
  let r = await call("ann", { action: "start", game: "mines", bet: 100, params: { mines: 3 } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(bal("ann"), 900, "ставку списано");
  assert.strictEqual(r.data.view.mines, undefined, "де міни — клієнт не знає");
  assert.strictEqual(JSON.stringify(r.data).includes('"mines":['), false);
  assert.strictEqual((await call("ann", { action: "cashout", game: "mines" })).status, 400, "кешаут без ходу");
  const mines = secret("ann", "mines").state.mines;
  const safeCells = Array.from({ length: 25 }, (_, i) => i).filter((i) => !mines.includes(i));
  r = await call("ann", { action: "move", game: "mines", move: { cell: safeCells[0] } });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.mult > 1);
  assert.strictEqual((await call("ann", { action: "move", game: "mines", move: { cell: safeCells[0] } })).status, 400, "та сама клітинка");
  assert.strictEqual((await call("ann", { action: "move", game: "mines", move: { cell: 25 } })).status, 400);
  r = await call("ann", { action: "move", game: "mines", move: { cell: safeCells[1] } });
  const mult2 = r.data.mult;
  // паралельні кешаути — платимо рівно раз
  delay = 15;
  const outs = await Promise.all([1, 2, 3].map(() => call("ann", { action: "cashout", game: "mines" })));
  delay = 0;
  assert.strictEqual(outs.filter((o) => o.status === 200).length, 1, "кешаут пройшов рівно раз");
  assert.strictEqual(bal("ann"), 900 + Math.floor(100 * mult2));
  assert.ok(outs.find((o) => o.status === 200).data.view.mines.length === 3, "після кінця міни показуємо");
  assert.strictEqual((await call("ann", { action: "move", game: "mines", move: { cell: safeCells[2] } })).status, 409, "хід після кешауту");

  // програш
  await call("ben", { action: "start", game: "mines", bet: 100, params: { mines: 24 } });
  const onlySafe = Array.from({ length: 25 }, (_, i) => i).find((i) => !secret("ben", "mines").state.mines.includes(i));
  const boom = Array.from({ length: 25 }, (_, i) => i).find((i) => i !== onlySafe);
  r = await call("ben", { action: "move", game: "mines", move: { cell: boom } });
  assert.strictEqual(r.data.status, "lost");
  assert.strictEqual((await call("ben", { action: "cashout", game: "mines" })).status, 409);
  assert.strictEqual(bal("ben"), 900);

  // незакінчений раунд: без ходу — повернення ставки; з ходом — автокешаут
  await call("ben", { action: "start", game: "mines", bet: 100, params: { mines: 5 } });
  assert.strictEqual(bal("ben"), 800);
  await call("ben", { action: "start", game: "mines", bet: 100, params: { mines: 5 } });
  assert.strictEqual(bal("ben"), 800, "старий раунд без ходу — ставку повернено, нову списано");
  const safeB = Array.from({ length: 25 }, (_, i) => i).find((i) => !secret("ben", "mines").state.mines.includes(i));
  r = await call("ben", { action: "move", game: "mines", move: { cell: safeB } });
  const autoPay = Math.floor(100 * r.data.mult);
  await call("ben", { action: "start", game: "mines", bet: 100, params: { mines: 5 } });
  assert.strictEqual(bal("ben"), 800 + autoPay - 100, "старий раунд з ходом — виграш зараховано");

  // валідація і гроші
  assert.strictEqual((await call("cid", { action: "start", game: "mines", bet: 100, params: { mines: 3 } })).status, 402);
  assert.strictEqual((await call("cid", { action: "start", game: "mines", bet: -5, params: { mines: 3 } })).status, 400);
  assert.strictEqual((await call("cid", { action: "start", game: "mines", bet: 10, params: { mines: 25 } })).status, 400);
  assert.strictEqual(bal("cid"), 50);

  // ── Tower ──
  tree.users.dan = { balance: 1000 };
  r = await call("dan", { action: "start", game: "tower", bet: 100, params: { diff: 1 } });
  assert.strictEqual(r.status, 200);
  let level = 0, alive = true;
  while (alive && level < 3) {
    r = await call("dan", { action: "move", game: "tower", move: { col: 0 } });
    alive = r.data.status === "active";
    if (alive) level++;
  }
  if (alive) {
    r = await call("dan", { action: "cashout", game: "tower" });
    assert.strictEqual(r.data.payout, Math.floor(100 * r.data.mult + 1e-6), "виплата = ставка × показаний множник");
    assert.strictEqual(r.data.mult, Math.round(Math.pow(4 / 3, level) * 0.97 * 100) / 100);
  }
  assert.strictEqual((await call("dan", { action: "move", game: "tower", move: { col: 9 } })).status, alive ? 409 : 409);

  // ── Hi-Lo ──
  tree.users.eve = { balance: 1000 };
  r = await call("eve", { action: "start", game: "hilo", bet: 100, params: {} });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.view.deck, undefined, "колода — секрет");
  // неможливий хід відхиляється, решта грається
  const cur = secret("eve", "hilo").state.current.r;
  if (cur === 12) assert.strictEqual((await call("eve", { action: "move", game: "hilo", move: { dir: "high" } })).status, 400);
  // Найімовірніший напрямок = менший множник (але не 0 — той неможливий).
  const { high, low } = r.data.view.next;
  const dir = high === 0 ? "low" : low === 0 ? "high" : high <= low ? "high" : "low";
  r = await call("eve", { action: "move", game: "hilo", move: { dir } });
  assert.ok(r.status === 200, "хід Hi-Lo");
  if (r.data.status === "active") {
    const m = r.data.mult;
    const before = bal("eve");
    r = await call("eve", { action: "cashout", game: "hilo" });
    assert.strictEqual(bal("eve"), before + Math.floor(100 * m + 1e-6));
  }

  // ── Dragon Tower ──
  tree.users.gus = { balance: 1000 };
  assert.strictEqual((await call("gus", { action: "start", game: "dragon", bet: 100, params: { cols: 5, dragons: 1 } })).status, 400, "лише відомі режими");
  r = await call("gus", { action: "start", game: "dragon", bet: 100, params: { cols: 3, dragons: 1 } });
  assert.strictEqual(r.status, 200);
  r = await call("gus", { action: "move", game: "dragon", move: { col: 1 } });
  assert.ok(["active", "lost"].includes(r.data.status));
  if (r.data.status === "active") {
    const m = r.data.mult;
    const b0 = bal("gus");
    r = await call("gus", { action: "cashout", game: "dragon" });
    assert.strictEqual(bal("gus"), b0 + Math.floor(100 * m + 1e-6));
  }
  for (const [cols, dragons] of [[3, 1], [3, 2], [4, 3]]) {
    const p = (cols - dragons) / cols, step = 1 + (dragons / cols) * 0.8;
    let m = 1;
    for (let lv = 1; lv <= 8; lv++) {
      m = Math.round(m * step * 100) / 100;
      assert.ok(Math.pow(p, lv) * m < 1, `Dragon ${cols}:${dragons} рівень ${lv}: RTP ${Math.pow(p, lv) * m}`);
    }
  }

  // ── Crash / Balloon (реальний час) ──
  tree.users.fay = { balance: 1000 };
  r = await call("fay", { action: "start", game: "crash", bet: 100, params: { auto: 0 } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.view.point, undefined, "точку вибуху клієнт не знає");
  assert.strictEqual(bal("fay"), 900);
  const st = () => secret("fay", "crash").state;
  // Раунд «летить» 1 с, вибух ще далеко: кешаут на 1.2 (що бачив гравець)
  st().crashTick = 5000; st().startedAt = Date.now() - 1000;
  r = await call("fay", { action: "move", game: "crash", move: { poll: true } });
  assert.strictEqual(r.data.status, "active");
  assert.ok(r.data.mult > 1.3 && r.data.mult < 1.4, "множник через 1 с ≈ 1.32: " + r.data.mult);
  r = await call("fay", { action: "cashout", game: "crash", claim: 1.2 });
  assert.strictEqual(r.data.payout, 120, "платимо множник, на якому гравець натиснув");
  assert.strictEqual(bal("fay"), 1020);
  // Заявка «з майбутнього» — платимо лише поточний серверний
  await call("fay", { action: "start", game: "crash", bet: 100, params: {} });
  st().crashTick = 5000; st().startedAt = Date.now() - 1000;
  r = await call("fay", { action: "cashout", game: "crash", claim: 50 });
  assert.ok(r.data.mult < 1.4, "claim більший за серверний множник не проходить");
  // Вже вибухнуло — кешаут не рятує
  await call("fay", { action: "start", game: "crash", bet: 100, params: {} });
  st().crashTick = 5; st().startedAt = Date.now() - 2000;
  const before = bal("fay");
  r = await call("fay", { action: "cashout", game: "crash", claim: 1.1 });
  assert.strictEqual(r.data.status, "lost");
  assert.ok(r.data.view.point > 1, "після вибуху точку показуємо");
  assert.strictEqual(bal("fay"), before);
  // Автокешаут: ціль 1.5 досягнута раніше за вибух — платимо 1.5 навіть без кліку
  await call("fay", { action: "start", game: "crash", bet: 100, params: { auto: 1.5 } });
  st().crashTick = 5000; st().startedAt = Date.now() - 60000;
  const b2 = bal("fay");
  r = await call("fay", { action: "move", game: "crash", move: { poll: true } });
  assert.strictEqual(r.data.payout, 150);
  assert.strictEqual(bal("fay"), b2 + 150);
  assert.strictEqual((await call("fay", { action: "start", game: "crash", bet: 1, params: { auto: 0.5 } })).status, 400, "невірна ціль автокешауту");
  // Balloon: та сама механіка, інший темп
  await call("fay", { action: "start", game: "balloon", bet: 100, params: {} });
  secret("fay", "balloon").state.crashTick = 5000; secret("fay", "balloon").state.startedAt = Date.now() - 2100;
  r = await call("fay", { action: "cashout", game: "balloon" });
  assert.strictEqual(r.data.payout, 148, "4 тіки × 0.12 → ×1.48");

  // ── математика: будь-яка стратегія ≤ 97% ──
  // Crash/Balloon — точно: кешаут на тіку n (множник m) виживає, якщо точка
  // вибуху > m, а P(point > m) = 0.97·100 / (100·m + 1) за формулою в crashPointFrom.
  for (const g of ["crash", "balloon"]) {
    const d = SESSION_GAMES[g];
    const flying = { crashTick: 1e9, startedAt: 0 };
    for (let n = 0; n < 3000; n += 7) {
      const m = d.multAt(flying, n * d.tickMs);
      const pSurvive = Math.min(1, 97 / (100 * m + 1));
      const ev = (pSurvive * Math.floor(100 * m + 1e-6)) / 100;
      assert.ok(ev <= 0.97 + 1e-9, `${g}: кешаут на ×${m} дає RTP ${ev}`);
    }
  }
  // Mines — точно, без симуляції: EV = P(вижити n відкриттів) × виплата.
  for (let mineCount = 1; mineCount <= 24; mineCount++) {
    const g = SESSION_GAMES.mines, safe = 25 - mineCount;
    for (let opens = 1; opens <= safe; opens++) {
      let prob = 1;
      for (let i = 0; i < opens; i++) prob *= (safe - i) / (25 - i);
      const st = { mines: Array.from({ length: mineCount }, (_, i) => i), opened: Array.from({ length: opens }, (_, i) => 24 - i), hit: null };
      const ev = (prob * Math.floor(100 * g.mult(st) + 1e-6)) / 100;
      assert.ok(ev <= 0.975, `Mines ${mineCount} мін × ${opens} відкриттів: RTP ${ev}`);
    }
  }
  {
    const N = 60000;
    const g = SESSION_GAMES.hilo;
    let paid = 0;
    for (let i = 0; i < N; i++) {
      let s = g.init({}, rng), lost = false;
      for (let k = 0; k < 3; k++) {
        const hi = g.stepMult(s.current.r, "high", s.deck), lo = g.stepMult(s.current.r, "low", s.deck);
        const d = hi === 0 ? "low" : lo === 0 ? "high" : hi < lo ? "high" : "low"; // найімовірніший напрямок
        const step = g.move(s, { dir: d });
        if (step.bust) { lost = true; break; }
        s = step.state;
      }
      if (!lost) paid += Math.floor(100 * g.mult(s));
    }
    const rtp = paid / (N * 100);
    assert.ok(rtp < 0.95 && rtp > 0.88, "Hi-Lo 3 кроки: RTP " + rtp); // 0.97³ ≈ 0.913
  }

  console.log("OK — api/round: Mines/Tower/Hi-Lo/Dragon/Crash/Balloon на сервері — секрет не тече, кешаут рівно раз, незакінчені раунди закриваються, RTP ≤ 97%");
})().catch((e) => { console.error(e); process.exit(1); });
