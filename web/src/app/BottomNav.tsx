import { NavLink } from 'react-router-dom';
import { legacyUrl } from './legacy';

export function BottomNav() {
  return (
    <nav className="nav" aria-label="Основна навігація">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="i">🏠</span>Головна
      </NavLink>
      <a href={legacyUrl('lobby')} title="Відкриється на старому сайті">
        <span className="i">🎰</span>Казино<span className="old">старий сайт</span>
      </a>
      <a href={legacyUrl('cashier')} title="Відкриється на старому сайті">
        <span className="i">💳</span>Каса<span className="old">старий сайт</span>
      </a>
      <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="i">👤</span>Профіль
      </NavLink>
      <a href={legacyUrl('more')} title="Відкриється на старому сайті">
        <span className="i">☰</span>Ще<span className="old">старий сайт</span>
      </a>
    </nav>
  );
}
