import { getVipLevel } from '../../domain/vip';
import { formatNumber } from '../../lib/format';
import type { UserRecord } from '../../services/access';

export function StatsGrid({ user }: { user: UserRecord }) {
  const vip = getVipLevel(user.totalWagered || 0);
  const items: Array<[string, string]> = [
    ['Баланс', '₴' + formatNumber(user.balance || 0)],
    ['VIP', vip.icon + ' ' + vip.name],
    ['Серія', (user.dailyStreak || 0) + '🔥'],
    ['Ставки', formatNumber(user.totalBets || 0)],
    ['Перемоги', formatNumber(user.totalWins || 0)],
  ];
  return (
    <div className="grid3">
      {items.map(([label, value]) => (
        <div className="stat" key={label}>
          <b>{value}</b>
          <span className="muted">{label}</span>
        </div>
      ))}
    </div>
  );
}
