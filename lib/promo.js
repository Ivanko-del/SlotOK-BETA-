// Промокоди на сервері. Спільне для api/reward.js (action "promo") і
// Телеграм-бота (/promo у api/telegram-webhook.js).
//
// promos/<CODE> = { value, uses, createdBy, time } — створює адмін, браузери
// гравців його не читають (правила: лише адмін). promo_redemptions/<CODE> =
// { <нік>: { time } } — закрито для браузерів, пише тільки сервер.
//
// Перевірка «вже брав» і ліміту активацій — одна транзакція над списком
// активацій: паралельні запити не пройдуть повз ліміт і не візьмуть код двічі.
// Баланс нараховується атомарно (dbIncrement) лише після того, як активацію
// записано.

const { dbGet, dbPush, dbIncrement, dbTransaction } = require("./firebase");

const CODE_RE = /^[A-Z0-9_-]{1,40}$/;
const MAX_VALUE = 1e9;

function normalizeCode(code) {
  return typeof code === "string" ? code.trim().toUpperCase() : "";
}

const BAD = { ok: false, status: 404, error: "bad_code", message: "Невірний промокод" };

async function redeem(nick, rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, status: 400, error: "bad_request", message: "Введи промокод" };
  if (!CODE_RE.test(code)) return BAD;
  const promo = await dbGet(`promos/${code}`);
  const value = promo && Number(promo.value);
  if (!promo || !Number.isFinite(value) || value <= 0 || value > MAX_VALUE) return BAD;
  const uses = Number.isInteger(promo.uses) && promo.uses > 0 ? promo.uses : 1;

  let verdict = "ok";
  await dbTransaction(`promo_redemptions/${code}`, (cur) => {
    const list = cur || {};
    if (list[nick]) { verdict = "already"; return undefined; }
    if (Object.keys(list).length >= uses) { verdict = "limit"; return undefined; }
    verdict = "ok";
    return { ...list, [nick]: { time: Date.now() } };
  });
  if (verdict === "already") return { ok: false, status: 409, error: "already_used", message: "Ти вже активував цей промокод" };
  if (verdict === "limit") return { ok: false, status: 409, error: "exhausted", message: "Ліміт активацій цього промокоду вичерпано" };

  const balance = await dbIncrement(`users/${nick}/balance`, value);
  await dbPush(`users/${nick}/history`, { text: `🎟️ Промокод ${code}: +${value}₴`, date: Date.now() }).catch(() => {});
  return { ok: true, code, amount: value, balance };
}

module.exports = { redeem, normalizeCode };
