// ============================================================
// SlotOK — server-side sign-in (Vercel Serverless Function)
//
// Until now "being logged in" meant localStorage.slotok_user = <nick>:
// the browser downloaded the password hash, compared it itself, and anyone
// could skip all that by typing another nick into localStorage — including
// the owner's. This endpoint moves the password check to the server and
// hands back a Firebase Auth custom token (uid = nick). After
// signInWithCustomToken() the database rules see auth.uid, which is what
// database.rules.strict.json builds on.
//
// GET                         → { serverAuth: bool }
// POST { action: "login",    nick, password }
// POST { action: "register", nick, password, email?, promo?, secQ, secA, ref? }
// POST { action: "reset",    nick, answer, newPassword }      (security question)
// POST { action: "change-password", nick, password, newPassword }
// POST { action: "set-security", nick, password, question, answer }
//
// Success → 200 { token, nick }   (reset/change-password → 200 { ok: true })
// Errors  → 4xx { error: <code>, message: <Ukrainian text for the player> }
// 503 { error: "not_configured" } when FIREBASE_SERVICE_ACCOUNT_KEY is not
// set — the app then falls back to its old client-side login.
// ============================================================

const { dbGet, dbUpdate, dbPush, dbIncrement, dbTransaction } = require("../lib/firebase");
const { createCustomToken, getServiceAccount } = require("../lib/google-auth");
const { allow } = require("../lib/rate-limit");
const { getSecret, setSecrets, migrateSecrets } = require("../lib/secrets");
const SlotOKPassword = require("../password.js");

const OWNER = "theivankoo";
const NICK_RE = /^[a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9_-]{3,20}$/;
const MAX_PASSWORD = 200;
const MIN_ANSWER = 3;

// Питання — або ключ зі списку в app.js (SECURITY_QUESTIONS), або власний
// текст гравця. Текст показується в розмітці, тож без HTML-символів.
function cleanQuestion(v) {
  if (typeof v !== "string") return null;
  const q = v.trim().replace(/[<>"'`]/g, "");
  return q.length >= 3 && q.length <= 120 ? q : null;
}
async function dbPatchQuestion(nick, question) {
  await dbUpdate(`users/${nick}`, { securityQuestion: question, hasSecurityAnswer: true });
}

function fail(res, status, error, message) {
  res.status(status).json({ error, message });
}

function clientIp(req) {
  const h = req.headers || {};
  return String(h["x-real-ip"] || (h["x-forwarded-for"] || "").split(",")[0] || "unknown").trim();
}

function str(v, max) {
  return typeof v === "string" && v.length <= max ? v : null;
}

// Per-IP and per-nick ceilings. The per-nick one is what actually stops a
// password-guessing run against one account from many IPs.
async function throttle(req, action, nick) {
  const ip = clientIp(req);
  const okIp = await allow(`auth-ip:${action}:${ip}`, action === "register" ? 5 : 30, 10 * 60000, { failClosed: true });
  const okNick = nick ? await allow(`auth-nick:${action}:${nick.toLowerCase()}`, 10, 10 * 60000, { failClosed: true }) : true;
  return okIp && okNick;
}

async function login(req, res, body) {
  const nick = str(body.nick, 40);
  const password = str(body.password, MAX_PASSWORD);
  // Old accounts may predate NICK_RE, so any valid RTDB key is accepted here.
  if (!nick || !password || !/^[^.#$[\]/\x00-\x1f]{1,40}$/.test(nick)) {
    return fail(res, 400, "bad_request", "Введіть нікнейм і пароль");
  }
  if (!(await throttle(req, "login", nick))) {
    return fail(res, 429, "rate_limited", "Забагато спроб входу. Зачекай 10 хвилин.");
  }
  const [pass, banned, banReason, isAdmin] = await Promise.all([
    getSecret(nick, "pass"),
    dbGet(`users/${nick}/banned`),
    dbGet(`users/${nick}/banReason`),
    dbGet(`users/${nick}/isAdmin`),
  ]);
  if (!pass) return fail(res, 404, "not_found", `Гравця "${nick}" не знайдено`);
  if (banned) return fail(res, 403, "banned", "Акаунт заблоковано" + (banReason ? ": " + banReason : ""));

  const check = await SlotOKPassword.verify(password, pass);
  if (!check.ok) return fail(res, 401, "wrong_password", "Невірний пароль");
  // Хеш їде з публічного users/<нік> у закритий user_secrets/<нік>.
  if (check.needsUpgrade) await setSecrets(nick, { pass: await SlotOKPassword.hash(password) });
  await migrateSecrets(nick);

  const admin = nick.toLowerCase() === OWNER || isAdmin === true;
  if (!admin && (await dbGet("site_config/maintenance"))) {
    return fail(res, 403, "maintenance", "Сайт тимчасово на технічному обслуговуванні. Спробуй пізніше.");
  }
  res.status(200).json({ token: createCustomToken(nick), nick });
}

async function register(req, res, body) {
  const nick = str(body.nick, 20);
  const password = str(body.password, MAX_PASSWORD);
  const secA = str(body.secA, 200);
  const secQ = cleanQuestion(body.secQ);
  const email = (str(body.email, 120) || "").trim();
  const promo = (str(body.promo, 40) || "").trim().toUpperCase();
  const ref = str(body.ref, 40);
  if (!nick || !NICK_RE.test(nick)) {
    return fail(res, 400, "bad_nick", 'Нікнейм: 3–20 символів, лише літери, цифри, "_" та "-"');
  }
  if (!password || password.length < 6) return fail(res, 400, "weak_password", "Пароль мінімум 6 символів");
  if (!secA || secA.trim().length < MIN_ANSWER) return fail(res, 400, "no_answer", `Відповідь на контрольне питання — мінімум ${MIN_ANSWER} символи`);
  if (!secQ) return fail(res, 400, "no_question", "Оберіть або напишіть контрольне питання");
  if (email && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)) return fail(res, 400, "bad_email", "Невірний email");
  if (!(await throttle(req, "register", null))) {
    return fail(res, 429, "rate_limited", "Забагато реєстрацій з цієї мережі. Спробуй пізніше.");
  }

  // Bonus rules mirror the old client-side authRegister().
  let bonus = 1000, spins = 10;
  if (promo === "SLOTOK") { bonus += 500; spins += 5; }
  else if (promo === "VIP") { bonus += 2000; }

  const now = Date.now();
  const newUser = {
    email,
    securityQuestion: secQ,
    hasSecurityAnswer: true,
    balance: bonus, freeSlots: spins,
    id: Math.floor(Math.random() * 900000) + 100000,
    tag: "Новачок 🌱", avatar: "👤",
    dailyStreak: 0, luckyGamesLeft: 3, luckyGamesUsed: 0,
    registeredAt: now, lastSeen: now,
    totalGames: 0, totalWins: 0, totalWagered: 0, slotsPlayed: 0,
  };
  if (promo) newUser.usedPromo = promo;
  if (ref && ref !== nick && /^[^.#$[\]/]{1,40}$/.test(ref) && (await getSecret(ref, "pass"))) {
    newUser.referredBy = ref;
  }

  // Create-if-absent: two simultaneous sign-ups for one nick can't both win.
  const { committed } = await dbTransaction(`users/${nick}`, (cur) => (cur ? undefined : newUser));
  if (!committed) return fail(res, 409, "nick_taken", `Нікнейм "${nick}" вже зайнятий`);
  await setSecrets(nick, {
    pass: await SlotOKPassword.hash(password),
    securityAnswerHash: await SlotOKPassword.hash(secA.trim().toLowerCase()),
  });

  await Promise.allSettled([
    dbPush(`users/${nick}/history`, { text: "🎉 Реєстрація! Бонус: +" + bonus + "₴", date: now }),
    newUser.referredBy ? dbIncrement(`users/${newUser.referredBy}/referrals`, 1) : null,
  ]);
  res.status(200).json({ token: createCustomToken(nick), nick, bonus, spins });
}

async function reset(req, res, body) {
  const nick = str(body.nick, 40);
  const answer = str(body.answer, 200);
  const newPassword = str(body.newPassword, MAX_PASSWORD);
  if (!nick || !answer || !/^[^.#$[\]/]{1,40}$/.test(nick)) return fail(res, 400, "bad_request", "Введіть відповідь");
  if (!newPassword || newPassword.length < 6) return fail(res, 400, "weak_password", "Пароль мінімум 6 символів");
  if (!(await throttle(req, "reset", nick))) {
    return fail(res, 429, "rate_limited", "Забагато спроб. Зачекай 10 хвилин.");
  }
  const stored = await getSecret(nick, "securityAnswerHash");
  if (!stored) return fail(res, 404, "not_found", "Для цього акаунту немає контрольного питання");
  const check = await SlotOKPassword.verify(answer.trim().toLowerCase(), stored);
  if (!check.ok) return fail(res, 401, "wrong_answer", "Невірна відповідь");
  const updates = { pass: await SlotOKPassword.hash(newPassword) };
  if (check.needsUpgrade) updates.securityAnswerHash = await SlotOKPassword.hash(answer.trim().toLowerCase());
  await setSecrets(nick, updates);
  await migrateSecrets(nick);
  res.status(200).json({ ok: true });
}

async function changePassword(req, res, body) {
  const nick = str(body.nick, 40);
  const password = str(body.password, MAX_PASSWORD);
  const newPassword = str(body.newPassword, MAX_PASSWORD);
  if (!nick || !password || !/^[^.#$[\]/]{1,40}$/.test(nick)) return fail(res, 400, "bad_request", "Введіть поточний пароль");
  if (!newPassword || newPassword.length < 6) return fail(res, 400, "weak_password", "Мінімум 6 символів");
  if (!(await throttle(req, "change", nick))) return fail(res, 429, "rate_limited", "Забагато спроб. Зачекай 10 хвилин.");
  const pass = await getSecret(nick, "pass");
  if (!pass || !(await SlotOKPassword.verify(password, pass)).ok) {
    return fail(res, 401, "wrong_password", "Поточний пароль невірний");
  }
  await setSecrets(nick, { pass: await SlotOKPassword.hash(newPassword) });
  await migrateSecrets(nick);
  res.status(200).json({ ok: true });
}

// Нове контрольне питання/відповідь — лише з поточним паролем.
async function setSecurity(req, res, body) {
  const nick = str(body.nick, 40);
  const password = str(body.password, MAX_PASSWORD);
  const question = cleanQuestion(body.question);
  const answer = str(body.answer, 200);
  if (!nick || !password || !/^[^.#$[\]/]{1,40}$/.test(nick)) return fail(res, 400, "bad_request", "Введіть поточний пароль");
  if (!question) return fail(res, 400, "no_question", "Оберіть або напишіть контрольне питання");
  if (!answer || answer.trim().length < MIN_ANSWER) return fail(res, 400, "no_answer", `Відповідь — мінімум ${MIN_ANSWER} символи`);
  if (!(await throttle(req, "change", nick))) return fail(res, 429, "rate_limited", "Забагато спроб. Зачекай 10 хвилин.");
  const pass = await getSecret(nick, "pass");
  if (!pass || !(await SlotOKPassword.verify(password, pass)).ok) {
    return fail(res, 401, "wrong_password", "Поточний пароль невірний");
  }
  await setSecrets(nick, { securityAnswerHash: await SlotOKPassword.hash(answer.trim().toLowerCase()) });
  await dbPatchQuestion(nick, question);
  await migrateSecrets(nick);
  res.status(200).json({ ok: true });
}

const ACTIONS = { login, register, reset, "change-password": changePassword, "set-security": setSecurity };

module.exports = async (req, res) => {
  const configured = !!getServiceAccount();
  if (req.method === "GET") {
    res.status(200).json({ serverAuth: configured });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  // Same-origin only: the endpoint is called by our own page, never cross-site.
  const origin = (req.headers || {}).origin;
  if (origin && !/^https:\/\/slot-ok-beta(-[a-z0-9-]+)?\.vercel\.app$|^http:\/\/localhost(:\d+)?$/.test(origin)) {
    return fail(res, 403, "bad_origin", "Запит з чужого сайту відхилено");
  }
  if (!configured) return fail(res, 503, "not_configured", "Серверний вхід ще не налаштований");

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const handler = ACTIONS[body.action];
  if (!handler) return fail(res, 400, "bad_action", "Невідома дія");
  try {
    await handler(req, res, body);
  } catch (err) {
    console.error("auth error", body.action, err);
    fail(res, 500, "server_error", "Помилка сервера. Спробуй ще раз.");
  }
};
