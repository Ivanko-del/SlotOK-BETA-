import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Field({ label, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      {label}
      <input {...rest} />
    </label>
  );
}

export function SelectField({
  label, children, ...rest
}: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="field">
      {label}
      <select {...rest}>{children}</select>
    </label>
  );
}
