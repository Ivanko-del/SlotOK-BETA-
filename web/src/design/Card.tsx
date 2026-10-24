import type { ReactNode } from 'react';

export function Card({ tone = 'plain', className = '', children }: { tone?: 'plain' | 'accent'; className?: string; children: ReactNode }) {
  return <section className={['card', tone === 'accent' ? 'accent' : '', className].filter(Boolean).join(' ')}>{children}</section>;
}
