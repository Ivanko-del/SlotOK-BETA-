import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setDb } from '../src/lib/db';
import { SlotOKPassword } from '../src/lib/password';
import { lookup, requestViaTelegram, resetWithAnswer } from '../src/services/recovery';
import { FakeDb } from './fakeDb';

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  setDb(db);
});

describe('lookup', () => {
  it('невідомий гравець', async () => {
    await expect(lookup('Nobody')).rejects.toThrow('Гравця не знайдено');
  });
  it('є питання → question', async () => {
    db.data.users = { Ivan: { securityQuestion: 'pet', securityAnswerHash: 'x' } };
    expect(await lookup('Ivan')).toEqual({ kind: 'question', question: 'pet' });
  });
  it('немає питання → telegram', async () => {
    db.data.users = { Ivan: {} };
    expect(await lookup('Ivan')).toEqual({ kind: 'telegram' });
  });
});

describe('resetWithAnswer', () => {
  async function seed() {
    db.data.users = {
      Ivan: { pass: 'old', securityQuestion: 'pet', securityAnswerHash: await SlotOKPassword.hash('барсик') },
    };
  }
  it('перевіряє поля', async () => {
    await seed();
    await expect(resetWithAnswer('Ivan', '', 'newpass1', 'newpass1')).rejects.toThrow('Введіть відповідь');
    await expect(resetWithAnswer('Ivan', 'барсик', '123', '123')).rejects.toThrow('Пароль мінімум 6 символів');
    await expect(resetWithAnswer('Ivan', 'барсик', 'newpass1', 'other')).rejects.toThrow('Паролі не збігаються');
  });
  it('невірна відповідь не змінює пароль', async () => {
    await seed();
    await expect(resetWithAnswer('Ivan', 'Рекс', 'newpass1', 'newpass1')).rejects.toThrow('Невірна відповідь');
    expect(db.read('users/Ivan/pass')).toBe('old');
  });
  it('вірна відповідь (регістр неважливий) міняє пароль', async () => {
    await seed();
    await resetWithAnswer('Ivan', '  БАРСИК ', 'newpass1', 'newpass1');
    expect((await SlotOKPassword.verify('newpass1', db.read('users/Ivan/pass'))).ok).toBe(true);
  });
});

describe('resetWithAnswer: спадкова відповідь', () => {
  it('SHA-256 відповідь перехешовується в pbkdf2, пароль оновлено', async () => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('барсик'));
    const sha = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    db.data.users = { Ivan: { pass: 'old', securityQuestion: 'pet', securityAnswerHash: sha } };
    await resetWithAnswer('Ivan', ' БАРСИК ', 'newpass1', 'newpass1');
    const stored = db.read('users/Ivan/securityAnswerHash');
    expect(stored.startsWith('pbkdf2$')).toBe(true);
    expect((await SlotOKPassword.verify('барсик', stored)).ok).toBe(true);
    expect((await SlotOKPassword.verify('newpass1', db.read('users/Ivan/pass'))).ok).toBe(true);
  });
});

describe('requestViaTelegram', () => {
  it('створює заявку, сповіщує бота й адмінів, повертає посилання', async () => {
    db.data.users = {
      theivankoo: { pmUnread: 0 },
      Admin2: { isAdmin: true, pmUnread: 4 },
      Ivan: {},
    };
    const notify = vi.fn();
    const url = await requestViaTelegram('Ivan', 99, notify);

    const reqs = db.read('password_reset_requests') as Record<string, any>;
    const [reqId, req] = Object.entries(reqs)[0];
    expect(reqId).toBe('Ivan_99');
    expect(req).toEqual({ user: 'Ivan', status: 'pending', time: 99 });
    expect(notify).toHaveBeenCalledWith('reset', 'Ivan_99');

    expect(Object.values(db.read('pm/theivankoo') as any)[0]).toMatchObject({ from: '📥 Система', to: 'theivankoo' });
    expect(Object.values(db.read('pm/Admin2') as any)[0]).toMatchObject({ to: 'Admin2' });
    expect(db.read('users/theivankoo/pmUnread')).toBe(1);
    expect(db.read('users/Admin2/pmUnread')).toBe(5);
    expect(url).toBe('https://t.me/SlotOK_DepositBot?start=reset_Ivan');
  });
});
