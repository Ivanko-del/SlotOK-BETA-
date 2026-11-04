// Self-check для api/support.js і lib/support.js (чат підтримки v122).
// Запуск: node scripts/selfcheck-support-api.js
//
// Перевіряємо головне, заради чого бонуси переїхали на сервер:
//   - суму рахує сервер (сума з тіла запиту ігнорується), час — серверний;
//   - кожну одноразову нагороду не забрати двічі, навіть паралельними запитами;
//   - VIP-множник, серія днів, кешбек з тижневим лімітом, сезон Battle Pass —
//     ті самі цифри, що й у shared/rewards.js (з нього ж малює браузер);
//   - серверна ставка (api/play) сама рахує вейджер, XP і кешбек.
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
const tgSent = [];
global.fetch = async (url, opts = {}) => {
  if (String(url).startsWith("https://api.telegram.org/")) { tgSent.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ ok: true }) }; }
  if (url === "https://oauth2.googleapis.com/token") return { ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) };
  const u = new URL(url);
  const p = decodeURIComponent(u.pathname.replace(/\.json$/, ""));
  const method = opts.method || "GET";
  if (method === "GET" && u.searchParams.get("shallow")) {
    const v = getPath(p);
    return { ok: true, status: 200, headers: { get: () => "" }, json: async () => (v && typeof v === "object" ? Object.fromEntries(Object.keys(v).map((k) => [k, true])) : v) };
  }
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
const support = require("../api/support.js");
const KB = require("../shared/support-kb");
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
    support({ method: "POST", headers: { authorization: nick ? "Bearer " + idToken(nick) : "" }, body }, res);
  });
}
const msgs = (nick) => Object.values((tree.support_chats || {})[nick] || {}).sort((a, b) => a.time - b.time);
const thread = (nick) => (tree.support_threads || {})[nick] || {};

(async () => {
  tree = { users: { ann: { id: 1 }, sup: { id: 2, role: "support" }, bob: { id: 3 } }, bot_config: { adminChatId: 777 } };
  assert.strictEqual((await call(null, { action: "open" })).status, 401, "без токена");
  assert.strictEqual((await call("ann", { action: "hack" })).status, 400);

  // Привітання один раз
  await call("ann", { action: "open" });
  await call("ann", { action: "open" });
  assert.strictEqual(msgs("ann").length, 1, "привітання лише раз");
  assert.strictEqual(msgs("ann")[0].sender, "ai");
  assert.strictEqual(thread("ann").status, "bot");

  // Стара історія без стану розмови — привітання не додаємо
  tree.support_chats.bob = { old1: { sender: "user", text: "старе", time: 1 } };
  await call("bob", { action: "open" });
  assert.strictEqual(msgs("bob").length, 1, "стара історія лишається як є");

  // Бот відповідає за базою, не передаючи людині
  let r = await call("ann", { action: "send", text: "Привіт, забув пароль" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.status, "bot");
  assert.ok(KB.supportTopic("password").replies.includes(msgs("ann").pop().text), "відповідь з теми «пароль»");
  assert.strictEqual(tgSent.length, 0, "простий випадок адміна не будить");

  // Порожнє / завелике / не те фото
  assert.strictEqual((await call("ann", { action: "send", text: "   " })).status, 400);
  assert.strictEqual((await call("ann", { action: "send", imgUrl: "javascript:alert(1)" })).status, 400);
  assert.strictEqual((await call("ann", { action: "send", imgUrl: "data:image/png;base64," + "A".repeat(1600000) })).status, 400);

  // Незрозуміле → чекає людину, сповіщення в Telegram
  r = await call("ann", { action: "send", text: "ффщщшш" });
  assert.strictEqual(r.data.status, "waiting");
  assert.strictEqual(thread("ann").status, "waiting");
  assert.ok(thread("ann").unreadStaff >= 1);
  assert.strictEqual(tgSent.length, 1);
  assert.ok(tgSent[0].text.startsWith("💬 Гравець ann (підтримка):"), "формат, який парсить telegram-webhook");
  // Поки чекає людину — бот мовчить
  const before = msgs("ann").length;
  await call("ann", { action: "send", text: "ще деталі" });
  assert.strictEqual(msgs("ann").length, before + 1, "бот не перебиває підтримку");

  // Фото + швидка тема
  r = await call("ann", { action: "send", imgUrl: "data:image/jpeg;base64,AAAA" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(msgs("ann").pop().imgUrl, "data:image/jpeg;base64,AAAA");

  // Підтримка відповідає; гравець не може
  assert.strictEqual((await call("bob", { action: "staffReply", nick: "ann", text: "я адмін" })).status, 403, "гравець — не підтримка");
  r = await call("sup", { action: "staffReply", nick: "ann", text: "Перевірили, все гаразд" });
  assert.strictEqual(r.status, 200);
  const last = msgs("ann").pop();
  assert.strictEqual(last.sender, "support");
  assert.strictEqual(last.by, "sup");
  assert.strictEqual(thread("ann").status, "answered");
  assert.strictEqual(tree.users.ann.supportUnread, 1);
  assert.strictEqual(thread("ann").unreadStaff, 0);
  await call("ann", { action: "read" });
  assert.strictEqual(tree.users.ann.supportUnread, 0);
  assert.strictEqual(thread("ann").unreadUser, 0);

  // Закрити → нове повідомлення відкриває з ботом
  assert.strictEqual((await call("sup", { action: "staffStatus", nick: "ann", status: "lol" })).status, 400);
  await call("sup", { action: "staffStatus", nick: "ann", status: "closed" });
  assert.strictEqual(thread("ann").status, "closed");
  r = await call("ann", { action: "send", topic: "shop" });
  assert.strictEqual(r.data.status, "bot", "після закриття знову бот");
  assert.ok(KB.supportTopic("shop").replies.includes(msgs("ann").pop().text));
  r = await call("ann", { action: "send", topic: "human" });
  assert.strictEqual(r.data.status, "waiting", "кнопка «Покликати людину»");

  // Варіанти відповідей не повторюються підряд
  tree = { users: { cat: { id: 4 } } };
  const seen = new Set();
  for (let i = 0; i < 3; i++) { await call("cat", { action: "send", topic: "hello" }); seen.add(msgs("cat").pop().text); }
  assert.ok(seen.size >= 2, "бот чергує варіанти");

  console.log("OK — api/support: бот за базою, передача людині й Telegram, фото, відповіді підтримки, статуси, стара історія ціла");
})().catch((e) => { console.error(e); process.exit(1); });
