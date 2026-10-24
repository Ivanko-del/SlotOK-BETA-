import { DAILY_BONUSES, canClaimDaily, dailyBonusPreview, DAY_MS } from '../src/domain/dailyBonus';
import { getBpProgress, getBpSeasonNum } from '../src/domain/battlePass';
import { buildNewUser, NEW_USER_KEYS } from '../src/domain/newUser';
import { activeCardId } from '../src/domain/cards';
import { getVipLevel, vipProgress } from '../src/domain/vip';

describe('щоденний бонус', () => {
  it('день 1 без VIP: 100', () => {
    expect(dailyBonusPreview({})).toMatchObject({ day: 1, base: 100, amount: 100, newStreak: 1, streakBonus: 0 });
  });
  it('множник Silver 1.1 округлюється вниз', () => {
    expect(dailyBonusPreview({ totalWagered: 5000 }).amount).toBe(110);
  });
  it('день 7: 1000 + 500 бонус серії, серія скидається', () => {
    expect(dailyBonusPreview({ dailyStreak: 6 })).toMatchObject({ day: 7, base: 1000, newStreak: 0, streakBonus: 500 });
  });
  it('серія понад 6 не виходить за таблицю', () => {
    expect(dailyBonusPreview({ dailyStreak: 40 }).base).toBe(DAILY_BONUSES[6]);
  });
  it('доступність: рівно через добу', () => {
    expect(canClaimDaily(1000, 1000 + DAY_MS - 1)).toBe(false);
    expect(canClaimDaily(1000, 1000 + DAY_MS)).toBe(true);
    expect(canClaimDaily(undefined, DAY_MS)).toBe(true);
  });
});

describe('VIP', () => {
  it('рівень за оборотом', () => {
    expect(getVipLevel(0).name).toBe('Iron');
    expect(getVipLevel(5000).name).toBe('Silver');
    expect(getVipLevel(10 ** 9).name).toBe('Supreme');
  });
  it('відсоток до наступного рівня', () => {
    expect(vipProgress(3000).pct).toBe(50); // Bronze 1000 → Silver 5000
    expect(vipProgress(10 ** 9).pct).toBe(100);
  });
});

describe('Battle Pass', () => {
  const now = Date.UTC(2026, 0, 1);
  it('сезон 1 на початку епохи', () => expect(getBpSeasonNum(now)).toBe(1));
  it('прогрес поточного сезону', () => {
    expect(getBpProgress({ bpSeason: 1, bpXP: 2500, bpLevel: 2 }, now)).toEqual({ level: 2, pct: 50 });
  });
  it('минулий сезон обнуляється', () => {
    expect(getBpProgress({ bpSeason: 0, bpXP: 2500, bpLevel: 2 }, now)).toEqual({ level: 0, pct: 0 });
  });
});

describe('новий користувач', () => {
  const base = { passHash: 'p', secAnswerHash: 's', email: '', secQuestion: 'pet', nick: 'Ivan', now: 5, rand: () => 0 };
  it('має рівно очікувані ключі', () => {
    const { user } = buildNewUser({ ...base, promo: '', refBy: null });
    expect(Object.keys(user).sort()).toEqual([...NEW_USER_KEYS].sort());
  });
  it('промокоди', () => {
    expect(buildNewUser({ ...base, promo: 'SLOTOK', refBy: null })).toMatchObject({ bonus: 1500, spins: 15 });
    expect(buildNewUser({ ...base, promo: 'VIP', refBy: null })).toMatchObject({ bonus: 3000, spins: 10 });
  });
  it('невідомий промокод лишається в usedPromo, але бонусу не дає', () => {
    const r = buildNewUser({ ...base, promo: 'ХХХ', refBy: null });
    expect(r.bonus).toBe(1000);
    expect(r.user.usedPromo).toBe('ХХХ');
  });
  it('запрошувач не може бути самим собою', () => {
    expect(buildNewUser({ ...base, promo: '', refBy: 'Ivan' }).user.referredBy).toBeUndefined();
    expect(buildNewUser({ ...base, promo: '', refBy: 'Petro' }).user.referredBy).toBe('Petro');
  });
});

describe('активна картка', () => {
  it('нема карток → null', () => expect(activeCardId({})).toBeNull());
  it('перша зі списку, якщо activeCardId недійсний', () => {
    expect(activeCardId({ linkedCards: { a: {}, b: {} }, activeCardId: 'zzz' })).toBe('a');
  });
  it('Аксіома має пріоритет у списку', () => {
    expect(activeCardId({ virtualCard: { axiomLinked: true }, linkedCards: { a: {} } })).toBe('axiom');
  });
  it('поважає activeCardId', () => {
    expect(activeCardId({ linkedCards: { a: {}, b: {} }, activeCardId: 'b' })).toBe('b');
  });
});
