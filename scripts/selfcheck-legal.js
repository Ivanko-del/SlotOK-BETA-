// Self-check: донат нічого не нараховує, вивід прибрано, власний акаунт видаляється.
// Run: node scripts/selfcheck-legal.js
const assert = require("assert");

process.env.WEBHOOK_SECRET = "test-secret";
process.env.BOT_TOKEN = "test-token";

let tree = {};
const getPath = (p) => p.split("/").filter(Boolean).reduce((n, k) => (n == null ? null : n[k]), tree) ?? null;
function setPath(path, value) {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) { tree = value || {}; return; }
  const last = parts.pop();
  const parent = parts.reduce((n, k) => (n[k] ??= {}), tree);
  if (value === null) delete parent[last]; else parent[last] = value;
}
const sent = [];
global.fetch = async (url, opts) => {
  if (url.startsWith("https://api.telegram.org")) { sent.push(JSON.parse((opts && opts.body) || "{}")); return { ok: true, json: async () => ({ ok: true, result: {} }) }; }
  const path = decodeURIComponent(url.split(".firebaseio.com/")[1].replace(/\.json.*$/, ""));
  const method = (opts && opts.method) || "GET";
  if (method === "GET") return { ok: true, headers: { get: () => "etag" }, json: async () => getPath(path) };
  if (method === "PUT") { setPath(path, JSON.parse(opts.body)); return { ok: true, json: async () => getPath(path) }; }
  if (method === "PATCH") {
    const body = JSON.parse(opts.body);
    if (!path) Object.entries(body).forEach(([k, v]) => setPath(k, v));
    else setPath(path, { ...(getPath(path) || {}), ...body });
    return { ok: true, json: async () => getPath(path) };
  }
  if (method === "DELETE") { setPath(path, null); return { ok: true, json: async () => null }; }
  if (method === "POST") { const key = "k" + Math.random(); setPath(`${path}/${key}`, JSON.parse(opts.body)); return { ok: true, json: async () => ({ name: key }) }; }
  throw new Error("unhandled " + method);
};

const webhook = require("../api/telegram-webhook.js");
const { deleteAccount } = require("../lib/account");
const SlotOKPassword = require("../password.js");

const res = () => ({ status() { return this; }, end() {} });
const tg = (body) => webhook({ headers: { "x-telegram-bot-api-secret-token": "test-secret" }, body }, res());

async function main() {
  setPath("bot_config/adminChatId", 999);
  setPath("users/donor", { balance: 100, totalDeposits: 0, vipGiftUntil: 0, slotiky: 5, totalWagered: 0 });
  setPath("deposit_requests/donor_1", { user: "donor", amount: 5000, method: "mono", status: "pending", time: Date.now() });

  // 1. Адмін підтверджує донат: ні баланс, ні Слотіки, ні totalDeposits не змінюються; є значок.
  await tg({ callback_query: { id: "c1", data: "dep:approve:donor_1", message: { chat: { id: 999 }, message_id: 1, text: "x" } } });
  const u = getPath("users/donor");
  assert.strictEqual(u.balance, 100, "донат не змінює баланс");
  assert.strictEqual(u.slotiky, 5, "донат не змінює Слотіки");
  assert.strictEqual(u.totalDeposits, 0, "донат не пишеться в totalDeposits/VIP");
  assert.strictEqual(u.totalWagered, 0, "донат не збільшує totalWagered");
  assert.strictEqual(u.supporter, true, "видано значок підтримки");
  assert.strictEqual(getPath("deposit_requests/donor_1/status"), "done");

  // 2. /withdraw не відкриває діалог виводу.
  setPath("telegram_links/555", "donor");
  setPath("users/donor/telegramChatId", 555);
  sent.length = 0;
  await tg({ message: { chat: { id: 555 }, from: {}, text: "/withdraw" } });
  assert.ok(!getPath("telegram_state/555"), "діалогу виводу немає");
  assert.match(sent[0].text, /недоступний/);

  // 3. Стара заявка на вивід лише повертається на баланс.
  setPath("users/donor/pendingWithdraw", true);
  setPath("withdraw_requests/w1", { user: "donor", amount: 300, status: "pending", method: "mono", card: "x" });
  await tg({ callback_query: { id: "c2", data: "wd:approve:w1", message: { chat: { id: 999 }, message_id: 2, text: "x" } } });
  assert.strictEqual(getPath("users/donor/balance"), 400, "кошти повернуто, виплати немає");
  assert.strictEqual(getPath("withdraw_requests/w1/status"), "rejected");

  // 4. Видалення акаунта: потрібен пароль; стирається профіль і секрети.
  setPath("user_secrets/donor", { pass: await SlotOKPassword.hash("secret1"), birthDate: "2000-01-01" });
  setPath("pm/donor/a", { text: "hi" });
  setPath("friends/donor", { x: true });
  let r = await deleteAccount("donor", "wrong");
  assert.strictEqual(r.ok, false); assert.strictEqual(r.status, 401);
  assert.ok(getPath("users/donor"), "з хибним паролем нічого не видалено");
  r = await deleteAccount("donor", "secret1");
  assert.strictEqual(r.ok, true);
  for (const p of ["users/donor", "user_secrets/donor", "pm/donor", "friends/donor", "telegram_links/555"]) assert.strictEqual(getPath(p), null, p + " видалено");

  console.log("OK — донат без нарахувань, вивід прибрано, акаунт видаляється");
}
main().catch((e) => { console.error(e); process.exit(1); });
