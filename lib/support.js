// Чат підтримки на сервері (api/support.js).
//
// Повідомлення — support_chats/<нік>/<id> (той самий вузол, що й раніше, тож
// стара історія лишається): { sender: 'user'|'ai'|'support'|'admin', text?,
// imgUrl?, time, by?, topic? }. Стан розмови — support_threads/<нік>:
//   status: 'bot'      — відповідає бот;
//           'waiting'  — чекає людину (бот не впорався, або гравець покликав);
//           'answered' — підтримка відповіла, чекаємо гравця;
//           'closed'   — розмову закрито (нове повідомлення відкриє її знову);
//   lastTs, lastText, lastFrom, unreadStaff, unreadUser, updatedAt, by.
// Бот відповідає тут, за базою shared/support-kb.js. Поки розмова в людини
// (waiting / answered), бот мовчить — щоб не перебивати підтримку.

const KB = require("../shared/support-kb");
const { dbGet, dbKeys, dbUpdate, dbPush, dbTransaction } = require("./firebase");
const { sendMessage, esc } = require("./telegram");

// Сповіщення адміну в Telegram, коли розмова чекає людину. Формат рядка
// «💬 Гравець <нік> (підтримка):» парсить telegram-webhook.js — відповідь
// на це повідомлення в Telegram піде гравцю в чат.
async function notifyStaff(nick, text) {
  try {
    const chatId = await dbGet("bot_config/adminChatId");
    if (chatId) await sendMessage(chatId, `💬 Гравець ${esc(nick)} (підтримка):\n${esc(text || "[фото — переглянь в адмінці на сайті]")}`);
  } catch (e) { console.warn("support notify failed", e.message); }
}

const OWNER = "theivankoo";
const MAX_TEXT = 2000;
const MAX_IMG = 1500000; // ≈1.1 МБ base64 — браузер стискає скрін до 1280 px
const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const NICK_RE = /^[^.#$[\]/]{1,40}$/;
const STATUSES = ["bot", "waiting", "answered", "closed"];

const chatPath = (nick) => `support_chats/${nick}`;
const threadPath = (nick) => `support_threads/${nick}`;
const num = (v) => Number(v) || 0;
const no = (status, error, message) => ({ ok: false, status, error, message });

function cleanText(t) {
  if (typeof t !== "string") return "";
  return t.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, MAX_TEXT);
}
function cleanImg(u) {
  return typeof u === "string" && u.length <= MAX_IMG && IMG_RE.test(u) ? u : null;
}
const preview = (m) => (m.text ? m.text.slice(0, 120) : m.imgUrl ? "📷 Фото" : "");

async function isStaff(nick) {
  if (!nick) return false;
  if (nick.toLowerCase() === OWNER) return "admin";
  const [admin, role] = await Promise.all([dbGet(`users/${nick}/isAdmin`), dbGet(`users/${nick}/role`)]);
  if (admin === true) return "admin";
  return role === "support" || role === "admin" ? "support" : false;
}

// Запис повідомлення + оновлення стану розмови однією транзакцією стану.
async function post(nick, msg, threadPatch) {
  const ref = await dbPush(chatPath(nick), msg);
  await dbTransaction(threadPath(nick), (cur) => {
    const t = cur || {};
    const next = { ...t, lastTs: msg.time, lastText: preview(msg), lastFrom: msg.sender, updatedAt: msg.time };
    return threadPatch(next, t);
  });
  return ref && ref.name;
}

function botMessage(text, topic) {
  return { sender: "ai", text, time: Date.now(), ...(topic ? { topic } : {}) };
}

// Відповідь бота на повідомлення гравця. Повертає { reply, handoff }.
function botAnswer({ text, img, topicId }, counter) {
  const n = num(counter);
  if (topicId) {
    const t = KB.supportTopic(topicId);
    if (t) return { reply: KB.supportPick(t.replies, n), handoff: !!t.human, topic: t.id };
  }
  if (!text && img) return { reply: KB.supportPick(KB.SUPPORT_PHOTO_REPLY, n), handoff: true };
  const m = KB.supportMatch(text);
  if (m) return { reply: KB.supportPick(m.topic.replies, n), handoff: !!m.topic.human, topic: m.topic.id };
  return { reply: KB.supportPick(KB.SUPPORT_FALLBACK, n), handoff: true };
}

// Перше відкриття чату: привітання бота, якщо історії ще немає.
async function open(nick) {
  const [thread, keys] = await Promise.all([dbGet(threadPath(nick)), dbKeys(chatPath(nick)).catch(() => [])]);
  if (!thread && !keys.length) {
    await post(nick, botMessage(KB.supportPick(KB.SUPPORT_GREETING)), (t) => ({ ...t, status: "bot", unreadStaff: 0, unreadUser: 0 }));
  }
  const t = (await dbGet(threadPath(nick))) || { status: "bot" };
  return { ok: true, status: t.status || "bot" };
}

async function send(nick, body) {
  const text = cleanText(body.text);
  const img = body.imgUrl ? cleanImg(body.imgUrl) : null;
  if (body.imgUrl && !img) return no(400, "bad_image", "Фото не підходить: JPG/PNG/WebP/GIF до ~1 МБ");
  const topicId = typeof body.topic === "string" ? body.topic.slice(0, 32) : "";
  const quick = topicId ? KB.supportTopic(topicId) : null;
  if (!text && !img && !quick) return no(400, "empty", "Порожнє повідомлення");

  const msg = { sender: "user", time: Date.now() };
  if (text) msg.text = text;
  else if (quick && !img) msg.text = quick.quick || quick.id;
  if (img) msg.imgUrl = img;
  if (quick) msg.topic = quick.id;

  const before = (await dbGet(threadPath(nick))) || {};
  const withHuman = before.status === "waiting" || before.status === "answered";
  await post(nick, msg, (t) => ({
    ...t,
    status: withHuman ? "waiting" : (t.status === "closed" ? "bot" : t.status || "bot"),
    unreadStaff: withHuman ? num(t.unreadStaff) + 1 : num(t.unreadStaff),
  }));
  if (withHuman && topicId !== KB.SUPPORT_HUMAN_TOPIC) {
    await notifyStaff(nick, msg.text);
    return { ok: true, status: "waiting", bot: null };
  }

  const counter = num(before.botCount);
  const a = botAnswer({ text, img, topicId }, counter);
  const reply = botMessage(a.reply, a.topic);
  await post(nick, reply, (t) => ({
    ...t,
    botCount: counter + 1,
    status: a.handoff ? "waiting" : t.status === "waiting" ? "waiting" : "bot",
    unreadStaff: a.handoff ? num(t.unreadStaff) + 1 : num(t.unreadStaff),
    ...(a.handoff ? { waitingSince: Date.now() } : {}),
  }));
  if (a.handoff && before.status !== "waiting") await notifyStaff(nick, msg.text);
  return { ok: true, status: a.handoff ? "waiting" : "bot", bot: { text: reply.text, handoff: a.handoff } };
}

async function markRead(nick) {
  await Promise.all([
    dbUpdate(threadPath(nick), { unreadUser: 0 }).catch(() => null),
    dbUpdate(`users/${nick}`, { supportUnread: 0 }),
  ]);
  return { ok: true };
}

// ── Підтримка (role support / admin) ──
async function staffReply(staff, body) {
  const role = await isStaff(staff);
  if (!role) return no(403, "forbidden", "Немає доступу до чатів підтримки");
  const nick = typeof body.nick === "string" ? body.nick : "";
  if (!NICK_RE.test(nick)) return no(400, "bad_nick", "Невірний гравець");
  const text = cleanText(body.text);
  const img = body.imgUrl ? cleanImg(body.imgUrl) : null;
  if (body.imgUrl && !img) return no(400, "bad_image", "Фото не підходить");
  if (!text && !img) return no(400, "empty", "Порожня відповідь");
  if (!(await dbGet(`users/${nick}/id`)) && !(await dbGet(threadPath(nick)))) return no(404, "not_found", "Гравця не знайдено");
  const msg = { sender: role, by: staff, time: Date.now() };
  if (text) msg.text = text;
  if (img) msg.imgUrl = img;
  await post(nick, msg, (t) => ({ ...t, status: "answered", by: staff, unreadStaff: 0, unreadUser: num(t.unreadUser) + 1 }));
  await dbTransaction(`users/${nick}/supportUnread`, (c) => num(c) + 1);
  return { ok: true };
}

async function staffStatus(staff, body) {
  if (!(await isStaff(staff))) return no(403, "forbidden", "Немає доступу до чатів підтримки");
  const nick = typeof body.nick === "string" ? body.nick : "";
  if (!NICK_RE.test(nick)) return no(400, "bad_nick", "Невірний гравець");
  if (!STATUSES.includes(body.status)) return no(400, "bad_status", "Невірний статус");
  const patch = { status: body.status, updatedAt: Date.now(), by: staff };
  if (body.status === "closed") patch.unreadStaff = 0;
  await dbUpdate(threadPath(nick), patch);
  if (body.status === "closed") {
    await post(nick, botMessage("Розмову закрито підтримкою. Якщо питання лишилось — просто напиши сюди, чат відкриється знову."), (t) => t);
  }
  return { ok: true };
}

async function staffRead(staff, body) {
  if (!(await isStaff(staff))) return no(403, "forbidden", "Немає доступу до чатів підтримки");
  const nick = typeof body.nick === "string" ? body.nick : "";
  if (!NICK_RE.test(nick)) return no(400, "bad_nick", "Невірний гравець");
  await dbUpdate(threadPath(nick), { unreadStaff: 0 });
  return { ok: true };
}

module.exports = { open, send, markRead, staffReply, staffStatus, staffRead, isStaff, botAnswer, _MAX_IMG: MAX_IMG };
