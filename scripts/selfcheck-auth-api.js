// Self-check для api/auth.js. Запуск: node scripts/selfcheck-auth-api.js
//
// База і Google OAuth підмінені в пам'яті; сервісний акаунт — тимчасовий
// RSA-ключ, згенерований тут же. Перевіряємо: без ключа ендпоінт чесно каже
// 503 (і застосунок падає назад на старий вхід), з ключем — пароль
// перевіряється на сервері, видається коректно підписаний custom token,
// перебір пароля ріжеться лімітом, реєстрація не перезаписує чужий нік і не
// дає накрутити бонус, а запити з чужого сайту відхиляються.
const assert = require("assert");
const crypto = require("crypto");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA = {
  project_id: "nye-slotok",
  client_email: "svc@nye-slotok.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
};

let tree = {};
const getPath = (p) => p.split("/").filter(Boolean).reduce((n, k) => (n == null ? null : n[k]), tree) ?? null;
function setPath(p, value) {
  const parts = p.split("/").filter(Boolean);
  if (!parts.length) { tree = value || {}; return; }
  const last = parts.pop();
  const parent = parts.reduce((n, k) => (n[k] ??= {}), tree);
  if (value === null) delete parent[last]; else parent[last] = value;
}
const dbRequests = [];

global.fetch = async (url, opts = {}) => {
  if (url === "https://oauth2.googleapis.com/token") {
    return { ok: true, json: async () => ({ access_token: "test-access", expires_in: 3600 }) };
  }
  const u = new URL(url);
  const p = decodeURIComponent(u.pathname.replace(/\.json$/, ""));
  const method = opts.method || "GET";
  dbRequests.push({ method, path: p, token: u.searchParams.get("access_token") });
  const etag = JSON.stringify(getPath(p));
  if (method === "GET") return { ok: true, status: 200, headers: { get: () => etag }, json: async () => getPath(p) };
  if (method === "PUT") {
    const ifMatch = (opts.headers || {})["if-match"];
    if (ifMatch !== undefined && ifMatch !== etag) return { ok: false, status: 412, text: async () => "" };
    setPath(p, JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => getPath(p) };
  }
  if (method === "PATCH") {
    for (const [k, v] of Object.entries(JSON.parse(opts.body))) setPath(`${p}/${k}`, v);
    return { ok: true, status: 200, json: async () => getPath(p) };
  }
  if (method === "POST") {
    const k = "k" + Math.random().toString(36).slice(2);
    setPath(`${p}/${k}`, JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ name: k }) };
  }
  throw new Error("unexpected " + method);
};

// Підписувач ID token для admin-reset (як Google securetoken).
const { privateKey: gKey, publicKey: gPub } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
require("../lib/id-token")._setCertsForTests({ g1: gPub.export({ type: "spki", format: "pem" }) });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function idToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", kid: "g1", typ: "JWT" });
  const p = b64({ sub: uid, aud: "nye-slotok", iss: "https://securetoken.google.com/nye-slotok", iat: now - 10, auth_time: now - 10, exp: now + 3600 });
  return `${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), gKey).toString("base64url")}`;
}

const handler = require("../api/auth.js");
const { _resetForTests } = require("../lib/google-auth");
const SlotOKPassword = require("../password.js");

function call(method, body, headers = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(d) { resolve({ status: this.statusCode, data: d }); },
      end() { resolve({ status: this.statusCode, data: null }); },
    };
    handler({ method, body, headers: { "x-real-ip": "10.0.0.1", ...headers } }, res);
  });
}

function decodeJwt(token) {
  const [h, p, sig] = token.split(".");
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), publicKey, Buffer.from(sig, "base64url"));
  return { ok, header: JSON.parse(Buffer.from(h, "base64url")), claims: JSON.parse(Buffer.from(p, "base64url")) };
}

(async () => {
  // --- без ключа ---
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  _resetForTests();
  assert.deepStrictEqual((await call("GET")).data, { serverAuth: false });
  assert.strictEqual((await call("POST", { action: "login", nick: "a", password: "b" })).status, 503);

  // --- з ключем ---
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify(SA);
  _resetForTests();
  assert.deepStrictEqual((await call("GET")).data, { serverAuth: true });
  assert.strictEqual((await call("PUT")).status, 405);
  assert.strictEqual((await call("POST", { action: "nope" })).status, 400);
  for (const a of ["constructor", "__proto__", "toString"]) assert.strictEqual((await call("POST", { action: a })).status, 400, "action " + a);
  assert.strictEqual(
    (await call("POST", { action: "login", nick: "alice", password: "x" }, { origin: "https://evil.example" })).status, 403,
    "чужий Origin");

  tree = { users: { alice: { pass: await SlotOKPassword.hash("secret1"), balance: 10 }, banned1: { pass: await SlotOKPassword.hash("p"), banned: true } } };

  let r = await call("POST", { action: "login", nick: "alice", password: "wrong" }, { origin: "https://slot-ok-beta.vercel.app" });
  assert.strictEqual(r.status, 401);
  r = await call("POST", { action: "login", nick: "ghost", password: "x" });
  assert.strictEqual(r.status, 404);
  r = await call("POST", { action: "login", nick: "banned1", password: "p" });
  assert.strictEqual(r.status, 403);
  r = await call("POST", { action: "login", nick: "alice", password: "secret1" });
  assert.strictEqual(r.status, 200);
  const jwt = decodeJwt(r.data.token);
  assert.ok(jwt.ok, "custom token підписаний ключем сервісного акаунта");
  assert.strictEqual(jwt.claims.uid, "alice");
  assert.strictEqual(jwt.claims.iss, SA.client_email);
  assert.ok(jwt.claims.exp - jwt.claims.iat <= 3600);
  assert.ok(dbRequests.every((q) => q.token === "test-access"), "сервер ходить у базу з адмін-токеном");
  assert.strictEqual(tree.users.alice.pass, undefined, "хеш прибрано з публічного users/<нік>");
  assert.ok(tree.user_secrets.alice.pass.startsWith("pbkdf2$"), "хеш тепер у закритому user_secrets");
  assert.strictEqual((await call("POST", { action: "login", nick: "alice", password: "secret1" })).status, 200, "вхід після переносу");
  // Адмін скинув пароль старим шляхом (пише в users/<нік>/pass) — новий має вигравати.
  tree.users.alice.pass = await SlotOKPassword.hash("temp777");
  assert.strictEqual((await call("POST", { action: "login", nick: "alice", password: "temp777" })).status, 200, "тимчасовий пароль від адміна");
  assert.strictEqual((await call("POST", { action: "login", nick: "alice", password: "secret1" })).status, 401);

  // Старий формат пароля мігрує при вході.
  tree.users.legacy = { pass: crypto.createHash("sha256").update("oldpass").digest("hex") };
  assert.strictEqual((await call("POST", { action: "login", nick: "legacy", password: "oldpass" })).status, 200);
  assert.ok(tree.user_secrets.legacy.pass.startsWith("pbkdf2$"), "legacy-хеш переписано в PBKDF2");

  // Техобслуговування: гравця не пускає, власника пускає.
  tree.site_config = { maintenance: true };
  assert.strictEqual((await call("POST", { action: "login", nick: "alice", password: "temp777" })).status, 403);
  tree.users.theivankoo = { pass: await SlotOKPassword.hash("ownerpw") };
  assert.strictEqual((await call("POST", { action: "login", nick: "theivankoo", password: "ownerpw" })).status, 200);
  delete tree.site_config;

  // Перебір пароля: 10 спроб на нік за 10 хв, навіть з різних IP.
  tree.users.victim = { pass: await SlotOKPassword.hash("hunter22") };
  let last;
  for (let i = 0; i < 11; i++) last = await call("POST", { action: "login", nick: "victim", password: "guess" + i }, { "x-real-ip": "1.1.1." + i });
  assert.strictEqual(last.status, 429, "перебір пароля ріжеться");
  assert.strictEqual((await call("POST", { action: "login", nick: "victim", password: "hunter22" }, { "x-real-ip": "9.9.9.9" })).status, 429);

  // --- реєстрація ---
  const reg = (body, ip = "20.0.0.1") => call("POST", { action: "register", secQ: "first_phone", secA: "answer", birthDate: "2000-01-01", termsAccepted: true, termsVersion: "3", ...body }, { "x-real-ip": ip });
  assert.strictEqual((await reg({ nick: "<img>", password: "123456" })).status, 400, "нік з HTML");
  assert.strictEqual((await reg({ nick: "ok_nick", password: "123" })).status, 400, "короткий пароль");
  assert.strictEqual((await reg({ nick: "kid", password: "123456", birthDate: new Date(Date.now() - 10 * 365.25 * 864e5).toISOString().slice(0, 10) })).status, 403, "молодше MIN_AGE — акаунт не створюється");
  assert.strictEqual(tree.users.kid, undefined);
  assert.strictEqual((await reg({ nick: "noterms", password: "123456", termsAccepted: false })).status, 400, "без згоди з Умовами реєстрації немає");
  assert.strictEqual((await reg({ nick: "teen15", password: "123456", birthDate: new Date(Date.now() - 15 * 365.25 * 864e5).toISOString().slice(0, 10) })).status, 400, "до 18 без дозволу батьків реєстрації немає");
  assert.strictEqual((await reg({ nick: "nobirth", password: "123456", birthDate: "" })).status, 400, "без дати народження");
  assert.strictEqual((await reg({ nick: "badbirth", password: "123456", birthDate: "2001-02-30" })).status, 400, "неіснуюча дата");
  assert.strictEqual((await reg({ nick: "alice", password: "123456" })).status, 409, "зайнятий нік не перезаписується");
  assert.strictEqual(tree.users.alice.balance, 10);
  r = await reg({ nick: "newbie", password: "123456", promo: "vip", ref: "alice", balance: 1e9 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(tree.users.newbie.balance, 3000, "бонус рахує сервер; balance з тіла запиту ігнорується");
  assert.strictEqual(tree.users.newbie.referredBy, "alice");
  assert.strictEqual(tree.users.alice.referrals, 1);
  assert.strictEqual(tree.users.newbie.pass, undefined, "у публічному вузлі нового гравця хешів немає");
  assert.ok(tree.user_secrets.newbie.pass.startsWith("pbkdf2$"));
  assert.ok(tree.user_secrets.newbie.securityAnswerHash.startsWith("pbkdf2$"));
  assert.strictEqual(tree.user_secrets.newbie.birthDate, "2000-01-01", "дата народження — лише в user_secrets");
  assert.strictEqual(tree.users.newbie.birthDate, undefined);
  assert.strictEqual(decodeJwt(r.data.token).claims.uid, "newbie");
  for (let i = 0; i < 5; i++) await reg({ nick: "spam" + i, password: "123456" }, "30.0.0.1");
  assert.strictEqual((await reg({ nick: "spam9", password: "123456" }, "30.0.0.1")).status, 429, "масова реєстрація з однієї IP");

  // --- скидання пароля через контрольне питання ---
  tree.users.bob = { pass: await SlotOKPassword.hash("old111"), securityAnswerHash: await SlotOKPassword.hash("kyiv") };
  assert.strictEqual((await call("POST", { action: "reset", nick: "bob", answer: "lviv", newPassword: "new222" })).status, 401);
  assert.strictEqual((await call("POST", { action: "reset", nick: "bob", answer: " Kyiv ", newPassword: "new222" })).status, 200);
  assert.ok((await SlotOKPassword.verify("new222", tree.user_secrets.bob.pass)).ok);
  assert.strictEqual(tree.users.bob.securityAnswerHash, undefined);

  // --- зміна пароля ---
  assert.strictEqual((await call("POST", { action: "change-password", nick: "bob", password: "nope", newPassword: "zzz999" })).status, 401);
  assert.strictEqual((await call("POST", { action: "change-password", nick: "bob", password: "new222", newPassword: "zzz999" })).status, 200);
  assert.ok((await SlotOKPassword.verify("zzz999", tree.user_secrets.bob.pass)).ok);

  // --- контрольне питання ---
  assert.strictEqual((await reg({ nick: "noq", password: "123456", secQ: "", secA: "abc" }, "40.0.0.1")).status, 400, "без питання");
  assert.strictEqual((await reg({ nick: "shorta", password: "123456", secQ: "pet", secA: "ab" }, "40.0.0.2")).status, 400, "коротка відповідь");
  r = await reg({ nick: "customq", password: "123456", secQ: 'Що було в "скарбничці"? <b>', secA: "Ґудзик" }, "40.0.0.3");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(tree.users.customq.securityQuestion, "Що було в скарбничці? b", "HTML-символи з питання прибрано");
  assert.strictEqual(tree.users.customq.hasSecurityAnswer, true);
  const setq = (b) => call("POST", { action: "set-security", nick: "customq", ...b }, { "x-real-ip": "40.0.0.9" });
  assert.strictEqual((await setq({ password: "bad", question: "first_phone", answer: "nokia" })).status, 401, "без пароля питання не змінити");
  assert.strictEqual((await setq({ password: "123456", question: "first_phone", answer: "Nokia 3310" })).status, 200);
  assert.strictEqual(tree.users.customq.securityQuestion, "first_phone");
  assert.strictEqual((await call("POST", { action: "reset", nick: "customq", answer: "nokia 3310", newPassword: "fresh99" }, { "x-real-ip": "40.0.0.10" })).status, 200, "нова відповідь працює");
  assert.strictEqual((await call("POST", { action: "reset", nick: "alice", answer: "x", newPassword: "fresh99" }, { "x-real-ip": "40.0.0.11" })).status, 404, "немає відповіді — 404 (клієнт піде в Telegram)");

  // --- крок 1 реєстрації: чи вільний нік (без читання users/ з браузера) ---
  assert.deepStrictEqual((await call("POST", { action: "nick-check", nick: "customq" }, { "x-real-ip": "50.0.0.9" })).data, { free: false });
  assert.deepStrictEqual((await call("POST", { action: "nick-check", nick: "freshnick" }, { "x-real-ip": "50.0.0.9" })).data, { free: true });

  // --- відновлення без входу: питання віддає сервер, хеш — ні ---
  let ri = await call("POST", { action: "reset-info", nick: "customq" }, { "x-real-ip": "50.0.0.1" });
  assert.strictEqual(ri.status, 200);
  assert.deepStrictEqual(ri.data, { question: "first_phone" }, "лише текст питання, без хешів");
  ri = await call("POST", { action: "reset-info", nick: "alice" }, { "x-real-ip": "50.0.0.1" });
  assert.deepStrictEqual(ri.data, { question: null }, "немає відповіді — клієнт піде в Telegram");
  assert.strictEqual((await call("POST", { action: "reset-info", nick: "ghost" }, { "x-real-ip": "50.0.0.1" })).status, 404);

  // --- заявка «не пам'ятаю відповідь» створюється сервером, з лімітом ---
  const rq = await call("POST", { action: "reset-request", nick: "alice" }, { "x-real-ip": "50.0.0.2" });
  assert.strictEqual(rq.status, 200);
  const reqId = rq.data.id;
  assert.deepStrictEqual({ user: tree.password_reset_requests[reqId].user, status: tree.password_reset_requests[reqId].status }, { user: "alice", status: "pending" });
  assert.ok(Object.values(tree.pm.theivankoo).some((m) => /alice/.test(m.text)), "адмін отримав ПМ про заявку");
  await call("POST", { action: "reset-request", nick: "alice" }, { "x-real-ip": "50.0.0.3" });
  assert.strictEqual((await call("POST", { action: "reset-request", nick: "alice" }, { "x-real-ip": "50.0.0.4" })).status, 429, "заявками не засипати");
  assert.strictEqual((await call("POST", { action: "reset-request", nick: "ghost" }, { "x-real-ip": "50.0.0.5" })).status, 404);

  // --- скидання з адмінки: лише адмін за ID token, хеш — лише в user_secrets ---
  const adminReset = (who, id) => call("POST", { action: "admin-reset", id }, { "x-real-ip": "50.0.0.6", ...(who ? { authorization: "Bearer " + idToken(who) } : {}) });
  assert.strictEqual((await adminReset(null, reqId)).status, 401, "без входу");
  assert.strictEqual((await adminReset("bob", reqId)).status, 403, "гравець не скидає чужий пароль");
  const passBefore = tree.user_secrets.alice.pass;
  const ar = await adminReset("theivankoo", reqId);
  assert.strictEqual(ar.status, 200);
  assert.notStrictEqual(tree.user_secrets.alice.pass, passBefore);
  assert.ok(tree.user_secrets.alice.pass.startsWith("pbkdf2$"));
  assert.strictEqual(tree.users.alice.pass, undefined, "у публічному users/ — нічого");
  assert.strictEqual(tree.password_reset_requests[reqId].status, "done");
  const tempMsg = Object.values(tree.pm.alice).find((m) => /тимчасовий пароль/.test(m.text));
  const temp = /пароль: (\S+)/.exec(tempMsg.text)[1];
  assert.ok((await SlotOKPassword.verify(temp, tree.user_secrets.alice.pass)).ok, "тимчасовий пароль з ПМ підходить");
  assert.strictEqual((await adminReset("theivankoo", reqId)).status, 409, "двічі не скинути");

  console.log("OK — api/auth: 503 без ключа, перевірка пароля на сервері, підписаний custom token, ліміти, безпечна реєстрація");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
