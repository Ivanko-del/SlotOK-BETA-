import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../src/features/auth/LoginForm';
import { setDb } from '../src/lib/db';
import { SlotOKPassword } from '../src/lib/password';
import { FakeDb } from './fakeDb';

let db: FakeDb;
beforeEach(async () => {
  db = new FakeDb();
  db.data.users = { Ivan: { pass: await SlotOKPassword.hash('secret1') } };
  setDb(db);
  localStorage.clear();
});

describe('LoginForm', () => {
  it('показує помилку для невірного пароля й не викликає onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} onForgot={() => {}} />);
    await userEvent.type(screen.getByLabelText('Нікнейм'), 'Ivan');
    await userEvent.type(screen.getByLabelText('Пароль'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('❌ Невірний пароль')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('при вірному паролі викликає onSuccess з ніком', async () => {
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} onForgot={() => {}} />);
    await userEvent.type(screen.getByLabelText('Нікнейм'), 'Ivan');
    await userEvent.type(screen.getByLabelText('Пароль'), 'secret1');
    await userEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith('Ivan'));
  });

  it('кнопка «Забули пароль?» викликає onForgot', async () => {
    const onForgot = vi.fn();
    render(<LoginForm onSuccess={() => {}} onForgot={onForgot} />);
    await userEvent.click(screen.getByRole('button', { name: 'Забули пароль?' }));
    expect(onForgot).toHaveBeenCalled();
  });
});
