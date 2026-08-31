// ============================================================
// SlotOK — Telegram bot webhook (@SlotOK_DepositBot)
// Runs as a Vercel Serverless Function.
//
// Handles:
//   - /start deep-link payloads (dep_/reset_) opened from the app
//   - /setadmin <code>            one-time admin bootstrap
//   - inline button taps          approve/reject deposit, withdraw,
//                                  password-reset requests
//   - admin-only text commands    /pending /user /stats /ban /unban /credit
//
// Everything money/account-affecting is gated on chatId === the
// stored bot_config/adminChatId — only the person who ran /setadmin
// can approve requests, ban players or adjust balances from here.
//
// Required environment variables (Vercel dashboard):
//   BOT_TOKEN, ADMIN_SETUP_CODE, WEBHOOK_SECRET
// ============================================================

const { dbGet, dbSet, dbUpdate, dbPush, dbIncrement } = require("../lib/firebase");
const { sendMessage, editMessageText, answerCallbackQuery, setMyCommands } = require("../lib/telegram");
const { completeLink, unlink, resolveNick } = require("../lib/telegram-linking");
const { startDeposit, startWithdraw, handleMoneyFlowReply } = require("../lib/telegram-money-flow");

const QUICK_KEYBOARD = {
  reply_markup: {
    keyboard: [
      ["💰 Баланс", "📊 Історія"],
      ["📥 Поповнити", "📤 Вивести"],
      ["🔗 Мій акаунт", "❓ Допомога"],
    ],
    resize_keyboard: true,
  },
};

const BUTTON_COMMANDS = {
  "💰 Баланс": "/balance",
  "📊 Історія": "/history",
  "📥 Поповнити": "/deposit",
  "📤 Вивести": "/withdraw",
  "🔗 Мій акаунт": "/me",
  "❓ Допомога": "/help",
};

const PLAYER_COMMANDS = [
  { command: "balance", description: "Баланс акаунту" },
  { command: "history", description: "Останні операції" },
  { command: "me", description: "Інфо про акаунт" },
  { command: "deposit", description: "Поповнити баланс" },
  { command: "withdraw", description: "Вивести кошти" },
  { command: "link", description: "Прив'язати акаунт SlotOK" },
  { command: "unlink", description: "Відв'язати акаунт" },
  { command: "menu", description: "Показати меню швидких дій" },
  { command: "cancel", description: "Скасувати поточну дію" },
  { command: "help", description: "Список команд" },
];

function sendQuickMenu(chatId) {
  return sendMessage(chatId, "Меню швидких дій 👇", QUICK_KEYBOARD);
}

module.exports = async (req, res) => {
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (!expectedSecret || req.headers["x-telegram-bot-api-secret-token"] !== expectedSecret) {
    res.status(401).end();
    return;
  }

  const update = req.body || {};

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message && update.message.text) {
      await handleMessage(update.message);
    }
    res.status(200).end();
  } catch (err) {
    console.error("telegramWebhook error", err);
    res.status(200).end(); // still 200 so Telegram doesn't retry-storm
  }
};

// ============================================================
// Messages
// ============================================================

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const fromUser = msg.from.username ? "@" + msg.from.username : msg.from.first_name || "гравець";

  if (text.startsWith("/setadmin")) return handleSetAdmin(chatId, text);

  const adminChatId = await dbGet("bot_config/adminChatId");
  const isAdmin = adminChatId && String(chatId) === String(adminChatId);

  // Admin replying (Telegram "Reply") to a forwarded support message —
  // route the text straight into that player's support chat.
  if (isAdmin && msg.reply_to_message) {
    const routed = await routeSupportReply(msg);
    if (routed) return;
  }

  if (text.startsWith("/start")) return handleStart(chatId, text, fromUser, adminChatId);

  if (text === "/menu") {
    // handleSetAdmin only ever runs once, before launch — register the native
    // "/" menu from here instead, guarded so it fires a single time.
    if (!(await dbGet("bot_config/commandsSet"))) {
      await setMyCommands(PLAYER_COMMANDS);
      await dbSet("bot_config/commandsSet", true);
    }
    return sendQuickMenu(chatId);
  }

  if (text.startsWith("/link")) {
    const token = text.slice("/link".length).trim();
    if (!token) return sendMessage(chatId, "Використання: /link &lt;код&gt;");
    const result = await completeLink(chatId, token);
    if (result.ok) {
      await sendMessage(chatId, `✅ Акаунт «${esc(result.nick)}» прив'язано!`);
      return sendQuickMenu(chatId);
    }
    if (result.reason === "expired") return sendMessage(chatId, "❌ Код протух (діє 10 хв). Згенеруй новий на сайті.");
    return sendMessage(chatId, "❌ Невірний код.");
  }

  if (text === "/unlink") {
    const nick = await unlink(chatId);
    if (!nick) return sendMessage(chatId, "Акаунт не був прив'язаний.");
    return sendMessage(chatId, `✅ Акаунт «${esc(nick)}» відв'язано.`, { reply_markup: { remove_keyboard: true } });
  }

  if (isAdmin && text.startsWith("/")) return handleAdminCommand(chatId, text);

  if (await handlePlayerCommand(chatId, text)) return;

  // Anything else: relay to admin (basic 2-way contact)
  if (adminChatId && !isAdmin) {
    await sendMessage(adminChatId, `✉️ Повідомлення від ${esc(fromUser)} (chat ${chatId}):\n${esc(text)}`);
    await sendMessage(chatId, "✅ Передано адміністратору, очікуй відповіді.");
  }
}

const SUPPORT_TAG_RE = /^💬 Гравець (\S+) \(підтримка\):/;

// Returns true if this admin message was a reply to a forwarded support
// notification and has been routed into that player's chat.
async function routeSupportReply(msg) {
  const original = msg.reply_to_message.text || "";
  const m = original.match(SUPPORT_TAG_RE);
  if (!m) return false;
  const nick = m[1];
  const replyText = (msg.text || "").trim();
  if (!replyText) return false;

  const exists = await dbGet(`users/${nick}`);
  if (!exists) {
    await sendMessage(msg.chat.id, `❌ Гравця «${esc(nick)}» вже не існує.`);
    return true;
  }

  await dbPush(`support_chats/${nick}`, { text: replyText, sender: "admin", time: Date.now() });
  await dbIncrement(`users/${nick}/supportUnread`, 1);
  const playerChatId = await dbGet(`users/${nick}/telegramChatId`);
  if (playerChatId) await sendMessage(playerChatId, `💬 Відповідь підтримки:\n${esc(replyText)}`);
  await sendMessage(msg.chat.id, `✅ Надіслано ${esc(nick)}`);
  return true;
}

async function handleSetAdmin(chatId, text) {
  const code = text.slice("/setadmin".length).trim();
  if (code !== process.env.ADMIN_SETUP_CODE) {
    await sendMessage(chatId, "❌ Невірний код.");
    return;
  }
  const existing = await dbGet("bot_config/adminChatId");
  if (existing) {
    await sendMessage(chatId, "⚠️ Адміністратора вже призначено раніше.");
    return;
  }
  await dbSet("bot_config/adminChatId", chatId);
  await setMyCommands(PLAYER_COMMANDS);
  await sendMessage(
    chatId,
    "✅ Тебе призначено адміністратором бота SlotOK.\n\nСюди приходитимуть заявки з кнопками підтвердження і повідомлення з чату підтримки (відповідай на них через Reply в Telegram — піде прямо гравцю). Команди: /help"
  );
}

async function handleStart(chatId, text, fromUser, adminChatId) {
  const payload = text.replace("/start", "").trim();

  if (payload.startsWith("dep_")) {
    const [, userId, amount] = payload.split("_");
    await sendMessage(
      chatId,
      `💰 Заявка на поповнення: ${amount}₴ (ID гравця: ${userId})\n\nРеквізити дивись у застосунку в розділі «Каса». Після оплати надішли сюди скрін/квитанцію — адміністратор перевірить і зарахує кошти.`
    );
    if (adminChatId) {
      await sendMessage(
        adminChatId,
        `📥 Гравець ${esc(fromUser)} відкрив бота для поповнення на ${amount}₴ (ID: ${userId}). Заявка з кнопками прийде окремим повідомленням, щойно він її подасть у застосунку.`
      );
    }
  } else if (payload.startsWith("reset_")) {
    const nick = payload.slice("reset_".length);
    await sendMessage(
      chatId,
      `🔑 Запит на відновлення пароля для акаунту «${esc(nick)}».\n\nНапиши тут щось, що підтвердить що це твій акаунт. Адміністратор перевірить і скине пароль — новий пароль прийде тобі в приватні повідомлення в самому застосунку SlotOK.`
    );
  } else if (payload.startsWith("link_")) {
    const token = payload.slice("link_".length);
    const result = await completeLink(chatId, token);
    if (result.ok) {
      await sendMessage(chatId, `✅ Акаунт «${esc(result.nick)}» прив'язано! Тепер сюди приходитимуть сповіщення про заявки, повідомлення й виграші.`);
      await sendQuickMenu(chatId);
    } else if (result.reason === "expired") {
      await sendMessage(chatId, "❌ Код прив'язки протух (діє 10 хв). Згенеруй новий на сайті.");
    } else {
      await sendMessage(chatId, "❌ Невірний код прив'язки. Згенеруй новий на сайті.");
    }
  } else {
    await sendMessage(
      chatId,
      "👋 Привіт! Це бот SlotOK. Скористайся кнопкою «Поповнити» чи «Забули пароль?» у застосунку — вона відкриє мене з потрібними деталями.",
      QUICK_KEYBOARD
    );
  }
}

// ============================================================
// Admin-only text commands
// ============================================================

async function handleAdminCommand(chatId, text) {
  const [cmd, ...rest] = text.split(" ");
  const arg = rest.join(" ").trim();

  if (cmd === "/pending") return cmdPending(chatId);
  if (cmd === "/user") return cmdUser(chatId, arg);
  if (cmd === "/stats") return cmdStats(chatId);
  if (cmd === "/ban") return cmdBan(chatId, arg);
  if (cmd === "/unban") return cmdUnban(chatId, arg);
  if (cmd === "/credit") return cmdCredit(chatId, arg);
  if (cmd === "/help" || cmd === "/admin") {
    return sendMessage(
      chatId,
      "🛠 Команди адміна:\n/pending — заявки, що очікують\n/user &lt;нік&gt; — інфо про гравця\n/stats — загальна статистика\n/ban &lt;нік&gt; [причина] — заблокувати\n/unban &lt;нік&gt; — розблокувати\n/credit &lt;нік&gt; &lt;сума&gt; — нарахувати/списати баланс (від'ємне число — списати)\n\n💬 Чат підтримки: кожне повідомлення гравця приходить сюди окремо — просто натисни Reply на ньому в Telegram і напиши відповідь, вона піде прямо гравцю на сайт."
    );
  }
}

async function cmdPending(chatId) {
  const [dep, wd, pwr] = await Promise.all([
    dbGet("deposit_requests"),
    dbGet("withdraw_requests"),
    dbGet("password_reset_requests"),
  ]);
  const pendingOf = (obj) => Object.entries(obj || {}).filter(([, v]) => v.status === "pending");
  const depP = pendingOf(dep), wdP = pendingOf(wd), pwrP = pendingOf(pwr);

  if (!depP.length && !wdP.length && !pwrP.length) {
    return sendMessage(chatId, "✅ Немає заявок, що очікують.");
  }

  let text = "📋 <b>Заявки, що очікують:</b>\n\n";
  if (depP.length) {
    text += `💰 Поповнення (${depP.length}):\n` + depP.map(([, v]) => `  • ${esc(v.user)} — ${v.amount}₴`).join("\n") + "\n\n";
  }
  if (wdP.length) {
    text += `💸 Виводи (${wdP.length}):\n` + wdP.map(([, v]) => `  • ${esc(v.user)} — ${v.amount}₴`).join("\n") + "\n\n";
  }
  if (pwrP.length) {
    text += `🔑 Відновлення паролів (${pwrP.length}):\n` + pwrP.map(([, v]) => `  • ${esc(v.user)}`).join("\n") + "\n\n";
  }
  text += "Натисни кнопки під оригінальним повідомленням заявки, щоб підтвердити/відхилити.";
  return sendMessage(chatId, text);
}

async function cmdUser(chatId, nick) {
  if (!nick) return sendMessage(chatId, "Використання: /user &lt;нік&gt;");
  const u = await dbGet(`users/${nick}`);
  if (!u) return sendMessage(chatId, `❌ Гравця «${esc(nick)}» не знайдено.`);
  const text =
    `👤 <b>${esc(nick)}</b>\n` +
    `💰 Баланс: ${u.balance || 0}₴\n` +
    `🆔 ID: ${u.id || "—"}\n` +
    `📅 Реєстрація: ${u.registeredAt ? new Date(u.registeredAt).toLocaleString("uk-UA") : "—"}\n` +
    `🎮 Ігор: ${u.totalGames || 0} · Вагер: ${u.totalWagered || 0}₴\n` +
    `🚫 Заблокований: ${u.banned ? "так" + (u.banReason ? " (" + u.banReason + ")" : "") : "ні"}\n` +
    `👑 Адмін: ${u.isAdmin ? "так" : "ні"}`;
  return sendMessage(chatId, text);
}

async function cmdStats(chatId) {
  const users = (await dbGet("users")) || {};
  const list = Object.values(users);
  const totalUsers = list.length;
  const totalBalance = list.reduce((s, u) => s + (u.balance || 0), 0);
  const totalDeposits = list.reduce((s, u) => s + (u.totalDeposits || 0), 0);
  const banned = list.filter((u) => u.banned).length;
  const text =
    `📊 <b>Статистика SlotOK</b>\n` +
    `👥 Гравців: ${totalUsers} (заблоковано: ${banned})\n` +
    `💰 Сумарний баланс у системі: ${totalBalance.toLocaleString("uk-UA")}₴\n` +
    `💳 Сумарні депозити: ${totalDeposits.toLocaleString("uk-UA")}₴`;
  return sendMessage(chatId, text);
}

async function cmdBan(chatId, arg) {
  const [nick, ...reasonParts] = arg.split(" ");
  if (!nick) return sendMessage(chatId, "Використання: /ban &lt;нік&gt; [причина]");
  const exists = await dbGet(`users/${nick}`);
  if (!exists) return sendMessage(chatId, `❌ Гравця «${esc(nick)}» не знайдено.`);
  const reason = reasonParts.join(" ");
  await dbUpdate(`users/${nick}`, { banned: true, banReason: reason || null });
  return sendMessage(chatId, `🚫 Гравця ${esc(nick)} заблоковано${reason ? " (" + esc(reason) + ")" : ""}.`);
}

async function cmdUnban(chatId, nick) {
  if (!nick) return sendMessage(chatId, "Використання: /unban &lt;нік&gt;");
  const exists = await dbGet(`users/${nick}`);
  if (!exists) return sendMessage(chatId, `❌ Гравця «${esc(nick)}» не знайдено.`);
  await dbUpdate(`users/${nick}`, { banned: false, banReason: null });
  return sendMessage(chatId, `✅ Гравця ${esc(nick)} розблоковано.`);
}

async function cmdCredit(chatId, arg) {
  const [nick, amountStr] = arg.split(" ");
  const amount = parseInt(amountStr, 10);
  if (!nick || !amountStr || Number.isNaN(amount)) {
    return sendMessage(chatId, "Використання: /credit &lt;нік&gt; &lt;сума&gt; (від'ємне число — списати)");
  }
  const exists = await dbGet(`users/${nick}`);
  if (!exists) return sendMessage(chatId, `❌ Гравця «${esc(nick)}» не знайдено.`);
  const newBalance = await dbIncrement(`users/${nick}/balance`, amount);
  await dbPush(`users/${nick}/history`, {
    text: `${amount >= 0 ? "✅ Нараховано адміном" : "➖ Списано адміном"}: ${amount >= 0 ? "+" : ""}${amount}₴`,
    date: Date.now(),
  });
  return sendMessage(
    chatId,
    `${amount >= 0 ? "✅" : "➖"} ${esc(nick)}: ${amount >= 0 ? "+" : ""}${amount}₴. Новий баланс: ${newBalance}₴`
  );
}

async function cmdPlayerBalance(chatId, nick) {
  const u = await dbGet(`users/${nick}`);
  return sendMessage(chatId, `💰 Баланс: ${(u && u.balance) || 0}₴`);
}

async function cmdPlayerHistory(chatId, nick) {
  const hist = (await dbGet(`users/${nick}/history`)) || {};
  const entries = Object.values(hist).sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 10);
  if (!entries.length) return sendMessage(chatId, "Історія порожня.");
  const text = "📊 <b>Останні операції:</b>\n" + entries.map((e) => `• ${esc(e.text || "")}`).join("\n");
  return sendMessage(chatId, text);
}

async function cmdPlayerMe(chatId, nick) {
  const u = await dbGet(`users/${nick}`);
  if (!u) return sendMessage(chatId, "Акаунт не знайдено.");
  const text =
    `🔗 <b>${esc(nick)}</b>\n` +
    `💰 Баланс: ${u.balance || 0}₴\n` +
    `📅 Реєстрація: ${u.registeredAt ? new Date(u.registeredAt).toLocaleString("uk-UA") : "—"}\n` +
    `🎮 Ігор: ${u.totalGames || 0}`;
  return sendMessage(chatId, text);
}

function cmdPlayerHelp(chatId) {
  return sendMessage(
    chatId,
    "🤖 <b>Команди:</b>\n💰 /balance — баланс\n📊 /history — останні операції\n🔗 /me — інфо про акаунт\n📥 /deposit — поповнити\n📤 /withdraw — вивести\n/cancel — скасувати поточну дію\n/unlink — відв'язати акаунт\n/menu — показати меню"
  );
}

async function handlePlayerCommand(chatId, rawText) {
  const text = BUTTON_COMMANDS[rawText] || rawText;

  const nickForFlow = await resolveNick(chatId);
  if (nickForFlow && (await handleMoneyFlowReply(chatId, nickForFlow, text))) return true;

  if (!["/balance", "/history", "/me", "/help", "/deposit", "/withdraw"].includes(text)) return false;

  const nick = nickForFlow;
  if (!nick) {
    await sendMessage(chatId, "❌ Акаунт не прив'язано. Прив'яжи через кнопку на сайті або /link &lt;код&gt;.");
    return true;
  }
  if (text === "/balance") await cmdPlayerBalance(chatId, nick);
  else if (text === "/history") await cmdPlayerHistory(chatId, nick);
  else if (text === "/me") await cmdPlayerMe(chatId, nick);
  else if (text === "/help") await cmdPlayerHelp(chatId);
  else if (text === "/deposit") await startDeposit(chatId, nick);
  else if (text === "/withdraw") await startWithdraw(chatId, nick);
  return true;
}

// ============================================================
// Inline button taps (callback_query)
// ============================================================

async function handleCallback(cq) {
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const adminChatId = await dbGet("bot_config/adminChatId");

  if (!adminChatId || String(chatId) !== String(adminChatId)) {
    await answerCallbackQuery(cq.id, "Немає прав.");
    return;
  }

  const [domain, action, id] = (cq.data || "").split(":");
  let resultText = null;

  if (domain === "dep") resultText = await actOnDeposit(action, id);
  else if (domain === "wd") resultText = await actOnWithdraw(action, id);
  else if (domain === "pwr") resultText = await actOnPasswordReset(action, id);

  if (resultText === null) {
    await answerCallbackQuery(cq.id, "Заявку вже оброблено або не знайдено.");
    return;
  }

  await answerCallbackQuery(cq.id, "Готово ✅");
  await editMessageText(chatId, messageId, cq.message.text + `\n\n${resultText}`);
}

async function actOnDeposit(action, id) {
  const r = await dbGet(`deposit_requests/${id}`);
  if (!r || r.status !== "pending") return null;

  if (action === "approve") {
    await dbIncrement(`users/${r.user}/balance`, r.amount);
    await dbUpdate(`deposit_requests/${id}`, { status: "done", approvedAt: Date.now(), approvedBy: "telegram-bot" });
    await dbPush(`users/${r.user}/history`, { text: `✅ Депозит підтверджено: +${r.amount}₴`, date: Date.now() });
    await dbPush(`users/${r.user}/cardTx`, { dir: "in", amount: r.amount, title: "Поповнення картки", subtitle: "Через касу", icon: "💳", ts: Date.now() });
    await dbIncrement(`users/${r.user}/totalDeposits`, r.amount);
    await notifyPlayer(r.user, `✅ Ваш депозит ${r.amount}₴ зараховано! Гарної гри! 🎰`);
    return `✅ Підтверджено: +${r.amount}₴ гравцю ${esc(r.user)}`;
  } else {
    await dbUpdate(`deposit_requests/${id}`, { status: "rejected", rejectedAt: Date.now() });
    await notifyPlayer(r.user, "❌ Ваш запит на поповнення відхилено. Зверніться до підтримки.");
    return `❌ Відхилено (${esc(r.user)})`;
  }
}

async function actOnWithdraw(action, id) {
  const r = await dbGet(`withdraw_requests/${id}`);
  if (!r || r.status !== "pending") return null;

  if (action === "approve") {
    await dbUpdate(`withdraw_requests/${id}`, { status: "done", approvedAt: Date.now(), approvedBy: "telegram-bot" });
    await dbUpdate(`users/${r.user}/withdraws/${id}`, { status: "done" });
    await dbUpdate(`users/${r.user}`, { pendingWithdraw: false });
    await dbPush(`users/${r.user}/cardTx`, { dir: "out", amount: r.amount, title: "Виведення коштів", subtitle: r.method || "", icon: "💸", ts: Date.now() });
    await dbPush(`users/${r.user}/history`, { text: `✅ Вивід підтверджено: -${r.amount}₴`, date: Date.now() });
    await notifyPlayer(r.user, "✅ Ваш вивід коштів схвалено! Кошти надійдуть на реквізити протягом 1-24 год.");
    return `✅ Виплачено: ${r.amount}₴ гравцю ${esc(r.user)}`;
  } else {
    await dbIncrement(`users/${r.user}/balance`, r.amount);
    await dbUpdate(`withdraw_requests/${id}`, { status: "rejected" });
    await dbUpdate(`users/${r.user}/withdraws/${id}`, { status: "rejected" });
    await dbUpdate(`users/${r.user}`, { pendingWithdraw: false });
    await notifyPlayer(r.user, `❌ Ваш запит на вивід ${r.amount}₴ відхилено. Кошти повернуто на баланс.`);
    return `❌ Відхилено, ${r.amount}₴ повернуто (${esc(r.user)})`;
  }
}

async function actOnPasswordReset(action, id) {
  const r = await dbGet(`password_reset_requests/${id}`);
  if (!r || r.status !== "pending") return null;

  if (action === "approve") {
    const tempPass = Math.random().toString(36).slice(2, 10);
    const tempPassHash = await sha256(tempPass);
    await dbSet(`users/${r.user}/pass`, tempPassHash);
    await dbUpdate(`password_reset_requests/${id}`, { status: "done", approvedAt: Date.now(), approvedBy: "telegram-bot" });
    await notifyPlayer(
      r.user,
      `🔑 Ваш пароль скинуто адміністратором. Новий тимчасовий пароль: ${tempPass}\nБудь ласка, увійдіть і одразу змініть його в налаштуваннях.`
    );
    return `✅ Пароль для ${esc(r.user)} скинуто й надіслано в ПП`;
  } else {
    await dbUpdate(`password_reset_requests/${id}`, { status: "rejected", rejectedAt: Date.now() });
    return `❌ Відхилено (${esc(r.user)})`;
  }
}

async function notifyPlayer(user, text) {
  const key = await dbPush(`pm/${user}`, { from: "🏦 SlotOK", to: user, text, ts: Date.now() });
  await dbIncrement(`users/${user}/pmUnread`, 1);
  const chatId = await dbGet(`users/${user}/telegramChatId`);
  if (chatId) await sendMessage(chatId, text);
  return key;
}

async function sha256(message) {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await require("crypto").webcrypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
