// Хеші паролів і відповідей на контрольні питання.
//
// Історично вони лежать у users/<нік>/pass і users/<нік>/securityAnswerHash,
// а вузол users читається всіма (профілі, рейтинги) — правилами RTDB не можна
// сховати одне поле, якщо батьківський вузол відкритий. Тому сервер переносить
// їх у user_secrets/<нік>/…, куди правила не пускають жоден браузер.
//
// Перенос поступовий: читаємо спершу старе місце (туди ще можуть писати старі
// шляхи — скидання пароля адміном у застосунку, тимчасовий пароль від бота),
// потім нове; будь-який запис іде в нове місце й прибирає старе.

const { dbGet, dbUpdate } = require("./firebase");
const { migratePrivate } = require("./private-profile");

const FIELDS = new Set(["pass", "securityAnswerHash", "birthDate"]);

async function getSecret(nick, field) {
  if (!FIELDS.has(field)) throw new Error(`unknown secret field ${field}`);
  // Обидва місця читаємо паралельно (вхід — гаряча дорога); старе має пріоритет.
  const [legacy, current] = await Promise.all([dbGet(`users/${nick}/${field}`), dbGet(`user_secrets/${nick}/${field}`)]);
  return legacy || current;
}

async function setSecrets(nick, values) {
  const updates = {};
  for (const [field, value] of Object.entries(values)) {
    if (!FIELDS.has(field)) throw new Error(`unknown secret field ${field}`);
    updates[`user_secrets/${nick}/${field}`] = value;
    updates[`users/${nick}/${field}`] = null;
  }
  await dbUpdate("", updates);
}

// Переносить обидва поля, якщо вони ще в публічному вузлі.
async function migrateSecrets(nick) {
  const values = {};
  const fields = [...FIELDS];
  const legacy = await Promise.all(fields.map((field) => dbGet(`users/${nick}/${field}`)));
  fields.forEach((field, i) => { if (legacy[i]) values[field] = legacy[i]; });
  if (Object.keys(values).length) await setSecrets(nick, values);
  // Приватні поля профілю (email, IP-хеш, Telegram-чат) — теж з публічного вузла.
  await migratePrivate(nick).catch((e) => console.warn("migratePrivate failed", e && e.message));
}

module.exports = { getSecret, setSecrets, migrateSecrets };
