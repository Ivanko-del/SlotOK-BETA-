import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session: { nick: string; user: Record<string, unknown>; signOut: () => void } = {
  nick: '',
  user: {},
  signOut: vi.fn(),
};
vi.mock('../src/app/SessionProvider', () => ({ useSession: () => session }));
vi.mock('../src/services/profile', () => ({
  STATUSES: [{ value: 'online', label: 'Онлайн' }],
  setAvatar: vi.fn(),
  setStatus: vi.fn(),
  setTag: vi.fn(),
  downscaleImage: vi.fn(),
}));

import { ProfileScreen } from '../src/features/profile/ProfileScreen';

describe('ProfileScreen адмін-кнопка', () => {
  beforeEach(() => {
    session.nick = '';
    session.user = {};
  });

  it('власник theivankoo бачить кнопку з href /?tab=admin', () => {
    session.nick = 'theivankoo';
    session.user = {};
    render(<ProfileScreen />);
    expect(screen.getByRole('link', { name: /Адмін-панель/ })).toHaveAttribute('href', '/?tab=admin');
  });

  it('звичайний гравець не бачить кнопки', () => {
    session.nick = 'Ivan';
    session.user = { isAdmin: false };
    render(<ProfileScreen />);
    expect(screen.queryByRole('link', { name: /Адмін-панель/ })).toBeNull();
  });
});
