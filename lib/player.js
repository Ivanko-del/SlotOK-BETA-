// Спільне для серверних ігор (api/play.js, api/round.js): хто гравець,
// чи можна йому грати, грубий ліміт частоти, атомарні рухи балансу.

const crypto = require("crypto");
const { dbGet, dbTransaction } = require("./firebase");
const { verifyIdToken } = require("./id-token");

const rng = { int: (min, max) => crypto.randomInt(min, max) };

function fail(res, status, error, message, extra) {
  res.status(status).json({ error, message, ...(extra || {}) });
}

// Нік із Firebase ID token. null — відповідь з помилкою вже надіслано.
async function authNick(req, res, label) {
  try {
    const auth = String((req.headers || {}).authorization || "");
    return await verifyIdToken(auth.replace(/^Bearer\s+/i, ""));
  } catch (e) {
    if (e.code === "bad_token") fail(res, 401, "unauthorized", "Сесія застаріла — увійди ще раз");
    else { console.error(`${label}: token check failed`, e); fail(res, 503, "auth_unavailable", "Сервер тимчасово недоступний"); }
    return null;
  }
}

// Дешевий ліміт у пам'яті інстансу: від скриптів, що смикають API в циклі.
// Не точний між інстансами — точність тут дає баланс, а не ліміт.
const _hits = new Map();
function tooFast(nick, max = 40) {
  const now = Date.now();
  const arr = (_hits.get(nick) || []).filter((t) => now - t < 10000);
  arr.push(now);
  _hits.set(nick, arr);
  if (_hits.size > 5000) _hits.clear();
  return arr.length > max;
}

// Обмеження акаунта — ті самі, що перевіряє браузер, але тут їх не обійти.
async function blockedReason(nick) {
  const [banned, autoFrozen, selfUntil] = await Promise.all([
    dbGet(`users/${nick}/banned`),
    dbGet(`users/${nick}/autoFrozen`),
    dbGet(`users/${nick}/selfExcludeUntil`),
  ]);
  return banned ? "Акаунт заблоковано"
    : autoFrozen ? "Акаунт тимчасово призупинено — звернись у підтримку"
    : selfUntil && selfUntil > Date.now() ? "Діє само-виключення"
    : null;
}

// Атомарно змінює баланс. Списання (delta < 0) не проходить, якщо коштів
// замало: повертає { ok: false, balance }.
async function moveBalance(nick, delta) {
  let insufficient = false;
  const tx = await dbTransaction(`users/${nick}/balance`, (cur) => {
    const balance = Number(cur) || 0;
    if (delta < 0 && balance < -delta) { insufficient = true; return undefined; }
    insufficient = false;
    return balance + delta;
  });
  return { ok: tx.committed && !insufficient, balance: Number(tx.value) || 0 };
}

module.exports = { rng, fail, authNick, tooFast, blockedReason, moveBalance, _resetRateLimitForTests: () => _hits.clear() };
