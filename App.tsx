import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Sidebar } from './components/Sidebar';
import { LocalModeBanner } from './components/LocalModeBanner';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { CRM } from './pages/CRM';
import { Gigs } from './pages/Gigs';
import { Finance } from './pages/Finance';
import { Projects } from './pages/Projects';
import { RepertoireHome } from './pages/repertoire/RepertoireHome';
import { Setlists } from './pages/repertoire/Setlists';
import { AudioAnalyzer } from './pages/AudioAnalyzer';
import { SharePage } from './pages/SharePage';
import { isSupabaseConfigured } from './lib/supabaseClient';
import type { ViewState } from './types';

const AuthenticatedApp: React.FC = () => {
  const [view, setView] = useState<ViewState>('dashboard');

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <Dashboard />;
      case 'repertoire': return <RepertoireHome />;
      case 'setlists': return <Setlists />;
      case 'audio-analyzer': return <AudioAnalyzer onSongCreated={() => setView('repertoire')} />;
      case 'gigs': return <Gigs />;
      case 'crm': return <CRM />;
      case 'finance': return <Finance />;
      case 'projects': return <Projects />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      {!isSupabaseConfigured && <LocalModeBanner />}
      <div className="flex flex-1">
        <Sidebar currentView={view} onChangeView={setView} />
        <main className="flex-1 p-6 md:p-10 pt-20 md:pt-10 overflow-y-auto">{renderView()}</main>
      </div>
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

  if (!session) {
    return (
      <div className="flex flex-col min-h-screen">
        {!isSupabaseConfigured && <LocalModeBanner />}
        <div className="flex-1">
          <Login />
        </div>
      </div>
    );
  }

  return <AuthenticatedApp />;
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
