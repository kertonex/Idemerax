import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/accounts" element={<AccountsPage />} />
      <Route path="/cards" element={<CardsPage />} />
      <Route path="/transactions" element={<TransactionsPage />} />
      <Route path="/reliability" element={<ReliabilityPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}

export default AppRoutes;
