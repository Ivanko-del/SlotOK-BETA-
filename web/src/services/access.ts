export type UserRecord = Record<string, any>;

export type Verdict =
  | { ok: true; clearSelfExclusion: boolean }
  | { ok: false; kind: 'missing' | 'banned' | 'selfExcluded' | 'maintenance'; message: string };

export function isAdminAccount(nick: string, user: UserRecord | null): boolean {
  return nick.toLowerCase() === 'theivankoo' || user?.isAdmin === true;
}

/** Ті самі перевірки, що робить startDataSync у app.js при кожному завантаженні сесії. */
export function evaluateAccess(nick: string, user: UserRecord | null, maintenance: boolean, now: number): Verdict {
  if (!user) return { ok: false, kind: 'missing', message: 'Акаунт не знайдено' };
  if (user.banned) {
    return {
      ok: false,
      kind: 'banned',
      message: 'ВАШ АКАУНТ ЗАБЛОКОВАНО!' + (user.banReason ? '\nПричина: ' + user.banReason : ''),
    };
  }
  let clearSelfExclusion = false;
  if (user.selfExcluded) {
    if (user.selfExcludeUntil && user.selfExcludeUntil > now) {
      const hrsLeft = Math.ceil((user.selfExcludeUntil - now) / 3600000);
      return {
        ok: false,
        kind: 'selfExcluded',
        message: '🚫 Ви увімкнули само-виключення. Залишилось: ' + hrsLeft + ' год.',
      };
    }
    clearSelfExclusion = true;
  }
  if (maintenance && !isAdminAccount(nick, user)) {
    return {
      ok: false,
      kind: 'maintenance',
      message: '🚧 Сайт зараз на технічному обслуговуванні. Зайдіть пізніше.',
    };
  }
  return { ok: true, clearSelfExclusion };
}
