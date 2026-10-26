// ============================================================
// SlotOK — бонуси й нагороди на сервері (Vercel Serverless Function)
//
// POST /api/reward  Authorization: Bearer <Firebase ID token>
//   { action: "daily" }                   — щоденний бонус (серія, ×VIP)
//   { action: "hourly" }                  — погодинний бонус (сума за VIP)
//   { action: "cashback" }                — забрати накопичений кешбек
//   { action: "dailySpin" }               — щоденне колесо
//   { action: "welcomeBack" }             — бонус повернення після 14+ днів
//   { action: "bp", lv, track: "f"|"v" }  — нагорода рівня Battle Pass
//   { action: "bpBonus" }                 — бонусна скриня після 50 рівня
//   { action: "bpVip" }                   — купити VIP-пропуск за Слотіки
//
// Сума, право на нагороду і час рахує сервер (lib/progress.js) — з тіла
// запиту береться лише що саме забрати. Раніше браузер передавав суму сам
// (claimDailyBonus(amount)) і перевіряв час за годинником телефона.
//
// 503 { error: "not_configured" } без FIREBASE_SERVICE_ACCOUNT_KEY — тоді
// застосунок працює по-старому, в браузері.
// ============================================================

const { getServiceAccount } = require("../lib/google-auth");
const { rng, fail, authNick, tooFast, blockedReason } = require("../lib/player");
const P = require("../lib/progress");

const ACTIONS = {
  daily: (nick) => P.claimDaily(nick),
  hourly: (nick) => P.claimHourly(nick),
  cashback: (nick) => P.claimCashback(nick),
  dailySpin: (nick) => P.claimDailySpin(nick, rng),
  welcomeBack: (nick) => P.claimWelcomeBack(nick),
  bp: (nick, body) => P.claimBpReward(nick, Number.isInteger(body.lv) ? body.lv : 0, body.track),
  bpBonus: (nick) => P.claimBpBonus(nick),
  bpVip: (nick) => P.buyBpVip(nick),
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!getServiceAccount()) return fail(res, 503, "not_configured", "Серверні нагороди ще не налаштовані");
  const nick = await authNick(req, res, "reward");
  if (!nick) return;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const action = Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
  if (!action) return fail(res, 400, "bad_request", "Невідома дія");
  if (tooFast(nick, 20)) return fail(res, 429, "rate_limited", "Занадто швидко — зачекай секунду");
  try {
    const blocked = await blockedReason(nick);
    if (blocked) return fail(res, 403, "blocked", blocked);
    const r = await action(nick, body);
    if (!r.ok) {
      const { ok, status, error, message, ...extra } = r;
      return fail(res, status, error, message, extra);
    }
    const { ok, ...data } = r;
    res.status(200).json(data);
  } catch (err) {
    console.error("reward error", body.action, err);
    fail(res, 500, "server_error", "Помилка сервера. Спробуй ще раз.");
  }
};
