// Видалення власного акаунта (право на видалення даних, див. Політику
// конфіденційності). Викликається з api/reward.js, action "deleteAccount":
// гравець підтверджує паролем, сервер стирає все, що ключоване його ніком.
//
// Що НЕ стирається автоматично (і сказано в Політиці): повідомлення в
// публічних чатах (їх чистить автоочищення, а на прохання — підтримка),
// заявки на донат у deposit_requests (облікові записи про платежі).

const { dbGet, dbUpdate } = require("./firebase");
const { getSecret } = require("./secrets");
const { getAccessToken, getServiceAccount } = require("./google-auth");
const SlotOKPassword = require("../password.js");

const PER_USER_NODES = ["users", "user_secrets", "pm", "missions", "friends", "friend_requests", "room_invites", "online", "notify_rate"];

async function deleteAuthUser(nick) {
  // Найкраще-що-можемо: акаунт Firebase Auth (uid = нік). Помилка не критична —
  // без запису в БД увійти все одно неможливо.
  try {
    const sa = getServiceAccount();
    if (!sa) return;
    const token = await getAccessToken("https://www.googleapis.com/auth/identitytoolkit");
    const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const base = host && !process.env.VERCEL ? `http://${host}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
    await fetch(`${base}/v1/projects/${sa.project_id}/accounts:delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || "owner"}` },
      body: JSON.stringify({ localId: nick }),
    });
  } catch (e) { console.warn("deleteAuthUser failed", e && e.message); }
}

async function deleteAccount(nick, password) {
  if (!password) return { ok: false, status: 400, error: "bad_request", message: "Введи пароль для підтвердження" };
  const pass = await getSecret(nick, "pass");
  if (!pass || !(await SlotOKPassword.verify(password, pass)).ok) {
    return { ok: false, status: 401, error: "wrong_password", message: "Пароль невірний" };
  }
  const user = (await dbGet(`users/${nick}`)) || {};
  const updates = {};
  for (const node of PER_USER_NODES) updates[`${node}/${nick}`] = null;
  if (user.telegramChatId) updates[`telegram_links/${user.telegramChatId}`] = null;
  await dbUpdate("", updates);
  await deleteAuthUser(nick);
  return { ok: true, deleted: true };
}

module.exports = { deleteAccount, PER_USER_NODES };
