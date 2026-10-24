import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DailyBonusCard } from '../src/features/home/DailyBonusCard';
import { DAY_MS } from '../src/domain/dailyBonus';

describe('DailyBonusCard', () => {
  it('доступний: показує суму і викликає onClaim', async () => {
    const onClaim = vi.fn();
    render(<DailyBonusCard user={{ dailyStreak: 2 }} now={DAY_MS * 5} busy={false} message="" onClaim={onClaim} />);
    expect(screen.getByText('+200 монет')).toBeInTheDocument();
    expect(screen.getByText('День 3 серії')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Забрати' }));
    expect(onClaim).toHaveBeenCalled();
  });

  it('вже забрано: кнопки немає, показує, скільки чекати', () => {
    const now = DAY_MS * 5;
    render(<DailyBonusCard user={{ lastDailyBonus: now - 3600000 }} now={now} busy={false} message="" onClaim={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Забрати' })).not.toBeInTheDocument();
    expect(screen.getByText(/Наступний бонус через 23 год 0 хв/)).toBeInTheDocument();
  });

  it('busy блокує кнопку', () => {
    render(<DailyBonusCard user={{}} now={DAY_MS * 5} busy message="" onClaim={() => {}} />);
    expect(screen.getByRole('button', { name: 'Забрати' })).toBeDisabled();
  });

  it('доступний: показує помилку з role alert', () => {
    render(<DailyBonusCard user={{}} now={DAY_MS * 5} busy={false} message="" error="Мережа недоступна" onClaim={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Мережа недоступна');
    expect(screen.getByRole('button', { name: 'Забрати' })).toBeInTheDocument();
  });

  it('вже забрано: показує і message, і error', () => {
    const now = DAY_MS * 5;
    render(<DailyBonusCard user={{ lastDailyBonus: now - 3600000 }} now={now} busy={false} message="🎁 +100 ₴" error="Бонус вже забрано" onClaim={() => {}} />);
    expect(screen.getByText('🎁 +100 ₴')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Бонус вже забрано');
  });
});
