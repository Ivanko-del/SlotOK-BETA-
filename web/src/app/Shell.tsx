import { Outlet } from 'react-router-dom';
import { formatNumber } from '../lib/format';
import { BottomNav } from './BottomNav';
import { useSession } from './SessionProvider';

export function Shell() {
  const { nick, user } = useSession();
  return (
    <div className="page">
      <header className="topbar">
        <span className="logo">SlotOK</span>
        <span className="row">
          <span className="muted">{nick}</span>
          <span className="coin" aria-label="Баланс">🪙 {formatNumber(user?.balance ?? 0)}</span>
        </span>
      </header>
      <Outlet />
      <BottomNav />
    </div>
  );
}
