import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { useAuth } from '../features/authentication/context/useAuth';
import AccountsPage from '../pages/AccountsPage';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import SettingsPage from '../pages/SettingsPage';
import TransactionsPage from '../pages/TransactionsPage';
import { getHealth } from '../shared/api/health';

function DashboardPage() {
  useEffect(() => {
    void getHealth();
  }, []);

  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}

function CardsPage() {
  return <h1 className="text-2xl font-semibold">Cards</h1>;
}

function ReliabilityPage() {
  return <h1 className="text-2xl font-semibold">Reliability</h1>;
}

function ProtectedRoute({
  children,
  allowIncompleteProfile = false,
}: {
  children: React.ReactNode;
  allowIncompleteProfile?: boolean;
}) {
  const { isAuthenticated, currentUser, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!allowIncompleteProfile && !currentUser?.profile_complete) {
    return <Navigate to="/settings" replace />;
  }

  return children;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, currentUser, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return (
      <Navigate
        to={currentUser?.profile_complete ? '/dashboard' : '/settings'}
        replace
      />
    );
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

      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
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
          <ProtectedRoute allowIncompleteProfile>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default AppRoutes;
