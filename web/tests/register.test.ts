import { beforeEach, describe, expect, it } from 'vitest';
import { setDb } from '../src/lib/db';
import { SlotOKPassword } from '../src/lib/password';
import { register, type RegisterInput } from '../src/services/auth';
import { REF_KEY, SESSION_KEY } from '../src/services/session';
import { FakeDb } from './fakeDb';

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  setDb(db);
  localStorage.clear();
});

const ok: RegisterInput = {
  nick: 'Ivan', pass: 'secret1', email: '', promo: '', secQuestion: 'pet', secAnswer: 'Барсик',
};

describe('валідація (тексти зі старого authRegister)', () => {
  const cases: Array<[Partial<RegisterInput>, string]> = [
    [{ nick: '' }, 'Введіть нікнейм'],
    [{ nick: 'ab' }, 'Нікнейм мінімум 3 символи'],
    [{ nick: 'a'.repeat(21) }, 'Нікнейм максимум 20 символів'],
    [{ nick: 'a b c' }, 'Нікнейм не може містити пробіли'],
    [{ nick: 'a.b.c' }, 'Нікнейм може містити лише літери, цифри, "_" та "-"'],
    [{ pass: '' }, 'Введіть пароль'],
    [{ pass: '12345' }, 'Пароль мінімум 6 символів'],
    [{ secAnswer: '  ' }, 'Введіть відповідь на контрольне питання (потрібна для відновлення пароля)'],
    [{ secQuestion: '' }, 'Оберіть контрольне питання'],
  ];
  it.each(cases)('%j → %s', async (patch, msg) => {
    await expect(register({ ...ok, ...patch })).rejects.toThrow(msg);
    expect(db.data.users).toBeUndefined();
  });

  it('прототипні ключі не проходять як контрольне питання', async () => {
    await expect(register({ ...ok, secQuestion: 'constructor' })).rejects.toThrow('Оберіть контрольне питання');
    expect(db.data.users).toBeUndefined();
  });

  it('дозволяє українські літери', async () => {
    await expect(register({ ...ok, nick: 'Їжак_Єгор-1' })).resolves.toMatchObject({ nick: 'Їжак_Єгор-1' });
  });
});

describe('успішна реєстрація', () => {
  it('пише користувача з хешами, бонусами і сесією', async () => {
    const r = await register(ok, 1234, () => 0);
    expect(r).toEqual({ nick: 'Ivan', bonus: 1000, spins: 10, bonusMsg: '' });
    const u = db.read('users/Ivan');
    expect(u).toMatchObject({ balance: 1000, freeSlots: 10, id: 100000, registeredAt: 1234, tag: 'Новачок 🌱' });
    expect((await SlotOKPassword.verify('secret1', u.pass)).ok).toBe(true);
    expect((await SlotOKPassword.verify('барсик', u.securityAnswerHash)).ok).toBe(true); // нижній регістр
    expect(localStorage.getItem(SESSION_KEY)).toBe('Ivan');
  });

  it('промокод SLOTOK', async () => {
    const r = await register({ ...ok, promo: 'slotok' });
    expect(r).toMatchObject({ bonus: 1500, spins: 15 });
    expect(db.read('users/Ivan/usedPromo')).toBe('SLOTOK');
  });

  it('запис в history про реєстрацію', async () => {
    await register(ok);
    const hist = Object.values(db.read('users/Ivan/history') as Record<string, any>);
    expect(hist[0].text).toBe('🎉 Реєстрація! Бонус: +1000₴');
  });

  it('зайнятий нік не перезаписує акаунт', async () => {
    db.data.users = { Ivan: { balance: 999 } };
    await expect(register(ok)).rejects.toThrow('❌ Нікнейм "Ivan" вже зайнятий');
    expect(db.read('users/Ivan/balance')).toBe(999);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('два одночасні запити з одним ніком: створюється лише один', async () => {
    const results = await Promise.allSettled([register(ok), register({ ...ok, pass: 'another1' })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('реферали', () => {
  it('referredBy, лічильник запрошувача, очищення ref_by', async () => {
    db.data.users = { Petro: { referrals: 2 } };
    localStorage.setItem(REF_KEY, 'Petro');
    await register(ok);
    expect(db.read('users/Ivan/referredBy')).toBe('Petro');
    expect(db.read('users/Petro/referrals')).toBe(3);
    expect(localStorage.getItem(REF_KEY)).toBeNull();
  });

  it('без ref_by реферала немає', async () => {
    await register(ok);
    expect(db.read('users/Ivan/referredBy')).toBeNull();
  });
});
