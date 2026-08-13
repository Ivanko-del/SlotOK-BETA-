// ============================================================
// SlotOK — Telegram bot webhook (@SlotOK_DepositBot)
// Runs as a Vercel Serverless Function.
//
// Scope, by design: this bot NEVER credits balances or resets
// passwords by itself. It only shows instructions to the player
// and notifies the admin's Telegram chat. All money/account
// changes still go through the existing admin panel in the app
// (deposit_requests / password_reset_requests), same as today.
//
// Required environment variables (set in Vercel dashboard):
//   BOT_TOKEN          — Telegram bot token
//   ADMIN_SETUP_CODE   — one-time secret for the /setadmin bootstrap
//   WEBHOOK_SECRET      — must match the secret_token used in setWebhook
// ============================================================

const DB_URL = "https://nye-slotok-default-rtdb.firebaseio.com";

async function dbGet(path) {
  const res = await fetch(`${DB_URL}/${path}.json`);
  return res.json();
}

async function dbSet(path, value) {
  await fetch(`${DB_URL}/${path}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

async function tg(method, payload) {
  const token = process.env.BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error("Telegram API error", method, await res.text());
  return res;
}

module.exports = async (req, res) => {
  // Reject anything that isn't actually from Telegram before doing any real work.
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.WEBHOOK_SECRET) {
    res.status(401).end();
    return;
  }

  const update = req.body || {};
  const msg = update.message;
  if (!msg || !msg.text) {
    res.status(200).end();
    return;
  }

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const fromUser = msg.from.username ? "@" + msg.from.username : (msg.from.first_name || "гравець");

  try {
    // ── One-time admin bootstrap ──────────────────────────
    if (text.startsWith("/setadmin")) {
      const code = text.slice("/setadmin".length).trim();
      if (code !== process.env.ADMIN_SETUP_CODE) {
        await tg("sendMessage", { chat_id: chatId, text: "❌ Невірний код." });
        res.status(200).end();
        return;
      }
      const existing = await dbGet("bot_config/adminChatId");
      if (existing) {
        await tg("sendMessage", { chat_id: chatId, text: "⚠️ Адміністратора вже призначено раніше." });
        res.status(200).end();
        return;
      }
      await dbSet("bot_config/adminChatId", chatId);
      await tg("sendMessage", {
        chat_id: chatId,
        text: "✅ Тебе призначено адміністратором бота SlotOK. Сюди приходитимуть сповіщення про поповнення, виводи й відновлення паролів.",
      });
      res.status(200).end();
      return;
    }

    const adminChatId = await dbGet("bot_config/adminChatId");

    // ── /start payloads from deep links in the app ────────
    if (text.startsWith("/start")) {
      const payload = text.replace("/start", "").trim();

      if (payload.startsWith("dep_")) {
        const parts = payload.split("_");
        const userId = parts[1] || "?";
        const amount = parts[2] || "?";
        await tg("sendMessage", {
          chat_id: chatId,
          text:
            `💰 Заявка на поповнення: ${amount}₴ (ID гравця: ${userId})\n\n` +
            `Реквізити для оплати дивись у застосунку в розділі «Каса». Після оплати надішли сюди скрін/квитанцію — адміністратор перевірить і зарахує кошти.`,
        });
        if (adminChatId) {
          await tg("sendMessage", {
            chat_id: adminChatId,
            text: `📥 Гравець ${fromUser} відкрив бота для поповнення на ${amount}₴ (ID: ${userId}). Заявка також є в адмін-панелі → Заявки → Поповнення.`,
          });
        }
      } else if (payload.startsWith("reset_")) {
        const nick = payload.slice("reset_".length);
        await tg("sendMessage", {
          chat_id: chatId,
          text:
            `🔑 Запит на відновлення пароля для акаунту «${nick}».\n\n` +
            `Напиши тут щось, що підтвердить що це твій акаунт (коли реєструвався, останній депозит тощо). Адміністратор перевірить і скине пароль, новий пароль прийде тобі в приватні повідомлення в самому застосунку SlotOK.`,
        });
        if (adminChatId) {
          await tg("sendMessage", {
            chat_id: adminChatId,
            text: `🔑 Гравець ${fromUser} запросив відновлення пароля для акаунту «${nick}». Перевір і підтверди в адмін-панелі → Заявки → Відновлення паролів.`,
          });
        }
      } else {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "👋 Привіт! Це бот SlotOK. Скористайся кнопкою «Поповнити» чи «Забули пароль?» у застосунку — вона відкриє мене з потрібними деталями.",
        });
      }
      res.status(200).end();
      return;
    }

    // ── Anything else: relay to admin (basic 2-way contact) ──
    if (adminChatId && String(chatId) !== String(adminChatId)) {
      await tg("sendMessage", {
        chat_id: adminChatId,
        text: `✉️ Повідомлення від ${fromUser} (chat ${chatId}):\n${text}`,
      });
      await tg("sendMessage", { chat_id: chatId, text: "✅ Передано адміністратору, очікуй відповіді." });
    }
    res.status(200).end();
  } catch (err) {
    console.error("telegramWebhook error", err);
    res.status(200).end(); // still 200 so Telegram doesn't retry-storm
  }
};
