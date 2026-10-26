// Self-check: хто може слати player-ping через api/notify.js (коли серверний
// вхід увімкнено). Запуск: node scripts/selfcheck-notify-auth.js
const assert = require("assert");
const crypto = require("crypto");

const { privateKey: saKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: gKey, publicKey: gPub } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({ project_id: "nye-slotok", client_email: "svc@x", private_key: saKey.export({ type: "pkcs8", format: "pem" }) });
process.env.BOT_TOKEN = "test";

const tree = { users: { alice: { telegramChatId: 1 }, bob: { telegramChatId: 2 }, adm: { isAdmin: true } } };
const sent = [];
global.fetch = async (url, opts = {}) => {
  if (url.startsWith("https://oauth2.googleapis.com")) return { ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) };
  if (url.startsWith("https://api.telegram.org")) { sent.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ ok: true }) }; }
  const p = decodeURIComponent(new URL(url).pathname.replace(/\.json$/, ""));
  const get = () => p.split("/").filter(Boolean).reduce((n, k) => (n == null ? null : n[k]), tree) ?? null;
  if ((opts.method || "GET") === "GET") return { ok: true, status: 200, headers: { get: () => JSON.stringify(get()) }, json: async () => get() };
  return { ok: true, status: 200, json: async () => null }; // ліміти тощо — не цікавлять
};
require("../lib/id-token")._setCertsForTests({ k: gPub.export({ type: "spki", format: "pem" }) });
const handler = require("../api/notify.js");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function tok(uid) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", kid: "k" }), pl = b64({ sub: uid, aud: "nye-slotok", iss: "https://securetoken.google.com/nye-slotok", iat: now, auth_time: now, exp: now + 600 });
  return `${h}.${pl}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${pl}`), gKey).toString("base64url")}`;
}
const ping = (who, body) => new Promise((resolve) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, end() { resolve(this.statusCode); }, json() { resolve(this.statusCode); } };
  handler({ method: "POST", headers: who ? { authorization: "Bearer " + tok(who) } : {}, body: { type: "player-ping", ...body } }, res);
});

(async () => {
  assert.strictEqual(await ping(null, { to: "bob", kind: "bigwin", ref: { amount: 1e6 } }), 401, "анонімно");
  assert.strictEqual(await ping("alice", { to: "bob", kind: "bigwin", ref: { amount: 1e6 } }), 403, "фейковий виграш іншому");
  assert.strictEqual(await ping("alice", { to: "bob", kind: "jackpot", ref: { amount: 1e6 } }), 403, "джекпот не від адміна");
  assert.strictEqual(sent.length, 0, "жодного фейку не надіслано");
  assert.strictEqual(await ping("alice", { to: "alice", kind: "bigwin", ref: { amount: 500 } }), 200, "свій виграш");
  assert.strictEqual(await ping("adm", { to: "bob", kind: "bonus", ref: { amount: 100 } }), 200, "бонус від адміна");
  assert.strictEqual(await ping("alice", { to: "bob", kind: "clan-chat" }), 200, "клан-чат");
  assert.strictEqual(sent.length, 3);
  console.log("OK — api/notify: player-ping лише від справжнього відправника (свій виграш, адмінські бонуси)");
})().catch((e) => { console.error(e); process.exit(1); });
