// Приватні поля профілю: email, lastIpHash, telegramChatId.
//
// Вузол users/<нік> читають усі залогінені клієнти (профілі, рейтинги), тож
// особисті поля лежать у user_private/<нік> — правила RTDB пускають туди лише
// власника і адміна. Сервер читає токеном адміна: спершу нове місце, потім —
// старе (акаунти, що ще не мігрували). Будь-який запис іде в нове місце й
// прибирає старе. Міграція ідемпотентна й викликається при кожному вході.

const { dbGet, dbUpdate } = require("./firebase");

const FIELDS = ["email", "lastIpHash", "telegramChatId"];
const FIELD_SET = new Set(FIELDS);

function check(field) {
  if (!FIELD_SET.has(field)) throw new Error(`unknown private field ${field}`);
}

async function getPrivate(nick, field) {
  check(field);
  const [current, legacy] = await Promise.all([dbGet(`user_private/${nick}/${field}`), dbGet(`users/${nick}/${field}`)]);
  return current != null && current !== "" ? current : legacy;
}

// value === null — видалити поле з обох місць.
async function setPrivate(nick, values) {
  const updates = {};
  for (const [field, value] of Object.entries(values)) {
    check(field);
    updates[`user_private/${nick}/${field}`] = value == null ? null : value;
    updates[`users/${nick}/${field}`] = null;
  }
  await dbUpdate("", updates);
}

// Переносить поля зі старого місця (лише ті, що там є; нове значення не затираємо).
async function migratePrivate(nick) {
  const legacy = await Promise.all(FIELDS.map((f) => dbGet(`users/${nick}/${f}`)));
  if (!legacy.some((v) => v != null && v !== "")) return false;
  const current = await Promise.all(FIELDS.map((f) => dbGet(`user_private/${nick}/${f}`)));
  const updates = {};
  FIELDS.forEach((f, i) => {
    if (legacy[i] == null) return;
    if (legacy[i] !== "" && (current[i] == null || current[i] === "")) updates[`user_private/${nick}/${f}`] = legacy[i];
    updates[`users/${nick}/${f}`] = null;
  });
  if (Object.keys(updates).length) await dbUpdate("", updates);
  return true;
}

module.exports = { getPrivate, setPrivate, migratePrivate, PRIVATE_FIELDS: FIELDS };
