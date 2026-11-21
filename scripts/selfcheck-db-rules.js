// Self-check правил бази: node scripts/selfcheck-db-rules.js
//
// Піднімає справжній емулятор Firebase Realtime Database (той самий рушій
// правил, що й у проді), завантажує database.rules.json (єдина версія правил)
// і проганяє сценарії атак та звичайних дій гравця: без входу не читається й
// не пишеться нічого приватного, гравець A не лізе в дані гравця B, а звичайні
// дії (вхід, гра, чат, ПМ, кімнати, рейтинг) проходять.
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
    user_private: { alice: { email: "a@x.ua", lastIpHash: "abc123", telegramChatId: 111 } },
    ip_index: { abc123: { alice: 1 }, zzz999: { carol: 1 } },
    sport_bets: { s1: { userId: "alice", amount: 40, status: "pending", odds: 2 }, s2: { userId: "bob", amount: 10, status: "pending", odds: 2 } },
    telegram_links: { 111: "alice" },
    deposit_requests: { d1: { user: "alice", amount: 100, status: "pending" }, d2: { user: "bob", amount: 5, status: "pending" } },
    support_chats: { alice: { m1: { sender: "user", text: "hi" } } },
    pm: { alice: { p1: { from: "bob", to: "alice", text: "секрет", ts: 1 } } },
    withdraw_requests: { w1: { user: "alice", amount: 10, status: "pending" } },
    password_reset_requests: { r1: { user: "alice", status: "pending", time: 1 } },
    feedback: { f0: { uid: "alice", role: "player", type: "question", message: "x", createdAt: 1, status: "new" } },
    admin_notes: { alice: { text: "підозра", updatedBy: "theivankoo" } },
    anti_cheat_flags: { alice: { x1: { type: "multi", ts: 1 } } },
    admin_action_log: { e1: { by: "theivankoo", action: "ban" } },
    promos: { SUMMER: { value: 100, uses: 5 } },
    win_feed: { w1: { user: "alice", game: "slots", amount: 50, time: 1 } },
    casino_stats: { totalWagered: 1000 },
    jackpot: { amount: 500 },
    leaderboards: { d1: { alice: { wins: 1 } } },
    tournaments: { t1: { name: "Т", prize: 10 } },
    tournament_scores: { t1: { alice: 3 } },
    lottery: { w1: { pool: 100, tickets: { k1: { user: "alice", ts: 1 } } } },
    online: { alice: true },
    clans: { c1: { name: "Клан", members: { alice: true } } },
    mp_rooms: { r1: { host: "alice" } },
    site_config: { maintenance: false },
    global_chat: { g1: { user: "alice", text: "hi", ts: 1 } },
  }), 200);
}

const OK = 200, NO = 401;

async function strict() {
  const ns = "strict";
  await loadRules(ns, "database.rules.json");
  await seed(ns);
  await closedByDefault(ns);
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

  // ── Приватні поля профілю: user_private/<нік> ──
  assert.strictEqual(await alice.get("user_private/alice"), OK, "власник читає свої приватні поля");
  assert.strictEqual(await bob.get("user_private/alice"), NO, "чужий не читає email/IP/Telegram");
  assert.strictEqual(await anon.get("user_private/alice"), NO, "анонім не читає приватні поля");
  assert.strictEqual(await bob.get("user_private"), NO, "список усіх приватних вузлів");
  assert.strictEqual(await bob.put("user_private/alice/email", "evil@x.ua"), NO, "чужий не пише в приватні поля");
  assert.strictEqual(await alice.put("user_private/alice/email", "new@x.ua"), OK, "власник міняє свій email");
  assert.strictEqual(await alice.put("user_private/alice/email", '<img src=x onerror=1>'), NO, "XSS в email");
  assert.strictEqual(await owner.get("user_private/alice"), OK, "адмін читає (як інші адмінські вузли)");
  assert.strictEqual(await alice.put("users/alice/email", "x@y.ua"), NO, "email більше не пишемо в публічний users/");
  assert.strictEqual(await alice.put("users/alice/lastIpHash", "deadbeef"), NO, "хеш IP більше не пишемо в публічний users/");
  assert.strictEqual(await alice.del("users/alice/email"), OK, "міграція: прибрати старе поле можна");
  assert.strictEqual(await alice.del("users/alice/lastIpHash"), OK, "міграція: прибрати старе поле можна");
  // Індекс IP-хешів: бакет читає лише той, чий це хеш.
  assert.strictEqual(await alice.get("ip_index/abc123"), OK, "власник хешу читає свій бакет");
  assert.strictEqual(await bob.get("ip_index/abc123"), NO, "чужий не читає бакет чужого IP-хешу");
  assert.strictEqual(await alice.get("ip_index"), NO, "увесь індекс не читається");
  assert.strictEqual(await bob.put("ip_index/abc123/bob", 5), OK, "кожен пише лише свій нік");
  assert.strictEqual(await bob.put("ip_index/abc123/alice", 5), NO, "не можна дописати чужий нік");
  // Спорт прибрано: нових ставок нема, власник може лише повернути СВОЮ відкриту.
  assert.strictEqual(await bob.post("sport_bets", { userId: "bob", amount: 999, status: "pending" }), NO, "нові спорт-ставки не пишуться");
  assert.strictEqual(await alice.put("sport_bets/s1/status", "won"), NO, "виграш не пишеться");
  assert.strictEqual(await alice.put("sport_bets/s2/status", "refunded"), NO, "чужу ставку не повертаємо");
  assert.strictEqual(await alice.put("sport_bets/s1/amount", 99999), NO, "сума ставки незмінна");
  assert.strictEqual(await alice.put("sport_bets/s1/status", "refunded"), OK, "власник повертає свою відкриту ставку");
  assert.strictEqual(await alice.put("sport_bets/s1/status", "pending"), NO, "повернену ставку не відкрити знову");
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

  // Магазин Слотіків: Слотіки, куплене й предмети — лише сервер; що надіто — сам гравець
  assert.strictEqual(await bob.put("users/bob/slotiky", 999), NO, "Слотіки собі не намалювати");
  assert.strictEqual(await bob.put("users/bob/slotikyItems/monthly_pass", { expires: 9e12 }), NO, "буст собі не видати");
  assert.strictEqual(await bob.put("users/bob/lootboxInv/legend", 5), NO, "скрині собі не видати");
  assert.strictEqual(await bob.put("users/bob/cosmetics/frame", "avatar_gold"), OK, "надіти рамку");
  assert.strictEqual(await bob.put("users/bob/cosmetics/badge", false), OK, "зняти значок");
  assert.strictEqual(await bob.put("users/bob/cosmetics/frame", "<img>"), NO);
  assert.strictEqual(await bob.put("users/carol/cosmetics/frame", "avatar_gold"), NO, "чуже — ні");
}

// Без входу: майже нічого не читається і нічого не пишеться; гравець B не
// читає й не пише приватне гравця A; звичайні ігрові дії проходять.
async function closedByDefault(ns) {
  const anon = client(ns, null);
  const alice = client(ns, "alice");
  const bob = client(ns, "bob");
  const owner = client(ns, "theivankoo");

  // ── Аноним: читання ──
  const privateForAnon = [
    "", "users", "users/alice", "users/alice/pass", "users/alice/balance", "user_secrets", "user_secrets/alice",
    "user_private", "user_private/alice", "pm", "pm/alice", "support_chats", "support_chats/alice",
    "ip_index", "ip_index/abc123", "deposit_requests", "withdraw_requests", "password_reset_requests",
    "feedback", "feedback/f0", "admin_notes", "anti_cheat_flags", "admin_action_log", "promos", "promos/SUMMER",
    "bot_config", "telegram_links", "lobby_chat", "global_chat", "clan_chats", "online", "clans", "mp_rooms",
    "jackpot", "leaderboards", "tournaments", "tournament_scores", "lottery", "site_config", "settings",
    "admin_settings", "announcement", "changelog", "casino_news", "rooms", "league_pub/s1", "sport_bets",
  ];
  for (const p of privateForAnon) assert.strictEqual(await anon.get(p), NO, `анонім не читає /${p}`);
  // Публічне лише для екрана входу: стрічка виграшів і загальна сума ставок.
  assert.strictEqual(await anon.get("win_feed"), OK, "стрічка виграшів на екрані входу");
  assert.strictEqual(await anon.get("casino_stats"), OK, "сума ставок на екрані входу");

  // ── Аноним: запис будь-куди ──
  const anonWrites = {
    "users/alice/balance": 1e9, "users/alice/avatar": "x", "users/eve": { balance: 1 }, "user_secrets/alice/pass": "x",
    "user_private/alice/email": "a@b.c", "pm/alice/z": { from: "eve", to: "alice", text: "x", ts: 1 },
    "support_chats/alice/z": { sender: "eve", text: "x" }, "ip_index/abc123/eve": 1,
    "deposit_requests/z": { user: "alice", amount: 1, status: "pending" }, "withdraw_requests/z": { user: "alice", amount: 1 },
    "password_reset_requests/z": { user: "alice", status: "pending", time: 1 },
    "feedback/z": { uid: "alice", type: "question", message: "x", createdAt: 1, status: "new" },
    "lobby_chat/z": { sender: "eve", text: "x" }, "global_chat/z": { user: "eve", text: "x" }, "clan_chats/c1/z": { user: "eve", text: "x" },
    "casino_news/z": { text: "x" }, "site_config/maintenance": true, "settings/x": 1, "admin_settings/rtp": 1,
    "announcement": "x", "changelog/z": { version: "1" }, "promos/FREE": { value: 1e6 }, "admin_notes/alice": { text: "x" },
    "anti_cheat_flags/alice/z": { type: "x" }, "jackpot/amount": 1e9, "lottery/w1/pool": 1e9, "leaderboards/d1/eve": { wins: 1 },
    "tournaments/z": { name: "x" }, "tournament_scores/t1/eve": 1, "mp_rooms/z": { host: "eve" }, "card_rooms/z": { a: 1 },
    "pvp_rps/z": { a: 1 }, "pvp_chess/z": { a: 1 }, "pvp_coinflip/z": { a: 1 }, "pvp_predict/z": { a: 1 },
    "clans/z": { name: "x" }, "online/alice": true, "investPool/total": 1, "p2p_loans/z": { a: 1 }, "global_roulette/z": { a: 1 },
    "casino_stats/totalWagered": 0, "casino_events/x": { a: 1 }, "win_feed/z": { user: "eve", amount: 1 }, "chat_meta/lastClear": 1,
    "chat_rate/eve": { ".sv": "timestamp" }, "leaderboard_weekly/eve": { rank: 1 }, "lottery_history/z": { winner: "eve" },
    "telegram_link_tokens/z": { nick: "alice", createdAt: 1 }, "minesweeper_records/easy/alice": { t: 1 },
  };
  for (const [p, val] of Object.entries(anonWrites)) assert.strictEqual(await anon.put(p, val), NO, `анонім не пише в /${p}`);
  assert.strictEqual(await anon.del("telegram_links/111"), NO, "анонім не відв'язує чужий Telegram");
  assert.strictEqual(await anon.del("win_feed/w1"), NO, "анонім не стирає стрічку");

  // ── Гравець B проти гравця A ──
  assert.strictEqual(await bob.get("users/alice"), OK, "профіль іншого гравця видно залогіненим");
  assert.strictEqual(await bob.get("pm/alice"), NO, "чужі ПМ не читаються");
  assert.strictEqual(await bob.get("pm"), NO, "усі ПМ не читаються");
  assert.strictEqual(await alice.get("pm/alice"), OK, "свої ПМ читаються");
  assert.strictEqual(await bob.get("support_chats"), NO, "усі чати підтримки — лише адмін");
  assert.strictEqual(await bob.get("withdraw_requests"), NO);
  assert.strictEqual(await bob.get("password_reset_requests"), NO);
  assert.strictEqual(await alice.get("password_reset_requests/r1"), OK, "свою заявку видно");
  assert.strictEqual(await bob.get("password_reset_requests/r1"), NO, "чужу — ні");
  assert.strictEqual(await alice.put("password_reset_requests/r2", { user: "alice", status: "pending", time: 2 }), NO, "заявку на скидання створює лише сервер");
  assert.strictEqual(await bob.get("feedback/f0"), NO);
  assert.strictEqual(await bob.get("admin_notes"), NO, "нотатки адміна");
  assert.strictEqual(await bob.get("anti_cheat_flags"), NO, "прапорці античиту");
  assert.strictEqual(await bob.get("admin_action_log"), NO, "журнал адміна");
  assert.strictEqual(await bob.get("promos"), NO, "список промокодів");
  assert.strictEqual(await bob.get("promos/SUMMER"), OK, "перевірка конкретного коду");
  assert.strictEqual(await bob.get("user_secrets/bob"), NO, "навіть свій хеш браузер не читає");
  assert.strictEqual(await owner.get("user_secrets/alice"), NO, "і адмін теж");
  assert.strictEqual(await owner.put("user_secrets/alice/pass", "pbkdf2$1$aa$cc"), NO, "адмін не пише хеш у браузері");
  assert.strictEqual(await owner.put("users/alice/pass", "pbkdf2$1$aa$cc"), NO, "пароль у публічному users/ не пише ніхто");
  assert.strictEqual(await owner.put("users/alice/securityAnswerHash", "x"), NO);
  assert.strictEqual(await alice.put("users/alice/birthDate", "2000-01-01"), NO, "дата народження — не в users/");
  assert.strictEqual(await alice.put("users/alice/securityLog/x", { type: "login", ts: 1 }), NO, "журнал безпеки — не в users/");
  assert.strictEqual(await alice.post("user_private/alice/securityLog", { type: "login", details: "IP: 1.2.x.x", ts: 1, ua: "UA" }), OK, "журнал безпеки — у приватному вузлі");
  assert.strictEqual(await bob.get("user_private/alice/securityLog"), NO, "чужий журнал безпеки");
  assert.strictEqual(await bob.put("users/alice/avatar", "😈"), NO, "чужа аватарка");
  assert.strictEqual(await bob.put("online/alice", null), NO, "зняти чужий онлайн");
  assert.strictEqual(await bob.put("leaderboards/d1/alice", { wins: 99 }), NO, "чужий рядок рейтингу");
  assert.strictEqual(await bob.put("tournament_scores/t1/alice", 0), NO, "чужі бали турніру");
  assert.strictEqual(await bob.put("lottery/w1/tickets/k9", { user: "alice", ts: 1 }), NO, "квиток на чуже ім'я");
  assert.strictEqual(await bob.put("lottery/w1/pool", 0), NO, "обнулити пул лотереї");
  assert.strictEqual(await bob.put("jackpot/amount", 0), NO, "обнулити джекпот");
  assert.strictEqual(await bob.put("investPool/investors/alice", { amount: 0 }), NO, "чужий внесок в інвест-пул");
  assert.strictEqual(await bob.post("win_feed", { user: "alice", game: "slots", amount: 1e9, time: 2 }), NO, "фальшивий виграш від чужого імені");
  assert.strictEqual(await bob.del("win_feed/w1"), NO, "чужий запис стрічки");
  assert.strictEqual(await bob.post("pm/alice", { from: "🏦 SlotOK", to: "alice", text: "фішинг", ts: 1 }), NO, "службове ПМ від імені SlotOK гравцю");
  assert.strictEqual(await bob.del("pm/alice/p1"), NO, "стерти чуже ПМ");
  assert.strictEqual(await bob.post("pm/theivankoo", { from: "📥 Система", to: "theivankoo", text: "Нова заявка", ts: 1 }), OK, "службове ПМ адміну (заявка на донат)");
  assert.strictEqual(await bob.post("clan_chats/c1", { user: "alice", text: "x", ts: 1 }), NO, "клан-чат від чужого імені");
  for (const p of ["site_config/maintenance", "settings/autoWipe", "admin_settings/rtp", "announcement", "changelog/z", "promos/FREE", "casino_events/double_winnings", "tournaments/t2", "casino_stats/totalWagered", "chat_meta/lastClear", "leaderboard_weekly/bob", "lottery_history/z", "p2p_loans/z", "global_roulette/z", "live_bets/z"]) {
    assert.strictEqual(await bob.put(p, { x: 1 }), NO, `адмінський/серверний вузол /${p}`);
  }
  assert.strictEqual(await bob.put("casino_news/z", { text: "x" }), NO, "новину пише лише адмін");

  // ── Звичайна гра ──
  assert.strictEqual(await bob.get("users"), OK, "рейтинги з users (залогінений)");
  assert.strictEqual(await bob.get("users", '&orderBy="totalWins"&limitToLast=10'), OK, "топ гравців");
  assert.strictEqual(await bob.put("online/bob", true), OK, "свій онлайн");
  assert.strictEqual(await bob.del("online/bob"), OK);
  assert.strictEqual(await bob.get("online"), OK);
  assert.strictEqual(await bob.put("leaderboards/d1/bob/wins", { ".sv": { increment: 1 } }), OK, "свій рядок рейтингу");
  assert.strictEqual(await bob.get("leaderboards/d1"), OK);
  assert.strictEqual(await bob.put("tournament_scores/t1/bob", 0), OK, "вступ у турнір");
  assert.strictEqual(await bob.get("tournaments"), OK);
  assert.strictEqual(await bob.put("lottery/w1/tickets/k2", { user: "bob", ts: 2 }), OK, "свій квиток");
  assert.strictEqual(await bob.put("lottery/w1/pool", { ".sv": { increment: 80 } }), OK, "пул лотереї росте");
  assert.strictEqual(await bob.put("jackpot/amount", { ".sv": { increment: 1 } }), OK, "внесок у джекпот");
  assert.strictEqual(await owner.put("jackpot/amount", 0), OK, "виплата джекпоту адміном");
  assert.strictEqual(await bob.patch("", { "investPool/total": { ".sv": { increment: 10 } }, "investPool/investors/bob/amount": { ".sv": { increment: 10 } } }), OK, "інвест-пул");
  assert.strictEqual(await bob.post("win_feed", { user: "bob", game: "slots", amount: 10, time: 3 }), OK, "свій виграш у стрічку");
  assert.strictEqual(await bob.post("clan_chats/c1", { user: "bob", text: "привіт", ts: 1 }), OK, "клан-чат");
  assert.strictEqual(await bob.get("clan_chats/c1"), OK);
  assert.strictEqual(await bob.put("clans/c1/members/bob", true), OK, "вступ у клан (поки на клієнті)");
  assert.strictEqual(await bob.put("mp_rooms/r1/guest", "bob"), OK, "мультиплеєр-кімната (поки на клієнті)");
  assert.strictEqual(await bob.get("site_config"), OK, "налаштування сайту — залогіненим");
  assert.strictEqual(await bob.get("global_chat"), OK);
  assert.strictEqual(await bob.put("casino_news/n1/reactions/like", { ".sv": { increment: 1 } }), OK, "реакція на новину");
  assert.strictEqual(await bob.put("casino_news/n1/reactions/like", 0), NO, "обнулити реакції");
  assert.strictEqual(await owner.put("site_config/maintenance", true), OK, "адмін вмикає техобслуговування");
  assert.strictEqual(await owner.get("support_chats"), OK, "адмін бачить звернення в підтримку");
  assert.strictEqual(await owner.get("pm/alice"), OK, "адмін бачить ПМ (модерація)");
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
  // Друзі: свої списки бачить лише власник, писати може лише сервер.
  await admin.put("friends/alice/bob", { since: 1 });
  await admin.put("friend_requests/alice/carol", { at: 1 });
  await admin.put("room_invites/alice/r1", { from: "bob" });
  for (const n of ["friends", "friend_requests"]) {
    const k = n === "friends" ? "bob" : "carol";
    assert.strictEqual(await alice.get(`${n}/alice`), OK, `${n}: свій список видно`);
    assert.strictEqual(await bob.get(`${n}/alice`), NO, `${n}: чужий — ні`);
    assert.strictEqual(await anon.get(`${n}/alice`), NO);
    assert.strictEqual(await alice.put(`${n}/alice/${k}x`, { at: 1 }), NO, `${n}: писати лише серверу`);
    assert.strictEqual(await bob.put(`${n}/bob/alice`, { at: 1 }), NO);
  }
  assert.strictEqual(await alice.get("room_invites/alice"), OK, "свої запрошення видно");
  assert.strictEqual(await bob.get("room_invites/alice"), NO, "чужі запрошення — ні");
  assert.strictEqual(await bob.put("room_invites/alice/r2", { from: "bob" }), NO, "запрошення пише лише сервер");
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
    await strict();
    console.log("OK — правила бази закриті за замовчуванням, відбивають атаки й пропускають звичайні дії");
  } finally {
    proc.kill();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
