// Дросель для api/notify.js — ендпоінт неавтентифікований, тож без нього
// будь-хто, хто знає чужий нік або id заявки, що висить у стані pending, може
// нескінченно повторювати той самий POST і засипати чужий (або адмінський)
// Telegram повідомленнями.
//
// ponytail: лічильник read-modify-write, не атомарний — два паралельні виклики
// можуть порахуватись як один. Для антиспаму цього вистачає (похибка на одне
// повідомлення на вікно); якщо колись знадобиться точність, тут потрібен
// той самий ETag/if-match цикл, що вже є в dbIncrement.

const { dbGet, dbSet } = require("./firebase");

// Ключ ліміту потрапляє у шлях Firebase, тому з нього треба прибрати символи,
// заборонені в ключах RTDB (. $ # [ ] / та керуючі), інакше запис просто впаде.
function sanitize(key) {
  return String(key).replace(/[.$#[\]/\x00-\x1f\x7f]/g, "_").slice(0, 180);
}

/**
 * Повертає true, якщо дію дозволено, і false — якщо ліміт вичерпано.
 * Ліміт «не більше max подій на вікно windowMs» для конкретного ключа.
 */
async function allow(key, max, windowMs) {
  const path = `notify_rate/${sanitize(key)}`;
  const now = Date.now();

  let entry;
  try {
    entry = await dbGet(path);
  } catch {
    return true; // БД недоступна — не блокуємо легітимні сповіщення
  }

  if (!entry || typeof entry.start !== "number" || now - entry.start >= windowMs) {
    await dbSet(path, { n: 1, start: now });
    return true;
  }
  if ((entry.n || 0) >= max) return false;

  await dbSet(path, { n: (entry.n || 0) + 1, start: entry.start });
  return true;
}

module.exports = { allow, sanitize };
