// Self-check для дроселя api/notify.js. Запуск: node scripts/selfcheck-notify-ratelimit.js
//
// api/notify.js неавтентифікований, тож дросель — єдине, що стоїть між
// «знаю чужий нік» і нескінченним потоком повідомлень у чужий Telegram.
// Перевіряємо: ліміт справді ріже, вікно справді відкривається знову,
// різні цілі не діляться лічильником, і падіння БД не блокує сповіщення.
const assert = require("assert");

process.env.BOT_TOKEN = "test-token";

let tree = {};
let failGet = false;

function getPath(path) {
  return path.split("/").filter(Boolean).reduce((n, k) => (n == null ? null : n[k]), tree) ?? null;
}
function setPath(path, value) {
  const parts = path.split("/").filter(Boolean);
  const last = parts.pop();
  parts.reduce((n, k) => (n[k] ??= {}), tree)[last] = value;
}

const sent = [];
let now = 1_000_000;

global.fetch = async (url, opts) => {
  if (url.startsWith("https://api.telegram.org")) {
    sent.push(JSON.parse((opts && opts.body) || "{}"));
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  }
  const path = decodeURIComponent(url.split(".firebaseio.com/")[1].replace(/\.json.*$/, ""));
  const method = (opts && opts.method) || "GET";
  if (method === "GET") {
    if (failGet) throw new Error("network down");
    return { ok: true, headers: { get: () => "etag" }, json: async () => getPath(path) };
  }
  if (method === "PUT") { setPath(path, JSON.parse(opts.body)); return { ok: true, json: async () => getPath(path) }; }
  if (method === "PATCH") { setPath(path, { ...(getPath(path) || {}), ...JSON.parse(opts.body) }); return { ok: true, json: async () => getPath(path) }; }
  if (method === "POST") { const k = "k" + Math.random(); setPath(`${path}/${k}`, JSON.parse(opts.body)); return { ok: true, json: async () => ({ name: k }) }; }
  if (method === "DELETE") { return { ok: true, json: async () => null }; }
  throw new Error("unhandled " + method);
};

const realNow = Date.now;
Date.now = () => now;

const { allow, sanitize } = require("../lib/rate-limit");
const notify = require("../api/notify.js");

function fakeReq(body) { return { method: "POST", body }; }
function fakeRes() {
  const r = { code: 200, status(c) { this.code = c; return this; }, end() {} };
  return r;
}

async function main() {
  // 1. Ліміт ріже рівно після max викликів, і вікно згодом відкривається.
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(await allow("k", 5, 60000), true, `виклик ${i + 1} має пройти`);
  }
  assert.strictEqual(await allow("k", 5, 60000), false, "6-й виклик має бути відрізаний");

  now += 59_999;
  assert.strictEqual(await allow("k", 5, 60000), false, "всередині вікна досі заблоковано");
  now += 2;
  assert.strictEqual(await allow("k", 5, 60000), true, "після вікна лічильник скидається");

  // 2. Різні ключі не діляться лічильником — інакше один спамер глушив би всіх.
  assert.strictEqual(await allow("інший", 1, 60000), true);
  assert.strictEqual(await allow("інший", 1, 60000), false);
  assert.strictEqual(await allow("третій", 1, 60000), true, "чужий ключ не має бути зачеплений");

  // 3. Ключі з символами, забороненими в шляхах Firebase, не ламають запис.
  assert.ok(!/[.$#[\]/]/.test(sanitize("a.b$c#d[e]f/g")), "небезпечні символи мають бути прибрані");
  assert.strictEqual(await allow("ping:кто/то.ещё", 1, 60000), true);
  assert.strictEqual(await allow("ping:кто/то.ещё", 1, 60000), false, "санітизований ключ має лишатись стабільним");

  // 4. Недоступна БД не повинна глушити легітимні сповіщення.
  failGet = true;
  assert.strictEqual(await allow("будь-що", 1, 60000), true, "при помилці БД дросель має пропускати");
  failGet = false;

  // 5. Наскрізь через сам ендпоінт: реплей одного й того самого player-ping
  //    не має слати в Telegram більше за ліміт.
  tree = {};
  setPath("users/victim/telegramChatId", 42);
  sent.length = 0;
  for (let i = 0; i < 15; i++) {
    await notify(fakeReq({ type: "player-ping", to: "victim", kind: "clan-chat" }), fakeRes());
  }
  assert.strictEqual(sent.length, 10, `очікували 10 повідомлень (ліміт), отримали ${sent.length}`);

  // 6. Реплей заявки на депозит не має спамити адміна.
  tree = {};
  setPath("bot_config/adminChatId", 999);
  setPath("deposit_requests/req1", { user: "vasya", amount: 500, method: "mono", status: "pending" });
  sent.length = 0;
  for (let i = 0; i < 10; i++) {
    await notify(fakeReq({ type: "deposit", id: "req1" }), fakeRes());
  }
  assert.strictEqual(sent.length, 3, `очікували 3 повідомлення (ліміт ретраїв), отримали ${sent.length}`);

  // 7. Дросель ріже саме повтори, а не різні заявки.
  setPath("deposit_requests/req2", { user: "petya", amount: 700, method: "privat", status: "pending" });
  sent.length = 0;
  await notify(fakeReq({ type: "deposit", id: "req2" }), fakeRes());
  assert.strictEqual(sent.length, 1, "нова заявка має пройти попри вичерпаний ліміт сусідньої");

  Date.now = realNow;
  console.log("OK — дросель notify ріже реплеї, поважає вікно і не глушить різні цілі");
}

main().catch((err) => { Date.now = realNow; console.error("SELFCHECK FAILED:", err.message); process.exit(1); });
