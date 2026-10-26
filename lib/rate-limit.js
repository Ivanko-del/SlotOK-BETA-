// Дросель для неавтентифікованих ендпоінтів (api/notify.js, api/auth.js).
// Без нього будь-хто, хто знає чужий нік або id заявки, може нескінченно
// повторювати той самий POST: засипати чужий Telegram повідомленнями або
// перебирати паролі.
//
// Лічильник оновлюється через dbTransaction (ETag/if-match), тож паралельні
// виклики не «злипаються» в один, як це було з простим read-modify-write.

const { dbTransaction } = require("./firebase");

// Ключ ліміту потрапляє у шлях Firebase, тому з нього треба прибрати символи,
// заборонені в ключах RTDB (. $ # [ ] / та керуючі), інакше запис просто впаде.
function sanitize(key) {
  return String(key).replace(/[.$#[\]/\x00-\x1f\x7f]/g, "_").slice(0, 180);
}

/**
 * Повертає true, якщо дію дозволено, і false — якщо ліміт вичерпано.
 * Ліміт «не більше max подій на вікно windowMs» для конкретного ключа.
 * failClosed: що робити, якщо БД недоступна. За замовчуванням пропускаємо
 * (сповіщення важливіші за антиспам); для входу краще відмовити.
 */
async function allow(key, max, windowMs, { failClosed = false } = {}) {
  const path = `notify_rate/${sanitize(key)}`;
  const now = Date.now();
  let allowed = false;
  try {
    await dbTransaction(path, (entry) => {
      if (!entry || typeof entry.start !== "number" || now - entry.start >= windowMs) {
        allowed = true;
        return { n: 1, start: now };
      }
      if ((entry.n || 0) >= max) {
        allowed = false;
        return undefined; // ліміт вичерпано — нічого не пишемо
      }
      allowed = true;
      return { n: (entry.n || 0) + 1, start: entry.start };
    });
  } catch {
    return !failClosed; // БД недоступна
  }
  return allowed;
}

module.exports = { allow, sanitize };
