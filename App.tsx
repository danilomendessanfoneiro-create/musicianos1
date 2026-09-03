import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { CRM } from './pages/CRM';
import { Gigs } from './pages/Gigs';
import { Finance } from './pages/Finance';
import { Projects } from './pages/Projects';
import { RepertoireHome } from './pages/repertoire/RepertoireHome';
import { Setlists } from './pages/repertoire/Setlists';
import { SharePage } from './pages/SharePage';
import type { ViewState } from './types';

const AuthenticatedApp: React.FC = () => {
  const [view, setView] = useState<ViewState>('dashboard');

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <Dashboard />;
      case 'repertoire': return <RepertoireHome />;
      case 'setlists': return <Setlists />;
      case 'gigs': return <Gigs />;
      case 'crm': return <CRM />;
      case 'finance': return <Finance />;
      case 'projects': return <Projects />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar currentView={view} onChangeView={setView} />
      <main className="flex-1 p-6 md:p-10 pt-20 md:pt-10 overflow-y-auto">{renderView()}</main>
    </div>
  );
};

const RootGate: React.FC = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Carregando...</p>
      </div>
    );
  }

  return session ? <AuthenticatedApp /> : <Login />;
};

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      {/* Rota pública: freelancer abre sem login */}
      <Route path="/s/:token" element={<SharePage />} />

      {/* Área autenticada */}
      <Route
        path="/*"
        element={
          <AuthProvider>
            <RootGate />
          </AuthProvider>
        }
      />
    </Routes>
  </BrowserRouter>
);

export default App;
