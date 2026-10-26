// Self-check правил бази: node scripts/selfcheck-db-rules.js
//
// Піднімає справжній емулятор Firebase Realtime Database (той самий рушій
// правил, що й у проді), завантажує database.rules.json і
// database.rules.strict.json і проганяє сценарії атак та звичайних дій гравця.
//
// Потрібні Java і jar емулятора (ставиться командою
// `npx firebase-tools setup:emulators:database`). Шлях до jar можна задати
// через FIREBASE_DB_EMULATOR_JAR. Якщо емулятора немає — тест чесно пише SKIP
// і завершується успішно (у CI він ставиться окремим кроком, див. .github/workflows/ci.yml).

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 9123;
const BASE = `http://127.0.0.1:${PORT}`;

function findJar() {
  if (process.env.FIREBASE_DB_EMULATOR_JAR) return process.env.FIREBASE_DB_EMULATOR_JAR;
  const dir = path.join(os.homedir(), ".cache", "firebase", "emulators");
  if (!fs.existsSync(dir)) return null;
  const jar = fs.readdirSync(dir).filter((f) => /^firebase-database-emulator.*\.jar$/.test(f)).sort().pop();
  return jar ? path.join(dir, jar) : null;
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
// Емулятор не перевіряє підпис — досить непідписаного JWT з потрібним uid.
const tokenFor = (uid, ns) =>
  `${b64({ alg: "none", typ: "JWT" })}.${b64({ uid, sub: uid, user_id: uid, aud: ns, iss: `https://securetoken.google.com/${ns}`, iat: 1700000000, exp: 4000000000 })}.`;

function client(ns, who) {
  // Будь-який Bearer емулятор вважає адміном, тож гравця передаємо як ?auth=.
  const headers = { "Content-Type": "application/json" };
  if (who === "admin") headers.Authorization = "Bearer owner";
  const auth = who && who !== "admin" ? `&auth=${tokenFor(who, ns)}` : "";
  const url = (p, q = "") => `${BASE}/${p}.json?ns=${ns}${auth}${q}`;
  const call = async (method, p, body, q) => {
    const res = await fetch(url(p, q), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return res.status;
  };
  return {
    get: (p, q) => call("GET", p, undefined, q),
    put: (p, v) => call("PUT", p, v),
    patch: (p, v) => call("PATCH", p, v),
    post: (p, v) => call("POST", p, v),
    del: (p) => call("DELETE", p),
  };
}

async function loadRules(ns, file) {
  const rules = fs.readFileSync(path.join(ROOT, file), "utf8");
  const res = await fetch(`${BASE}/.settings/rules.json?ns=${ns}`, { method: "PUT", headers: { Authorization: "Bearer owner" }, body: rules });
  const text = await res.text();
  assert.strictEqual(res.status, 200, `${file} не прийнято емулятором: ${text}`);
}

async function seed(ns) {
  const admin = client(ns, "admin");
  assert.strictEqual(await admin.put("", {
    users: {
      alice: { balance: 100, pass: "pbkdf2$1$aa$bb", avatar: "👤" },
      bob: { balance: 50, pass: "pbkdf2$1$aa$bb" },
      theivankoo: { balance: 0 },
    },
    bot_config: { adminChatId: 1 },
    telegram_links: { 111: "alice" },
    deposit_requests: { d1: { user: "alice", amount: 100, status: "pending" }, d2: { user: "bob", amount: 5, status: "pending" } },
    support_chats: { alice: { m1: { sender: "user", text: "hi" } } },
  }), 200);
}

const OK = 200, NO = 401;

async function phase1() {
  const ns = "phase1";
  await loadRules(ns, "database.rules.json");
  await seed(ns);
  const anon = client(ns, null);

  assert.strictEqual(await anon.get(""), NO, "корінь бази не має читатись");
  assert.strictEqual(await anon.get("users"), OK, "users читається (поки клієнт без Auth)");
  assert.strictEqual(await anon.get("bot_config"), NO, "bot_config — лише сервер");
  assert.strictEqual(await anon.put("bot_config/adminChatId", 666), NO, "підміна адмін-чату бота");
  assert.strictEqual(await anon.put("telegram_links/999", "alice"), NO, "прив'язка чужого Telegram");
  assert.strictEqual(await anon.del("telegram_links/111"), OK, "відв'язати можна");
  assert.strictEqual(await anon.put("notify_rate/x", { n: 0 }), NO, "скидання лімітів");
  assert.strictEqual(await anon.put("users", {}), NO, "стерти всіх гравців одним записом");
  assert.strictEqual(await anon.del("deposit_requests"), NO, "стерти колекцію заявок");

  assert.strictEqual(await anon.put("users/alice/balance", 150), OK);
  assert.strictEqual(await anon.put("users/alice/balance", -10), NO, "баланс у мінус");
  assert.strictEqual(await anon.put("users/alice/balance", "1e9"), NO, "баланс рядком");
  assert.strictEqual(await anon.put("users/alice/avatarUrl", 'x" onerror="alert(1)'), NO, "XSS в avatarUrl");
  assert.strictEqual(await anon.put("users/alice/avatarUrl", "javascript:alert(1)"), NO, "javascript: URL");
  assert.strictEqual(await anon.put("users/alice/avatarUrl", "https://i.imgur.com/a.png"), OK);
  assert.strictEqual(await anon.put("users/alice/avatar", "data:image/png;base64,iVBORw0KGgo="), OK);
  assert.strictEqual(await anon.put("users/alice/lastIP", "1.2.3.4"), NO, "відкрита IP");
  assert.strictEqual(await anon.put("users/<img src=x>", { balance: 1 }), NO, "нік з HTML");
  assert.strictEqual(await anon.put("users/newbie", { balance: 1000 }), OK, "звичайна реєстрація (фаза 1)");

  assert.strictEqual(await anon.post("lobby_chat", { sender: "alice", text: "<3 привіт", time: 1 }), OK);
  assert.strictEqual(await anon.post("lobby_chat", { sender: "alice", text: "x", avatarUrl: "x' onerror='a" }), NO, "XSS в чаті");
  assert.strictEqual(await anon.post("lobby_chat", { sender: '"><svg onload=1>', text: "x" }), NO, "XSS у ніку чату");
  assert.strictEqual(await anon.del("lobby_chat"), OK, "авто-очищення чату адміном (фаза 1 — ще без Auth)");

  assert.strictEqual(await anon.put("telegram_link_tokens/t1", { nick: "alice", createdAt: 1 }), OK);
  assert.strictEqual(await anon.put("telegram_link_tokens/t1", { nick: "bob", createdAt: 2 }), NO, "перезапис чужого токена");
}

async function strict() {
  const ns = "strict";
  await loadRules(ns, "database.rules.strict.json");
  await seed(ns);
  const anon = client(ns, null);
  const alice = client(ns, "alice");
  const bob = client(ns, "bob");
  const owner = client(ns, "theivankoo");

  assert.strictEqual(await anon.put("users/alice/balance", 1e6), NO, "анонім не пише в баланс");
  assert.strictEqual(await bob.put("users/alice/balance", 0), NO, "чужий не зменшує баланс");
  assert.strictEqual(await bob.put("users/alice/balance", 130), OK, "чужий може зарахувати виграш/переказ");
  assert.strictEqual(await alice.put("users/alice/balance", 20), OK, "власник списує ставку");
  assert.strictEqual(await alice.put("users/alice/isAdmin", true), NO, "самопризначення адміном");
  assert.strictEqual(await alice.put("users/alice/banned", false), NO, "самозняття бану");
  assert.strictEqual(await alice.put("users/alice/pass", "x"), NO, "пароль міняє лише сервер");
  assert.strictEqual(await bob.put("users/alice/tag", "lol"), NO, "чужий тег");
  assert.strictEqual(await alice.put("users/alice/lastSeen", 5), OK);
  assert.strictEqual(await alice.patch("users/alice", { lastSeen: 6, avatar: "😎" }), OK, "update() кількох полів");
  assert.strictEqual(await alice.put("users/mallory", { balance: 1e9 }), NO, "створення акаунта в обхід сервера");
  assert.strictEqual(await owner.put("users/alice/isAdmin", true), OK, "власник сайту призначає адміна");
  assert.strictEqual(await alice.put("users/bob/banned", true), OK, "новий адмін банить");
  assert.strictEqual(await bob.post("users/alice/history", { text: "PvP" }), OK, "запис в історію суперника");

  assert.strictEqual(await bob.get("deposit_requests"), NO, "чужі заявки не видно");
  assert.strictEqual(await bob.get("deposit_requests", '&orderBy="user"&equalTo="bob"'), OK, "свої заявки видно запитом");
  assert.strictEqual(await bob.get("deposit_requests", '&orderBy="user"&equalTo="alice"'), NO, "чужі заявки запитом");
  assert.strictEqual(await bob.put("deposit_requests/d3", { user: "alice", amount: 1, status: "pending" }), NO, "заявка від чужого імені");
  assert.strictEqual(await bob.put("deposit_requests/d3", { user: "bob", amount: 1, status: "pending" }), OK);
  assert.strictEqual(await bob.patch("deposit_requests/d2", { status: "approved" }), NO, "сам собі підтвердив");
  assert.strictEqual(await bob.patch("deposit_requests/d2", { status: "cancelled" }), OK, "скасувати свою можна");

  assert.strictEqual(await bob.get("support_chats/alice"), NO, "чужа підтримка");
  assert.strictEqual(await alice.get("support_chats/alice"), OK);
  assert.strictEqual(await bob.put("telegram_link_tokens/t9", { nick: "alice", createdAt: 1 }), NO, "токен прив'язки на чужий нік");
  assert.strictEqual(await alice.put("telegram_link_tokens/t9", { nick: "alice", createdAt: 1 }), OK);
  assert.strictEqual(await bob.post("lobby_chat", { sender: "bob", text: "hi" }), OK);
  assert.strictEqual(await anon.post("lobby_chat", { sender: "bob", text: "hi" }), NO, "анонім у чаті");
}

(async () => {
  const jar = findJar();
  if (!jar) {
    console.log("SKIP — емулятор бази не знайдено (npx firebase-tools setup:emulators:database)");
    return;
  }
  const proc = spawn("java", ["-jar", jar, "--port", String(PORT)], { stdio: "ignore" });
  try {
    for (let i = 0; ; i++) {
      try { await fetch(`${BASE}/.json?ns=ping`); break; } catch {
        if (i > 60) throw new Error("емулятор не стартував");
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    await phase1();
    await strict();
    console.log("OK — правила бази: фаза 1 і строгий режим відбивають атаки й пропускають звичайні дії");
  } finally {
    proc.kill();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
