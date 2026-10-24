import { useEffect, useState } from 'react';
import { useSession } from '../../app/SessionProvider';
import { claimDaily } from '../../services/wallet';
import { DailyBonusCard } from './DailyBonusCard';
import { GameTiles } from './GameTiles';
import { ProgressCard } from './ProgressCard';
import { StatsGrid } from './StatsGrid';
import { WinTicker } from './WinTicker';

export function HomeScreen() {
  const { nick, user } = useSession();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!nick || !user) return null;

  async function claim() {
    setBusy(true);
    setMessage('');
    try {
      const r = await claimDaily(nick!);
      setNow(Date.now());
      setMessage(`🎁 +${r.amount} ₴${r.streakBonus ? ` і бонус серії +${r.streakBonus} ₴` : ''}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Не вдалося забрати бонус');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <DailyBonusCard user={user} now={now} busy={busy} message={message} onClaim={claim} />
      <StatsGrid user={user} />
      <ProgressCard user={user} now={now} />
      <WinTicker />
      <GameTiles />
    </div>
  );
}
