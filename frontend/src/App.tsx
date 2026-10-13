import { useLocation } from 'react-router';

import AppShell from './components/layout/AppShell';
import { AuthProvider } from './features/authentication/context/AuthProvider';
import { useAuth } from './features/authentication/context/useAuth';
import { ThemeProvider } from './features/settings/context/ThemeProvider';
import AppRoutes from './routes/AppRoutes';

function App() {
  const location = useLocation();
  const { currentUser, isAuthenticated, isLoading } = useAuth();

  const isAuthenticationPage =
    location.pathname === '/login' || location.pathname === '/register';

  const shouldRenderAppShell =
    !isAuthenticationPage &&
    !isLoading &&
    isAuthenticated &&
    currentUser?.profile_complete === true;

  if (!shouldRenderAppShell) {
    return <AppRoutes />;
  }

  return (
    <AppShell>
      <AppRoutes />
    </AppShell>
  );
}

export default function AppWithAuth() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AuthProvider>
  );
}
