// ============================================================
// SlotOK — онлайн-кімнати на сервері (lib/rooms.js + lib/room-games/*)
//
// POST /api/room  Authorization: Bearer <Firebase ID token>
//   { action: "create", game, bet, size?, opts? }  — нова кімната, ставка списується
//   { action: "join",   id }                       — увійти (ставка списується)
//   { action: "quick",  game, bet }                — масові ігри: у найближчу гру з цією ставкою
//   { action: "start",  id }                       — господар: почати, не чекаючи повного столу
//   { action: "leave",  id }                       — вийти: до старту — з поверненням,
//                                                    під час гри — поразка
//   { action: "act",    id, move }                 — хід
//   { action: "tick",   id }                       — прострочений таймер (будь-хто)
//   { action: "view",   id }                       — стан для мене (якщо підписка відстала)
//   { action: "mine" }                             — мої відкриті кімнати
//
// Хто виграв і скільки — рахує лише сервер; браузер бачить чужі карти /
// кораблі / міни лише тоді, коли гра їх відкрила.
// ============================================================

const { getServiceAccount } = require("../lib/google-auth");
const { parseBet } = require("../lib/games");
const { fail, authNick, tooFast, blockedReason } = require("../lib/player");
const { safeRecordWager } = require("../lib/progress");
const rooms = require("../lib/rooms");

const ID_RE = /^[a-z0-9]{12,40}$/;

function send(res, out, extra) {
  if (out.error) return fail(res, out.error.status || 400, out.error.error, out.error.message, out.error.balance !== undefined ? { balance: out.error.balance } : undefined);
  const r = out.room;
  res.status(200).json({
    ok: true,
    ...(r ? { id: r.id, game: r.game, status: r.status, ver: r.ver, result: r.result || null } : {}),
    ...(out.balance !== undefined ? { balance: out.balance } : {}),
    ...(extra || {}),
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!getServiceAccount()) return fail(res, 503, "not_configured", "Онлайн-кімнати ще не налаштовані");
  const nick = await authNick(req, res, "api/room");
  if (!nick) return;
  if (tooFast(nick, 60)) return fail(res, 429, "rate_limited", "Занадто швидко — зачекай секунду");
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const id = typeof body.id === "string" && ID_RE.test(body.id) ? body.id : null;

  try {
    switch (body.action) {
      case "create": {
        const bet = parseBet(body.bet);
        if (!bet || bet < 10) return fail(res, 400, "bad_bet", "Ставка — від ₴10");
        const blocked = await blockedReason(nick);
        if (blocked) return fail(res, 403, "blocked", blocked);
        const out = await rooms.create(nick, String(body.game || ""), bet, Number(body.size) || 0, body.opts);
        const progress = out.error ? undefined : await safeRecordWager(nick, bet);
        return send(res, out, { progress });
      }
      case "quick": {
        const bet = parseBet(body.bet);
        if (!bet || bet < 10) return fail(res, 400, "bad_bet", "Ставка — від ₴10");
        const blocked = await blockedReason(nick);
        if (blocked) return fail(res, 403, "blocked", blocked);
        const out = await rooms.quick(nick, String(body.game || ""), bet);
        const progress = out.error || out.balance === undefined ? undefined : await safeRecordWager(nick, bet);
        return send(res, out, { progress });
      }
      case "join": {
        if (!id) return fail(res, 400, "bad_id", "Невірна кімната");
        const blocked = await blockedReason(nick);
        if (blocked) return fail(res, 403, "blocked", blocked);
        const out = await rooms.join(nick, id);
        const progress = out.error || out.balance === undefined ? undefined : await safeRecordWager(nick, out.room.bet);
        return send(res, out, { progress });
      }
      case "start": return id ? send(res, await rooms.startNow(nick, id)) : fail(res, 400, "bad_id", "Невірна кімната");
      case "leave": return id ? send(res, await rooms.leave(nick, id)) : fail(res, 400, "bad_id", "Невірна кімната");
      case "act": return id ? send(res, await rooms.act(nick, id, body.move && typeof body.move === "object" ? body.move : null)) : fail(res, 400, "bad_id", "Невірна кімната");
      case "tick": return id ? send(res, await rooms.tick(id)) : fail(res, 400, "bad_id", "Невірна кімната");
      case "view": {
        if (!id) return fail(res, 400, "bad_id", "Невірна кімната");
        const out = await rooms.view(nick, id);
        if (out.error) return send(res, out);
        return send(res, out, { pub: out.pub, priv: out.priv });
      }
      case "mine": return res.status(200).json({ ok: true, rooms: await rooms.mine(nick) });
      default: return fail(res, 400, "bad_action", "Невідома дія");
    }
  } catch (e) {
    console.error("api/room", body.action, e);
    return fail(res, 500, "server_error", "Помилка сервера — спробуй ще раз");
  }
};
