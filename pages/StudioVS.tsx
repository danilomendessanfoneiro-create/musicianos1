import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StemName } from '../lib/stemEngine';
import {
  STEM_META,
  STEM_ORDER,
  decodeFile,
  encodeWav,
  formatBytes,
  formatDuration,
  separateBuffer,
} from '../lib/stemAudio';
import { MultitrackPlayer } from '../lib/multitrack';
import {
  VsProject,
  VsTrack,
  deleteProject,
  getFile,
  listProjects,
  newId,
  putFile,
  saveProject,
  storageEstimate,
} from '../lib/vsLibrary';
import { sendAudioTo } from '../lib/audioHandoff';

interface LiveTrack {
  id: string;
  label: string;
  color: string;
  buffer: AudioBuffer;
  blob: Blob | null;
  volume: number;
  muted: boolean;
  soloed: boolean;
}

const IMPORT_COLORS = ['#f2b705', '#4cc9a4', '#7a6cf0', '#ef6461', '#3fa7d6', '#e07a5f', '#9bc53d', '#c05299'];

const SEMITONE_LABELS = ['-5', '-4', '-3', '-2', '-1', '0', '+1', '+2', '+3', '+4', '+5'];

interface StudioVSProps {
  /** Chamada depois que uma pista é entregue ao Analisador de Áudio. O Musicianos
   * navega por estado (ViewState), não por URL — por isso quem troca de tela é o
   * App.tsx, não esta página. */
  onOpenAnalyzer?: () => void;
}

export default function StudioVS({ onOpenAnalyzer }: StudioVSProps) {
  const [projects, setProjects] = useState<VsProject[]>([]);
  const [current, setCurrent] = useState<VsProject | null>(null);
  const [tracks, setTracks] = useState<LiveTrack[]>([]);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [songKey, setSongKey] = useState('');
  const [origin, setOrigin] = useState<'separado' | 'importado'>('separado');
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [compact, setCompact] = useState(true);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [semitones, setSemitones] = useState(0);
  const [tempo, setTempo] = useState(1);
  const [levels, setLevels] = useState<Record<string, number>>({});

  const playerRef = useRef<MultitrackPlayer | null>(null);
  const separateInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const duration = playerRef.current?.duration ?? 0;

  const refreshLibrary = useCallback(async () => {
    setProjects(await listProjects());
    setQuota(await storageEstimate());
  }, []);

  useEffect(() => {
    refreshLibrary();
    return () => playerRef.current?.dispose();
  }, [refreshLibrary]);

  // Medidores de nível: só rodam enquanto está tocando.
  useEffect(() => {
    if (!playing) {
      setLevels({});
      return;
    }
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const next: Record<string, number> = {};
      for (const track of tracks) next[track.id] = player.level(track.id);
      setLevels(next);
    }, 60);
    return () => window.clearInterval(timer);
  }, [playing, tracks]);

  const mountPlayer = useCallback((list: LiveTrack[]) => {
    playerRef.current?.dispose();
    const player = new MultitrackPlayer(list.map((t) => ({ id: t.id, buffer: t.buffer })));
    player.onTime = (t) => setTime(t);
    player.onEnded = () => {
      setPlaying(false);
      setTime(0);
    };
    playerRef.current = player;
    setTracks(list);
    setTime(0);
    setPlaying(false);
    setSemitones(0);
    setTempo(1);
  }, []);

  const resetWorkspace = () => {
    playerRef.current?.dispose();
    playerRef.current = null;
    setTracks([]);
    setCurrent(null);
    setTitle('');
    setArtist('');
    setSongKey('');
    setSaved(false);
    setError(null);
    setPlaying(false);
    setTime(0);
  };

  /* ---------------- separar uma música em pistas ---------------- */

  const handleSeparate = async (file: File) => {
    setError(null);
    setSaved(false);
    setCurrent(null);
    setBusy('Lendo o arquivo');
    setProgress(0);
    try {
      const buffer = await decodeFile(file);
      if (buffer.duration > 12 * 60) {
        throw new Error('Arquivo com mais de 12 minutos. Corte em partes menores.');
      }
      setBusy('Separando as pistas');
      const stems = await separateBuffer(buffer, {}, (p) => setProgress(p.ratio));
      const list: LiveTrack[] = STEM_ORDER.map((name: StemName) => ({
        id: name,
        label: STEM_META[name].label,
        color: STEM_META[name].color,
        buffer: stems[name],
        blob: null,
        volume: 1,
        muted: false,
        soloed: false,
      }));
      mountPlayer(list);
      setOrigin('separado');
      setTitle(file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível processar este arquivo.');
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  /* ---------------- importar pistas prontas ---------------- */

  const handleImport = async (files: FileList) => {
    setError(null);
    setSaved(false);
    setCurrent(null);
    setBusy('Lendo as pistas');
    try {
      const list: LiveTrack[] = [];
      let index = 0;
      for (const file of Array.from(files)) {
        const buffer = await decodeFile(file);
        list.push({
          id: `t${index}`,
          label: file.name.replace(/\.[^.]+$/, '').slice(0, 28),
          color: IMPORT_COLORS[index % IMPORT_COLORS.length],
          buffer,
          blob: file,
          volume: 1,
          muted: false,
          soloed: false,
        });
        index++;
      }
      if (!list.length) throw new Error('Nenhuma pista reconhecida.');
      mountPlayer(list);
      setOrigin('importado');
      setTitle(files[0].name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler essas pistas.');
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- acervo ---------------- */

  const openProject = async (project: VsProject) => {
    setError(null);
    setBusy('Abrindo o VS');
    try {
      const list: LiveTrack[] = [];
      for (const track of project.tracks) {
        const blob = await getFile(track.fileKey);
        if (!blob) continue;
        list.push({
          id: track.id,
          label: track.label,
          color: track.color,
          buffer: await decodeFile(blob),
          blob,
          volume: 1,
          muted: false,
          soloed: false,
        });
      }
      if (!list.length) throw new Error('Os arquivos deste VS não estão mais no navegador.');
      mountPlayer(list);
      setCurrent(project);
      setTitle(project.title);
      setArtist(project.artist);
      setSongKey(project.songKey);
      setOrigin(project.origin);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir.');
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    if (!tracks.length) return;
    setBusy('Salvando no acervo');
    try {
      const id = current?.id ?? newId();
      const stored: VsTrack[] = [];
      for (const track of tracks) {
        const blob = track.blob ?? encodeWav(track.buffer, { compact });
        const fileKey = `${id}/${track.id}.wav`;
        await putFile(fileKey, blob);
        stored.push({
          id: track.id,
          label: track.label,
          color: track.color,
          fileKey,
          bytes: blob.size,
        });
      }
      const project: VsProject = {
        id,
        title: title.trim() || 'VS sem nome',
        artist: artist.trim(),
        songKey: songKey.trim(),
        notes: current?.notes ?? '',
        origin,
        durationSec: duration,
        createdAt: current?.createdAt ?? Date.now(),
        tracks: stored,
      };
      await saveProject(project);
      setCurrent(project);
      setSaved(true);
      await refreshLibrary();
    } catch (err) {
      setError(
        err instanceof Error && err.name === 'QuotaExceededError'
          ? 'O navegador ficou sem espaço. Apague algum VS ou salve em qualidade compacta.'
          : 'Não foi possível salvar.',
      );
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (project: VsProject) => {
    if (!window.confirm(`Apagar "${project.title}" e as pistas dele?`)) return;
    await deleteProject(project.id);
    if (current?.id === project.id) resetWorkspace();
    await refreshLibrary();
  };

  /* ---------------- transporte e mixer ---------------- */

  const togglePlay = async () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isPlaying) {
      player.pause();
      setPlaying(false);
    } else {
      await player.play();
      setPlaying(true);
    }
  };

  const updateTrack = (id: string, patch: Partial<LiveTrack>) => {
    setTracks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const downloadTrack = (track: LiveTrack) => {
    const blob = track.blob ?? encodeWav(track.buffer, { compact: false });
    download(blob, `${(title || 'vs').replace(/[^\w\-]+/g, '-')}-${track.label}.wav`);
  };

  const analyseTrack = async (track: LiveTrack) => {
    const blob = track.blob ?? encodeWav(track.buffer, { compact: false });
    await sendAudioTo(blob, `${title || 'vs'} — ${track.label}`);
    onOpenAnalyzer?.();
  };

  const anySolo = tracks.some((t) => t.soloed);

  const usedInLibrary = useMemo(
    () => projects.reduce((sum, p) => sum + p.tracks.reduce((s, t) => s + t.bytes, 0), 0),
    [projects],
  );

  /* ---------------- render ---------------- */

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Estúdio VS</h1>
        <p className="max-w-xl text-sm text-slate-500">
          Separe uma música nas pistas de voz, harmonia, baixo e bateria, ou monte um VS com
          pistas que você já tem. Tudo acontece dentro do seu navegador: nenhum áudio é enviado
          para servidor.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Entrada */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => separateInput.current?.click()}
          className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-left transition hover:border-slate-400 disabled:opacity-50"
        >
          <span className="block text-sm font-medium text-slate-900">Separar uma música</span>
          <span className="mt-1 block text-xs text-slate-500">
            Um arquivo de áudio vira quatro pistas independentes.
          </span>
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => importInput.current?.click()}
          className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-left transition hover:border-slate-400 disabled:opacity-50"
        >
          <span className="block text-sm font-medium text-slate-900">Importar pistas</span>
          <span className="mt-1 block text-xs text-slate-500">
            Selecione vários arquivos de uma vez; cada um vira um canal do mixer.
          </span>
        </button>
      </div>
      <input
        ref={separateInput}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleSeparate(file);
          e.target.value = '';
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleImport(e.target.files);
          e.target.value = '';
        }}
      />

      {busy && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between text-sm text-slate-700">
            <span>{busy}…</span>
            {progress > 0 && <span>{Math.round(progress * 100)}%</span>}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-800 transition-[width] duration-300"
              style={{ width: `${Math.max(4, progress * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            A separação roda no seu computador e leva mais ou menos um quarto do tempo da música.
          </p>
        </div>
      )}

      {/* Console */}
      {tracks.length > 0 && (
        <section className="overflow-hidden rounded-2xl bg-[#14171c] text-slate-100 shadow-xl">
          <div className="flex flex-wrap items-center gap-4 border-b border-white/10 px-5 py-4">
            <button
              type="button"
              onClick={togglePlay}
              className="h-11 w-11 shrink-0 rounded-full bg-white text-[#14171c] transition hover:bg-slate-200"
              aria-label={playing ? 'Pausar' : 'Tocar'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <div className="min-w-[240px] flex-1">
              <input
                type="range"
                min={0}
                max={Math.max(duration, 0.1)}
                step={0.01}
                value={time}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setTime(value);
                  playerRef.current?.seek(value);
                }}
                className="w-full accent-amber-400"
                aria-label="Posição"
              />
              <div className="mt-1 flex justify-between font-mono text-xs text-slate-400">
                <span>{formatDuration(time)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Tom</span>
                <select
                  value={semitones}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setSemitones(value);
                    playerRef.current?.setSemitones(value);
                  }}
                  className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-slate-100"
                >
                  {SEMITONE_LABELS.map((label, i) => (
                    <option key={label} value={i - 5} className="text-slate-900">
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Andamento</span>
                <select
                  value={tempo}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setTempo(value);
                    playerRef.current?.setTempo(value);
                  }}
                  className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-slate-100"
                >
                  {[0.7, 0.8, 0.9, 1, 1.1, 1.2].map((value) => (
                    <option key={value} value={value} className="text-slate-900">
                      {Math.round(value * 100)}%
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="divide-y divide-white/5">
            {tracks.map((track) => {
              const audible = anySolo ? track.soloed : !track.muted;
              return (
                <div key={track.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: track.color, opacity: audible ? 1 : 0.25 }}
                  />
                  <span className="w-24 shrink-0 text-sm font-medium">{track.label}</span>

                  <span className="hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/10 sm:block">
                    <span
                      className="block h-full rounded-full transition-[width] duration-75"
                      style={{
                        width: `${Math.round((levels[track.id] ?? 0) * 100)}%`,
                        backgroundColor: track.color,
                      }}
                    />
                  </span>

                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.01}
                    value={track.volume}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      updateTrack(track.id, { volume: value });
                      playerRef.current?.setVolume(track.id, value);
                    }}
                    className="min-w-[120px] flex-1 accent-slate-300"
                    aria-label={`Volume de ${track.label}`}
                  />

                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        updateTrack(track.id, { muted: !track.muted });
                        playerRef.current?.setMuted(track.id, !track.muted);
                      }}
                      className={`h-7 w-8 rounded text-xs font-semibold transition ${
                        track.muted ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                      }`}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateTrack(track.id, { soloed: !track.soloed });
                        playerRef.current?.setSoloed(track.id, !track.soloed);
                      }}
                      className={`h-7 w-8 rounded text-xs font-semibold transition ${
                        track.soloed ? 'bg-amber-400 text-slate-900' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                      }`}
                    >
                      S
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTrack(track)}
                      className="h-7 rounded bg-white/10 px-2 text-xs text-slate-300 transition hover:bg-white/20"
                    >
                      Baixar
                    </button>
                    <button
                      type="button"
                      onClick={() => analyseTrack(track)}
                      className="h-7 rounded bg-white/10 px-2 text-xs text-slate-300 transition hover:bg-white/20"
                      title="Abrir esta pista no Analisador de Áudio"
                    >
                      Tom
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-black/20 px-5 py-3 text-xs text-slate-400">
            <button
              type="button"
              onClick={() => {
                const soloVoice = tracks.find((t) => t.id === 'vocals');
                if (!soloVoice) return;
                const next = !soloVoice.muted;
                updateTrack(soloVoice.id, { muted: next });
                playerRef.current?.setMuted(soloVoice.id, next);
              }}
              className="rounded-md bg-white/10 px-3 py-1.5 text-slate-200 transition hover:bg-white/20"
              disabled={!tracks.some((t) => t.id === 'vocals')}
            >
              Tirar a voz
            </button>
            <span>Mudar o tom muda o andamento junto — os dois controles se somam.</span>
          </div>
        </section>
      )}

      {/* Ficha e gravação */}
      {tracks.length > 0 && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Música</span>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSaved(false);
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Artista</span>
              <input
                value={artist}
                onChange={(e) => {
                  setArtist(e.target.value);
                  setSaved(false);
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600">Tom</span>
              <input
                value={songKey}
                onChange={(e) => {
                  setSongKey(e.target.value);
                  setSaved(false);
                }}
                placeholder="ex.: G, Em"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
            Salvar em qualidade compacta (mono, 22 kHz) — ocupa cerca de quatro vezes menos espaço
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!!busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {current ? 'Salvar alterações' : 'Salvar no acervo'}
            </button>
            {saved && <span className="text-sm text-emerald-600">Salvo</span>}
            <button
              type="button"
              onClick={resetWorkspace}
              className="text-sm text-slate-500 underline-offset-2 hover:underline"
            >
              Fechar sem salvar
            </button>
          </div>
        </section>
      )}

      {/* Acervo */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Meu acervo</h2>
          <span className="text-xs text-slate-500">
            {formatBytes(usedInLibrary)} usados
            {quota && quota.quota > 0 ? ` de ${formatBytes(quota.quota)} disponíveis` : ''}
          </span>
        </div>

        {projects.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
            Nenhum VS salvo ainda. Separe uma música ou importe pistas para começar o acervo.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            {projects.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center gap-3 bg-white px-4 py-3">
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-medium text-slate-900">{project.title}</p>
                  <p className="text-xs text-slate-500">
                    {[project.artist, project.songKey, `${project.tracks.length} pistas`,
                      formatDuration(project.durationSec)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {project.tracks.map((track) => (
                    <span
                      key={track.id}
                      className="h-5 w-1.5 rounded-full"
                      style={{ backgroundColor: track.color }}
                      title={track.label}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => openProject(project)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm transition hover:border-slate-500"
                >
                  Abrir
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(project)}
                  className="text-sm text-slate-400 transition hover:text-rose-600"
                >
                  Apagar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
