import { useState } from 'react';
import { Button } from '../../design/Button';
import { Field } from '../../design/Field';
import { SECURITY_QUESTIONS } from '../../domain/securityQuestions';
import { lookup, requestViaTelegram, resetWithAnswer, type LookupResult } from '../../services/recovery';

type Step =
  | { kind: 'nick' }
  | { kind: 'question'; question: string }
  | { kind: 'telegram' }
  | { kind: 'done'; text: string; url?: string };

export function RecoveryDialog({ onClose }: { onClose(): void }) {
  const [step, setStep] = useState<Step>({ kind: 'nick' });
  const [nick, setNick] = useState('');
  const [answer, setAnswer] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  const next = () =>
    run(async () => {
      const r: LookupResult = await lookup(nick);
      setStep(r.kind === 'question' ? { kind: 'question', question: r.question } : { kind: 'telegram' });
    });

  const reset = () =>
    run(async () => {
      await resetWithAnswer(nick.trim(), answer, p1, p2);
      setStep({ kind: 'done', text: '✅ Пароль змінено! Тепер увійдіть з новим паролем.' });
    });

  const telegram = () =>
    run(async () => {
      const url = await requestViaTelegram(nick.trim());
      window.open(url, '_blank', 'noopener');
      setStep({
        kind: 'done',
        url,
        text: '✅ Заявку надіслано. Напишіть боту в Telegram для підтвердження — адмін скине пароль і надішле його вам у приватні повідомлення.',
      });
    });

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="rec-title">
      <div className="dialog">
        <div className="row between">
          <h2 id="rec-title">🔑 Відновлення пароля</h2>
          <Button variant="quiet" onClick={onClose} aria-label="Закрити">✕</Button>
        </div>

        {step.kind === 'nick' && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void next(); }}>
            <p className="muted">Введіть свій нікнейм, щоб почати відновлення.</p>
            <Field label="Нікнейм" value={nick} onChange={(e) => setNick(e.target.value)} />
            <Button block type="submit" disabled={busy}>Далі →</Button>
          </form>
        )}

        {step.kind === 'question' && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void reset(); }}>
            <p className="muted">{SECURITY_QUESTIONS[step.question] || 'Контрольне питання'}</p>
            <Field label="Відповідь" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <Field label="Новий пароль (мін 6 символів)" type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" />
            <Field label="Повторіть новий пароль" type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" />
            <Button block type="submit" disabled={busy}>Змінити пароль</Button>
            <Button block type="button" variant="quiet" onClick={() => setStep({ kind: 'telegram' })}>Не пам'ятаю відповідь</Button>
          </form>
        )}

        {step.kind === 'telegram' && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void telegram(); }}>
            <p className="muted">
              Автоматичне відновлення недоступне для цього акаунту. Подайте заявку — адміністратор перевірить вас у Telegram і скине пароль вручну.
            </p>
            <Button block type="submit" disabled={busy}>✈️ Подати заявку через Telegram</Button>
          </form>
        )}

        {step.kind === 'done' && (
          <>
            <p className="ok">{step.text}</p>
            {step.url && (
              <a className="btn block" href={step.url} target="_blank" rel="noopener noreferrer">✈️ Відкрити бота в Telegram</a>
            )}
            <Button block type="button" onClick={onClose}>Закрити</Button>
          </>
        )}

        {error && <div className="error" role="alert">{error}</div>}
      </div>
    </div>
  );
}
