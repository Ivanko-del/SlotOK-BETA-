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
const { getPrivate } = require("../lib/private-profile");
const { sendMessage, esc } = require("../lib/telegram");
const { sendPushToUser } = require("../lib/fcm");
const { allow } = require("../lib/rate-limit");
const { getServiceAccount } = require("../lib/google-auth");
const { verifyIdToken } = require("../lib/id-token");

const OWNER = "theivankoo";
// Хто може надіслати сповіщення якого типу (коли серверний вхід увімкнено):
//   self  — лише собі (власний великий виграш, VIP, Battle Pass);
//   admin — лише адмін (бонус усім, джекпот);
//   any   — будь-кому (ПМ, клан-чат), але текст ПМ сервер бере з бази сам.
const PING_ACL = { bigwin: "self", vipup: "self", bplevel: "self", bonus: "admin", jackpot: "admin", pm: "any", "clan-chat": "any" };

// null = перевірку пройдено; інакше HTTP-статус відмови.
async function checkPingSender(req, to, kind) {
  if (!getServiceAccount()) return null; // серверний вхід ще не ввімкнено — як раніше
  let sender;
  try {
    sender = await verifyIdToken(String((req.headers || {}).authorization || "").replace(/^Bearer\s+/i, ""));
  } catch (e) {
    return e.code === "bad_token" ? 401 : 503;
  }
  const acl = Object.prototype.hasOwnProperty.call(PING_ACL, kind) ? PING_ACL[kind] : null;
  if (!acl) return 400;
  if (acl === "self" && sender !== to) return 403;
  if (acl === "admin" && sender.toLowerCase() !== OWNER && (await dbGet(`users/${sender}/isAdmin`)) !== true) return 403;
  return null;
}

// Нік/id потрапляють у шлях бази (users/<to>/…, support_chats/<user>/<id>) —
// без цього "../" у тілі запиту читав би довільні вузли з правами адміна.
const SAFE_SEG = /^[^.#$[\]/\x00-\x1f\x7f]{1,120}$/;
const badSeg = (v) => v !== undefined && v !== null && !(typeof v === "string" && SAFE_SEG.test(v));

const PATHS = {
  deposit: "deposit_requests",
  reset: "password_reset_requests",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  try {
    const { type, id, user, to, kind, ref } = req.body || {};
    if (badSeg(id) || badSeg(user) || badSeg(to) || badSeg(ref && ref.id)) { res.status(400).end(); return; }

    if (type === "player-ping") {
      if (!to || !kind) { res.status(400).end(); return; }
      const denied = await checkPingSender(req, String(to), String(kind));
      if (denied) { res.status(denied).end(); return; }
      // Гравцю — не більше 10 сповіщень на хвилину, скільки б разів
      // не повторювали POST ззовні.
      if (!(await allow(`ping:${to}`, 10, 60000))) { res.status(429).end(); return; }
      const chatId = await getPrivate(String(to), "telegramChatId");
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
      // Одне повідомлення підтримки = одне сповіщення адміну; повтори того
      // самого id — це реплей. Плюс стеля на гравця, щоб потік нових
      // повідомлень теж не перетворився на флуд в адмінський чат.
      if (!(await allow(`support-msg:${user}:${id}`, 1, 60000))) { res.status(429).end(); return; }
      if (!(await allow(`support-user:${user}`, 20, 60000))) { res.status(429).end(); return; }
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

    // Вивід прибрано (ігрова валюта віртуальна): типи withdraw/withdraw-2fa більше не обробляються.

    const path = Object.prototype.hasOwnProperty.call(PATHS, type) ? PATHS[type] : null;
    if (!path || !id) {
      res.status(400).end();
      return;
    }

    // Заявка потребує рівно одного сповіщення адміну. Застосунок може
    // повторити POST після мережевої помилки, тому не 1, а 3 на 5 хвилин —
    // ретраї проходять, а реплей у циклі ні.
    if (!(await allow(`${type}:${id}`, 3, 300000))) { res.status(429).end(); return; }

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
        `💰 <b>Нова заявка на донат</b>\n👤 ${esc(req_.user)}\n💵 ${req_.amount} грн · ${esc(req_.method || "—")}`,
        { reply_markup: buttons("dep", id) }
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
