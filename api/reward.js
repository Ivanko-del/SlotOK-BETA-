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
//   { action: "buySlotiky", n }           — купити пакет Слотіків за ₴ (lib/shop.js)
//   { action: "shopBuy", item }           — купити товар магазину за Слотіки
//   { action: "openBox", tier }           — відкрити скриню з інвентаря
//   { action: "shopMigrate" }             — разове повернення за прибрані товари
//   { action: "missions" }                — стан щоденних місій і серії (lib/missions.js)
//   { action: "missionClaim", i }         — забрати нагороду за виконану місію (0…2)
//   { action: "streakClaim" }             — забрати нагороду дня серії
//   { action: "league" }                 — стан рейтингової ліги (lib/leagues.js)
//   { action: "leagueClaim" }             — забрати нагороду за завершені сезони
//   { action: "friendRequest"|"friendAccept"|"friendDecline"|"friendCancel"|"friendRemove", nick }
//   { action: "friendInvite", nick, id }  — запросити друга в мою кімнату (lib/friends.js)
//   { action: "friendInviteDismiss", id } — прибрати своє запрошення
//   { action: "deleteAccount", password } — видалити свій акаунт і дані (lib/account.js)
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
const SHOP = require("../lib/shop");
const MISSIONS = require("../lib/missions");
const LEAGUES = require("../lib/leagues");
const FR = require("../lib/friends");
const ACCOUNT = require("../lib/account");

const ACTIONS = {
  daily: (nick) => P.claimDaily(nick),
  hourly: (nick) => P.claimHourly(nick),
  cashback: (nick) => P.claimCashback(nick),
  dailySpin: (nick) => P.claimDailySpin(nick, rng),
  welcomeBack: (nick) => P.claimWelcomeBack(nick),
  bp: (nick, body) => P.claimBpReward(nick, Number.isInteger(body.lv) ? body.lv : 0, body.track),
  bpBonus: (nick) => P.claimBpBonus(nick),
  bpVip: (nick) => P.buyBpVip(nick),
  buySlotiky: (nick, body) => SHOP.buySlotiky(nick, Number.isInteger(body.n) ? body.n : 0),
  shopBuy: (nick, body) => SHOP.buyItem(nick, typeof body.item === "string" ? body.item : ""),
  openBox: (nick, body) => SHOP.openBox(nick, typeof body.tier === "string" ? body.tier : "", rng),
  shopMigrate: (nick) => SHOP.migrate(nick),
  missions: (nick) => MISSIONS.state(nick),
  missionClaim: (nick, body) => MISSIONS.claimMission(nick, Number.isInteger(body.i) ? body.i : -1),
  streakClaim: (nick) => MISSIONS.claimStreak(nick),
  league: (nick) => LEAGUES.state(nick),
  leagueClaim: (nick) => LEAGUES.claim(nick),
  friendRequest: (nick, body) => FR.request(nick, body.nick),
  friendAccept: (nick, body) => FR.accept(nick, body.nick),
  friendDecline: (nick, body) => FR.decline(nick, body.nick),
  friendCancel: (nick, body) => FR.cancel(nick, body.nick),
  friendRemove: (nick, body) => FR.remove(nick, body.nick),
  friendInvite: (nick, body) => FR.invite(nick, body.nick, body.id),
  friendInviteDismiss: (nick, body) => FR.dismissInvite(nick, body.id),
  deleteAccount: (nick, body) => ACCOUNT.deleteAccount(nick, typeof body.password === "string" ? body.password : ""),
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
