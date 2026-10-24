import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDb } from '../lib/db';
import { evaluateAccess, type UserRecord } from '../services/access';
import { clearSession, getSession } from '../services/session';
import { subscribeUser } from '../services/wallet';

interface SessionValue {
  nick: string | null;
  /** undefined — ще вантажиться, null — запису немає */
  user: UserRecord | null | undefined;
  blocked: string | null;
  signIn(nick: string): void;
  signOut(): void;
  dismissBlocked(): void;
}

const Ctx = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession поза SessionProvider');
  return v;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [nick, setNick] = useState<string | null>(() => getSession());
  const [user, setUser] = useState<UserRecord | null | undefined>(undefined);
  const [maintenance, setMaintenance] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    setUser(undefined);
    setMaintenance(null);
    if (!nick) return;
    const off = subscribeUser(nick, setUser);
    getDb()
      .get('site_config/maintenance')
      .then((v) => setMaintenance(!!v))
      .catch(() => setMaintenance(false));
    return off;
  }, [nick]);

  // Те саме, що робить startDataSync у старому app.js при кожному оновленні користувача.
  useEffect(() => {
    if (!nick || user === undefined || maintenance === null) return;
    const verdict = evaluateAccess(nick, user, maintenance, Date.now());
    if (!verdict.ok) {
      clearSession();
      setBlocked(verdict.message);
      setNick(null);
    } else if (verdict.clearSelfExclusion) {
      void getDb().set('users/' + nick + '/selfExcluded', false);
    }
  }, [nick, user, maintenance]);

  const signIn = useCallback((n: string) => {
    setBlocked(null);
    setNick(n);
  }, []);
  const signOut = useCallback(() => {
    clearSession();
    setNick(null);
  }, []);
  const dismissBlocked = useCallback(() => setBlocked(null), []);

  const value = useMemo(
    () => ({ nick, user, blocked, signIn, signOut, dismissBlocked }),
    [nick, user, blocked, signIn, signOut, dismissBlocked],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
