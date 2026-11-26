import { AuthPage } from './components/auth/AuthPage';
import { LoginConfirmation } from './components/auth/LoginConfirmation';
import { Splash } from './components/common/Splash';
import { FeedPanel } from './components/feed/FeedPanel';
import { InfoRouter } from './components/info/InfoRouter';
import { useAuth } from './contexts/AuthContext';
import { goHome, useInfoRoute } from './router/infoRoute';
import { useAndroidBack } from './utils/androidBack';

export default function App() {
  const { user, loading, pendingLogin } = useAuth();
  const route = useInfoRoute();

  useAndroidBack(() => {
    if (!route) return false;
    goHome();
    return true;
  }, 200);

  if (loading) return <main className="h-full"><Splash hint="Відновлюємо сесію…" /></main>;

  if (!user && pendingLogin) return <LoginConfirmation />;

  if (!user) return route ? <InfoRouter route={route} variant="public" /> : <AuthPage />;

  return (
    <>
      <FeedPanel />
      {route && <InfoRouter route={route} variant="overlay" />}
    </>
  );
}
