// lib/telegram-money-flow.js
const { dbGet, dbSet, dbUpdate, dbIncrement, dbDelete } = require("./firebase");
const { sendMessage, esc } = require("./telegram");

const STATE_TTL_MS = 10 * 60 * 1000;

const AMOUNT_KEYBOARD = { reply_markup: { keyboard: [["100", "300", "500"], ["1000", "Інша сума"], ["/cancel"]], resize_keyboard: true } };
const DEPOSIT_METHOD_KEYBOARD = { reply_markup: { keyboard: [["🐈 Monobank"], ["/cancel"]], resize_keyboard: true } };
const DEPOSIT_METHOD_LABELS = { "🐈 Monobank": "mono" };

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
  return sendMessage(chatId, "Донат — добровільна підтримка проєкту: він не змінює ігровий баланс і нічого не додає в гру (лише значок «Підтримав проєкт»). Обери суму в гривнях (мін. 50) або напиши свою:", AMOUNT_KEYBOARD);
}

function depositButtons(id) {
  return { inline_keyboard: [[{ text: "✅ Підтвердити (значок)", callback_data: `dep:approve:${id}` }, { text: "❌ Відхилити", callback_data: `dep:reject:${id}` }]] };
}

async function handleDepositReply(chatId, nick, step, data, text) {
  if (step === "amount") {
    if (text === "Інша сума") return sendMessage(chatId, "Введи суму цифрами (мін. 50 грн):");
    const amount = parseInt(text, 10);
    if (!amount || amount < 50) return sendMessage(chatId, "❌ Мінімальна сума донату — 50 грн. Спробуй ще:");
    await saveState(chatId, "deposit", "method", { amount });
    return sendMessage(chatId, `Сума: ${amount} грн. Обери спосіб:`, DEPOSIT_METHOD_KEYBOARD);
  }

  if (step === "method") {
    const method = DEPOSIT_METHOD_LABELS[text];
    if (!method) return sendMessage(chatId, "Обери спосіб кнопками нижче.", DEPOSIT_METHOD_KEYBOARD);

    const u = (await dbGet(`users/${nick}`)) || {};
    const userId = u.id || nick;
    const reqId = `${nick}_${Date.now()}`;
    await dbSet(`deposit_requests/${reqId}`, { user: nick, userId, amount: data.amount, method, cardId: u.activeCardId || null, status: "pending", time: Date.now() });
    await clearState(chatId);
    await sendMessage(chatId, `✅ Заявку на донат ${data.amount} грн подано! Реквізити дивись у застосунку (Гаманець → Донат). Після підтвердження в профілі зʼявиться значок «Підтримав проєкт». Ігровий баланс не змінюється.`, { reply_markup: { remove_keyboard: true } });

    const adminChatId = await dbGet("bot_config/adminChatId");
    if (adminChatId) {
      await sendMessage(adminChatId, `💰 <b>Нова заявка на донат</b>\n👤 ${esc(nick)}\n💵 ${data.amount} грн · ${esc(method)}`, { reply_markup: depositButtons(reqId) });
    }
  }
}

// Вивід коштів прибрано: ігрова валюта віртуальна й не виводиться. Залишилась
// лише кнопка для старих заявок (webhook повертає їхню суму на баланс).
function withdrawButtons(id) {
  return { inline_keyboard: [[{ text: "↩ Повернути на баланс", callback_data: `wd:reject:${id}` }]] };
}

async function startWithdraw(chatId) {
  return sendMessage(chatId, "Вивід коштів недоступний: ігрова валюта віртуальна й не виводиться.");
}

async function handleMoneyFlowReply(chatId, nick, text) {
  const state = await getState(chatId);
  if (!state) return false;
  if (state.type === "deposit") await handleDepositReply(chatId, nick, state.step, state.data, text);
  else if (state.type === "withdraw") await clearState(chatId);
  return true;
}

module.exports = { startDeposit, startWithdraw, withdrawButtons, getState, saveState, clearState, handleMoneyFlowReply, STATE_TTL_MS };
