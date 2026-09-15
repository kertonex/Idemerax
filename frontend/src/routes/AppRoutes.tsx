import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { useAuth } from '../features/authentication/context/useAuth';
import LoginPage from '../pages/LoginPage';
import { getHealth } from '../shared/api/health';

function DashboardPage() {
  useEffect(() => {
    void getHealth();
  }, []);

  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}

function AccountsPage() {
  return <h1 className="text-2xl font-semibold">Accounts</h1>;
}

function CardsPage() {
  return <h1 className="text-2xl font-semibold">Cards</h1>;
}

function TransactionsPage() {
  return <h1 className="text-2xl font-semibold">Transactions</h1>;
}

function ReliabilityPage() {
  return <h1 className="text-2xl font-semibold">Reliability</h1>;
}

function SettingsPage() {
  return <h1 className="text-2xl font-semibold">Settings</h1>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/accounts"
        element={
          <ProtectedRoute>
            <AccountsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/cards"
        element={
          <ProtectedRoute>
            <CardsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/transactions"
        element={
          <ProtectedRoute>
            <TransactionsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/reliability"
        element={
          <ProtectedRoute>
            <ReliabilityPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default AppRoutes;
