import { getDb } from '../lib/db';
import { notifyBot } from '../lib/notifyBot';
import { SlotOKPassword } from '../lib/password';
import { NICK_PATH_RE } from './auth';
import { UserFacingError } from './errors';

export const TG_BOT_USERNAME = 'SlotOK_DepositBot';

export type LookupResult = { kind: 'question'; question: string } | { kind: 'telegram' };

function assertNick(nick: string): void {
  if (!nick) throw new UserFacingError('Введіть нікнейм');
  if (!NICK_PATH_RE.test(nick)) throw new UserFacingError('Гравця не знайдено');
}

export async function lookup(nickRaw: string): Promise<LookupResult> {
  const nick = nickRaw.trim();
  assertNick(nick);
  const data = await getDb().get<Record<string, any>>('users/' + nick);
  if (!data) throw new UserFacingError('Гравця не знайдено');
  if (data.securityQuestion && data.securityAnswerHash) return { kind: 'question', question: data.securityQuestion };
  return { kind: 'telegram' };
}

export async function resetWithAnswer(nick: string, answer: string, p1: string, p2: string): Promise<void> {
  assertNick(nick);
  const a = answer.trim();
  if (!a) throw new UserFacingError('Введіть відповідь');
  if (p1.length < 6) throw new UserFacingError('Пароль мінімум 6 символів');
  if (p1 !== p2) throw new UserFacingError('Паролі не збігаються');

  const db = getDb();
  const stored = await db.get('users/' + nick + '/securityAnswerHash');
  const check = await SlotOKPassword.verify(a.toLowerCase(), stored);
  if (!check.ok) throw new UserFacingError('Невірна відповідь');

  const updates: Record<string, unknown> = { ['users/' + nick + '/pass']: await SlotOKPassword.hash(p1) };
  // Відповідь у старому форматі (голий SHA-256) переїжджає на PBKDF2 разом зі зміною пароля.
  if (check.needsUpgrade) updates['users/' + nick + '/securityAnswerHash'] = await SlotOKPassword.hash(a.toLowerCase());
  await db.update(updates);
}

export async function requestViaTelegram(
  nick: string,
  now: number = Date.now(),
  notify: typeof notifyBot = notifyBot,
): Promise<string> {
  assertNick(nick);
  const db = getDb();
  const reqId = nick + '_' + now;
  await db.set('password_reset_requests/' + reqId, { user: nick, status: 'pending', time: now });
  notify('reset', reqId);

  const sys = (to: string, text: string) => db.push('pm/' + to, { from: '📥 Система', to, text, ts: now });
  await sys(
    'theivankoo',
    `🔑 Заявка на відновлення пароля від @${nick}. Перевірте особу через Telegram і скиньте пароль в адмін-панелі.`,
  );
  await db.increment('users/theivankoo/pmUnread', 1);

  for (const adm of await db.adminNicks(5)) {
    if (adm === 'theivankoo') continue;
    await sys(adm, `🔑 Заявка на відновлення пароля від @${nick}`);
    await db.increment('users/' + adm + '/pmUnread', 1);
  }
  return `https://t.me/${TG_BOT_USERNAME}?start=reset_${nick}`;
}
