import { useState } from 'react';
import { useSession } from '../../app/SessionProvider';
import { LoginForm } from './LoginForm';
import { RecoveryDialog } from './RecoveryDialog';
import { RegisterForm } from './RegisterForm';

export function AuthScreen() {
  const { signIn, blocked, dismissBlocked } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [recovery, setRecovery] = useState(false);

  return (
    <main className="page stack">
      <h1 className="logo center" style={{ fontSize: 32, paddingTop: 24 }}>SlotOK</h1>
      {blocked && (
        <div className="card error row between" role="alert">
          <span>{blocked}</span>
          <button type="button" className="btn quiet" aria-label="Закрити повідомлення" onClick={dismissBlocked}>✕</button>
        </div>
      )}
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Вхід</button>
        <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Реєстрація</button>
      </div>
      <div className="card">
        {mode === 'login' ? (
          <LoginForm onSuccess={signIn} onForgot={() => setRecovery(true)} />
        ) : (
          <RegisterForm onSuccess={signIn} />
        )}
      </div>
      {recovery && <RecoveryDialog onClose={() => setRecovery(false)} />}
    </main>
  );
}
