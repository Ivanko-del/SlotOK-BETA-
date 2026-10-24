export const SESSION_KEY = 'slotok_user';
const LEGACY_SESSION_KEY = 'royal_online_user';
export const REF_KEY = 'ref_by';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function getSession(): string | null {
  return safe(() => {
    let nick = localStorage.getItem(SESSION_KEY);
    if (!nick) {
      const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
      if (legacy) {
        nick = legacy;
        localStorage.setItem(SESSION_KEY, legacy);
      }
    }
    localStorage.removeItem(LEGACY_SESSION_KEY);
    return nick;
  }, null);
}

export function setSession(nick: string): void {
  safe(() => localStorage.setItem(SESSION_KEY, nick), undefined);
}

export function clearSession(): void {
  safe(() => localStorage.removeItem(SESSION_KEY), undefined);
}

/** Як checkRefParam у app.js: запам'ятовуємо запрошувача лише для гостя й лише безпечне ім'я. */
export function captureRef(search: string, hasSession: boolean): void {
  const ref = new URLSearchParams(search).get('ref');
  if (ref && !hasSession && /^[^.#$\[\]\/]{1,40}$/.test(ref)) {
    safe(() => localStorage.setItem(REF_KEY, ref), undefined);
  }
}

export function takeRef(): string | null {
  return safe(() => localStorage.getItem(REF_KEY), null);
}

export function clearRef(): void {
  safe(() => localStorage.removeItem(REF_KEY), undefined);
}
