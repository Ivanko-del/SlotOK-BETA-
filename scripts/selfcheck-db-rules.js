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
    user_secrets: { alice: { pass: "pbkdf2$1$aa$bb" } },
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
  assert.strictEqual(await anon.get("user_secrets/alice"), NO, "хеші паролів");
  assert.strictEqual(await anon.put("user_secrets/alice/pass", "x"), NO, "підміна хешу пароля");
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
  await rooms(ns, client(ns, "alice"), client(ns, "bob"), anon);
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
  assert.strictEqual(await alice.get("user_secrets/alice"), NO, "навіть свій хеш браузер не читає");
  assert.strictEqual(await bob.put("user_secrets/alice/pass", "x"), NO, "чужий хеш");
  assert.strictEqual(await bob.put("users/alice/tag", "lol"), NO, "чужий тег");
  assert.strictEqual(await alice.put("users/alice/lastSeen", 5), OK);
  assert.strictEqual(await alice.patch("users/alice", { lastSeen: 6, avatar: "😎" }), OK, "update() кількох полів");
  assert.strictEqual(await alice.put("users/mallory", { balance: 1e9 }), NO, "створення акаунта в обхід сервера");
  assert.strictEqual(await alice.put("users/alice/lastDailyBonus", 0), NO, "скинути таймер щоденного бонусу");
  assert.strictEqual(await alice.put("users/alice/welcomeBackAt", 0), NO, "повторний бонус повернення");
  assert.strictEqual(await alice.put("users/alice/bpClaimed/f50", null), OK, "обнулити нагороди нового сезону");
  assert.strictEqual(await alice.put("users/alice/bpClaimed", { f50: true }), NO, "відмітити нагороду без сервера");
  assert.strictEqual(await alice.put("users/alice/bpBonusClaimed", 0), OK);
  assert.strictEqual(await alice.put("users/alice/bpBonusClaimed", -5), NO, "відкрити скрині вдруге");
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
  const say = (who, key, sender) => who.patch("", { [`lobby_chat/${key}`]: { sender, text: "hi" }, [`chat_rate/${sender}`]: { ".sv": "timestamp" } });
  assert.strictEqual(await say(bob, "m1", "bob"), OK, "повідомлення з міткою часу");
  assert.strictEqual(await say(bob, "m2", "bob"), NO, "друге повідомлення одразу — антиспам");
  assert.strictEqual(await bob.post("lobby_chat", { sender: "bob", text: "hi" }), NO, "без мітки часу");
  const carol = client(ns, "carol"); // не адмін (alice вище стала адміном)
  assert.strictEqual(await say(carol, "m3", "bob"), NO, "від чужого імені");
  assert.strictEqual(await anon.post("lobby_chat", { sender: "bob", text: "hi" }), NO, "анонім у чаті");
  assert.strictEqual(await carol.del("lobby_chat/m1"), NO, "чуже повідомлення не видалити");
  assert.strictEqual(await bob.del("lobby_chat/m1"), OK, "своє — можна");
  await new Promise((r) => setTimeout(r, 2100));
  assert.strictEqual(await say(bob, "m4", "bob"), OK, "через 2 с — знову можна");
  await rooms(ns, alice, bob, anon);
  await feedbackAndPm(ns, owner, bob, carol);
}

// Звернення (feedback), роль support і блокування в ПМ.
async function feedbackAndPm(ns, owner, bob, carol) {
  const dave = client(ns, "dave");
  const fb = (uid, extra = {}) => ({ uid, role: "player", type: "question", subject: "Тема", message: "Текст звернення", contact: "", createdAt: 1, status: "new", ...extra });
  assert.strictEqual(await bob.put("feedback/f1", fb("bob")), OK, "своє звернення");
  assert.strictEqual(await bob.put("feedback/f2", fb("carol")), NO, "звернення від чужого імені");
  assert.strictEqual(await bob.put("feedback/f2", fb("bob", { status: "closed" })), NO, "одразу закрите — ні");
  assert.strictEqual(await bob.put("feedback/f2", fb("bob", { reply: "сам собі" })), NO, "з відповіддю — ні");
  assert.strictEqual(await bob.put("feedback/f2", fb("bob", { type: "hack" })), NO, "невідомий тип");
  assert.strictEqual(await bob.put("feedback/f3", fb("bob", { type: "report", reportedUser: "carol", evidence: ["msg"] })), OK, "скарга на гравця");
  assert.strictEqual(await bob.put("feedback/f4", fb("bob", { imgUrl: "data:image/jpeg;base64,AAAA" })), OK, "зі скріном");
  assert.strictEqual(await bob.put("feedback/f5", fb("bob", { imgUrl: "javascript:alert(1)" })), NO, "скрін — лише data:image");
  assert.strictEqual(await bob.get("feedback", '&orderBy="uid"&equalTo="bob"'), OK, "свої звернення видно запитом");
  assert.strictEqual(await bob.get("feedback/f1"), OK);
  assert.strictEqual(await carol.get("feedback"), NO, "чужі звернення не видно");
  assert.strictEqual(await carol.get("feedback/f1"), NO);
  assert.strictEqual(await bob.patch("feedback/f1", { status: "closed" }), NO, "гравець сам статус не міняє");
  assert.strictEqual(await bob.put("users/bob/role", "support"), NO, "роль собі не видати");
  assert.strictEqual(await owner.put("users/carol/role", "support"), OK, "адмін видає роль support");
  assert.strictEqual(await owner.put("users/dave/role", "god"), NO, "лише відомі ролі");
  assert.strictEqual(await carol.get("feedback"), OK, "support читає всі звернення");
  assert.strictEqual(await carol.patch("feedback/f1", { status: "in_progress", reply: "Дивимось", reply_at: 2, reply_by: "carol" }), OK, "support відповідає");
  assert.strictEqual(await carol.patch("feedback/f1", { reply_by: "theivankoo" }), NO, "відповідь від чужого імені");
  assert.strictEqual(await carol.patch("feedback/f1", { message: "переписано" }), NO, "текст звернення support не міняє");
  assert.strictEqual(await carol.del("feedback/f1"), NO, "support не видаляє");
  assert.strictEqual(await carol.put("users/bob/banned", true), NO, "support — не адмін");

  const pmMsg = (from, to) => ({ from, to, text: "привіт", ts: 1 });
  assert.strictEqual(await dave.post("pm/bob", pmMsg("dave", "bob")), OK, "ПМ іншому гравцю");
  assert.strictEqual(await bob.put("users/bob/blocked/dave", 1), OK, "заблокувати");
  assert.strictEqual(await dave.post("pm/bob", pmMsg("dave", "bob")), NO, "заблокований не пише");
  assert.strictEqual(await dave.post("pm/dave", pmMsg("dave", "bob")), OK, "свою копію — можна");
  assert.strictEqual(await carol.post("pm/bob", pmMsg("carol", "bob")), OK, "інші — пишуть");
}

// Онлайн-кімнати: пише лише сервер; приватне бачить лише власник; повний стан — ніхто.
async function rooms(ns, alice, bob, anon) {
  const admin = client(ns, "admin");
  await admin.put("rooms/rps/r1", { status: "waiting", bet: 10 });
  await admin.put("room_private/r1/alice", { ver: 1, v: "{}" });
  await admin.put("room_state/r1", { j: "{}" });
  assert.strictEqual(await alice.get("rooms/rps/r1"), OK, "лобі кімнат видно");
  assert.strictEqual(await alice.put("rooms/rps/r1/status", "finished"), NO, "кімнату міняє лише сервер");
  assert.strictEqual(await alice.post("rooms/rps", { status: "waiting" }), NO, "фальшиву кімнату не створити");
  assert.strictEqual(await alice.get("room_private/r1/alice"), OK, "своє приватне видно");
  assert.strictEqual(await bob.get("room_private/r1/alice"), NO, "чуже приватне — ні");
  assert.strictEqual(await anon.get("room_private/r1/alice"), NO);
  assert.strictEqual(await alice.put("room_private/r1/alice", { ver: 9 }), NO);
  assert.strictEqual(await alice.get("room_state/r1"), NO, "повний стан (міни, флоти) — лише сервер");
  assert.strictEqual(await alice.put("minesweeper_records/easy/alice", { t: 12.5, at: 1 }), OK, "свій рекорд");
  assert.strictEqual(await alice.put("minesweeper_records/easy/bob", { t: 1, at: 1 }), NO, "чужий рекорд");
  assert.strictEqual(await alice.put("minesweeper_records/easy/alice", { t: -1 }), NO, "дурний час");
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
