import { activeCardId } from '../domain/cards';
import { canClaimDaily, dailyBonusPreview } from '../domain/dailyBonus';
import { getDb } from '../lib/db';
import { evaluateAccess, type UserRecord } from './access';
import { UserFacingError } from './errors';

export function subscribeUser(nick: string, cb: (u: UserRecord | null) => void): () => void {
  return getDb().subscribe<UserRecord>('users/' + nick, cb);
}

export interface ClaimResult {
  amount: number;
  day: number;
  streakBonus: number;
  mult: number;
}

/**
 * Дзеркало claimDailyBonus + checkStreakBonus + addToHistory зі старого app.js.
 * Увага: старий addToHistory для будь-якого тексту з «+» збільшує totalGames і totalWins —
 * повторюємо, щоб статистика двох версій не розходилася.
 */
export async function claimDaily(nick: string, now: number = Date.now()): Promise<ClaimResult> {
  const db = getDb();
  const base = 'users/' + nick;
  const user = await db.get<UserRecord>(base);
  if (!user) throw new UserFacingError('Акаунт не знайдено');
  const verdict = evaluateAccess(nick, user, false, now);
  if (!verdict.ok) throw new UserFacingError(verdict.message);
  if (!canClaimDaily(user.lastDailyBonus, now)) throw new UserFacingError('Бонус вже забрано, зачекай до завтра');

  const p = dailyBonusPreview(user);
  await db.update({ [base + '/lastDailyBonus']: now, [base + '/dailyStreak']: p.newStreak });
  await db.increment(base + '/balance', p.amount + p.streakBonus);

  const tx: Record<string, unknown> = {
    dir: 'in', amount: p.amount, title: 'Щоденний бонус', subtitle: 'День ' + p.day + ' серії', icon: '🎁', ts: now,
  };
  const cardId = activeCardId(user);
  if (cardId) tx.cardId = cardId;
  await db.push(base + '/cardTx', tx);
  await db.push(base + '/history', { text: 'Daily Bonus: +' + p.amount, date: now });
  await db.increment(base + '/totalGames', 1);
  await db.increment(base + '/totalWins', 1);

  return { amount: p.amount, day: p.day, streakBonus: p.streakBonus, mult: p.mult };
}

export interface WinFeedItem {
  user: string;
  amount: number;
  game?: string;
  time: number;
}

export function subscribeWinFeed(cb: (items: WinFeedItem[]) => void): () => void {
  return getDb().subscribeLast<WinFeedItem>('win_feed', 'time', 8, (items) =>
    cb([...items].sort((a, b) => b.time - a.time)),
  );
}

export function subscribeJackpot(cb: (n: number) => void): () => void {
  return getDb().subscribe<number>('jackpot/amount', (v) => cb(typeof v === 'number' ? v : 0));
}
