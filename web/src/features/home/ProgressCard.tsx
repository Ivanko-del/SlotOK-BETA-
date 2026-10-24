import { Card } from '../../design/Card';
import { ProgressBar } from '../../design/ProgressBar';
import { getBpProgress } from '../../domain/battlePass';
import { vipProgress } from '../../domain/vip';
import type { UserRecord } from '../../services/access';

export function ProgressCard({ user, now }: { user: UserRecord; now: number }) {
  const vip = vipProgress(user.totalWagered || 0);
  const bp = getBpProgress(user, now);
  return (
    <Card className="stack">
      <div>
        <div className="row between"><b>VIP: {vip.level.name}</b><span className="muted">{vip.pct}%</span></div>
        <ProgressBar pct={vip.pct} />
      </div>
      <div>
        <div className="row between"><b>Battle Pass</b><span className="muted">Lv{bp.level + 1}</span></div>
        <ProgressBar pct={bp.pct} />
      </div>
    </Card>
  );
}
