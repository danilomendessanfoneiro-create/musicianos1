import React, { useRef, useState } from 'react';
import { Upload, Loader2, Info, Copy, Check } from 'lucide-react';
import {
  loadMonoSamples,
  computeChromaFrames,
  estimateKey,
  estimateChordTimeline,
  formatTime,
  MAX_ANALYZE_SECONDS,
  KeyCandidate,
  ChordSegment,
} from '../lib/audioAnalysis';
import { PrimaryButton } from '../components/ui';

export const AudioAnalyzer: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [truncatedNotice, setTruncatedNotice] = useState(false);
  const [keyCandidates, setKeyCandidates] = useState<KeyCandidate[] | null>(null);
  const [chords, setChords] = useState<ChordSegment[] | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setKeyCandidates(null);
    setChords(null);
    setTruncatedNotice(false);
    setCopied(false);
    setAnalyzing(true);
    setProgress(0);

    try {
      const { samples, sampleRate, truncated } = await loadMonoSamples(file);
      setTruncatedNotice(truncated);
      const { frames, overallChroma } = await computeChromaFrames(samples, sampleRate, setProgress);
      setKeyCandidates(estimateKey(overallChroma));
      setChords(estimateChordTimeline(frames));
    } catch (err) {
      setError('Não consegui analisar esse arquivo — verifique se é um áudio válido (mp3, wav, m4a...).');
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCopy = () => {
    if (!keyCandidates || !chords) return;
    const top = keyCandidates[0];
    const lines = [
      `Tom sugerido: ${top.key} (confiança: ${Math.round(Math.max(0, top.score) * 100)}%)`,
      '',
      'Progressão detectada:',
      ...chords.map((c) => `${formatTime(c.start)} - ${c.chord}`),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-indigo-500 pb-2">
        <h2 className="text-3xl font-extrabold text-white">Analisador de Áudio</h2>
      </div>

      <p className="text-zinc-400 text-sm max-w-2xl">
        Envie uma gravação e o app estima o tom e uma progressão de acordes aproximada, direto no seu
        navegador — sem enviar o áudio pra nenhum servidor. É uma estimativa heurística (análise de
        frequência), não uma transcrição perfeita: funciona melhor em gravações mais "limpas" (voz +
        violão/piano) e serve como ponto de partida pra você ajustar na hora de cadastrar a cifra.
      </p>

      <div className="bg-zinc-900 rounded-2xl p-6">
        <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFile} className="hidden" id="audio-input" />
        <label
          htmlFor="audio-input"
          className="flex items-center justify-center gap-2 border-2 border-dashed border-zinc-700 hover:border-indigo-500 rounded-xl p-8 cursor-pointer text-zinc-400 hover:text-white transition-colors"
        >
          <Upload className="w-5 h-5" />
          {fileName ? `Arquivo: ${fileName} — clique para trocar` : 'Clique para escolher um arquivo de áudio'}
        </label>

        {analyzing && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Analisando... {progress}%
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

        {truncatedNotice && (
          <p className="text-yellow-400 text-xs mt-4 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Áudio maior que {Math.floor(MAX_ANALYZE_SECONDS / 60)} min — analisei só o início, por performance.
          </p>
        )}
      </div>

      {keyCandidates && chords && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-zinc-900 rounded-2xl p-6">
            <h3 className="text-sm text-zinc-500 uppercase tracking-wide mb-4">Tom sugerido</h3>
            <p className="text-4xl font-extrabold text-indigo-400">{keyCandidates[0].key}</p>
            <p className="text-zinc-500 text-sm mt-1">
              Confiança relativa: {Math.round(Math.max(0, keyCandidates[0].score) * 100)}%
            </p>

            <h4 className="text-xs text-zinc-500 uppercase tracking-wide mt-6 mb-2">Outros candidatos</h4>
            <ul className="space-y-1.5">
              {keyCandidates.slice(1, 4).map((c) => (
                <li key={c.key} className="flex justify-between text-sm text-zinc-400">
                  <span>{c.key}</span>
                  <span>{Math.round(Math.max(0, c.score) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-zinc-900 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm text-zinc-500 uppercase tracking-wide">Progressão detectada</h3>
              <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {chords.map((c, i) => (
                <div key={i} className="flex justify-between text-sm py-1.5 px-2 rounded hover:bg-zinc-800">
                  <span className="text-zinc-500 font-mono">{formatTime(c.start)}</span>
                  <span className="text-teal-400 font-semibold">{c.chord}</span>
                </div>
              ))}
              {chords.length === 0 && <p className="text-zinc-600 text-sm italic">Nada detectado.</p>}
            </div>
          </div>
        </div>
      )}

      {!analyzing && (
        <p className="text-zinc-600 text-xs">
          Dica: depois de analisar, use "Copiar" e cole o resultado como referência ao criar a música em
          Repertório & Cifras — o tom sugerido já pode ir direto no campo "Tom original".
        </p>
      )}
    </div>
  );
};
