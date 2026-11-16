// lib/telegram-linking.js
const { dbGet, dbUpdate } = require("./firebase");
const { getPrivate } = require("./private-profile");

const TOKEN_TTL_MS = 10 * 60 * 1000;

async function completeLink(chatId, token) {
  if (!token) return { ok: false, reason: "missing" };
  const entry = await dbGet(`telegram_link_tokens/${token}`);
  if (!entry || !entry.nick) return { ok: false, reason: "not_found" };
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    await dbUpdate("", { [`telegram_link_tokens/${token}`]: null });
    return { ok: false, reason: "expired" };
  }
  const prevChat = await getPrivate(entry.nick, "telegramChatId");
  await dbUpdate("", {
    [`user_private/${entry.nick}/telegramChatId`]: chatId,
    [`users/${entry.nick}/telegramChatId`]: null, // старе (публічне) місце
    [`telegram_links/${chatId}`]: entry.nick,
    [`telegram_link_tokens/${token}`]: null,
    // re-link from a new chat must revoke the old one, or it keeps /withdraw access
    ...(prevChat && String(prevChat) !== String(chatId) ? { [`telegram_links/${prevChat}`]: null } : {}),
  });
  return { ok: true, nick: entry.nick };
}

async function unlink(chatId) {
  const nick = await dbGet(`telegram_links/${chatId}`);
  if (!nick) return null;
  await dbUpdate("", {
    [`user_private/${nick}/telegramChatId`]: null,
    [`users/${nick}/telegramChatId`]: null,
    [`telegram_links/${chatId}`]: null,
  });
  return nick;
}

async function resolveNick(chatId) {
  const nick = await dbGet(`telegram_links/${chatId}`);
  if (!nick) return null;
  const back = await getPrivate(nick, "telegramChatId");
  return String(back) === String(chatId) ? nick : null;
}

module.exports = { completeLink, unlink, resolveNick, TOKEN_TTL_MS };
