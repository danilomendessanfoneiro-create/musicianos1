import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Edit, Minus, Plus, Play, Pause, Type } from 'lucide-react';
import { Song } from '../../types';
import { transposeChordProBody, semitoneDiff } from '../../lib/chordpro';
import { ChordProRenderer } from './ChordProRenderer';

interface SongViewerProps {
  song: Song;
  onBack: () => void;
  onEdit: () => void;
  /** Se vier de um setlist, mostra já transposto para o tom do show */
  initialKey?: string;
}

export const SongViewer: React.FC<SongViewerProps> = ({ song, onBack, onEdit, initialKey }) => {
  const baseSemitones = initialKey ? semitoneDiff(song.original_key, initialKey) : 0;
  const [semitones, setSemitones] = useState(baseSemitones);
  const [fontSize, setFontSize] = useState(16);
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(40); // px/s
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const transposedBody = transposeChordProBody(song.body_chordpro, semitones);
  const currentKeyIndex = ((['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(song.original_key) + semitones) % 12 + 12) % 12;
  const currentKey = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][currentKeyIndex];

  useEffect(() => {
    if (!autoScroll) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (containerRef.current) {
        containerRef.current.scrollTop += scrollSpeed * dt;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [autoScroll, scrollSpeed]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <button onClick={onEdit} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
          <Edit className="w-4 h-4" /> Editar
        </button>
      </div>

      <div>
        <h2 className="text-3xl font-extrabold text-white">{song.title}</h2>
        <p className="text-zinc-400">{song.artist}</p>
      </div>

      {/* Barra de controles estilo cifra */}
      <div className="flex flex-wrap items-center gap-4 bg-zinc-900 rounded-2xl p-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Tom</span>
          <button onClick={() => setSemitones((s) => s - 1)} className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700">
            <Minus className="w-4 h-4" />
          </button>
          <span className="w-10 text-center font-bold text-indigo-400">{currentKey}</span>
          <button onClick={() => setSemitones((s) => s + 1)} className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700">
            <Plus className="w-4 h-4" />
          </button>
          {semitones !== 0 && (
            <button onClick={() => setSemitones(0)} className="text-xs text-zinc-500 hover:text-white underline ml-1">
              original ({song.original_key})
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-zinc-500" />
          <button onClick={() => setFontSize((f) => Math.max(10, f - 2))} className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-xs">A-</button>
          <button onClick={() => setFontSize((f) => Math.min(32, f + 2))} className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-xs">A+</button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`p-2 rounded-lg flex items-center gap-1 text-sm ${autoScroll ? 'bg-indigo-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700'}`}
          >
            {autoScroll ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            Autoscroll
          </button>
          {autoScroll && (
            <input
              type="range" min={10} max={150} value={scrollSpeed}
              onChange={(e) => setScrollSpeed(Number(e.target.value))}
              className="w-24"
            />
          )}
        </div>
      </div>

      <div ref={containerRef} className="bg-zinc-900 rounded-2xl p-6 max-h-[65vh] overflow-y-auto">
        <ChordProRenderer body={transposedBody} fontSize={fontSize} />
      </div>
    </div>
  );
};
