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

  // ── Слоти: фріспіни й бонус-раунд перевіряє сервер ──
  tree.users.sam = { balance: 1000, freeSlots: 1 };
  const sam = idToken("sam");
  r = await play(sam, { game: "slots", bet: 1000000, params: { mode: "free" } });
  assert.strictEqual(r.status, 200, "фріспін");
  assert.ok(r.data.bet <= 100, "фріспін грається на ставку ≤ 100, а не на будь-яку");
  assert.ok(tree.users.sam.freeSlots === 0 || r.data.trigger === "free", "фріспін списано");
  if (r.data.trigger !== "free") {
    assert.strictEqual((await play(sam, { game: "slots", bet: 100, params: { mode: "free" } })).status, 409, "другого фріспіна нема");
  }
  assert.strictEqual(tree.users.sam.balance, 1000 + r.data.payout, "фріспін не списує ставку");
  delete tree.game_sessions;
  assert.strictEqual((await play(sam, { game: "slots", bet: 100, params: { mode: "bonus" } })).status, 409, "бонус-раунду нема — не грається");
  tree.game_sessions = { sam: { slots: { status: "active", spinsLeft: 2, bet: 50, mult: 3 } } };
  const balBonus = tree.users.sam.balance;
  r = await play(sam, { game: "slots", bet: 999, params: { mode: "bonus" } });
  assert.strictEqual(r.data.bet, 50, "ставка бонус-раунду — з сервера, не з запиту");
  assert.strictEqual(r.data.bonusSpinsLeft, 1);
  r = await play(sam, { game: "slots", bet: 999, params: { mode: "bonus" } });
  assert.strictEqual(tree.game_sessions.sam.slots.status, "done");
  assert.strictEqual((await play(sam, { game: "slots", bet: 100, params: { mode: "bonus" } })).status, 409, "11-го бонус-спіну нема");
  assert.ok(tree.users.sam.balance >= balBonus, "бонус-спіни нічого не списують");
  assert.strictEqual((await play(sam, { game: "slots", bet: 100, params: { mode: "turbo" } })).status, 400);

  // Точний RTP Classic 777: E = (W + p_bonus·B) / (1 − 5·p_free), де B — 10 бонус-спінів.
  {
    const S = GAMES.slots;
    let prev = 0, W = 0;
    for (const l of S.LINES) { W += (l.upTo - prev) * l.mult; prev = l.upTo; }
    const pBonus = S.BONUS_UPTO - prev, pFree = S.FREE_UPTO - S.BONUS_UPTO;
    const Wb = W / S.BONUS_ODDS, B = S.BONUS_SPINS * Wb * 2.5; // ×2 або ×3 порівну
    const E = (W + pBonus * B) / (1 - S.FREE_SPINS * pFree);
    assert.ok(E < 0.97 && E > 0.9, "RTP Classic 777: " + E);
    let prevD = 0, Ed = 0;
    for (const l of GAMES.diamond.LINES) { Ed += (l.upTo - prevD) * l.mult; prevD = l.upTo; }
    assert.ok(Ed < 0.97, "RTP Diamond Rush: " + Ed);
  }

  // ── математика: RTP і межі (200k раундів; похибка середнього ~0,3%) ──
  const rng = { int: (min, max) => crypto.randomInt(min, max) };
  const N = 200000;
  let paidDice = 0, paidLimbo = 0;
  for (let i = 0; i < N; i++) {
    paidDice += GAMES.dice.play(100, GAMES.dice.parse({ target: 50, dir: i % 2 ? "over" : "under" }), rng).payout;
    paidLimbo += GAMES.limbo.play(100, GAMES.limbo.parse({ target: 2 }), rng).payout;
  }
  const rtpDice = paidDice / (N * 100), rtpLimbo = paidLimbo / (N * 100);
  // Sic Bo «велике» і Card War: теоретичні RTP 0,9722 і рівно 1,0 (як і в клієнті до переносу).
  let paidSb = 0, paidCw = 0;
  for (let i = 0; i < N; i++) {
    paidSb += GAMES.sicbo.play(100, GAMES.sicbo.parse({ type: "big" }), rng).payout;
    paidCw += GAMES.cardwar.play(100, GAMES.cardwar.parse({}), rng).payout;
  }
  const rtpSb = paidSb / (N * 100), rtpCw = paidCw / (N * 100);
  assert.ok(Math.abs(rtpSb - 0.9722) < 0.01, "RTP Sic Bo " + rtpSb);
  assert.ok(Math.abs(rtpCw - 1.0) < 0.01, "RTP Card War " + rtpCw);
  // Ребаланс: жодна гра не повертає гравцю більше, ніж він ставить, за будь-якого вибору.
  const rtpOf = (game, params, n = 200000) => { let paid = 0; for (let i = 0; i < n; i++) paid += GAMES[game].play(100, params, rng).payout; return paid / (n * 100); };
  for (const risk of ["low", "med", "high"]) {
    const r = rtpOf("plinko", { risk }, 300000);
    assert.ok(r > 0.92 && r < 0.995, `Plinko ${risk} RTP ${r}`);
    const w = GAMES.plinko.TABLE[risk].weights.reduce((a, b) => a + b);
    assert.ok(Math.abs(w - 1) < 1e-9, `Plinko ${risk}: ваги в сумі ${w}`);
  }
  // Клієнт показує ті самі коефіцієнти, що рахує сервер.
  const appSrc = require("fs").readFileSync(require("path").join(__dirname, "..", "app.js"), "utf8");
  const tableSrc = /const PLINKO_TABLE = (\{[\s\S]*?\n\});/.exec(appSrc);
  assert.ok(tableSrc, "PLINKO_TABLE не знайдено в app.js");
  assert.deepStrictEqual(new Function("return " + tableSrc[1])(), GAMES.plinko.TABLE, "PLINKO_TABLE в app.js ≠ lib/games.js");
  assert.strictEqual(GAMES.plinko.parse({ risk: "insane" }), null);
  // Keno: точний RTP для кожної кількості чисел (гіпергеометричний розподіл).
  const Cn = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
  for (let k = 1; k <= 10; k++) {
    let e = 0;
    for (let h = 0; h <= k; h++) e += ((Cn(k, h) * Cn(40 - k, 20 - h)) / Cn(40, 20)) * (GAMES.keno.PAY[k][h] || 0);
    assert.ok(e > 0.9 && e < 0.97, `Keno ${k} чисел: RTP ${e}`);
  }
  const kr = GAMES.keno.play(100, { picks: [1, 2, 3] }, rng);
  assert.strictEqual(new Set(kr.drawn).size, 20, "20 різних кульок");
  assert.ok(kr.drawn.every((n) => n >= 1 && n <= 40));
  assert.strictEqual(GAMES.keno.parse({ picks: [1, 1] }), null, "повтор числа");
  assert.strictEqual(GAMES.keno.parse({ picks: [0] }), null);
  assert.strictEqual(GAMES.keno.parse({ picks: Array.from({ length: 11 }, (_, i) => i + 1) }), null);
  const appKeno = /const KENO_PAY = (\{[\s\S]*?\n\});/.exec(appSrc);
  assert.deepStrictEqual(new Function("return " + appKeno[1])(), GAMES.keno.PAY, "KENO_PAY в app.js ≠ lib/games.js");
  // Double / Fortune / Chests
  for (const color of ["red", "black", "green"]) {
    const r = rtpOf("double", { color }, 300000);
    assert.ok(r > 0.9 && r < 1.0, `Double ${color}: RTP ${r}`);
  }
  const fortuneExact = GAMES.fortune.MULTS.reduce((a, b) => a + b, 0) / GAMES.fortune.MULTS.length;
  assert.ok(fortuneExact < 0.98, "Fortune RTP " + fortuneExact);
  const appFortune = /const FORTUNE_SEGMENTS = (\[[\s\S]*?\n\]);/.exec(appSrc);
  assert.deepStrictEqual(new Function("return " + appFortune[1])().map((x) => x.mult), GAMES.fortune.MULTS, "FORTUNE_SEGMENTS в app.js ≠ lib/games.js");
  const rc = rtpOf("chests", {}, 300000);
  assert.ok(rc > 0.93 && rc < 0.99, "Chests RTP " + rc);
  assert.strictEqual(GAMES.double.parse({ color: "blue" }), null);
  // Скретч: 96,4% звичайно; «удача новачка» лише для перших ігор.
  const rs = rtpOf("scratch", {}, 300000);
  assert.ok(rs > 0.93 && rs < 0.99, "Scratch RTP " + rs);
  assert.strictEqual(GAMES.sicbo.parse({ type: "sum", sum: 3 }), null);
  assert.strictEqual(GAMES.sicbo.parse({ type: "sum", sum: 18 }), null);
  assert.strictEqual(GAMES.sicbo.parse({ type: "jackpot" }), null);
  const sbRound = GAMES.sicbo.play(100, { type: "sum", sum: 10 }, rng);
  assert.ok(sbRound.dice.every((d) => d >= 1 && d <= 6) && sbRound.sum === sbRound.dice.reduce((a, b) => a + b));
  assert.ok(rtpDice > 0.93 && rtpDice < 1.0, "RTP Dice " + rtpDice);
  assert.ok(rtpLimbo > 0.93 && rtpLimbo < 1.0, "RTP Limbo " + rtpLimbo);
  assert.strictEqual(GAMES.limbo.parse({ target: 1.001 }), null);
  assert.strictEqual(GAMES.limbo.parse({ target: "abc" }), null);

  // ── Нові ігри v110: точний RTP ──
  const C12 = [1, 12, 66, 220, 495, 792, 924, 792, 495, 220, 66, 12, 1];
  const rtpNew = {};
  for (const risk of ["low", "med", "high"]) {
    const r = GAMES.plinko3d.MULTS[risk].reduce((a, m, i) => a + m * C12[i] / 4096, 0);
    assert.ok(r > 0.95 && r < 0.98, `Plinko 3D ${risk} RTP ${r}`);
    rtpNew["plinko3d-" + risk] = r;
  }
  {
    const W = GAMES.wheel3d, bonusMean = W.BONUS.reduce((a, b) => a + b, 0) / W.BONUS.length;
    const r = W.SEGMENTS.reduce((a, v) => a + (v === "B" ? bonusMean : v), 0) / W.SEGMENTS.length;
    assert.ok(r > 0.95 && r < 0.98, "Wheel 3D RTP " + r);
    rtpNew.wheel3d = r;
  }
  {
    const all = [];
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) all.push([a, b]);
    const fixed = (d) => ({ int: (() => { let i = 0; return () => d[i++]; })() });
    const bets = [{ type: "small" }, { type: "big" }, { type: "seven" }, { type: "doubles" }];
    for (let s2 = 2; s2 <= 12; s2++) bets.push({ type: "sum", sum: s2 });
    for (const b of bets) {
      const r = all.reduce((acc, d) => acc + GAMES.craps.play(1000, GAMES.craps.parse(b), fixed(d)).payout, 0) / (36 * 1000);
      assert.ok(r > 0.95 && r < 0.98, `Craps ${JSON.stringify(b)} RTP ${r}`);
    }
    assert.strictEqual(GAMES.craps.parse({ type: "sum", sum: 13 }), null);
    assert.strictEqual(GAMES.craps.parse({ type: "any" }), null);
  }
  {
    // Слот 5×3: на кожній лінії символи барабанів незалежні й рівномірні
    // за стрічкою → E[лінія] рахується перебором 9^5 комбінацій з вагами.
    const S = GAMES.slot5, freq = S.REELS.map((r) => { const f = new Array(9).fill(0); r.forEach((x) => f[x]++); return f.map((c) => c / r.length); });
    let eLine = 0;
    const rec = (k, p, sy) => {
      if (k === 5) { const w = S.lineWin(sy); if (w) eLine += p * w.mult; return; }
      for (let x = 0; x < 9; x++) if (freq[k][x]) { sy[k] = x; rec(k + 1, p * freq[k][x], sy); }
    };
    rec(0, 1, []);
    // Скатер: на стрічці скатери стоять щонайменше через 3, тож у вікні 3×1
    // барабана їх 0 або 1; P = 3 × кількість / довжина.
    S.REELS.forEach((r) => {
      const at = r.map((x, i) => (x === S.SCATTER ? i : -1)).filter((i) => i >= 0);
      for (const i of at) for (const j of at) if (i !== j) assert.ok(Math.min(Math.abs(i - j), r.length - Math.abs(i - j)) >= 3, "скатери надто близько");
    });
    let dist = [1];
    S.REELS.forEach((r) => {
      const p = (3 * r.filter((x) => x === S.SCATTER).length) / r.length, nd = new Array(dist.length + 1).fill(0);
      dist.forEach((v, k) => { nd[k] += v * (1 - p); nd[k + 1] += v * p; });
      dist = nd;
    });
    const eScatter = [3, 4, 5].reduce((a, k) => a + (dist[k] || 0) * S.SCATTER_PAY[k], 0);
    const r = eLine + eScatter; // лінійна ставка = ставка/10, ліній 10 → RTP ліній = E[множник лінії]
    assert.ok(r > 0.95 && r < 0.98, "Slot 5x3 RTP " + r);
    rtpNew.slot5 = r;
    // Перевірка play(): та сама таблиця, виплата = сума ліній/10 + скатер
    const s5 = S.play(1000, {}, { int: (a, b) => a + Math.floor(Math.random() * (b - a)) });
    assert.strictEqual(s5.payout, Math.floor(1000 * (s5.lines.reduce((a, l) => a + l.mult / 10, 0) + s5.scatterMult) + 1e-6));
  }
  {
    // «Три в ряд» — каскади не рахуються аналітично; симуляція з фіксованим зерном.
    // mulberry32: простий, але якісний генератор (LCG тут занижує збіги).
    let seed = 20261027;
    const next = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const prng = { int: (a, b) => a + Math.floor(next() * (b - a)) };
    let paid = 0, hits = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) { const o = GAMES.match3.play(1000, {}, prng); paid += o.payout; if (o.win) hits++; }
    const r = paid / (n * 1000);
    assert.ok(r > 0.93 && r < 0.985, "Match-3 RTP " + r);
    rtpNew.match3 = r;
    // Кроки узгоджені: після останнього кроку збігів немає
    const o = GAMES.match3.play(100, {}, prng);
    const last = o.steps.length ? o.steps[o.steps.length - 1].grid : o.start;
    assert.strictEqual(GAMES.match3.findRuns(last).cells.length, 0);
  }
  assert.strictEqual(GAMES.plinko3d.parse({ risk: "ultra" }), null);
  console.log(`OK — api/play: ID token, валідація, атомарний баланс, ідемпотентність, блокування; RTP dice ${rtpDice.toFixed(3)}, limbo ${rtpLimbo.toFixed(3)}, sic bo ${rtpSb.toFixed(3)}, card war ${rtpCw.toFixed(3)}; нові: ${Object.entries(rtpNew).map(([k, v]) => k + ' ' + v.toFixed(3)).join(', ')}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
