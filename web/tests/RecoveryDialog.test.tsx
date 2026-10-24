import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecoveryDialog } from '../src/features/auth/RecoveryDialog';
import { setDb } from '../src/lib/db';
import { FakeDb } from './fakeDb';

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  db.data.users = {
    Ivan: { securityQuestion: 'pet', securityAnswerHash: 'x' },
    Olga: { pass: 'x' },
  };
  setDb(db);
});

describe('RecoveryDialog', () => {
  it('Enter у кроці нікнейма переходить до контрольного питання', async () => {
    render(<RecoveryDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('Нікнейм'), 'Ivan{Enter}');
    expect(await screen.findByLabelText('Відповідь')).toBeInTheDocument();
  });

  it('після заявки через Telegram показує видиме посилання на бота', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<RecoveryDialog onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('Нікнейм'), 'Olga{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: /Подати заявку/ }));
    const link = await screen.findByRole('link', { name: /Відкрити бота в Telegram/ });
    expect(link).toHaveAttribute('href', 'https://t.me/SlotOK_DepositBot?start=reset_Olga');
    expect(open).toHaveBeenCalled();
  });
});
