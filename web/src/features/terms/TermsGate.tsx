import { useState } from 'react';
import { useSession } from '../../app/SessionProvider';
import { Button } from '../../design/Button';
import { TERMS_CHECKS } from '../../domain/terms';
import { acceptTerms } from '../../services/auth';

export function TermsGate() {
  const { nick, signOut } = useSession();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const all = TERMS_CHECKS.every((c) => checked[c.k]);

  async function accept() {
    if (!nick || !all) return;
    setBusy(true);
    setFailed(false);
    try {
      await acceptTerms(nick);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className="dialog">
        <h2 id="terms-title">Перш ніж грати</h2>
        <p className="muted">Коротко про головне. Повний текст — за посиланням нижче.</p>
        {TERMS_CHECKS.map((c) => (
          <label key={c.k} className="check">
            <input
              type="checkbox"
              checked={!!checked[c.k]}
              onChange={(e) => setChecked((s) => ({ ...s, [c.k]: e.target.checked }))}
            />
            {c.text}
          </label>
        ))}
        <a className="muted" href="/?open=rules" target="_blank" rel="noopener">Читати повні правила ↗</a>
        {failed && <div className="error" role="alert">Не вдалося зберегти. Спробуй ще раз.</div>}
        <Button block disabled={!all || busy} onClick={accept}>Підтверджую</Button>
        <Button block variant="quiet" onClick={signOut}>Вийти</Button>
      </div>
    </div>
  );
}
