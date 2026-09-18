import React, { useEffect, useRef, useState } from 'react';
import { Mic, MonitorUp, Square, Info, RotateCcw, Sparkles } from 'lucide-react';
import { captureMicrophone, captureTabAudio, startLiveAnalyzer, LiveAnalyzerHandle } from '../lib/liveAudio';
import { KeyCandidate } from '../lib/audioAnalysis';

export const LiveListener: React.FC = () => {
  const [source, setSource] = useState<'mic' | 'tab' | null>(null);
  const [chord, setChord] = useState<string>('—');
  const [level, setLevel] = useState(0);
  const [keyCandidates, setKeyCandidates] = useState<KeyCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<LiveAnalyzerHandle | null>(null);

  useEffect(() => {
    return () => handleRef.current?.stop();
  }, []);

  const start = async (kind: 'mic' | 'tab') => {
    setError(null);
    try {
      const stream = kind === 'mic' ? await captureMicrophone() : await captureTabAudio();
      handleRef.current = startLiveAnalyzer(stream, (r) => {
        setChord(r.chord);
        setLevel(r.level);
      });
      setSource(kind);
      setKeyCandidates(null);
    } catch (err: any) {
      setError(err?.message || 'Não consegui acessar o áudio — verifique as permissões do navegador.');
    }
  };

  const stop = () => {
    handleRef.current?.stop();
    handleRef.current = null;
    setSource(null);
    setChord('—');
    setLevel(0);
    setKeyCandidates(null);
  };

  const discoverKey = () => {
    if (!handleRef.current) return;
    setKeyCandidates(handleRef.current.getKeyCandidates());
  };

  const restart = () => {
    handleRef.current?.reset();
    setKeyCandidates(null);
  };

  if (!source) {
    return (
      <div className="bg-zinc-900 rounded-2xl p-6 space-y-4">
        <p className="text-zinc-400 text-sm max-w-2xl">
          Ouça o acorde em tempo real enquanto uma música toca — no microfone do seu dispositivo, ou direto
          de uma aba do navegador (ex: YouTube), sem precisar instalar nada. O tom é calculado quando você
          pedir, juntando tudo que já foi ouvido até ali — igual ao modo "Analisar arquivo".
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

  return (
    <div className="space-y-4">
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
          <div className="h-full bg-teal-500 transition-all duration-150" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>

        <div className="text-center">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Acorde atual</h3>
          <p className="text-5xl font-extrabold text-teal-400">{chord}</p>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={discoverKey}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium"
          >
            <Sparkles className="w-4 h-4" /> Descobrir tom
          </button>
          <button onClick={restart} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white" title="Use se a música mudou">
            <RotateCcw className="w-3.5 h-3.5" /> Reiniciar acumulado
          </button>
        </div>

        {keyCandidates && keyCandidates.length > 0 && (
          <div className="flex items-center gap-6">
            <div>
              <h3 className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Tom</h3>
              <p className="text-3xl font-extrabold text-indigo-400">{keyCandidates[0].key}</p>
            </div>
            {keyCandidates[1] && keyCandidates[1].score > keyCandidates[0].score * 0.85 && (
              <div className="text-zinc-500 text-xs max-w-[160px]">
                Se não bater, tente <span className="text-zinc-300 font-medium">{keyCandidates[1].key}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-zinc-600 text-xs text-center">
        Deixe tocar alguns segundos e clique em "Descobrir tom" quantas vezes quiser — quanto mais tempo
        acumulado, mais confiável o resultado. Trocou de música? Clique em "Reiniciar acumulado" primeiro.
      </p>
    </div>
  );
};
