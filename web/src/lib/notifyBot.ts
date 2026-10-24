/** Сповіщення Telegram-боту через серверну функцію; помилки мовчки ігноруємо, як у старому notifyBot. */
export function notifyBot(type: string, id: string | null, extra?: Record<string, unknown>): void {
  try {
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id, ...extra }),
    }).catch(() => {});
  } catch {
    /* нічого */
  }
}
