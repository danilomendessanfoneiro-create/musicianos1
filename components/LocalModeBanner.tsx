import React, { useState } from 'react';
import { Info, X } from 'lucide-react';

export const LocalModeBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="bg-yellow-900/40 border-b border-yellow-700/50 text-yellow-200 text-sm px-4 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 shrink-0" />
        <span>
          Modo local: os dados ficam salvos só neste navegador (não compartilham entre dispositivos ainda).
          Configure o Supabase quando quiser sincronizar de verdade — veja o README.
        </span>
      </div>
      <button onClick={() => setDismissed(true)} className="text-yellow-300 hover:text-white shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
