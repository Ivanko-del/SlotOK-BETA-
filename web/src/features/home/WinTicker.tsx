import { useEffect, useState } from 'react';
import { Card } from '../../design/Card';
import { formatNumber } from '../../lib/format';
import { subscribeJackpot, subscribeWinFeed, type WinFeedItem } from '../../services/wallet';

export function WinTicker() {
  const [items, setItems] = useState<WinFeedItem[]>([]);
  const [jackpot, setJackpot] = useState(0);

  useEffect(() => {
    const offFeed = subscribeWinFeed(setItems);
    const offJackpot = subscribeJackpot(setJackpot);
    return () => {
      offFeed();
      offJackpot();
    };
  }, []);

  return (
    <Card className="stack">
      <div className="row between"><h2>💰 Джекпот</h2><span className="big">₴{formatNumber(jackpot)}</span></div>
      <h2>Останні виграші</h2>
      <div className="feed">
        {items.length === 0 && <span className="muted">Поки немає великих виграшів</span>}
        {items.map((i, idx) => (
          <div key={idx}>
            <b>{i.user}</b> виграв <b className="ok">+₴{formatNumber(i.amount)}</b>
            {i.game ? ` у ${i.game}` : ''}
          </div>
        ))}
      </div>
    </Card>
  );
}
