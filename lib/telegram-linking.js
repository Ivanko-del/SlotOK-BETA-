// lib/telegram-linking.js
const { dbGet, dbUpdate } = require("./firebase");

const TOKEN_TTL_MS = 10 * 60 * 1000;

async function completeLink(chatId, token) {
  if (!token) return { ok: false, reason: "missing" };
  const entry = await dbGet(`telegram_link_tokens/${token}`);
  if (!entry || !entry.nick) return { ok: false, reason: "not_found" };
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    await dbUpdate("", { [`telegram_link_tokens/${token}`]: null });
    return { ok: false, reason: "expired" };
  }
  await dbUpdate("", {
    [`users/${entry.nick}/telegramChatId`]: chatId,
    [`telegram_links/${chatId}`]: entry.nick,
    [`telegram_link_tokens/${token}`]: null,
  });
  return { ok: true, nick: entry.nick };
}

async function unlink(chatId) {
  const nick = await dbGet(`telegram_links/${chatId}`);
  if (!nick) return null;
  await dbUpdate("", {
    [`users/${nick}/telegramChatId`]: null,
    [`telegram_links/${chatId}`]: null,
  });
  return nick;
}

async function resolveNick(chatId) {
  return dbGet(`telegram_links/${chatId}`);
}

module.exports = { completeLink, unlink, resolveNick, TOKEN_TTL_MS };
