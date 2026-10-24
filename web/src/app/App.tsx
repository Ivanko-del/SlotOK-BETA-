import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthScreen } from '../features/auth/AuthScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { TermsGate } from '../features/terms/TermsGate';
import { hasAcceptedTerms } from '../domain/terms';
import { Shell } from './Shell';
import { SessionProvider, useSession } from './SessionProvider';

export function Gate() {
  const { nick, user, ready } = useSession();
  if (!nick) return <AuthScreen />;
  if (!ready || !user) return <p className="page center muted">Завантаження…</p>;
  return (
    <>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomeScreen />} />
          <Route path="profile" element={<ProfileScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {!hasAcceptedTerms(user) && <TermsGate />}
    </>
  );
}

export function App() {
  return (
    <BrowserRouter basename="/v2">
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </BrowserRouter>
  );
}
