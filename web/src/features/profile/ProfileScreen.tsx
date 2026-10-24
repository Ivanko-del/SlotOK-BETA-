import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../app/SessionProvider';
import { Button } from '../../design/Button';
import { Card } from '../../design/Card';
import { Field } from '../../design/Field';
import { ProgressBar } from '../../design/ProgressBar';
import { getVipLevel } from '../../domain/vip';
import { formatNumber } from '../../lib/format';
import { isAdminAccount } from '../../services/access';
import { downscaleImage, setAvatar, setStatus, setTag, STATUSES } from '../../services/profile';

function Avatar({ user }: { user: Record<string, any> }) {
  const src: string | null = user.avatarUrl || (typeof user.avatar === 'string' && user.avatar.length > 2 ? user.avatar : null);
  return <div className="avatar">{src ? <img src={src} alt="" /> : user.avatar || '👤'}</div>;
}

export function ProfileScreen() {
  const { nick, user, signOut } = useSession();
  const [tag, setTagValue] = useState('');
  const [info, setInfo] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) setTagValue(user.tag || '');
  }, [user?.tag]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!nick || !user) return null;

  const vip = getVipLevel(user.totalWagered || 0);
  const played = user.stats?.gamesPlayed || user.totalGames || 0;
  const won = user.stats?.gamesWon || user.totalWins || 0;
  const winRate = played > 0 ? Math.min(100, Math.round((won / played) * 100)) : 0;
  const rows: Array<[string, string]> = [
    ['Баланс', '₴' + formatNumber(user.balance || 0)],
    ['Найбільший виграш', '₴' + formatNumber(user.stats?.biggestWin || user.maxWin || 0)],
    ['Ігор зіграно', formatNumber(played)],
    ['Оборот', '₴' + formatNumber(user.totalWagered || user.totalWager || 0)],
    ['Серія', (user.dailyStreak || 0) + '🔥'],
    ['Зіграно слотів', formatNumber(user.slotsPlayed || 0)],
    ['Поповнень', '₴' + formatNumber(user.totalDeposits || 0)],
  ];

  async function onAvatar(file: File | undefined) {
    if (!file) return;
    setInfo('Завантаження…');
    try {
      await setAvatar(nick!, await downscaleImage(file));
      setInfo('Аватар оновлено');
    } catch (e) {
      setInfo(e instanceof Error ? e.message : 'Не вдалося завантажити');
    }
  }

  return (
    <div className="stack">
      <Card className="stack center">
        <div className="row" style={{ justifyContent: 'center' }}><Avatar user={user} /></div>
        <h1 style={{ fontSize: 22 }}>{nick}</h1>
        <div className="muted">ID {user.id || '---'} · {vip.icon} {vip.name}{isAdminAccount(nick, user) ? ' · 🛡 Адмін' : ''}</div>
        <Field
          label="Статус профілю"
          value={tag}
          maxLength={60}
          onChange={(e) => setTagValue(e.target.value)}
          onBlur={() => tag !== (user.tag || '') && void setTag(nick, tag)}
        />
        <label className="field">
          Стан
          <select value={user.status || 'online'} onChange={(e) => void setStatus(nick, e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onAvatar(e.target.files?.[0])} />
        <Button variant="quiet" onClick={() => fileRef.current?.click()}>📷 Змінити аватар</Button>
        {info && <div className="muted">{info}</div>}
      </Card>

      <Card className="stack">
        <h2>Статистика</h2>
        {rows.map(([k, v]) => (
          <div className="row between" key={k}><span className="muted">{k}</span><b>{v}</b></div>
        ))}
        <div>
          <div className="row between"><span className="muted">Відсоток перемог</span><b>{winRate}%</b></div>
          <ProgressBar pct={winRate} />
        </div>
      </Card>

      {isAdminAccount(nick, user) && (
        <Card><a className="btn block" href="/?tab=admin">🛡 Адмін-панель (старий сайт)</a></Card>
      )}
      <Button block variant="quiet" onClick={signOut}>Вийти</Button>
      <a className="muted center" href="/">Відкрити старий сайт</a>
    </div>
  );
}
