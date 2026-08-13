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
const { sendMessage, editMessageText, answerCallbackQuery } = require("../lib/telegram");

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

  if (text.startsWith("/start")) return handleStart(chatId, text, fromUser, adminChatId);

  if (isAdmin && text.startsWith("/")) return handleAdminCommand(chatId, text);

  // Anything else: relay to admin (basic 2-way contact)
  if (adminChatId && !isAdmin) {
    await sendMessage(adminChatId, `✉️ Повідомлення від ${esc(fromUser)} (chat ${chatId}):\n${esc(text)}`);
    await sendMessage(chatId, "✅ Передано адміністратору, очікуй відповіді.");
  }
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
  await sendMessage(
    chatId,
    "✅ Тебе призначено адміністратором бота SlotOK.\n\nСюди приходитимуть заявки з кнопками підтвердження. Команди: /pending /user &lt;нік&gt; /stats /ban &lt;нік&gt; [причина] /unban &lt;нік&gt; /credit &lt;нік&gt; &lt;сума&gt;"
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
  } else {
    await sendMessage(
      chatId,
      "👋 Привіт! Це бот SlotOK. Скористайся кнопкою «Поповнити» чи «Забули пароль?» у застосунку — вона відкриє мене з потрібними деталями."
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
      "🛠 Команди адміна:\n/pending — заявки, що очікують\n/user &lt;нік&gt; — інфо про гравця\n/stats — загальна статистика\n/ban &lt;нік&gt; [причина] — заблокувати\n/unban &lt;нік&gt; — розблокувати\n/credit &lt;нік&gt; &lt;сума&gt; — нарахувати/списати баланс (від'ємне число — списати)"
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
