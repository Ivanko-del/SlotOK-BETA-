// ============================================================
// SlotOK — push an actionable Telegram notification to the admin
// the moment a deposit/withdraw/password-reset request is created,
// instead of waiting for the player to open the bot.
//
// Called from the app (submitDepositRequest / submitWithdraw /
// pwrRequestViaTelegram) right after the request is written to
// Firebase. Body: { type: 'deposit'|'withdraw'|'reset', id }.
//
// The request is re-read from Firebase by id here — we never trust
// amounts/usernames passed in the POST body, only the id, so a
// forged call can at most trigger a notification for a request
// that's genuinely sitting pending in the DB (nothing worse than
// what direct DB access already allows in this app).
// ============================================================

const { dbGet, dbUpdate } = require("../lib/firebase");
const { sendMessage, esc } = require("../lib/telegram");
const { sendPushToUser } = require("../lib/fcm");

const PATHS = {
  deposit: "deposit_requests",
  withdraw: "withdraw_requests",
  reset: "password_reset_requests",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  try {
    const { type, id, user, to, kind, ref } = req.body || {};

    if (type === "player-ping") {
      if (!to || !kind) { res.status(400).end(); return; }
      const chatId = await dbGet(`users/${to}/telegramChatId`);
      if (!chatId) { res.status(200).end(); return; }

      // pm/clan-chat carry no body text: this endpoint is unauthenticated, so
      // trusting sender/message text straight from the POST body would let
      // anyone impersonate any sender through the bot. Instead, for "pm" we
      // only trust a message id and re-read the real message server-side —
      // same pattern as the "support" branch below — so the bot shows the
      // actual content without opening an impersonation hole.
      let text = null;
      if (kind === "pm") {
        text = "📩 Нове повідомлення в особистих!";
        if (ref && ref.id) {
          const msg = await dbGet(`pm/${to}/${ref.id}`);
          if (msg && msg.to === to) {
            const preview = msg.imgUrl ? "[фото — переглянь в застосунку]" : esc(msg.text || "");
            text = `✉️ <b>Нове повідомлення від ${esc(msg.from || "гравця")}</b>\n${preview}`;
          }
        }
      } else if (kind === "clan-chat") {
        text = "👥 Нове повідомлення в клан-чаті!";
      } else if (kind === "bigwin" && ref && typeof ref.amount === "number") {
        text = `🎉 Великий виграш: +${ref.amount}₴ (${esc(ref.game || "гра")})!`;
      } else if (kind === "jackpot" && ref && typeof ref.amount === "number") {
        text = `🎰 ДЖЕКПОТ! Нараховано ₴${ref.amount}!`;
      } else if (kind === "bonus" && ref && typeof ref.amount === "number") {
        text = `🎁 Бонус: +${ref.amount}₴!`;
      } else if (kind === "vipup" && ref && ref.name) {
        text = `🎉 VIP підвищено до ${esc(ref.icon || "")} ${esc(ref.name)}!`;
      } else if (kind === "bplevel" && ref && ref.level) {
        text = `🎫 Battle Pass: рівень ${ref.level}!`;
      }
      if (!text) { res.status(200).end(); return; }

      // Telegram (existing) and a real FCM push (see lib/fcm.js — no-ops
      // quietly if FIREBASE_SERVICE_ACCOUNT_KEY isn't configured yet) run
      // side by side; a failure in either must never break the other.
      await Promise.allSettled([
        sendMessage(chatId, text),
        sendPushToUser(dbGet, dbUpdate, to, "🎰 SlotOK Casino", text.replace(/<[^>]+>/g, ""), { kind }),
      ]);
      res.status(200).end();
      return;
    }

    if (type === "support") {
      if (!id || !user) { res.status(400).end(); return; }
      const msg = await dbGet(`support_chats/${user}/${id}`);
      if (!msg || msg.sender !== "user") { res.status(200).end(); return; }
      const adminChatId = await dbGet("bot_config/adminChatId");
      if (!adminChatId) { res.status(200).end(); return; }

      const preview = msg.mediaUrl
        ? (msg.isVideo ? "[відео — переглянь в адмінці на сайті]" : "[фото — переглянь в адмінці на сайті]")
        : esc(msg.text || "");
      // Формат навмисно стабільний — по ньому парситься відповідь адміна (reply в Telegram)
      await sendMessage(adminChatId, `💬 Гравець ${esc(user)} (підтримка):\n${preview}`);
      res.status(200).end();
      return;
    }

    if (type === "withdraw-2fa") {
      // Реальне 2FA: код/кнопка йдуть у ВЛАСНИЙ Telegram гравця, а не в те саме
      // вікно сайту, звідки подано заявку — це і є другий, окремий канал.
      // Підтвердження обробляється тапом по кнопці в telegram-webhook.js
      // (callback_data "wd2fa:..."), не тут — тут лише надсилаємо повідомлення.
      if (!id) { res.status(400).end(); return; }
      const r = await dbGet(`withdraw_requests/${id}`);
      if (!r || r.status !== "pending_2fa") { res.status(200).end(); return; }
      const chatId = await dbGet(`users/${r.user}/telegramChatId`);
      if (!chatId) { res.status(200).end(); return; }
      await sendMessage(
        chatId,
        `🔐 <b>Підтвердження виводу</b>\n💵 Сума: ${r.amount}₴ · ${esc(r.method || "—")}\n\nЦе точно ти щойно запросив вивід на сайті? Підтверди нижче — після цього заявку побачить адміністратор.`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Так, це я — підтвердити", callback_data: `wd2fa:confirm:${id}` },
              { text: "❌ Це не я — скасувати", callback_data: `wd2fa:cancel:${id}` },
            ]],
          },
        }
      );
      res.status(200).end();
      return;
    }

    const path = PATHS[type];
    if (!path || !id) {
      res.status(400).end();
      return;
    }

    const req_ = await dbGet(`${path}/${id}`);
    if (!req_ || req_.status !== "pending") {
      res.status(200).end(); // nothing to notify, quietly succeed
      return;
    }

    const adminChatId = await dbGet("bot_config/adminChatId");
    if (!adminChatId) {
      res.status(200).end();
      return;
    }

    if (type === "deposit") {
      await sendMessage(
        adminChatId,
        `💰 <b>Нова заявка на поповнення</b>\n👤 ${esc(req_.user)}\n💵 ${req_.amount}₴ · ${esc(req_.method || "—")}`,
        { reply_markup: buttons("dep", id) }
      );
    } else if (type === "withdraw") {
      await sendMessage(
        adminChatId,
        `💸 <b>Нова заявка на вивід</b>\n👤 ${esc(req_.user)}\n💵 ${req_.amount}₴ · ${esc(req_.method || "—")}\n💳 ${esc(req_.card || "—")}`,
        { reply_markup: buttons("wd", id) }
      );
    } else if (type === "reset") {
      await sendMessage(
        adminChatId,
        `🔑 <b>Запит на відновлення пароля</b>\n👤 ${esc(req_.user)}`,
        { reply_markup: buttons("pwr", id) }
      );
    }

    res.status(200).end();
  } catch (err) {
    console.error("notify error", err);
    res.status(200).end();
  }
};

function buttons(domain, id) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Підтвердити", callback_data: `${domain}:approve:${id}` },
        { text: "❌ Відхилити", callback_data: `${domain}:reject:${id}` },
      ],
    ],
  };
}
