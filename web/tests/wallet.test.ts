import { beforeEach, describe, expect, it } from 'vitest';
import { DAY_MS } from '../src/domain/dailyBonus';
import { setDb } from '../src/lib/db';
import { claimDaily, subscribeWinFeed } from '../src/services/wallet';
import { FakeDb } from './fakeDb';

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  setDb(db);
});

describe('claimDaily', () => {
  it('день 1: +100, серія 1, lastDailyBonus, історія, статистика', async () => {
    db.data.users = { Ivan: { balance: 50, totalGames: 3, totalWins: 1 } };
    const r = await claimDaily('Ivan', 5000);
    expect(r).toMatchObject({ amount: 100, day: 1, streakBonus: 0 });
    expect(db.read('users/Ivan')).toMatchObject({
      balance: 150, dailyStreak: 1, lastDailyBonus: 5000, totalGames: 4, totalWins: 2,
    });
    const hist = Object.values(db.read('users/Ivan/history') as any)[0] as any;
    expect(hist).toEqual({ text: 'Daily Bonus: +100', date: 5000 });
  });

  it('пише cardTx без cardId, якщо карток немає', async () => {
    db.data.users = { Ivan: { balance: 0 } };
    await claimDaily('Ivan', 5000);
    const tx = Object.values(db.read('users/Ivan/cardTx') as any)[0] as any;
    expect(tx).toEqual({ dir: 'in', amount: 100, title: 'Щоденний бонус', subtitle: 'День 1 серії', icon: '🎁', ts: 5000 });
  });

  it('пише cardTx з id активної картки', async () => {
    db.data.users = { Ivan: { balance: 0, linkedCards: { c1: {}, c2: {} }, activeCardId: 'c2' } };
    await claimDaily('Ivan', 5000);
    const tx = Object.values(db.read('users/Ivan/cardTx') as any)[0] as any;
    expect(tx.cardId).toBe('c2');
  });

  it('множник VIP', async () => {
    db.data.users = { Ivan: { balance: 0, totalWagered: 5000 } };
    expect((await claimDaily('Ivan', 5000)).amount).toBe(110);
    expect(db.read('users/Ivan/balance')).toBe(110);
  });

  it('день 7: 1000 + 500, серія скидається в 0; у cardTx лише 1000', async () => {
    db.data.users = { Ivan: { balance: 0, dailyStreak: 6 } };
    const r = await claimDaily('Ivan', 5000);
    expect(r).toMatchObject({ amount: 1000, day: 7, streakBonus: 500 });
    expect(db.read('users/Ivan/balance')).toBe(1500);
    expect(db.read('users/Ivan/dailyStreak')).toBe(0);
    const tx = Object.values(db.read('users/Ivan/cardTx') as any)[0] as any;
    expect(tx.amount).toBe(1000);
  });

  it('повторний клік у межах доби відхиляється і нічого не міняє', async () => {
    db.data.users = { Ivan: { balance: 0 } };
    await claimDaily('Ivan', 5000);
    await expect(claimDaily('Ivan', 5000 + DAY_MS - 1)).rejects.toThrow('Бонус вже забрано');
    expect(db.read('users/Ivan/balance')).toBe(100);
  });

  it('через добу можна знову', async () => {
    db.data.users = { Ivan: { balance: 0 } };
    await claimDaily('Ivan', 5000);
    await expect(claimDaily('Ivan', 5000 + DAY_MS)).resolves.toMatchObject({ amount: 150, day: 2 });
  });

  it('невідомий акаунт', async () => {
    await expect(claimDaily('Nobody', 1)).rejects.toThrow('Акаунт не знайдено');
  });
});

describe('subscribeWinFeed', () => {
  it('віддає найновіші першими', () => {
    db.data.win_feed = {
      a: { user: 'A', amount: 10, time: 1 },
      b: { user: 'B', amount: 20, time: 3 },
      c: { user: 'C', amount: 30, time: 2 },
    };
    let got: any[] = [];
    subscribeWinFeed((items) => (got = items));
    expect(got.map((i) => i.user)).toEqual(['B', 'C', 'A']);
  });
});
