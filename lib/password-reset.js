// Відновлення пароля без контрольного питання: гравець подає заявку,
// адмін (в адмінці або в Telegram-боті) підтверджує — сервер генерує
// тимчасовий пароль і кладе його хеш у закритий user_secrets/<нік>.
//
// Раніше все це робив браузер: заявку писав анонім напряму в базу, а адмінка
// клала хеш тимчасового пароля в публічний users/<нік>/pass. Тепер браузер
// лише просить сервер (api/auth.js, дії reset-request і admin-reset).

const crypto = require("crypto");
const { dbGet, dbSet, dbUpdate, dbPush, dbIncrement } = require("./firebase");
const { setSecrets } = require("./secrets");
const SlotOKPassword = require("../password.js");

const OWNER = "theivankoo";

// Тимчасовий пароль — повноцінний доступ до акаунту, тож лише crypto.
function randomTempPassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // без схожих 0/o/1/l
  return Array.from(crypto.randomBytes(12)).map((b) => alphabet[b % alphabet.length]).join("");
}

// Нова заявка. Повертає її id (для сповіщення адміна в боті).
async function createResetRequest(nick) {
  const id = `${nick}_${Date.now()}`;
  await dbSet(`password_reset_requests/${id}`, { user: nick, status: "pending", time: Date.now() });
  await dbPush(`pm/${OWNER}`, {
    from: "📥 Система", to: OWNER, ts: Date.now(),
    text: `🔑 Заявка на відновлення пароля від @${nick}. Перевірте особу через Telegram і скиньте пароль в адмін-панелі.`,
  });
  await dbIncrement(`users/${OWNER}/pmUnread`, 1).catch(() => {});
  return id;
}

// Підтвердити заявку. null — заявки немає або вона вже не pending.
async function approveResetRequest(id, approvedBy) {
  const r = await dbGet(`password_reset_requests/${id}`);
  if (!r || r.status !== "pending" || typeof r.user !== "string") return null;
  const tempPass = randomTempPassword();
  await setSecrets(r.user, { pass: await SlotOKPassword.hash(tempPass) });
  await dbUpdate(`password_reset_requests/${id}`, { status: "done", approvedAt: Date.now(), approvedBy });
  return { user: r.user, tempPass };
}

function tempPasswordText(tempPass) {
  return `🔑 Ваш пароль скинуто адміністратором. Новий тимчасовий пароль: ${tempPass}\nБудь ласка, увійдіть і одразу змініть його в налаштуваннях.`;
}

module.exports = { randomTempPassword, createResetRequest, approveResetRequest, tempPasswordText, OWNER };
