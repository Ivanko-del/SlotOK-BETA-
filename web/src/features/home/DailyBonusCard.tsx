import { Button } from '../../design/Button';
import { Card } from '../../design/Card';
import { canClaimDaily, dailyBonusPreview, msUntilNextDaily } from '../../domain/dailyBonus';
import type { UserRecord } from '../../services/access';

interface Props {
  user: UserRecord;
  now: number;
  busy: boolean;
  message: string;
  error?: string;
  onClaim(): void;
}

export function DailyBonusCard({ user, now, busy, message, error, onClaim }: Props) {
  const can = canClaimDaily(user.lastDailyBonus, now);
  const p = dailyBonusPreview(user);

  if (!can) {
    const ms = msUntilNextDaily(user.lastDailyBonus, now);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return (
      <Card>
        <h2>🎁 Щоденний бонус</h2>
        <p className="muted">Наступний бонус через {h} год {m} хв · серія {user.dailyStreak || 0} 🔥</p>
        {message && <p className="ok">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </Card>
    );
  }

  return (
    <Card tone="accent">
      <div className="muted" style={{ color: 'inherit', fontWeight: 800 }}>ЩОДЕННИЙ БОНУС</div>
      <div className="big">+{p.amount} монет</div>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>День {p.day} серії</div>
      <Button variant="accent" disabled={busy} onClick={onClaim}>Забрати</Button>
      {error && <p className="error" role="alert">{error}</p>}
    </Card>
  );
}
