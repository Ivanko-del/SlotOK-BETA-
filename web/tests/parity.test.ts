import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BP_SEASON_DAYS, BP_SEASON_EPOCH, BP_XP_PER_LEVEL } from '../src/domain/battlePass';
import { DAILY_BONUSES } from '../src/domain/dailyBonus';
import { NEW_USER_KEYS } from '../src/domain/newUser';
import { SECURITY_QUESTIONS } from '../src/domain/securityQuestions';
import { TERMS_CHECKS, TERMS_VERSION } from '../src/domain/terms';
import { VIP_LEVELS } from '../src/domain/vip';

// app.js — не модуль, тож читаємо його як текст і порівнюємо константи.
// Якщо тут падає — хтось змінив правила в app.js (або тут) і друга версія розійшлася.
const app = readFileSync(resolve(__dirname, '../../app.js'), 'utf8');

function literal(re: RegExp): any {
  const m = app.match(re);
  if (!m) throw new Error('Не знайдено в app.js: ' + re);
  return new Function('return ' + m[1])();
}

describe('parity з app.js', () => {
  it('VIP_LEVELS: назва, поріг, множник бонусу', () => {
    const legacy = literal(/const VIP_LEVELS = (\[[\s\S]*?\n\]);/);
    const pick = (l: any) => ({ name: l.name, min: l.min, dailyMult: l.dailyMult });
    expect(VIP_LEVELS.map(pick)).toEqual(legacy.map(pick));
  });

  it('DAILY_BONUSES', () => {
    expect([...DAILY_BONUSES]).toEqual(literal(/const DAILY_BONUSES = (\[[^\]]*\]);/));
  });

  it('арифметика щоденного бонусу', () => {
    expect(app).toMatch(/DAILY_BONUSES\[Math\.min\(streak, 6\)\]/);
    expect(app).toMatch(/const newStreak = streak >= 7 \? 0 : streak;/);
    expect(app).toMatch(/Math\.floor\(amount \* vip\.dailyMult\)/);
    expect(app).toMatch(/streak === 7\) \{[\s\S]*?increment\(500\)/);
  });

  it('Battle Pass', () => {
    expect(BP_XP_PER_LEVEL).toBe(Number(app.match(/const BP_XP_PER_LEVEL = (\d+)/)![1]));
    expect(BP_SEASON_EPOCH).toBe(literal(/const BP_SEASON_EPOCH = (Date\.UTC\([^)]*\));/));
    expect(BP_SEASON_DAYS).toBe(Number(app.match(/const BP_SEASON_DAYS\s*=\s*(\d+)/)![1]));
  });

  it('контрольні питання', () => {
    expect(SECURITY_QUESTIONS).toEqual(literal(/const SECURITY_QUESTIONS = (\{[\s\S]*?\n\});/));
  });

  it('умови користування', () => {
    expect(TERMS_VERSION).toBe(app.match(/var TERMS_VERSION = '(\d+)'/)![1]);
    expect(TERMS_CHECKS).toEqual(literal(/var TERMS_CHECKS = (\[[\s\S]*?\n\]);/));
  });

  it('форма нового користувача', () => {
    const body = app.match(/const newUser = \{([\s\S]*?)\n    \};/)![1];
    const keys = [...body.matchAll(/\b([A-Za-z]\w*):/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual([...NEW_USER_KEYS].sort());
  });

  it('стартові бонуси і промокоди', () => {
    expect(app).toMatch(/let bonus = 1000, spins = 10/);
    expect(app).toMatch(/promo === 'SLOTOK'\) \{ bonus \+= 500; spins \+= 5;/);
    expect(app).toMatch(/promo === 'VIP'\) \{ bonus \+= 2000;/);
  });
});
