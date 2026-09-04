import React, { useRef, useState } from 'react';
import {
  LogOut, LayoutDashboard, Briefcase, DollarSign, Users, Target, Menu, X, Music, ListMusic, Waves,
  Download, Upload,
} from 'lucide-react';
import type { ViewState } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { exportLocalBackup, importLocalBackup } from '../lib/localBackend';

const NavButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  view: ViewState;
  currentView: ViewState;
  onClick: (view: ViewState) => void;
}> = ({ icon, label, view, currentView, onClick }) => (
  <button
    className={`flex items-center w-full p-3 rounded-xl transition-all duration-200 ${
      currentView === view
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/50'
        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
    }`}
    onClick={() => onClick(view)}
  >
    {icon}
    <span className="ml-4 text-sm font-medium">{label}</span>
  </button>
);

export const Sidebar: React.FC<{ currentView: ViewState; onChangeView: (view: ViewState) => void }> = ({
  currentView,
  onChangeView,
}) => {
  const { profile, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const backup = exportLocalBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `musicianos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      importLocalBackup(JSON.parse(text));
      setBackupMsg('Restaurado! Recarregando...');
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setBackupMsg('Arquivo inválido — não consegui restaurar.');
      setTimeout(() => setBackupMsg(null), 3000);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const navItems: { view: ViewState; label: string; icon: React.ReactNode }[] = [
    { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { view: 'repertoire', label: 'Repertório & Cifras', icon: <Music className="w-5 h-5" /> },
    { view: 'setlists', label: 'Setlists', icon: <ListMusic className="w-5 h-5" /> },
    { view: 'audio-analyzer', label: 'Analisador de Áudio', icon: <Waves className="w-5 h-5" /> },
    { view: 'gigs', label: 'Shows', icon: <Briefcase className="w-5 h-5" /> },
    { view: 'crm', label: 'CRM / Contatos', icon: <Users className="w-5 h-5" /> },
    { view: 'finance', label: 'Finanças', icon: <DollarSign className="w-5 h-5" /> },
    { view: 'projects', label: 'Projetos', icon: <Target className="w-5 h-5" /> },
  ];

  return (
    <>
      <button
        className="fixed top-4 left-4 z-50 p-2 md:hidden bg-zinc-900 rounded-full text-white shadow-xl"
        onClick={() => setIsOpen(true)}
      >
        <Menu className="w-6 h-6" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setIsOpen(false)} />
      )}

      <div
        className={`
          fixed inset-y-0 left-0 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0 transition duration-300 ease-in-out
          w-64 bg-zinc-900 p-6 flex flex-col z-40
        `}
      >
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-2xl font-bold text-indigo-400">
            Musici<span className="text-white">anos</span>
          </h1>
          <button className="md:hidden text-zinc-400 hover:text-white" onClick={() => setIsOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-grow space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavButton
              key={item.view}
              icon={item.icon}
              label={item.label}
              view={item.view}
              currentView={currentView}
              onClick={(view) => {
                onChangeView(view);
                setIsOpen(false);
              }}
            />
          ))}
        </nav>

        <div className="pt-4 border-t border-zinc-700 mt-auto">
          {!isSupabaseConfigured && (
            <div className="mb-3 pb-3 border-b border-zinc-800 space-y-1.5">
              <p className="text-[11px] text-zinc-500 mb-1.5">
                Modo local: faça backup antes de limpar dados do navegador.
              </p>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 w-full text-left text-xs text-zinc-400 hover:text-white px-1 py-1"
              >
                <Download className="w-3.5 h-3.5" /> Exportar backup
              </button>
              <label className="flex items-center gap-2 w-full text-left text-xs text-zinc-400 hover:text-white px-1 py-1 cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> Restaurar backup
                <input ref={importInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
              </label>
              {backupMsg && <p className="text-[11px] text-teal-400 px-1">{backupMsg}</p>}
            </div>
          )}
          <div className="text-sm text-zinc-400 mb-2">Olá, {profile?.name || 'Músico'}</div>
          <button
            onClick={signOut}
            className="flex items-center w-full p-3 rounded-xl text-red-400 hover:bg-zinc-800 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="ml-4 text-sm font-medium">Sair</span>
          </button>
        </div>
      </div>
    </>
  );
};
