import { useLocation } from 'react-router';

import AppShell from './components/layout/AppShell';
import AppRoutes from './routes/AppRoutes';

function App() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  if (isLoginPage) {
    return <AppRoutes />;
  }

  return (
    <AppShell>
      <AppRoutes />
    </AppShell>
  );
}

export default App;
