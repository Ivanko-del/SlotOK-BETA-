// ============================================================
// SlotOK — серверна гра «одним запитом» (Vercel Serverless Function)
//
// POST /api/play  Authorization: Bearer <Firebase ID token>
//   { game: "dice"|"limbo", bet, params, id }
//
// Сервер сам: перевіряє, хто гравець (ID token), кидає випадкове число
// (crypto.randomInt), рахує виграш і ОДНИМ атомарним записом списує ставку й
// зараховує виграш на users/<нік>/balance. Клієнт лише показує анімацію.
//
// id — ключ ідемпотентності (генерує клієнт на кожен клік). Повтор того самого
// id (подвійний клік, ретрай після обриву мережі) не грає вдруге, а повертає
// вже збережений результат з game_rounds/<нік>/<id>. Це і є журнал раундів:
// у браузера туди немає доступу ні на читання, ні на запис.
//
// 503 { error: "not_configured" } без FIREBASE_SERVICE_ACCOUNT_KEY — тоді
// застосунок грає по-старому, в браузері.
// ============================================================

const crypto = require("crypto");
const { dbGet, dbUpdate, dbTransaction } = require("../lib/firebase");
const { getServiceAccount } = require("../lib/google-auth");
const { verifyIdToken } = require("../lib/id-token");
const { GAMES, parseBet } = require("../lib/games");

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const rng = { int: (min, max) => crypto.randomInt(min, max) };

// Дешевий ліміт у пам'яті інстансу: від скриптів, що смикають API в циклі.
// Не точний між інстансами — точність тут дає баланс, а не ліміт.
const _hits = new Map();
function tooFast(nick) {
  const now = Date.now();
  const arr = (_hits.get(nick) || []).filter((t) => now - t < 10000);
  arr.push(now);
  _hits.set(nick, arr);
  if (_hits.size > 5000) _hits.clear();
  return arr.length > 40; // > 4 ігри на секунду в середньому за 10 с
}

function fail(res, status, error, message, extra) {
  res.status(status).json({ error, message, ...(extra || {}) });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!getServiceAccount()) return fail(res, 503, "not_configured", "Серверні ігри ще не налаштовані");

  let nick;
  try {
    const auth = String((req.headers || {}).authorization || "");
    nick = await verifyIdToken(auth.replace(/^Bearer\s+/i, ""));
  } catch (e) {
    if (e.code === "bad_token") return fail(res, 401, "unauthorized", "Сесія застаріла — увійди ще раз");
    console.error("play: token check failed", e);
    return fail(res, 503, "auth_unavailable", "Сервер тимчасово недоступний");
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const game = GAMES[body.game];
  const bet = parseBet(body.bet);
  const params = game && game.parse(body.params);
  if (!game || !params) return fail(res, 400, "bad_game", "Невідома гра або параметри");
  if (!bet) return fail(res, 400, "bad_bet", "Невірна сума ставки");
  if (typeof body.id !== "string" || !ID_RE.test(body.id)) return fail(res, 400, "bad_id", "Невірний запит");
  if (tooFast(nick)) return fail(res, 429, "rate_limited", "Занадто швидко — зачекай секунду");

  const roundPath = `game_rounds/${nick}/${body.id}`;
  try {
    // 1) Займаємо id раунду. Якщо він уже є — це повтор: віддаємо збережене.
    const claim = await dbTransaction(roundPath, (cur) => (cur ? undefined : { status: "pending", game: body.game, bet, ts: Date.now() }));
    if (!claim.committed) {
      const prev = claim.value || {};
      if (prev.status === "done") return res.status(200).json({ ...prev.response, replay: true });
      return fail(res, 409, "in_progress", "Ця ставка вже обробляється");
    }

    // 2) Обмеження акаунта — ті самі, що перевіряє браузер, але тут їх не обійти.
    const [banned, autoFrozen, selfUntil] = await Promise.all([
      dbGet(`users/${nick}/banned`),
      dbGet(`users/${nick}/autoFrozen`),
      dbGet(`users/${nick}/selfExcludeUntil`),
    ]);
    const blocked = banned ? "Акаунт заблоковано"
      : autoFrozen ? "Акаунт тимчасово призупинено — звернись у підтримку"
      : selfUntil && selfUntil > Date.now() ? "Діє само-виключення"
      : null;
    if (blocked) {
      await dbUpdate(roundPath, { status: "rejected", reason: "blocked" });
      return fail(res, 403, "blocked", blocked);
    }

    // 3) Результат і атомарний запис балансу (списання + виграш разом).
    const outcome = game.play(bet, params, rng);
    let insufficient = false;
    const tx = await dbTransaction(`users/${nick}/balance`, (cur) => {
      const balance = Number(cur) || 0;
      if (balance < bet) { insufficient = true; return undefined; }
      insufficient = false;
      return balance - bet + outcome.payout;
    });
    if (insufficient || !tx.committed) {
      await dbUpdate(roundPath, { status: "rejected", reason: "insufficient" });
      return fail(res, 402, "insufficient", "Недостатньо коштів", { balance: Number(tx.value) || 0 });
    }

    const response = { game: body.game, bet, params, ...outcome, balance: tx.value, id: body.id };
    await dbUpdate(roundPath, { status: "done", response, doneAt: Date.now() });
    res.status(200).json(response);
  } catch (err) {
    console.error("play error", err);
    fail(res, 500, "server_error", "Помилка сервера. Перевір баланс і спробуй ще раз.");
  }
};
