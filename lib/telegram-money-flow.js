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

const WITHDRAW_METHOD_KEYBOARD = { reply_markup: { keyboard: [["🟢 PrivatBank", "🐈 Monobank"], ["₮ USDT"], ["/cancel"]], resize_keyboard: true } };
const WITHDRAW_METHOD_LABELS = { "🟢 PrivatBank": "privat", "🐈 Monobank": "mono", "₮ USDT": "usdt" };

function withdrawButtons(id) {
  return { inline_keyboard: [[{ text: "✅ Підтвердити", callback_data: `wd:approve:${id}` }, { text: "❌ Відхилити", callback_data: `wd:reject:${id}` }]] };
}

async function startWithdraw(chatId, nick) {
  const u = (await dbGet(`users/${nick}`)) || {};
  if (u.pendingWithdraw) return sendMessage(chatId, "❌ У тебе вже є активна заявка на вивід. Дочекайся її обробки.");
  await saveState(chatId, "withdraw", "amount", { balance: u.balance || 0 });
  return sendMessage(chatId, `Баланс: ${u.balance || 0}₴. Скільки вивести (мін. 200₴)?`, { reply_markup: { keyboard: [["/cancel"]], resize_keyboard: true } });
}

async function handleWithdrawReply(chatId, nick, step, data, text) {
  if (step === "amount") {
    const amount = parseInt(text, 10);
    if (!amount || amount < 200) return sendMessage(chatId, "❌ Мінімальна сума виводу — 200₴. Спробуй ще:");
    if (amount > data.balance) return sendMessage(chatId, "❌ Недостатньо коштів. Спробуй меншу суму:");
    await saveState(chatId, "withdraw", "method", { amount });
    return sendMessage(chatId, "Обери спосіб виводу:", WITHDRAW_METHOD_KEYBOARD);
  }

  if (step === "method") {
    const method = WITHDRAW_METHOD_LABELS[text];
    if (!method) return sendMessage(chatId, "Обери спосіб кнопками нижче.", WITHDRAW_METHOD_KEYBOARD);
    await saveState(chatId, "withdraw", "card", { amount: data.amount, method });
    return sendMessage(chatId, method === "usdt" ? "Введи USDT TRC20 адресу:" : "Введи номер картки:", { reply_markup: { keyboard: [["/cancel"]], resize_keyboard: true } });
  }

  if (step === "card") {
    const card = text.trim();
    if (!card) return sendMessage(chatId, "Введи реквізити для виводу:");
    // Re-read here, not from the snapshot taken at dialog start: the site can
    // have withdrawn/spent in the meantime, and a double-tap on this message
    // runs two invocations concurrently. Claiming pendingWithdraw *before*
    // debiting narrows that race to a single round trip.
    const u = (await dbGet(`users/${nick}`)) || {};
    if (u.pendingWithdraw) {
      await clearState(chatId);
      return sendMessage(chatId, "❌ У тебе вже є активна заявка на вивід.");
    }
    if ((u.balance || 0) < data.amount) {
      await clearState(chatId);
      return sendMessage(chatId, "❌ Недостатньо коштів, заявку скасовано.");
    }
    await dbUpdate(`users/${nick}`, { pendingWithdraw: true });
    await dbIncrement(`users/${nick}/balance`, -data.amount);
    const userId = u.id || nick;
    const reqId = `${nick}_${Date.now()}`;
    await dbSet(`withdraw_requests/${reqId}`, { user: nick, userId, amount: data.amount, method: data.method, card, status: "pending", time: Date.now() });
    await dbSet(`users/${nick}/withdraws/${reqId}`, { amount: data.amount, method: data.method, status: "pending", time: Date.now() });
    await clearState(chatId);
    await sendMessage(chatId, `✅ Заявку на вивід ${data.amount}₴ прийнято! Обробка 1-24 год.`, { reply_markup: { remove_keyboard: true } });

    const adminChatId = await dbGet("bot_config/adminChatId");
    if (adminChatId) {
      await sendMessage(adminChatId, `💸 <b>Нова заявка на вивід</b>\n👤 ${esc(nick)}\n💵 ${data.amount}₴ · ${esc(data.method)}\n💳 ${esc(card)}`, { reply_markup: withdrawButtons(reqId) });
    }
  }
}

async function handleMoneyFlowReply(chatId, nick, text) {
  const state = await getState(chatId);
  if (!state) return false;
  if (text === "/cancel") {
    await clearState(chatId);
    await sendMessage(chatId, "Скасовано.", { reply_markup: { remove_keyboard: true } });
    return true;
  }
  if (state.type === "deposit") await handleDepositReply(chatId, nick, state.step, state.data, text);
  else if (state.type === "withdraw") await handleWithdrawReply(chatId, nick, state.step, state.data, text);
  return true;
}

module.exports = { startDeposit, startWithdraw, getState, saveState, clearState, handleMoneyFlowReply, STATE_TTL_MS };
