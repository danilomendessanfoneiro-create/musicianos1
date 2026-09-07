import React, { useEffect, useRef, useState } from 'react';
import { Mic, MonitorUp, Square, Info } from 'lucide-react';
import { captureMicrophone, captureTabAudio, startLiveAnalyzer, LiveAnalyzerResult, LiveAnalyzerHandle } from '../lib/liveAudio';

export const LiveListener: React.FC = () => {
  const [source, setSource] = useState<'mic' | 'tab' | null>(null);
  const [result, setResult] = useState<LiveAnalyzerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<LiveAnalyzerHandle | null>(null);

  useEffect(() => {
    return () => handleRef.current?.stop();
  }, []);

  const start = async (kind: 'mic' | 'tab') => {
    setError(null);
    try {
      const stream = kind === 'mic' ? await captureMicrophone() : await captureTabAudio();
      handleRef.current = startLiveAnalyzer(stream, setResult);
      setSource(kind);
      setResult(null);
    } catch (err: any) {
      setError(err?.message || 'Não consegui acessar o áudio — verifique as permissões do navegador.');
    }
  };

  const stop = () => {
    handleRef.current?.stop();
    handleRef.current = null;
    setSource(null);
    setResult(null);
  };

  if (!source) {
    return (
      <div className="bg-zinc-900 rounded-2xl p-6 space-y-4">
        <p className="text-zinc-400 text-sm max-w-2xl">
          Ouça o tom e o acorde em tempo real enquanto uma música toca — no microfone do seu dispositivo, ou
          direto de uma aba do navegador (ex: YouTube), sem precisar instalar nada.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => start('mic')}
            className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-white"
          >
            <Mic className="w-4 h-4" /> Usar microfone
          </button>
          <button
            onClick={() => start('tab')}
            className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-white"
          >
            <MonitorUp className="w-4 h-4" /> Capturar áudio de uma aba
          </button>
        </div>
        <p className="text-zinc-600 text-xs flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          A captura de aba funciona bem no Chrome/Edge — ao escolher a aba no diálogo do navegador, marque
          "Compartilhar áudio da guia". No Firefox/Safari o suporte é limitado; use o microfone nesses casos.
        </p>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    );
  }

  const topKey = result?.keyCandidates?.[0];

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-teal-400">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
          </span>
          Ouvindo {source === 'mic' ? 'o microfone' : 'a aba compartilhada'}...
        </div>
        <button onClick={stop} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-red-400">
          <Square className="w-3.5 h-3.5" /> Parar
        </button>
      </div>

      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-teal-500 transition-all duration-150"
          style={{ width: `${Math.round((result?.level ?? 0) * 100)}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-6 text-center">
        <div>
          <h3 className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Tom atual</h3>
          <p className="text-4xl font-extrabold text-indigo-400">{topKey?.key ?? '—'}</p>
        </div>
        <div>
          <h3 className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Acorde atual</h3>
          <p className="text-4xl font-extrabold text-teal-400">{result?.chord ?? '—'}</p>
        </div>
      </div>

      {!result && <p className="text-zinc-600 text-xs text-center">Aguardando som suficiente pra estimar...</p>}
    </div>
  );
};
