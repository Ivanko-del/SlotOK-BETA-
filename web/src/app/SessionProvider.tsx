import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDb } from '../lib/db';
import { evaluateAccess, type UserRecord } from '../services/access';
import { clearSession, getSession } from '../services/session';
import { subscribeUser } from '../services/wallet';

interface SessionValue {
  nick: string | null;
  /** undefined — ще вантажиться, null — запису немає */
  user: UserRecord | null | undefined;
  /** true, коли користувач завантажений і пройшов перевірки доступу */
  ready: boolean;
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
    const offUser = subscribeUser(nick, setUser);
    const offMaintenance = getDb().subscribe('site_config/maintenance', (v) => setMaintenance(!!v));
    return () => {
      offUser();
      offMaintenance();
    };
  }, [nick]);

  const verdict = useMemo(
    () => (nick && user !== undefined && maintenance !== null ? evaluateAccess(nick, user, maintenance, Date.now()) : null),
    [nick, user, maintenance],
  );
  const ready = verdict?.ok === true;

  // Те саме, що робить startDataSync у старому app.js при кожному оновленні користувача.
  useEffect(() => {
    if (!nick || !verdict) return;
    if (!verdict.ok) {
      clearSession();
      setBlocked(verdict.message);
      setNick(null);
    } else if (verdict.clearSelfExclusion) {
      void getDb().set('users/' + nick + '/selfExcluded', false);
    }
  }, [nick, verdict]);

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
    () => ({ nick, user, ready, blocked, signIn, signOut, dismissBlocked }),
    [nick, user, ready, blocked, signIn, signOut, dismissBlocked],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
