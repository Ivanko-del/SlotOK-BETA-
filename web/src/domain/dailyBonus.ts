import { getVipLevel } from './vip';

export const DAILY_BONUSES = [100, 150, 200, 300, 500, 750, 1000] as const;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function canClaimDaily(last: number | undefined, now: number): boolean {
  return now - (last || 0) >= DAY_MS;
}

export function msUntilNextDaily(last: number | undefined, now: number): number {
  return Math.max(0, DAY_MS - (now - (last || 0)));
}

export interface DailyPreview {
  day: number;
  base: number;
  mult: number;
  amount: number;
  newStreak: number;
  streakBonus: number;
}

/** Рівно та сама арифметика, що в openDailyBonus/claimDailyBonus/checkStreakBonus у app.js. */
export function dailyBonusPreview(user: { dailyStreak?: number; totalWagered?: number }): DailyPreview {
  const streak = user.dailyStreak || 0;
  const day = streak + 1;
  const base = DAILY_BONUSES[Math.min(streak, 6)];
  const mult = getVipLevel(user.totalWagered || 0).dailyMult;
  return {
    day,
    base,
    mult,
    amount: Math.floor(base * mult),
    newStreak: day >= 7 ? 0 : day,
    streakBonus: day === 7 ? 500 : 0,
  };
}
