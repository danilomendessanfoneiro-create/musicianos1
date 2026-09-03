import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Music } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { SharedSetlistRow } from '../types';
import { transposeChordProBody, semitoneDiff } from '../lib/chordpro';
import { ChordProRenderer } from './repertoire/ChordProRenderer';

export const SharePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [rows, setRows] = useState<SharedSetlistRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!token) return;
    supabase.rpc('get_shared_setlist', { token }).then(({ data, error: rpcError }) => {
      if (rpcError || !data || data.length === 0) {
        setError('Este link não existe ou expirou.');
      } else {
        setRows(data as SharedSetlistRow[]);
      }
    });
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <p className="text-zinc-400">{error}</p>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <p className="text-zinc-500">Carregando repertório...</p>
      </div>
    );
  }

  const first = rows[0];
  const active = rows[activeIndex];
  const semitones = semitoneDiff(active.original_key, active.performance_key);
  const transposedBody = transposeChordProBody(active.body_chordpro, semitones);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="bg-zinc-900 p-6 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-indigo-400 mb-2">
          <Music className="w-5 h-5" />
          <span className="text-sm font-medium">Musicianos · Repertório compartilhado</span>
        </div>
        <h1 className="text-2xl font-extrabold text-white">{first.setlist_title}</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Enviado por {first.owner_name}
          {first.gig_date && ` · ${new Date(first.gig_date + 'T00:00:00').toLocaleDateString('pt-BR')}`}
          {first.gig_venue && ` · ${first.gig_venue}${first.gig_city ? ` (${first.gig_city})` : ''}`}
        </p>
        {first.setlist_notes && <p className="text-zinc-500 text-sm mt-1">{first.setlist_notes}</p>}
      </header>

      <div className="flex flex-col lg:flex-row">
        <nav className="lg:w-72 shrink-0 bg-zinc-900 lg:min-h-[calc(100vh-104px)] p-4 space-y-1">
          {rows.map((r, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                i === activeIndex ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              <p className="text-sm font-medium">{i + 1}. {r.song_title}</p>
              <p className="text-xs opacity-70">{r.song_artist} · Tom {r.performance_key}</p>
            </button>
          ))}
        </nav>

        <main className="flex-1 p-6">
          <h2 className="text-2xl font-bold text-white">{active.song_title}</h2>
          <p className="text-zinc-400 mb-4">{active.song_artist} · Tocar em <span className="text-indigo-400 font-semibold">{active.performance_key}</span></p>
          {active.item_notes && <p className="text-yellow-400 text-sm mb-4 italic">{active.item_notes}</p>}
          <div className="bg-zinc-900 rounded-2xl p-6 overflow-x-auto">
            <ChordProRenderer body={transposedBody} />
          </div>
        </main>
      </div>
    </div>
  );
};
