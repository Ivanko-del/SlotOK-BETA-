// Self-check для api/reward.js і lib/progress.js. Запуск: node scripts/selfcheck-reward-api.js
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
global.fetch = async (url, opts = {}) => {
  if (url === "https://oauth2.googleapis.com/token") return { ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) };
  const u = new URL(url);
  const p = decodeURIComponent(u.pathname.replace(/\.json$/, ""));
  const method = opts.method || "GET";
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
const reward = require("../api/reward.js");
const play = require("../api/play.js");
const R = require("../shared/rewards");
const SH = require("../shared/shop");
const { recordWager } = require("../lib/progress");
const { _resetRateLimitForTests } = require("../lib/player");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function idToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "RS256", kid: "kid1", typ: "JWT" });
  const p = b64({ sub: uid, aud: "nye-slotok", iss: "https://securetoken.google.com/nye-slotok", iat: now - 10, auth_time: now - 10, exp: now + 3600 });
  return `${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), googleKey).toString("base64url")}`;
}
function call(handler, nick, body) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(d) { resolve({ status: this.statusCode, data: d }); },
      end() { resolve({ status: this.statusCode, data: null }); },
    };
    handler({ method: "POST", headers: { authorization: nick ? "Bearer " + idToken(nick) : "" }, body }, res);
  });
}
// Ліміт частоти (20 за 10 с) тут не перевіряємо — скидаємо перед кожним запитом.
const claim = (nick, action, extra = {}) => { _resetRateLimitForTests(); return call(reward, nick, { action, ...extra }); };
const user = (nick) => tree.users[nick];
const HOUR = 3600000, DAY = 24 * HOUR;
const season = R.getBpSeasonInfo().num;

(async () => {
  // ── доступ ──
  tree = { users: { alice: { balance: 0 } } };
  assert.strictEqual((await claim(null, "daily")).status, 401, "без токена");
  assert.strictEqual((await claim("alice", "steal")).status, 400, "невідома дія");
  assert.strictEqual((await claim("alice", "constructor")).status, 400, "дія з прототипу");
  tree.users.alice.banned = true;
  assert.strictEqual((await claim("alice", "daily")).status, 403, "бан");
  assert.strictEqual(user("alice").balance, 0);

  // ── щоденний бонус ──
  tree = { users: { alice: { balance: 0 } } };
  let r = await claim("alice", "daily", { amount: 1e9 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.amount, R.DAILY_BONUSES[0], "сума з тіла запиту ігнорується");
  assert.strictEqual(user("alice").balance, R.DAILY_BONUSES[0]);
  assert.strictEqual(user("alice").dailyStreak, 1);
  assert.strictEqual((await claim("alice", "daily")).status, 409, "вдруге за добу — ні");
  assert.strictEqual(user("alice").balance, R.DAILY_BONUSES[0]);

  // Паралельні запити: платить рівно один.
  tree = { users: { alice: { balance: 0 } } };
  const many = await Promise.all(Array.from({ length: 6 }, () => claim("alice", "daily")));
  assert.strictEqual(many.filter((x) => x.status === 200).length, 1, "паралельні щоденні бонуси");
  assert.strictEqual(user("alice").balance, R.DAILY_BONUSES[0]);

  // VIP-множник і 7-й день серії.
  tree = { users: { alice: { balance: 0, totalWagered: 25000, dailyStreak: 6, lastDailyBonus: Date.now() - DAY - 1 } } };
  r = await claim("alice", "daily");
  const gold = R.getVipLevel(25000);
  assert.strictEqual(r.data.amount, Math.floor(R.DAILY_BONUSES[6] * gold.dailyMult));
  assert.strictEqual(r.data.streakBonus, R.STREAK_7_BONUS);
  assert.strictEqual(user("alice").balance, r.data.amount + R.STREAK_7_BONUS);
  assert.strictEqual(user("alice").dailyStreak, 0, "після 7-го дня серія починається знову");

  // ── погодинний ──
  tree = { users: { alice: { balance: 0, totalWagered: 5000, lastHourlyBonus: Date.now() - HOUR + 60000 } } };
  assert.strictEqual((await claim("alice", "hourly")).status, 409, "ще не минула година");
  tree.users.alice.lastHourlyBonus = Date.now() - HOUR - 1;
  r = await claim("alice", "hourly");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(user("alice").balance, R.getVipLevel(5000).hourly);
  assert.strictEqual(Object.values(user("alice").hourlyHistory).length, 1);

  // ── кешбек ──
  tree = { users: { alice: { balance: 0, cashbackPending: R.CASHBACK_MIN_CLAIM - 1 } } };
  assert.strictEqual((await claim("alice", "cashback")).status, 409, "менше мінімуму");
  tree.users.alice.cashbackPending = 2500;
  tree.users.alice.cashbackWeekUsed = 2500;
  const cb = await Promise.all([claim("alice", "cashback"), claim("alice", "cashback"), claim("alice", "cashback")]);
  assert.strictEqual(cb.filter((x) => x.status === 200).length, 1, "кешбек забирається один раз");
  assert.strictEqual(user("alice").balance, 2500);
  assert.strictEqual(user("alice").cashbackPending, 0);
  assert.strictEqual(user("alice").cashbackTotalClaimed, 2500);
  assert.strictEqual(user("alice").cashbackWeekUsed, 2500, "виплата не відкриває тижневий ліміт заново");

  // ── щоденне колесо ──
  tree = { users: { alice: { balance: 0 } } };
  r = await claim("alice", "dailySpin");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(R.DAILY_SPIN_PRIZES[r.data.index], r.data.prize);
  assert.strictEqual(user("alice").balance, r.data.prize);
  assert.strictEqual((await claim("alice", "dailySpin")).status, 409, "раз на день");

  // ── бонус повернення ──
  tree = { users: { alice: { balance: 0, lastSeen: 1 } } };
  assert.strictEqual((await claim("alice", "welcomeBack")).status, 409, "lastSeen з браузера не рахується");
  tree.users.alice.lastPlayedAt = Date.now() - 20 * DAY;
  r = await claim("alice", "welcomeBack");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.amount, R.welcomeBackBonus(20));
  assert.strictEqual((await claim("alice", "welcomeBack")).status, 409, "один раз за відсутність");
  tree.users.alice.lastPlayedAt = Date.now();
  assert.strictEqual((await claim("alice", "welcomeBack")).status, 409, "щойно грав — бонусу немає");

  // ── Battle Pass ──
  tree = { users: { alice: { balance: 0, bpSeason: season, bpXP: 5000 } } };
  assert.strictEqual((await claim("alice", "bp", { lv: 6, track: "f" })).status, 409, "рівень ще не досягнуто");
  assert.strictEqual((await claim("alice", "bp", { lv: 99, track: "f" })).status, 400);
  assert.strictEqual((await claim("alice", "bp", { lv: 5, track: "x" })).status, 400);
  assert.strictEqual((await claim("alice", "bp", { lv: 5, track: "v" })).status, 403, "VIP-доріжка без пропуску");
  const bpMany = await Promise.all([1, 2, 3].map(() => claim("alice", "bp", { lv: 5, track: "f" })));
  assert.strictEqual(bpMany.filter((x) => x.status === 200).length, 1, "нагорода рівня — один раз");
  assert.strictEqual(user("alice").balance, R.BP_REWARDS[4].free.val);
  r = await claim("alice", "bp", { lv: 2, track: "f" });
  assert.strictEqual(user("alice").freeSlots, R.BP_REWARDS[1].free.val, "не грошові нагороди теж нараховуються");

  // Минулий сезон: прогрес обнуляється, стару нагороду не забрати.
  tree = { users: { alice: { balance: 0, bpSeason: season - 1, bpXP: 50000, bpVip: true, bpClaimed: { f1: true } } } };
  assert.strictEqual((await claim("alice", "bp", { lv: 1, track: "f" })).status, 409);
  assert.strictEqual(user("alice").bpXP, 0);
  assert.strictEqual(user("alice").bpVip, false);
  assert.strictEqual(user("alice").bpSeason, season);

  // Бонусні скрині після 50 рівня.
  tree = { users: { alice: { bpSeason: season, bpXP: R.BP_MAX_LEVEL * R.BP_XP_PER_LEVEL + 2 * R.BP_BONUS_XP + 100, bpVip: true } } };
  const chests = await Promise.all([1, 2, 3, 4].map(() => claim("alice", "bpBonus")));
  assert.strictEqual(chests.filter((x) => x.status === 200).length, 2, "скринь рівно стільки, скільки зароблено");
  assert.strictEqual(user("alice").lootboxInv.bp, 2);
  assert.strictEqual(user("alice").slotiky, 4);

  // VIP-пропуск за Слотіки.
  tree = { users: { alice: { slotiky: R.BP_VIP_PRICE_SLOTIKY - 1 } } };
  assert.strictEqual((await claim("alice", "bpVip")).status, 402);
  tree.users.alice.slotiky = R.BP_VIP_PRICE_SLOTIKY + 100;
  const buys = await Promise.all([claim("alice", "bpVip"), claim("alice", "bpVip")]);
  assert.strictEqual(buys.filter((x) => x.status === 200).length, 1, "пропуск купується один раз");
  assert.strictEqual(user("alice").slotiky, 100);
  assert.strictEqual(user("alice").bpVip, true);
  assert.strictEqual(user("alice").bpSeason, season);

  // ── облік ставки ──
  tree = { users: { alice: { balance: 0, totalWagered: 0 } } };
  let p = await recordWager("alice", 25000);
  assert.deepStrictEqual(p.vipUp, { name: gold.name, icon: gold.icon }, "підвищення VIP помічено");
  assert.strictEqual(user("alice").totalWagered, 25000);
  assert.strictEqual(user("alice").bpXP, 250, "1 XP за 100 ₴");
  assert.strictEqual(user("alice").cashbackPending, Math.min(Math.floor(25000 * gold.cashback), R.CASHBACK_MAX_PER_BET));
  assert.ok(user("alice").lastPlayedAt > 0);
  tree.users.alice.bpVip = true;
  await recordWager("alice", 1000);
  assert.strictEqual(user("alice").bpXP, 270, "VIP-пропуск — подвійний XP");
  p = await recordWager("alice", 75000);
  assert.strictEqual(p.bpLevelUp, 1);
  assert.strictEqual(user("alice").bpLevel, 1);

  // Тижневий ліміт кешбеку, вимкнений кешбек, кешбек клану.
  tree = { users: { alice: { totalWagered: 1e6, cashbackWeekUsed: R.CASHBACK_MAX_PER_WEEK - 10, cashbackWeekStart: Date.now() } } };
  await recordWager("alice", 100000);
  assert.strictEqual(user("alice").cashbackPending, 10, "тижневий ліміт");
  tree.users.alice.cashbackWeekStart = Date.now() - 8 * DAY;
  await recordWager("alice", 100000);
  assert.strictEqual(user("alice").cashbackPending, 10 + R.CASHBACK_MAX_PER_BET, "новий тиждень — ліміт знову");
  assert.strictEqual(user("alice").cashbackWeekUsed, R.CASHBACK_MAX_PER_BET);
  tree = { users: { alice: { totalWagered: 1e6, cashbackOff: true } } };
  await recordWager("alice", 100000);
  assert.strictEqual(user("alice").cashbackPending, undefined, "кешбек вимкнено гравцем");
  tree = { users: { alice: { clanId: "c1" } }, clans: { c1: { bank: 30000 } } };
  await recordWager("alice", 10000);
  assert.strictEqual(user("alice").cashbackPending, Math.floor(10000 * (R.getVipLevel(10000).cashback + R.getClanBankTier(30000).cashback)), "кешбек клану додається до VIP");

  // Серверна ставка сама веде облік; фріспін — ні.
  tree = { users: { alice: { balance: 1000 } } };
  r = await call(play, "alice", { game: "dice", bet: 200, params: { target: 50, dir: "over" }, id: "reward-check-0001" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.progress.wager, 200);
  assert.strictEqual(user("alice").totalWagered, 200);
  assert.strictEqual(user("alice").bpXP, 2);
  tree.users.alice.freeSlots = 1;
  r = await call(play, "alice", { game: "slots", bet: 50, params: { mode: "free" }, id: "reward-check-0002" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.progress, undefined);
  assert.strictEqual(user("alice").totalWagered, 200, "фріспін не рахується ставкою");

  // ── Магазин Слотіків ──
  tree = { users: { bob: { balance: 6000000 } } };
  assert.strictEqual((await claim("bob", "buySlotiky", { n: 3 })).status, 400, "лише пакети з каталогу");
  r = await claim("bob", "buySlotiky", { n: 5 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(user("bob").balance, 1000000);
  assert.strictEqual(user("bob").slotiky, 5);
  assert.strictEqual((await claim("bob", "buySlotiky", { n: 5 })).status, 402, "не вистачає ₴");
  assert.strictEqual(user("bob").slotiky, 5);
  assert.strictEqual((await claim("bob", "shopBuy", { item: "guaranteed_win" })).status, 400, "прибраних товарів не купити");
  const twice = await Promise.all([1, 2].map(() => claim("bob", "shopBuy", { item: "avatar_gold" })));
  assert.strictEqual(twice.filter((x) => x.status === 200).length, 1, "косметика купується один раз");
  assert.strictEqual(user("bob").slotiky, 3);
  r = await claim("bob", "shopBuy", { item: "mines_hint" });
  assert.strictEqual(user("bob").minesHints, 3, "предмет — лічильник");
  r = await claim("bob", "shopBuy", { item: "lootbox_basic" });
  assert.strictEqual(user("bob").lootboxInv.basic, 1);
  assert.strictEqual((await claim("bob", "shopBuy", { item: "monthly_pass" })).status, 402, "не вистачає Слотіків");
  const opens = await Promise.all([1, 2].map(() => claim("bob", "openBox", { tier: "basic" })));
  assert.strictEqual(opens.filter((x) => x.status === 200).length, 1, "одну скриню не відкрити двічі");
  const win = opens.find((x) => x.status === 200).data.win;
  assert.ok(SH.SHOP_BOXES.basic.prizes.some((p) => Math.floor(p.mult * SH.SLOTIKY_PRICE) === win), "виграш зі таблиці скрині");
  assert.strictEqual(user("bob").balance, 1000000 + win);

  // Бусти: продовження, вплив на щоденний бонус, VIP-прогрес, XP, кешбек
  tree = { users: { bob: { slotiky: 20, balance: 0 } } };
  await claim("bob", "shopBuy", { item: "daily_x3" });
  const exp1 = user("bob").slotikyItems.daily_x3.expires;
  await claim("bob", "shopBuy", { item: "daily_x3" });
  assert.ok(user("bob").slotikyItems.daily_x3.expires - exp1 >= 7 * DAY - 5000, "повторна купівля продовжує буст");
  r = await claim("bob", "daily");
  assert.strictEqual(r.data.amount, R.DAILY_BONUSES[0] * 3, "щоденний ×3");
  await claim("bob", "shopBuy", { item: "vip_boost_3d" });
  await claim("bob", "shopBuy", { item: "xp_boost" });
  await recordWager("bob", 1000);
  assert.strictEqual(user("bob").totalWagered, 2000, "VIP-прогрес ×2");
  assert.strictEqual(user("bob").bpXP, 20, "XP ×2");
  tree = { users: { bob: { totalWagered: 1e6, slotikyItems: { cashback_x2: { expires: Date.now() + DAY } } } } };
  await recordWager("bob", 10000);
  assert.strictEqual(user("bob").cashbackPending, Math.min(Math.floor(10000 * R.getVipLevel(1e6).cashback * 2), R.CASHBACK_MAX_PER_BET * 2), "кешбек ×2");
  tree.users.bob.slotikyItems.cashback_x2.expires = Date.now() - 1;
  tree.users.bob.cashbackPending = 0;
  await recordWager("bob", 10000);
  assert.strictEqual(user("bob").cashbackPending, Math.min(Math.floor(10000 * R.getVipLevel(1e6).cashback), R.CASHBACK_MAX_PER_BET), "прострочений буст не діє");

  // Разове повернення за прибрані товари й ефекти профілю
  tree = { users: { bob: { slotiky: 1, profileEffect: "fire", lootboxes: 2, crashInsurance: true,
    slotikyItems: { guaranteed_win: { boughtAt: 1 }, chat_gif: { boughtAt: 1 }, avatar_gold: { boughtAt: 1 } } } } };
  const migr = await Promise.all([1, 2].map(() => claim("bob", "shopMigrate")));
  assert.strictEqual(migr.reduce((a, x) => a + (x.data.refund || 0), 0), 25 + 5 + 750, "повернення один раз");
  assert.strictEqual(user("bob").slotiky, 1 + 780);
  assert.deepStrictEqual(Object.keys(user("bob").slotikyItems), ["avatar_gold"], "куплена косметика лишається");
  assert.strictEqual(user("bob").profileEffect, undefined);
  assert.strictEqual(user("bob").lootboxInv.bp, 2, "старі скрині BP перенесено");
  assert.strictEqual(user("bob").crashInsurance, 1);

  // Фріспіни й прокрутки з магазину / Battle Pass: ставка фіксована, баланс не списується
  tree = { users: { bob: { balance: 0, shopSpins: 1, freeFortune: 1, shopFortune: 0 } } };
  r = await call(play, "bob", { game: "slots", bet: 50, params: { mode: "shop" }, id: "shop-spin-00001" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.bet, SH.SHOP_SPIN_STAKE, "ставка спіну з магазину");
  assert.strictEqual(user("bob").shopSpins, 0);
  assert.strictEqual(user("bob").balance, r.data.payout);
  r = await call(play, "bob", { game: "slots", bet: 50, params: { mode: "shop" }, id: "shop-spin-00002" });
  assert.strictEqual(r.status, 409, "куплені спіни скінчились");
  r = await call(play, "bob", { game: "fortune", bet: 50, params: { mode: "free" }, id: "free-fortune-01" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.bet, SH.FREE_FORTUNE_STAKE);
  assert.strictEqual((await call(play, "bob", { game: "fortune", bet: 50, params: { mode: "shop" }, id: "shop-fortune-01" })).status, 409);
  r = await call(play, "bob", { game: "fortune", bet: 10, params: {}, id: "paid-fortune-01" });
  assert.notStrictEqual(r.status, 400, "старий запит Колеса без mode — платний");

  console.log("OK — api/reward: суми й час рахує сервер, нагороди не забрати двічі, ставки на сервері ведуть VIP/XP/кешбек");
})().catch((e) => { console.error(e); process.exit(1); });
