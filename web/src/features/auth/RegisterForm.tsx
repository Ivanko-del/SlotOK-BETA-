import { useState, type FormEvent } from 'react';
import { Button } from '../../design/Button';
import { Field, SelectField } from '../../design/Field';
import { SECURITY_QUESTIONS } from '../../domain/securityQuestions';
import { register } from '../../services/auth';

export function RegisterForm({ onSuccess }: { onSuccess(nick: string): void }) {
  const [f, setF] = useState({ nick: '', email: '', pass: '', promo: '', secQuestion: 'pet', secAnswer: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await register(f);
      onSuccess(r.nick);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка реєстрації');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Нікнейм" value={f.nick} onChange={set('nick')} autoComplete="username" />
      <Field label="Пошта (необов'язково)" type="email" value={f.email} onChange={set('email')} autoComplete="email" />
      <Field label="Пароль" type="password" value={f.pass} onChange={set('pass')} autoComplete="new-password" />
      <SelectField label="Контрольне питання" value={f.secQuestion} onChange={set('secQuestion')}>
        {Object.entries(SECURITY_QUESTIONS).map(([k, text]) => (
          <option key={k} value={k}>{text}</option>
        ))}
      </SelectField>
      <Field label="Відповідь (для відновлення пароля)" value={f.secAnswer} onChange={set('secAnswer')} />
      <Field label="Промокод (необов'язково)" value={f.promo} onChange={set('promo')} />
      {error && <div className="error" role="alert">{error}</div>}
      <Button block type="submit" disabled={busy}>{busy ? '⏳ Реєстрація…' : 'Створити акаунт'}</Button>
    </form>
  );
}
