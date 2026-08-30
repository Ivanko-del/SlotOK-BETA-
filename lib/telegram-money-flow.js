// lib/telegram-money-flow.js
const { dbGet, dbSet, dbUpdate, dbIncrement, dbDelete } = require("./firebase");
const { sendMessage, esc } = require("./telegram");

const STATE_TTL_MS = 10 * 60 * 1000;

const AMOUNT_KEYBOARD = { reply_markup: { keyboard: [["100", "300", "500"], ["1000", "Інша сума"], ["/cancel"]], resize_keyboard: true } };
const DEPOSIT_METHOD_KEYBOARD = { reply_markup: { keyboard: [["🟢 PrivatBank", "🐈 Monobank"], ["/cancel"]], resize_keyboard: true } };
const DEPOSIT_METHOD_LABELS = { "🟢 PrivatBank": "privat", "🐈 Monobank": "mono" };

async function getState(chatId) {
  const s = await dbGet(`telegram_state/${chatId}`);
  if (!s || Date.now() - (s.updatedAt || 0) > STATE_TTL_MS) return null;
  return s;
}

function saveState(chatId, type, step, data) {
  return dbSet(`telegram_state/${chatId}`, { type, step, data, updatedAt: Date.now() });
}

function clearState(chatId) {
  return dbDelete(`telegram_state/${chatId}`);
}

async function startDeposit(chatId, nick) {
  await saveState(chatId, "deposit", "amount", {});
  return sendMessage(chatId, "Обери суму поповнення (мін. 50₴) або напиши свою:", AMOUNT_KEYBOARD);
}

function depositButtons(id) {
  return { inline_keyboard: [[{ text: "✅ Підтвердити", callback_data: `dep:approve:${id}` }, { text: "❌ Відхилити", callback_data: `dep:reject:${id}` }]] };
}

async function handleDepositReply(chatId, nick, step, data, text) {
  if (step === "amount") {
    if (text === "Інша сума") return sendMessage(chatId, "Введи суму цифрами (мін. 50₴):");
    const amount = parseInt(text, 10);
    if (!amount || amount < 50) return sendMessage(chatId, "❌ Мінімальна сума поповнення — 50₴. Спробуй ще:");
    await saveState(chatId, "deposit", "method", { amount });
    return sendMessage(chatId, `Сума: ${amount}₴. Обери банк:`, DEPOSIT_METHOD_KEYBOARD);
  }

  if (step === "method") {
    const method = DEPOSIT_METHOD_LABELS[text];
    if (!method) return sendMessage(chatId, "Обери банк кнопками нижче.", DEPOSIT_METHOD_KEYBOARD);

    const u = (await dbGet(`users/${nick}`)) || {};
    const userId = u.id || nick;
    const reqId = `${nick}_${Date.now()}`;
    await dbSet(`deposit_requests/${reqId}`, { user: nick, userId, amount: data.amount, method, status: "pending", time: Date.now() });
    await clearState(chatId);
    await sendMessage(chatId, `✅ Заявку на ${data.amount}₴ подано! Реквізити дивись у застосунку в розділі «Каса». Після оплати очікуй підтвердження адміна.`, { reply_markup: { remove_keyboard: true } });

    const adminChatId = await dbGet("bot_config/adminChatId");
    if (adminChatId) {
      await sendMessage(adminChatId, `💰 <b>Нова заявка на поповнення</b>\n👤 ${esc(nick)}\n💵 ${data.amount}₴ · ${esc(method)}`, { reply_markup: depositButtons(reqId) });
    }
  }
}

async function handleMoneyFlowReply(chatId, nick, text) {
  const state = await getState(chatId);
  if (!state) return false;
  if (state.type === "deposit") await handleDepositReply(chatId, nick, state.step, state.data, text);
  return true;
}

module.exports = { startDeposit, getState, saveState, clearState, handleMoneyFlowReply, STATE_TTL_MS };
