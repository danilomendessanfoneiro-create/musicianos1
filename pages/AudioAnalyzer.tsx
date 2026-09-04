import React, { useEffect, useRef, useState } from 'react';
import { Upload, Loader2, Info, Copy, Check, Play, Pause, FilePlus2, ArrowRight } from 'lucide-react';
import {
  loadMonoSamples,
  computeChromaFrames,
  estimateKey,
  estimateChordTimeline,
  buildSkeletonChordPro,
  formatTime,
  MAX_ANALYZE_SECONDS,
  KeyCandidate,
  ChordSegment,
} from '../lib/audioAnalysis';
import { useSupabaseTable } from '../lib/useSupabaseTable';
import { Song } from '../types';
import { PrimaryButton } from '../components/ui';

const CHORD_COLORS = [
  'bg-indigo-600', 'bg-teal-600', 'bg-rose-600', 'bg-amber-600',
  'bg-violet-600', 'bg-emerald-600', 'bg-sky-600', 'bg-fuchsia-600',
];
function colorForChord(chord: string): string {
  if (chord === 'N/C') return 'bg-zinc-800';
  let hash = 0;
  for (let i = 0; i < chord.length; i++) hash = (hash * 31 + chord.charCodeAt(i)) % CHORD_COLORS.length;
  return CHORD_COLORS[hash];
}

export const AudioAnalyzer: React.FC<{ onSongCreated?: () => void }> = ({ onSongCreated }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeChipRef = useRef<HTMLButtonElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const { insert: insertSong } = useSupabaseTable<Song>('songs', 'title', true);

  const [fileName, setFileName] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [truncatedNotice, setTruncatedNotice] = useState(false);
  const [keyCandidates, setKeyCandidates] = useState<KeyCandidate[] | null>(null);
  const [chords, setChords] = useState<ChordSegment[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [creatingSong, setCreatingSong] = useState(false);
  const [createdSongTitle, setCreatedSongTitle] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setError(null);
    setKeyCandidates(null);
    setChords(null);
    setTruncatedNotice(false);
    setCopied(false);
    setCreatedSongTitle(null);
    setCurrentTime(0);
    setIsPlaying(false);
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

  const activeIndex = chords?.findIndex((c) => currentTime >= c.start && currentTime < c.end) ?? -1;

  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeIndex]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) audioRef.current.play();
    else audioRef.current.pause();
  };

  const seekTo = (time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    audioRef.current.play();
  };

  const handleCopy = () => {
    if (!keyCandidates || !chords) return;
    const top = keyCandidates[0];
    const lines = [
      `Tom sugerido: ${top.key} (confiança: ${Math.round(Math.max(0, top.score) * 100)}%)`,
      '',
      'Progressão detectada:',
      ...chords.filter((c) => c.chord !== 'N/C').map((c) => `${formatTime(c.start)} - ${c.chord}`),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateSong = async () => {
    if (!keyCandidates || !chords) return;
    setCreatingSong(true);
    const titleGuess = (fileName || 'Nova música')
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    const saved = await insertSong({
      title: titleGuess || 'Nova música',
      artist: '',
      original_key: keyCandidates[0].key,
      bpm: null,
      tags: ['analisador-de-áudio'],
      body_chordpro: buildSkeletonChordPro(chords),
    });
    setCreatingSong(false);
    if (saved) {
      setCreatedSongTitle(saved.title);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-indigo-500 pb-2">
        <h2 className="text-3xl font-extrabold text-white">Analisador de Áudio</h2>
      </div>

      <p className="text-zinc-400 text-sm max-w-2xl">
        Envie uma gravação e o app estima o tom e a progressão de acordes, direto no seu navegador — sem
        enviar o áudio pra nenhum servidor. Funciona melhor em gravações mais "limpas" (voz + violão/piano);
        é uma estimativa, não uma transcrição perfeita — use como ponto de partida.
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

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          className="hidden"
          onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {keyCandidates && chords && audioUrl && (
        <>
          {/* Tom sugerido — só o palpite principal + 1 alternativa, sem excesso de opções */}
          <div className="bg-zinc-900 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-8">
              <div>
                <h3 className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Tom sugerido</h3>
                <p className="text-4xl font-extrabold text-indigo-400">{keyCandidates[0].key}</p>
              </div>
              {keyCandidates[1] && keyCandidates[1].score > keyCandidates[0].score * 0.85 && (
                <div className="text-zinc-500 text-sm">
                  Se não bater, tente <span className="text-zinc-300 font-medium">{keyCandidates[1].key}</span>{' '}
                  (tom relativo, ambiguidade comum sem melodia como referência)
                </div>
              )}
            </div>

            {createdSongTitle ? (
              <div className="text-sm text-teal-400 flex items-center gap-1.5">
                <Check className="w-4 h-4" /> "{createdSongTitle}" criada em Repertório & Cifras
              </div>
            ) : (
              <PrimaryButton onClick={handleCreateSong} disabled={creatingSong} className="flex items-center gap-2 shrink-0">
                {creatingSong ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
                Criar música com este resultado
              </PrimaryButton>
            )}
          </div>
          {createdSongTitle && (
            <button
              onClick={() => onSongCreated?.()}
              className="text-zinc-400 hover:text-white text-xs flex items-center gap-1.5 -mt-3"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              Ir para <span className="text-indigo-400 font-medium">Repertório & Cifras</span> e digitar a letra
              por cima dos "____" ouvindo a música no player de lá
            </button>
          )}

          {/* Player com os acordes sincronizados */}
          <div className="bg-zinc-900 rounded-2xl p-6">
            <div className="flex items-center gap-4 mb-5">
              <button
                onClick={togglePlay}
                className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center shrink-0 text-white"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <div className="flex-1">
                <input
                  type="range"
                  min={0}
                  max={audioDuration || 0}
                  step={0.01}
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(audioDuration)}</span>
                </div>
              </div>
              <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white shrink-0">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>

            <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Acordes (acompanha a reprodução)</h4>
            <div ref={timelineRef} className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
              {chords.map((seg, i) => {
                const isActive = i === activeIndex;
                const widthPct = Math.max(4, ((seg.end - seg.start) / (audioDuration || seg.end)) * 100);
                return (
                  <button
                    key={i}
                    ref={isActive ? activeChipRef : null}
                    onClick={() => seekTo(seg.start)}
                    style={{ minWidth: `${Math.max(48, widthPct * 3)}px` }}
                    className={`shrink-0 rounded-lg px-3 py-3 text-center transition-all ${colorForChord(seg.chord)} ${
                      isActive ? 'ring-2 ring-white scale-105' : 'opacity-60 hover:opacity-90'
                    }`}
                  >
                    <div className="text-white font-bold text-sm">{seg.chord}</div>
                    <div className="text-white/70 text-[10px]">{formatTime(seg.start)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {!analyzing && !keyCandidates && (
        <p className="text-zinc-600 text-xs">
          Dica: depois de analisar, use "Copiar" e cole o resultado como referência ao criar a música em
          Repertório & Cifras — o tom sugerido já pode ir direto no campo "Tom original".
        </p>
      )}
    </div>
  );
};
