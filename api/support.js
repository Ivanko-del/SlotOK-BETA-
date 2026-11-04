// ============================================================
// SlotOK — чат підтримки (Vercel Serverless Function)
//
// POST /api/support  Authorization: Bearer <Firebase ID token>
//   гравець:
//     { action: "open" }                         — привітання бота, якщо чат порожній
//     { action: "send", text?, imgUrl?, topic? } — повідомлення (бот відповідає сам)
//     { action: "read" }                         — прочитав відповіді підтримки
//   підтримка (role support / admin):
//     { action: "staffReply",  nick, text?, imgUrl? }
//     { action: "staffStatus", nick, status }    — bot | waiting | answered | closed
//     { action: "staffRead",   nick }
//
// Логіка й формат — lib/support.js, база відповідей — shared/support-kb.js.
// 503 { error: "not_configured" } без FIREBASE_SERVICE_ACCOUNT_KEY — тоді
// застосунок пише в базу напряму, як раніше (запасний режим у браузері).
// ============================================================

const { getServiceAccount } = require("../lib/google-auth");
const { fail, authNick, tooFast } = require("../lib/player");
const S = require("../lib/support");

const ACTIONS = {
  open: (nick) => S.open(nick),
  send: (nick, body) => S.send(nick, body),
  read: (nick) => S.markRead(nick),
  staffReply: (nick, body) => S.staffReply(nick, body),
  staffStatus: (nick, body) => S.staffStatus(nick, body),
  staffRead: (nick, body) => S.staffRead(nick, body),
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!getServiceAccount()) return fail(res, 503, "not_configured", "Сервер підтримки ще не налаштований");
  const nick = await authNick(req, res, "support");
  if (!nick) return;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const action = Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
  if (!action) return fail(res, 400, "bad_request", "Невідома дія");
  // Чат — не гра: 12 запитів за 10 с вистачає з запасом, а флуд ріже.
  if (tooFast(nick, 12)) return fail(res, 429, "rate_limited", "Не так швидко — зачекай кілька секунд");
  try {
    const r = await action(nick, body);
    if (!r.ok) return fail(res, r.status, r.error, r.message);
    const { ok, ...data } = r;
    res.status(200).json(data);
  } catch (err) {
    console.error("support error", body.action, err);
    fail(res, 500, "server_error", "Помилка сервера. Спробуй ще раз.");
  }
};
