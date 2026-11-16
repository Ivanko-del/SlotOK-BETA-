// Друзі та запрошення за стіл (викликається з api/reward.js).
//
// Дані (пише лише сервер; кожен читає тільки свої списки):
//   friends/<нік>/<інший>       = { since }   — взаємно, два записи
//   friend_requests/<кому>/<від> = { at }      — вхідні запити
//   room_invites/<кому>/<id кімнати> = { from, game, roomId, bet, size, at }
//
// Усі зміни — тут: перевірка ніка, ліміти (друзів ≤ MAX_FRIENDS, запитів ≤
// MAX_PENDING, запрошень ≤ MAX_INVITES), блокування (users/<кому>/blocked/<від>),
// запрошення — лише друзям і лише в кімнату, де відправник уже сидить.
// Запрошення живе INVITE_TTL і прибирається ліниво (при наступному запрошенні).
// Ставку за запрошеного не списуємо: він заходить звичайним rooms.join.

const { dbGet, dbUpdate } = require("./firebase");
const { allow } = require("./rate-limit");
const { _parse: parseRoom } = require("./rooms");

const MAX_FRIENDS = 200;
const MAX_PENDING = 50;
const MAX_INVITES = 20;
const INVITE_TTL = 5 * 60000;

const KEY_RE = /^[^.$#[\]/\x00-\x1f\x7f]{1,64}$/;
const ROOM_ID_RE = /^[a-z0-9]{12,40}$/;

const err = (status, error, message) => ({ ok: false, status, error, message });
const cleanNick = (v) => (typeof v === "string" && KEY_RE.test(v) ? v : null);
const count = (o) => (o && typeof o === "object" ? Object.keys(o).length : 0);

async function userExists(nick) {
  return (await dbGet(`users/${nick}/balance`)) !== null;
}
const isBlockedBy = async (target, by) => (await dbGet(`users/${by}/blocked/${target}`)) != null;

async function request(nick, rawTo) {
  const to = cleanNick(rawTo);
  if (!to) return err(400, "bad_nick", "Вкажи нік гравця");
  if (to === nick) return err(400, "self", "Не можна додати самого себе");
  if (!(await allow(`friendreq:${nick}`, 30, 3600000))) return err(429, "rate_limited", "Забагато запитів — спробуй пізніше");
  if (!(await userExists(to))) return err(404, "no_user", "Гравця не знайдено");
  if (await isBlockedBy(nick, to)) return err(403, "blocked", "Цьому гравцю не можна надіслати запит");
  if (await isBlockedBy(to, nick)) return err(403, "blocked_by_me", "Ти заблокував цього гравця — спершу розблокуй");
  const [mine, theirs, incoming, pending] = await Promise.all([
    dbGet(`friends/${nick}`), dbGet(`friends/${to}`), dbGet(`friend_requests/${nick}/${to}`), dbGet(`friend_requests/${to}`),
  ]);
  if (mine && mine[to]) return err(409, "already", "Ви вже друзі");
  if (incoming) return accept(nick, to); // він уже просив мене — просто дружимо
  if (count(mine) >= MAX_FRIENDS) return err(409, "friends_full", `У тебе вже ${MAX_FRIENDS} друзів`);
  if (count(theirs) >= MAX_FRIENDS) return err(409, "their_full", "У цього гравця повний список друзів");
  if (pending && pending[nick]) return { ok: true, state: "pending" };
  if (count(pending) >= MAX_PENDING) return err(409, "their_pending_full", "У цього гравця забагато запитів — спробуй пізніше");
  await dbUpdate("", { [`friend_requests/${to}/${nick}`]: { at: Date.now() } });
  return { ok: true, state: "sent" };
}

async function accept(nick, rawFrom) {
  const from = cleanNick(rawFrom);
  if (!from || from === nick) return err(400, "bad_nick", "Невірний нік");
  const [req, mine, theirs] = await Promise.all([
    dbGet(`friend_requests/${nick}/${from}`), dbGet(`friends/${nick}`), dbGet(`friends/${from}`),
  ]);
  if (!req) return err(404, "no_request", "Запиту немає");
  if (!(mine && mine[from])) {
    if (count(mine) >= MAX_FRIENDS) return err(409, "friends_full", `У тебе вже ${MAX_FRIENDS} друзів`);
    if (count(theirs) >= MAX_FRIENDS) return err(409, "their_full", "У цього гравця повний список друзів");
  }
  if ((await isBlockedBy(from, nick)) || (await isBlockedBy(nick, from))) return err(403, "blocked", "Недоступно");
  const since = Date.now();
  await dbUpdate("", {
    [`friends/${nick}/${from}`]: { since }, [`friends/${from}/${nick}`]: { since },
    [`friend_requests/${nick}/${from}`]: null, [`friend_requests/${from}/${nick}`]: null,
  });
  return { ok: true, state: "friends" };
}

async function decline(nick, rawFrom) {
  const from = cleanNick(rawFrom);
  if (!from) return err(400, "bad_nick", "Невірний нік");
  await dbUpdate("", { [`friend_requests/${nick}/${from}`]: null });
  return { ok: true };
}

async function cancel(nick, rawTo) {
  const to = cleanNick(rawTo);
  if (!to) return err(400, "bad_nick", "Невірний нік");
  await dbUpdate("", { [`friend_requests/${to}/${nick}`]: null });
  return { ok: true };
}

async function remove(nick, rawWho) {
  const who = cleanNick(rawWho);
  if (!who || who === nick) return err(400, "bad_nick", "Невірний нік");
  await dbUpdate("", { [`friends/${nick}/${who}`]: null, [`friends/${who}/${nick}`]: null });
  return { ok: true };
}

// Запросити друга за стіл. Кімната — з room_state (там справжні гравці й ставка).
async function invite(nick, rawTo, rawId) {
  const to = cleanNick(rawTo);
  if (!to || to === nick) return err(400, "bad_nick", "Невірний нік");
  if (typeof rawId !== "string" || !ROOM_ID_RE.test(rawId)) return err(400, "bad_id", "Невірна кімната");
  const [fr, back] = await Promise.all([dbGet(`friends/${nick}/${to}`), dbGet(`friends/${to}/${nick}`)]);
  if (!fr || !back) return err(403, "not_friends", "Запрошувати можна лише друзів");
  if (await isBlockedBy(nick, to)) return err(403, "blocked", "Цьому гравцю не можна надіслати запрошення");
  const room = parseRoom(await dbGet(`room_state/${rawId}`));
  if (!room) return err(404, "no_room", "Кімнату не знайдено");
  if (!room.players.includes(nick)) return err(403, "not_in_room", "Ти не в цій кімнаті");
  if (room.status !== "waiting") return err(409, "started", "Гра вже почалась");
  if (room.players.length >= room.size) return err(409, "full", "Місць немає");
  if (room.players.includes(to)) return err(409, "already", "Друг уже за столом");
  if (!(await allow(`friendinv:${nick}`, 20, 60000))) return err(429, "rate_limited", "Забагато запрошень — зачекай хвилину");

  const now = Date.now();
  const cur = (await dbGet(`room_invites/${to}`)) || {};
  const upd = {};
  let live = 0;
  for (const [k, v] of Object.entries(cur)) {
    if (!v || typeof v.at !== "number" || now - v.at > INVITE_TTL) upd[`room_invites/${to}/${k}`] = null; // ліниве прибирання
    else if (k !== rawId) live++;
  }
  if (live >= MAX_INVITES) return err(429, "their_invites_full", "У друга забагато запрошень");
  upd[`room_invites/${to}/${rawId}`] = { from: nick, game: room.game, roomId: rawId, bet: room.bet, size: room.size, at: now };
  await dbUpdate("", upd);
  return { ok: true };
}

// Адресат прибирає своє запрошення (відхилив / прийняв / застаріло).
async function dismissInvite(nick, rawId) {
  if (typeof rawId !== "string" || !ROOM_ID_RE.test(rawId)) return err(400, "bad_id", "Невірна кімната");
  await dbUpdate("", { [`room_invites/${nick}/${rawId}`]: null });
  return { ok: true };
}

module.exports = { request, accept, decline, cancel, remove, invite, dismissInvite, MAX_FRIENDS, MAX_PENDING, MAX_INVITES, INVITE_TTL };
