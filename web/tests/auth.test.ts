import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '../src/lib/db';
import { SlotOKPassword } from '../src/lib/password';
import { acceptTerms, login } from '../src/services/auth';
import { SESSION_KEY } from '../src/services/session';
import { FakeDb } from './fakeDb';

let db: FakeDb;

beforeEach(() => {
  db = new FakeDb();
  setDb(db);
  localStorage.clear();
});

async function seed(nick: string, pass: string, extra: Record<string, unknown> = {}) {
  db.data.users = { ...(db.data.users ?? {}), [nick]: { pass: await SlotOKPassword.hash(pass), balance: 5, ...extra } };
}

describe('login', () => {
  it('порожні поля', async () => {
    await expect(login('', 'x')).rejects.toThrow('Введіть нікнейм');
    await expect(login('Ivan', '')).rejects.toThrow('Введіть пароль');
  });

  it('невідомий гравець', async () => {
    await expect(login('Nobody', 'x')).rejects.toThrow('❌ Гравця "Nobody" не знайдено');
  });

  it('нік зі шляховими символами не читає вкладені вузли', async () => {
    await seed('Ivan', 'secret1');
    await expect(login('Ivan/pass', 'x')).rejects.toThrow('не знайдено');
  });

  it('бан із причиною', async () => {
    await seed('Ivan', 'secret1', { banned: true, banReason: 'чіти' });
    await expect(login('Ivan', 'secret1')).rejects.toThrow('🚫 Акаунт заблоковано: чіти');
  });

  it('невірний пароль', async () => {
    await seed('Ivan', 'secret1');
    await expect(login('Ivan', 'wrong')).rejects.toThrow('❌ Невірний пароль');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('успіх: сесія і lastSeen', async () => {
    await seed('Ivan', 'secret1');
    const nick = await login('Ivan', 'secret1', 777);
    expect(nick).toBe('Ivan');
    expect(localStorage.getItem(SESSION_KEY)).toBe('Ivan');
    expect(db.read('users/Ivan/lastSeen')).toBe(777);
  });

  it('спадковий SHA-256 пароль входить і мовчки оновлюється до pbkdf2', async () => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('old-pass'));
    const sha = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    db.data.users = { Ivan: { pass: sha } };
    await login('Ivan', 'old-pass');
    expect(db.read('users/Ivan/pass').startsWith('pbkdf2$')).toBe(true);
  });

  it('техобслуговування: блокує гравця, пропускає адміна', async () => {
    await seed('Ivan', 'secret1');
    await seed('Boss', 'secret1', { isAdmin: true });
    db.data.site_config = { maintenance: true };
    await expect(login('Ivan', 'secret1')).rejects.toThrow('технічному обслуговуванні');
    await expect(login('Boss', 'secret1')).resolves.toBe('Boss');
  });
});

describe('login: таймаут', () => {
  afterEach(() => vi.useRealTimers());
  it('через 10 с без відповіді БД кидає «Час вийшов»', async () => {
    vi.useFakeTimers();
    db.get = () => new Promise(() => {});
    const p = login('Ivan', 'secret1');
    const assertion = expect(p).rejects.toThrow('⏱ Час вийшов. Перевір інтернет.');
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
});

describe('acceptTerms', () => {
  it('пише termsAcceptedAt і termsVersion', async () => {
    db.data.users = { Ivan: {} };
    await acceptTerms('Ivan', 42);
    expect(db.read('users/Ivan/termsAcceptedAt')).toBe(42);
    expect(db.read('users/Ivan/termsVersion')).toBe('1');
  });
});
