import { LEGACY_GAMES, legacyUrl } from '../../app/legacy';

export function GameTiles() {
  return (
    <section>
      <h2 style={{ margin: '4px 0 8px', fontSize: 15 }}>Популярне <span className="muted">(відкриється на старому сайті)</span></h2>
      <div className="grid3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {LEGACY_GAMES.map((g) => (
          <a className="tile" key={g.id} href={legacyUrl(g.id)}>
            <span className="emoji">{g.emoji}</span>
            {g.title}
          </a>
        ))}
      </div>
    </section>
  );
}
