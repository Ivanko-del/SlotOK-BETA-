import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const dismissBlocked = vi.fn();
vi.mock('../src/app/SessionProvider', () => ({
  useSession: () => ({ signIn: vi.fn(), blocked: 'Акаунт заблоковано', dismissBlocked }),
}));

import { AuthScreen } from '../src/features/auth/AuthScreen';

describe('AuthScreen', () => {
  it('банер блокування має кнопку закриття', async () => {
    render(<AuthScreen />);
    expect(screen.getByText('Акаунт заблоковано')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Закрити повідомлення' }));
    expect(dismissBlocked).toHaveBeenCalled();
  });
});
