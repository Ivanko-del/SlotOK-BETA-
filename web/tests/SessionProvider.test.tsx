import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/App';
import { setDb } from '../src/lib/db';
import { SESSION_KEY } from '../src/services/session';
import { FakeDb } from './fakeDb';

let db: FakeDb;
const base = { balance: 10, termsAcceptedAt: 1, termsVersion: '1' };

beforeEach(() => {
  db = new FakeDb();
  setDb(db);
  localStorage.clear();
  window.history.pushState({}, '', '/v2/');
});

/** Стежимо, чи кнопка «Забрати» бодай раз з'явилась у DOM. */
function watchClaimButton() {
  const seen = { value: false };
  const check = () => {
    if (screen.queryByRole('button', { name: 'Забрати' })) seen.value = true;
  };
  const mo = new MutationObserver(check);
  mo.observe(document.body, { childList: true, subtree: true });
  return { seen, stop: () => mo.disconnect() };
}

describe('SessionProvider / Gate', () => {
  it('забанений гравець зі збереженою сесією не бачить Головну', async () => {
    db.data.users = { Ivan: { ...base, banned: true, banReason: 'чіти' } };
    localStorage.setItem(SESSION_KEY, 'Ivan');
    const w = watchClaimButton();
    render(<App />);
    expect(await screen.findByText(/ВАШ АКАУНТ ЗАБЛОКОВАНО/)).toBeInTheDocument();
    expect(screen.getByText(/Причина: чіти/)).toBeInTheDocument();
    expect(w.seen.value).toBe(false);
    expect(screen.queryByRole('button', { name: 'Забрати' })).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    w.stop();
  });

  it('само-виключений гравець не бачить Головну', async () => {
    db.data.users = { Ivan: { ...base, selfExcluded: true, selfExcludeUntil: Date.now() + 5 * 3600000 } };
    localStorage.setItem(SESSION_KEY, 'Ivan');
    const w = watchClaimButton();
    render(<App />);
    expect(await screen.findByText(/само-виключення/)).toBeInTheDocument();
    expect(w.seen.value).toBe(false);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    w.stop();
  });

  it('техобслуговування посеред сесії викидає гравця', async () => {
    db.data.users = { Ivan: { ...base } };
    localStorage.setItem(SESSION_KEY, 'Ivan');
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Забрати' })).toBeInTheDocument();
    await act(async () => {
      await db.set('site_config/maintenance', true);
    });
    expect(await screen.findByText(/технічному обслуговуванні/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Забрати' })).toBeNull();
  });

  it('адміна техобслуговування не викидає', async () => {
    db.data.users = { Boss: { ...base, isAdmin: true } };
    localStorage.setItem(SESSION_KEY, 'Boss');
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Забрати' })).toBeInTheDocument();
    await act(async () => {
      await db.set('site_config/maintenance', true);
    });
    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Забрати' })).toBeInTheDocument());
    expect(localStorage.getItem(SESSION_KEY)).toBe('Boss');
  });
});
