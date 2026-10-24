import { getDb } from '../lib/db';
import { SlotOKPassword } from '../lib/password';
import { TERMS_VERSION } from '../domain/terms';
import { isAdminAccount } from './access';
import { buildNewUser } from '../domain/newUser';
import { SECURITY_QUESTIONS } from '../domain/securityQuestions';
import { UserFacingError } from './errors';
import { clearRef, setSession, takeRef } from './session';

/** Firebase-ключі не можуть містити . # $ [ ] / — інакше нік перетворився б на шлях. */
export const NICK_PATH_RE = /^[^.#$\[\]\/]+$/;

export async function login(nickRaw: string, pass: string, now: number = Date.now()): Promise<string> {
  const n = nickRaw.trim();
  if (!n) throw new UserFacingError('Введіть нікнейм');
  if (!pass) throw new UserFacingError('Введіть пароль');

  const notFound = new UserFacingError('❌ Гравця "' + n + '" не знайдено');
  if (!NICK_PATH_RE.test(n)) throw notFound;

  const db = getDb();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new UserFacingError('⏱ Час вийшов. Перевір інтернет.')), 10_000);
  });
  let data: Record<string, any> | null;
  try {
    data = await Promise.race([db.get<Record<string, any>>('users/' + n), timeout]);
  } finally {
    clearTimeout(timer);
  }
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

export interface RegisterInput {
  nick: string;
  pass: string;
  email: string;
  promo: string;
  secQuestion: string;
  secAnswer: string;
}

export interface RegisterResult {
  nick: string;
  bonus: number;
  spins: number;
  bonusMsg: string;
}

export async function register(
  input: RegisterInput,
  now: number = Date.now(),
  rand: () => number = Math.random,
): Promise<RegisterResult> {
  const n = input.nick.trim();
  const email = input.email.trim();
  const promo = input.promo.trim().toUpperCase();
  const secA = input.secAnswer.trim();

  if (!n) throw new UserFacingError('Введіть нікнейм');
  if (n.length < 3) throw new UserFacingError('Нікнейм мінімум 3 символи');
  if (n.length > 20) throw new UserFacingError('Нікнейм максимум 20 символів');
  if (n.includes(' ')) throw new UserFacingError('Нікнейм не може містити пробіли');
  if (!/^[a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9_\-]+$/.test(n)) {
    throw new UserFacingError('Нікнейм може містити лише літери, цифри, "_" та "-"');
  }
  if (!input.pass) throw new UserFacingError('Введіть пароль');
  if (input.pass.length < 6) throw new UserFacingError('Пароль мінімум 6 символів');
  if (!Object.hasOwn(SECURITY_QUESTIONS, input.secQuestion)) throw new UserFacingError('Оберіть контрольне питання');
  if (!secA) {
    throw new UserFacingError('Введіть відповідь на контрольне питання (потрібна для відновлення пароля)');
  }

  const secAnswerHash = await SlotOKPassword.hash(secA.toLowerCase());
  const passHash = await SlotOKPassword.hash(input.pass);

  const { user, bonus, spins, bonusMsg } = buildNewUser({
    passHash, secAnswerHash, email, secQuestion: input.secQuestion, promo,
    refBy: takeRef(), nick: n, now, rand,
  });

  const db = getDb();
  // Транзакція замість «перевірити, потім записати»: два одночасні запити з одним ніком не затруть один одного.
  const created = await db.createIfAbsent('users/' + n, user);
  if (!created) throw new UserFacingError('❌ Нікнейм "' + n + '" вже зайнятий');

  setSession(n);
  clearRef();
  try {
    await db.push('users/' + n + '/history', { text: '🎉 Реєстрація! Бонус: +' + bonus + '₴', date: now });
    if (user.referredBy) await db.increment('users/' + user.referredBy + '/referrals', 1);
  } catch (e) {
    console.warn(e);
  }
  return { nick: n, bonus, spins, bonusMsg };
}
