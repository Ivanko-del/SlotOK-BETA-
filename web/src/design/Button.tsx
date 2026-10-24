import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'quiet';
  block?: boolean;
}

export function Button({ variant = 'primary', block, className = '', ...rest }: Props) {
  const cls = ['btn', variant === 'primary' ? '' : variant, block ? 'block' : '', className].filter(Boolean).join(' ');
  return <button className={cls} {...rest} />;
}
