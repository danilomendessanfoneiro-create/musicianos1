import React, { useMemo, useState } from 'react';
import { PlusCircle, Search, Music2, Trash2 } from 'lucide-react';
import { useSupabaseTable } from '../../lib/useSupabaseTable';
import { Song } from '../../types';
import { Input, PrimaryButton } from '../../components/ui';
import { SongForm } from './SongForm';
import { SongViewer } from './SongViewer';

export const RepertoireHome: React.FC = () => {
  const { rows: songs, insert, update, remove, loading } = useSupabaseTable<Song>('songs', 'title', true);
  const [query, setQuery] = useState('');
  const [editingSong, setEditingSong] = useState<Song | 'new' | null>(null);
  const [viewingSong, setViewingSong] = useState<Song | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
  }, [songs, query]);

  if (viewingSong) {
    return (
      <SongViewer
        song={viewingSong}
        onBack={() => setViewingSong(null)}
        onEdit={() => { setEditingSong(viewingSong); setViewingSong(null); }}
      />
    );
  }

  if (editingSong) {
    return (
      <SongForm
        song={editingSong === 'new' ? null : editingSong}
        onCancel={() => setEditingSong(null)}
        onSave={async (data) => {
          if (editingSong === 'new') {
            await insert(data);
          } else {
            await update(editingSong.id, data);
          }
          setEditingSong(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-indigo-500 pb-2">
        <h2 className="text-3xl font-extrabold text-white">Repertório & Cifras</h2>
        <PrimaryButton onClick={() => setEditingSong('new')} className="flex items-center gap-2">
          <PlusCircle className="w-4 h-4" /> Nova Música
        </PrimaryButton>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <Input
          placeholder="Buscar por título ou artista..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-zinc-500">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((song) => (
            <div
              key={song.id}
              className="bg-zinc-900 p-5 rounded-2xl hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer"
              onClick={() => setViewingSong(song)}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <Music2 className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-semibold text-white">{song.title}</h3>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); remove(song.id); }}
                  className="text-zinc-500 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-zinc-400 text-sm mt-1">{song.artist || 'Artista não informado'}</p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs bg-zinc-800 px-2 py-1 rounded-full text-indigo-300">Tom: {song.original_key}</span>
                {song.bpm && <span className="text-xs bg-zinc-800 px-2 py-1 rounded-full text-zinc-400">{song.bpm} BPM</span>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-zinc-500 italic col-span-full">
              {query ? 'Nenhuma música encontrada.' : 'Sua biblioteca está vazia — cadastre sua primeira cifra.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
