import { useLocation } from 'react-router';

import AppShell from './components/layout/AppShell';
import { AuthProvider } from './features/authentication/context/AuthProvider';
import AppRoutes from './routes/AppRoutes';

function App() {
  const location = useLocation();
  const isAuthenticationPage =
    location.pathname === '/login' || location.pathname === '/register';

  if (isAuthenticationPage) {
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
      <App />
    </AuthProvider>
  );
}
