import { getDb } from '../lib/db';
import { SlotOKPassword } from '../lib/password';
import { TERMS_VERSION } from '../domain/terms';
import { isAdminAccount } from './access';
import { UserFacingError } from './errors';
import { setSession } from './session';

/** Firebase-ключі не можуть містити . # $ [ ] / — інакше нік перетворився б на шлях. */
export const NICK_PATH_RE = /^[^.#$\[\]\/]+$/;

export async function login(nickRaw: string, pass: string, now: number = Date.now()): Promise<string> {
  const n = nickRaw.trim();
  if (!n) throw new UserFacingError('Введіть нікнейм');
  if (!pass) throw new UserFacingError('Введіть пароль');

  const notFound = new UserFacingError('❌ Гравця "' + n + '" не знайдено');
  if (!NICK_PATH_RE.test(n)) throw notFound;

  const db = getDb();
  const data = await db.get<Record<string, any>>('users/' + n);
  if (!data) throw notFound;
  if (data.banned) {
    throw new UserFacingError('🚫 Акаунт заблоковано' + (data.banReason ? ': ' + data.banReason : ''));
  }

  const check = await SlotOKPassword.verify(pass, data.pass);
  if (!check.ok) throw new UserFacingError('❌ Невірний пароль');
  if (check.needsUpgrade) {
    try {
      await db.set('users/' + n + '/pass', await SlotOKPassword.hash(pass));
    } catch (e) {
      console.warn(e);
    }
  }

  const maintenance = await db.get('site_config/maintenance');
  if (maintenance && !isAdminAccount(n, data)) {
    throw new UserFacingError('🚧 Сайт тимчасово на технічному обслуговуванні. Спробуй пізніше.');
  }

  setSession(n);
  await db.update({ ['users/' + n + '/lastSeen']: now });
  return n;
}

export async function acceptTerms(nick: string, now: number = Date.now()): Promise<void> {
  await getDb().update({
    ['users/' + nick + '/termsAcceptedAt']: now,
    ['users/' + nick + '/termsVersion']: TERMS_VERSION,
  });
}
