// Self-check for the Telegram bot webhook's routing logic. Run: node scripts/selfcheck-telegram-bot.js
//
// Covers two regressions fixed together:
// 1. /cancel must always answer, in every state (idle, mid-flow, admin) — it used
//    to only work while a deposit/withdraw dialog was active; otherwise it fell
//    through to admin-relay (players) or got no reply at all (admin).
// 2. The new read-only player commands (/top, /vip, /ref) must not require a
//    linked account (except /vip and /ref, which need one) and must not crash
//    on the VIP tier boundary math.
const assert = require("assert");

process.env.WEBHOOK_SECRET = "test-secret";
process.env.BOT_TOKEN = "test-token";

// Nested-tree stand-in for the Firebase RTDB REST API — real Firebase lets you
// GET any sub-path of a larger object (e.g. users/nick/telegramChatId), so the
// mock has to walk the tree the same way rather than exact-match full paths.
let tree = {};
function getPath(path) {
  return path.split("/").filter(Boolean).reduce((node, key) => (node == null ? null : node[key]), tree) ?? null;
}
function setPath(path, value) {
  const parts = path.split("/").filter(Boolean);
  const last = parts.pop();
  const parent = parts.reduce((node, key) => (node[key] ??= {}), tree);
  parent[last] = value;
}
function deletePath(path) {
  const parts = path.split("/").filter(Boolean);
  const last = parts.pop();
  const parent = parts.reduce((node, key) => (node && node[key]) ?? {}, tree);
  delete parent[last];
}

const sentMessages = [];

global.fetch = async (url, opts) => {
  if (url.startsWith("https://api.telegram.org")) {
    const body = JSON.parse((opts && opts.body) || "{}");
    sentMessages.push(body);
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  }
  const path = decodeURIComponent(url.split(".firebaseio.com/")[1].replace(/\.json.*$/, ""));
  const method = (opts && opts.method) || "GET";
  if (method === "GET") return { ok: true, headers: { get: () => "etag" }, json: async () => getPath(path) };
  if (method === "PUT") { setPath(path, JSON.parse(opts.body)); return { ok: true, json: async () => getPath(path) }; }
  if (method === "PATCH") { setPath(path, { ...(getPath(path) || {}), ...JSON.parse(opts.body) }); return { ok: true, json: async () => getPath(path) }; }
  if (method === "DELETE") { deletePath(path); return { ok: true, json: async () => null }; }
  if (method === "POST") { const key = "k" + Math.random(); setPath(`${path}/${key}`, JSON.parse(opts.body)); return { ok: true, json: async () => ({ name: key }) }; }
  throw new Error("unhandled method " + method);
};

const webhook = require("../api/telegram-webhook.js");

function fakeReq(message) {
  return { headers: { "x-telegram-bot-api-secret-token": "test-secret" }, body: { message } };
}
function fakeRes() {
  return { status() { return this; }, end() {} };
}

async function main() {
  setPath("bot_config/adminChatId", 999);

  // 1. Player, no active dialog: /cancel must reply "nothing to cancel", not relay to admin.
  sentMessages.length = 0;
  await webhook(fakeReq({ chat: { id: 111 }, from: {}, text: "/cancel" }), fakeRes());
  assert.strictEqual(sentMessages.length, 1, "expected exactly one reply to the player");
  assert.match(sentMessages[0].text, /Немає активної дії/);

  // 2. Player, mid deposit dialog: /cancel must clear state and confirm.
  setPath("telegram_state/222", { type: "deposit", step: "amount", data: {}, updatedAt: Date.now() });
  sentMessages.length = 0;
  await webhook(fakeReq({ chat: { id: 222 }, from: {}, text: "/cancel" }), fakeRes());
  assert.strictEqual(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /Скасовано/);
  assert.strictEqual(getPath("telegram_state/222"), null, "state must be cleared");

  // 3. Admin, no active dialog: /cancel must not silently fall through handleAdminCommand.
  sentMessages.length = 0;
  await webhook(fakeReq({ chat: { id: 999 }, from: {}, text: "/cancel" }), fakeRes());
  assert.strictEqual(sentMessages.length, 1, "admin must get a reply too");
  assert.match(sentMessages[0].text, /Немає активної дії/);

  // Link a player for /vip and /ref
  setPath("telegram_links/333", "player1");
  setPath("users/player1", { telegramChatId: 333, totalWagered: 24000, referralEarnings: 150 });

  // 4. /top works without a linked account and doesn't crash on empty/zero-wager users.
  setPath("users/player2", { totalWagered: 0 });
  sentMessages.length = 0;
  await webhook(fakeReq({ chat: { id: 444 }, from: {}, text: "/top" }), fakeRes());
  assert.strictEqual(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /player1/);
  assert.doesNotMatch(sentMessages[0].text, /player2/, "zero-wager players should be excluded from the top list");

  // 5. /vip picks the right tier and shows progress to the next one.
  sentMessages.length = 0;
  await webhook(fakeReq({ chat: { id: 333 }, from: {}, text: "/vip" }), fakeRes());
  assert.strictEqual(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /Gold/, "24000₴ wagered should land in the Gold tier (min 20000)");

  // 6. /ref shows the referral link keyed off the linked nick.
  sentMessages.length = 0;
  await webhook(fakeReq({ chat: { id: 333 }, from: {}, text: "/ref" }), fakeRes());
  assert.strictEqual(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /\?ref=player1/);
  assert.match(sentMessages[0].text, /150/);

  // 7. /promo credits the balance once, then blocks a repeat redemption and an
  //    exhausted code — this is the money-path branch, worth pinning down exactly.
  setPath("promos/WELCOME", { value: 250, uses: 1, createdBy: "admin" });
  sentMessages.length = 0;
  await webhook(fakeReq({ chat: { id: 333 }, from: {}, text: "/promo WELCOME" }), fakeRes());
  assert.strictEqual(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /\+250₴/);
  assert.strictEqual(getPath("users/player1/balance"), 250);

  sentMessages.length = 0;
  await webhook(fakeReq({ chat: { id: 333 }, from: {}, text: "/promo WELCOME" }), fakeRes());
  assert.match(sentMessages[0].text, /вже активував/, "same user redeeming twice must be blocked");
  assert.strictEqual(getPath("users/player1/balance"), 250, "balance must not move on a blocked repeat redemption");

  setPath("telegram_links/555", "player3");
  setPath("users/player3", { telegramChatId: 555 });
  sentMessages.length = 0;
  await webhook(fakeReq({ chat: { id: 555 }, from: {}, text: "/promo WELCOME" }), fakeRes());
  assert.match(sentMessages[0].text, /вичерпано/, "uses:1 code must be exhausted after one redemption by anyone");

  sentMessages.length = 0;
  await webhook(fakeReq({ chat: { id: 555 }, from: {}, text: "/promo NOPE" }), fakeRes());
  assert.match(sentMessages[0].text, /Невірний промокод/);

  console.log("OK — /cancel, /top, /vip, /ref, /promo all behave as expected");
}

main().catch((err) => { console.error("SELFCHECK FAILED:", err.message); process.exit(1); });
