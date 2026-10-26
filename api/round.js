// ============================================================
// SlotOK — серверний раунд гри з кількома ходами (Mines, Tower, Hi-Lo)
//
// POST /api/round  Authorization: Bearer <Firebase ID token>
//   { action: "start",   game, bet, params }  — списати ставку, почати раунд
//   { action: "move",    game, move }         — хід (клітинка / стовпчик / вище-нижче)
//   { action: "cashout", game }               — забрати поточний виграш
//   { action: "state",   game }               — поточний раунд (після перезавантаження)
//
// Стан раунду — game_sessions/<нік>/<гра>, браузеру недоступний: де міни і
// порядок карт клієнт дізнається лише тоді, коли гравець їх відкрив або раунд
// закінчився. Кожен хід — dbTransaction, тож два паралельні запити не зіграють
// один хід двічі і не заберуть виграш двічі.
//
// Почати новий раунд, не закінчивши старий, можна: старий закривається сам —
// з виграшем, якщо він уже є, або з поверненням ставки, якщо ще не було ходу
// (тоді гравець нічого не ризикував і нічого не дізнався).
// ============================================================

const { dbGet, dbUpdate, dbTransaction } = require("../lib/firebase");
const { getServiceAccount } = require("../lib/google-auth");
const { parseBet, payFor } = require("../lib/games");
const { SESSION_GAMES } = require("../lib/sessions");
const { rng, fail, authNick, tooFast, blockedReason, moveBalance } = require("../lib/player");

const sessionPath = (nick, game) => `game_sessions/${nick}/${game}`;

// Сесія з бази → з відновленими порожніми масивами (див. fix у lib/sessions.js).
function load(def, raw) {
  return raw && raw.state ? { ...raw, state: def.fix(raw.state) } : raw;
}

// Виплата за раундом у статусі "cashing": спершу гроші, потім позначка "done".
// Якщо між ними все впаде, наступний запит повторить виплату (рідкісний випадок
// на користь гравця, а не втрачений виграш).
async function payOut(nick, game, session) {
  const { balance } = await moveBalance(nick, session.payout);
  await dbUpdate(sessionPath(nick, game), { status: "done", doneAt: Date.now() });
  return balance;
}

// Закриває незакінчений раунд перед новим.
async function settlePrevious(nick, game) {
  const def = SESSION_GAMES[game];
  let action = null;
  const tx = await dbTransaction(sessionPath(nick, game), (raw) => {
    const cur = load(def, raw);
    action = null;
    if (!cur || (cur.status !== "active" && cur.status !== "cashing")) return undefined;
    if (cur.status === "cashing") { action = "pay"; return undefined; }
    if (def.timed) {
      // Не забраний раунд Crash/Balloon: автокешаут, якщо досяг цілі; якщо ще
      // летить — забираємо поточний множник; якщо вже вибухнув — програш.
      const r = def.resolve(cur.state, Date.now(), Infinity);
      if (r.status === "lost") return { ...cur, status: "lost", doneAt: Date.now() };
      action = "pay";
      return { ...cur, status: "cashing", payout: payFor(cur.bet, r.mult) };
    }
    const mult = def.mult(cur.state);
    if (mult > 0) { action = "pay"; return { ...cur, status: "cashing", payout: payFor(cur.bet, mult) }; }
    action = "refund";
    return { ...cur, status: "refunded", doneAt: Date.now() };
  });
  const s = load(def, tx.value);
  if (action === "pay") await payOut(nick, game, s);
  if (action === "refund" && tx.committed) await moveBalance(nick, s.bet);
}

function publicView(def, session, reveal) {
  return {
    status: session.status,
    bet: session.bet,
    params: session.params,
    mult: def.mult(session.state),
    view: def.view(session.state, reveal),
  };
}

async function start(req, res, nick, game, def, body) {
  const bet = parseBet(body.bet);
  const params = def.parse(body.params);
  if (!bet) return fail(res, 400, "bad_bet", "Невірна сума ставки");
  if (!params) return fail(res, 400, "bad_params", "Невірні параметри гри");
  const blocked = await blockedReason(nick);
  if (blocked) return fail(res, 403, "blocked", blocked);

  await settlePrevious(nick, game);
  const path = sessionPath(nick, game);
  // Займаємо слот раунду; паралельний start того самого гравця отримає 409.
  const claim = await dbTransaction(path, (cur) =>
    cur && (cur.status === "active" || cur.status === "cashing" || cur.status === "starting") && Date.now() - (cur.startedAt || 0) < 30000
      ? undefined
      : { status: "starting", startedAt: Date.now() });
  if (!claim.committed) return fail(res, 409, "in_progress", "Раунд уже починається");

  const debit = await moveBalance(nick, -bet);
  if (!debit.ok) {
    await dbUpdate(path, { status: "void" });
    return fail(res, 402, "insufficient", "Недостатньо коштів", { balance: debit.balance });
  }
  const ctx = def.timed ? { luck: ((await dbGet(`users/${nick}/luckyGamesLeft`)) || 0) > 0 } : {};
  const session = { status: "active", game, bet, params, state: def.init(params, rng, ctx), startedAt: Date.now() };
  await dbUpdate(path, session);
  res.status(200).json({ ...publicView(def, session, false), balance: debit.balance });
}

async function move(req, res, nick, game, def, body) {
  if (def.timed) return poll(req, res, nick, game, def);
  let outcome = null; // "invalid" | "inactive" | "bust" | "ok" | "finished"
  const tx = await dbTransaction(sessionPath(nick, game), (raw) => {
    const cur = load(def, raw);
    if (!cur || cur.status !== "active") { outcome = "inactive"; return undefined; }
    const r = def.move(cur.state, body.move, rng);
    if (!r) { outcome = "invalid"; return undefined; }
    if (r.bust) { outcome = "bust"; return { ...cur, state: r.state, status: "lost", doneAt: Date.now() }; }
    if (def.finished(r.state)) {
      outcome = "finished";
      return { ...cur, state: r.state, status: "cashing", payout: payFor(cur.bet, def.mult(r.state)) };
    }
    outcome = "ok";
    return { ...cur, state: r.state };
  });
  if (outcome === "inactive") return fail(res, 409, "no_round", "Раунд уже завершено — почни новий");
  if (outcome === "invalid") return fail(res, 400, "bad_move", "Такий хід неможливий");
  const s = load(def, tx.value);
  if (outcome === "finished") {
    const balance = await payOut(nick, game, s);
    return res.status(200).json({ ...publicView(def, { ...s, status: "done" }, true), payout: s.payout, balance });
  }
  res.status(200).json(publicView(def, s, outcome === "bust"));
}

// Crash/Balloon: «ще летить?» і кешаут за серверним часом.
async function timedSettle(res, nick, game, def, claim) {
  let outcome = null, mult = 0;
  const tx = await dbTransaction(sessionPath(nick, game), (raw) => {
    const cur = load(def, raw);
    if (!cur || cur.status !== "active") { outcome = "inactive"; return undefined; }
    const r = def.resolve(cur.state, Date.now(), claim);
    outcome = r.status;
    if (r.status === "active") { mult = r.mult; return undefined; }
    if (r.status === "lost") return { ...cur, status: "lost", doneAt: Date.now() };
    mult = r.mult;
    return { ...cur, status: "cashing", payout: payFor(cur.bet, r.mult) };
  });
  if (outcome === "inactive") return fail(res, 409, "no_round", "Раунд уже завершено");
  const s = load(def, tx.value);
  if (outcome === "active") return res.status(200).json({ status: "active", mult });
  if (outcome === "lost") return res.status(200).json(publicView(def, s, true));
  const balance = await payOut(nick, game, s);
  res.status(200).json({ ...publicView(def, { ...s, status: "done" }, true), mult, payout: s.payout, balance });
}
function poll(req, res, nick, game, def) {
  return timedSettle(res, nick, game, def, undefined);
}

async function cashout(req, res, nick, game, def, body) {
  if (def.timed) {
    const claim = body && typeof body.claim === "number" ? body.claim : Infinity;
    return timedSettle(res, nick, game, def, claim);
  }
  let outcome = null;
  const tx = await dbTransaction(sessionPath(nick, game), (raw) => {
    const cur = load(def, raw);
    if (!cur || cur.status !== "active") { outcome = "inactive"; return undefined; }
    const mult = def.mult(cur.state);
    if (!(mult > 0)) { outcome = "nothing"; return undefined; }
    outcome = "ok";
    return { ...cur, status: "cashing", payout: payFor(cur.bet, mult) };
  });
  if (outcome === "inactive") return fail(res, 409, "no_round", "Раунд уже завершено");
  if (outcome === "nothing") return fail(res, 400, "nothing_to_cashout", "Спершу зроби хоча б один хід");
  const s = load(def, tx.value);
  const balance = await payOut(nick, game, s);
  res.status(200).json({ ...publicView(def, { ...s, status: "done" }, true), payout: s.payout, balance });
}

async function state(req, res, nick, game, def) {
  const s = load(def, await dbGet(sessionPath(nick, game)));
  if (!s || s.status !== "active") return res.status(200).json({ status: "none" });
  res.status(200).json(publicView(def, s, false));
}

const ACTIONS = { start, move, cashout, state };

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!getServiceAccount()) return fail(res, 503, "not_configured", "Серверні ігри ще не налаштовані");
  const nick = await authNick(req, res, "round");
  if (!nick) return;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const def = SESSION_GAMES[body.game];
  const handler = ACTIONS[body.action];
  if (!def || !handler) return fail(res, 400, "bad_request", "Невідома гра або дія");
  if (tooFast(nick, 80)) return fail(res, 429, "rate_limited", "Занадто швидко — зачекай секунду");
  try {
    await handler(req, res, nick, body.game, def, body);
  } catch (err) {
    console.error("round error", body.action, body.game, err);
    fail(res, 500, "server_error", "Помилка сервера. Перевір баланс і спробуй ще раз.");
  }
};
