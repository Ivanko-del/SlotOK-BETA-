import { useState, type FormEvent } from 'react';
import { Button } from '../../design/Button';
import { Field } from '../../design/Field';
import { login } from '../../services/auth';

export function LoginForm({ onSuccess, onForgot }: { onSuccess(nick: string): void; onForgot(): void }) {
  const [nick, setNick] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      onSuccess(await login(nick, pass));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка входу');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Нікнейм" value={nick} onChange={(e) => setNick(e.target.value)} autoComplete="username" />
      <Field label="Пароль" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
      {error && <div className="error" role="alert">{error}</div>}
      <Button block type="submit" disabled={busy}>{busy ? '⏳ Перевірка…' : 'Увійти'}</Button>
      <Button block type="button" variant="quiet" onClick={onForgot}>Забули пароль?</Button>
    </form>
  );
}
