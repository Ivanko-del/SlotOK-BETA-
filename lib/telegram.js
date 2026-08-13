async function tg(method, payload) {
  const token = process.env.BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("Telegram API error", method, data);
  return data;
}

function sendMessage(chatId, text, extra) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

function editMessageText(chatId, messageId, text, extra) {
  return tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", ...extra });
}

function answerCallbackQuery(callbackQueryId, text) {
  return tg("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false });
}

module.exports = { tg, sendMessage, editMessageText, answerCallbackQuery };
