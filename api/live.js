// ============================================================
// SlotOK — спільні ігри за розкладом (lib/live.js)
//
// POST /api/live  Authorization: Bearer <Firebase ID token>
//   { action: "state" }                          — раунди коліс і Краш зараз + мої розрахунки
//   { action: "wheelBet", game, choice, amount } — ставка на колесо (w5|w10|w15|w30|r60)
//   { action: "wheelResult", game, round }       — результат завершеного раунду
//   { action: "crashBet", amount, auto? }        — ставка на наступний політ
//   { action: "crashCashout", round }            — забрати зараз (за часом сервера)
//   { action: "crashPoll" }                       — під час польоту: чи вже впало
//
// Кожен виклик спершу розраховує мої завершені раунди (settleMine) і
// повертає їх у "settled" — так виграш нараховується, навіть якщо в момент
// спіну гравця на сторінці не було.
// ============================================================

const { getServiceAccount } = require("../lib/google-auth");
const { parseBet } = require("../lib/games");
const { fail, authNick, tooFast, blockedReason } = require("../lib/player");
const { safeRecordWager } = require("../lib/progress");
const live = require("../lib/live");

function sendErr(res, e) {
  return fail(res, e.status || 400, e.error, e.message, e.balance !== undefined ? { balance: e.balance } : undefined);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!getServiceAccount()) return fail(res, 503, "not_configured", "Спільні ігри ще не налаштовані");
  const nick = await authNick(req, res, "api/live");
  if (!nick) return;
  if (tooFast(nick, 60)) return fail(res, 429, "rate_limited", "Занадто швидко — зачекай секунду");
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const now = Date.now();

  try {
    // Дешеве опитування під час польоту: без розрахунків, лише «вже впало?»
    if (body.action === "crashPoll") {
      const c = await live.crashCurrent(now);
      return res.status(200).json({ ok: true, now, n: c.n, startAt: c.startAt, commit: c.commit, point: c.point, seed: c.seed, crashAt: c.crashAt });
    }
    const settled = await live.settleMine(nick, now);
    switch (body.action) {
      case "state": {
        const st = await live.state(now, body.which);
        settled.push(...(await live.legacyRefund(nick, now).catch(() => [])));
        const crash = await live.crashCurrent(now);
        delete crash._point; delete crash._crashAt;
        return res.status(200).json({ ok: true, ...st, crash, settled });
      }
      case "wheelBet": {
        const amount = parseBet(body.amount);
        if (!amount || amount < 10) return fail(res, 400, "bad_bet", "Ставка — від ₴10");
        const blocked = await blockedReason(nick);
        if (blocked) return fail(res, 403, "blocked", blocked);
        const out = await live.wheelBet(nick, String(body.game || ""), String(body.choice || ""), amount, now);
        if (out.error) return sendErr(res, out.error);
        const progress = await safeRecordWager(nick, amount);
        return res.status(200).json({ ok: true, ...out, settled, progress });
      }
      case "wheelResult": {
        const n = Number(body.round);
        if (!Number.isInteger(n) || !live.WHEELS[body.game]) return fail(res, 400, "bad_round", "Невірний раунд");
        const r = await live.publishWheel(body.game, n, now);
        if (!r) return fail(res, 409, "not_yet", "Раунд ще не скінчився");
        return res.status(200).json({ ok: true, round: n, ...r, settled });
      }
      case "crashBet": {
        const amount = parseBet(body.amount);
        if (!amount || amount < 10) return fail(res, 400, "bad_bet", "Ставка — від ₴10");
        const blocked = await blockedReason(nick);
        if (blocked) return fail(res, 403, "blocked", blocked);
        const out = await live.crashBet(nick, amount, body.auto, now);
        if (out.error) return sendErr(res, out.error);
        const progress = await safeRecordWager(nick, amount);
        return res.status(200).json({ ok: true, ...out, settled, progress });
      }
      case "crashCashout": {
        const out = await live.crashCashout(nick, Number(body.round), now);
        if (out.error) return sendErr(res, out.error);
        return res.status(200).json({ ok: true, ...out, settled });
      }
      default: return fail(res, 400, "bad_action", "Невідома дія");
    }
  } catch (e) {
    if (e.code === "not_configured") return fail(res, 503, "not_configured", "Спільні ігри ще не налаштовані");
    console.error("api/live", body.action, e);
    return fail(res, 500, "server_error", "Помилка сервера — спробуй ще раз");
  }
};
