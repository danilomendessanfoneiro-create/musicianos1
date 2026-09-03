import React, { useState } from 'react';
import { ArrowLeft, Trash2, Share2, Copy, Check, X as XIcon } from 'lucide-react';
import { useSetlistDetail } from '../../lib/useSetlistDetail';
import { useSupabaseTable } from '../../lib/useSupabaseTable';
import { Song } from '../../types';
import { MAJOR_KEYS, MINOR_KEYS } from '../../lib/chordpro';
import { Select, PrimaryButton, Modal, Input } from '../../components/ui';

export const SetlistEditor: React.FC<{ setlistId: string; onBack: () => void }> = ({ setlistId, onBack }) => {
  const { setlist, items, shares, loading, addSong, removeItem, updateItem, createShareLink, revokeShare } =
    useSetlistDetail(setlistId);
  const { rows: songs } = useSupabaseTable<Song>('songs', 'title', true);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (loading || !setlist) return <p className="text-zinc-500">Carregando...</p>;

  const availableSongs = songs.filter(
    (s) => !items.some((i) => i.song_id === s.id) && (s.title.toLowerCase().includes(query.toLowerCase()) || s.artist.toLowerCase().includes(query.toLowerCase()))
  );

  const shareUrl = (token: string) => `${window.location.origin}/s/${token}`;

  const handleCreateLink = async () => {
    const token = await createShareLink();
    if (token) {
      setNewLink(shareUrl(token));
      setCopied(false);
    }
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappMessage = (url: string) =>
    `Olá! Segue o repertório de "${setlist.title}" com as tonalidades: ${url}`;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-3xl font-extrabold text-white">{setlist.title}</h2>
        <div className="flex gap-2">
          <PrimaryButton onClick={handleCreateLink} className="flex items-center gap-2">
            <Share2 className="w-4 h-4" /> Gerar Link
          </PrimaryButton>
          <button
            onClick={() => setIsPickerOpen(true)}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium"
          >
            + Adicionar Música
          </button>
        </div>
      </div>

      {shares.length > 0 && (
        <div className="bg-zinc-900 rounded-2xl p-4 space-y-2">
          <h3 className="text-sm text-zinc-500 uppercase tracking-wide">Links ativos</h3>
          {shares.map((s) => {
            const url = shareUrl(s.share_token);
            return (
              <div key={s.id} className="flex items-center justify-between gap-2 bg-zinc-800 rounded-lg p-2 pl-3">
                <a href={url} target="_blank" rel="noreferrer" className="text-indigo-300 text-sm truncate">{url}</a>
                <div className="flex gap-1 shrink-0">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage(url))}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs px-2 py-1 bg-green-700 hover:bg-green-600 rounded text-white"
                  >
                    WhatsApp
                  </a>
                  <button onClick={() => handleCopy(url)} className="p-1.5 text-zinc-400 hover:text-white">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => revokeShare(s.id)} className="p-1.5 text-zinc-400 hover:text-red-400">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-zinc-900 rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-800 text-zinc-400 text-sm">
            <tr>
              <th className="p-4 w-12">#</th>
              <th className="p-4">Música</th>
              <th className="p-4">Tom original</th>
              <th className="p-4">Tom no show</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className="border-t border-zinc-800">
                <td className="p-4 text-zinc-500">{idx + 1}</td>
                <td className="p-4">
                  <p className="font-medium text-white">{item.song?.title}</p>
                  <p className="text-xs text-zinc-500">{item.song?.artist}</p>
                </td>
                <td className="p-4 text-zinc-400">{item.song?.original_key}</td>
                <td className="p-4">
                  <Select
                    value={item.performance_key}
                    onChange={(e) => updateItem(item.id, { performance_key: e.target.value })}
                    className="w-24 py-1"
                  >
                    <optgroup label="Maiores">
                      {MAJOR_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </optgroup>
                    <optgroup label="Menores">
                      {MINOR_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </optgroup>
                  </Select>
                </td>
                <td className="p-4">
                  <button onClick={() => removeItem(item.id)} className="text-zinc-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-zinc-500 italic">Nenhuma música no setlist ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isPickerOpen && (
        <Modal title="Adicionar Música" onClose={() => setIsPickerOpen(false)}>
          <Input placeholder="Buscar..." value={query} onChange={(e) => setQuery(e.target.value)} className="mb-3" />
          <div className="max-h-80 overflow-y-auto space-y-2">
            {availableSongs.map((song) => (
              <button
                key={song.id}
                onClick={async () => { await addSong(song); }}
                className="w-full text-left p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
              >
                <p className="text-white text-sm font-medium">{song.title}</p>
                <p className="text-zinc-500 text-xs">{song.artist} · Tom {song.original_key}</p>
              </button>
            ))}
            {availableSongs.length === 0 && <p className="text-zinc-500 text-sm italic">Nenhuma música disponível.</p>}
          </div>
        </Modal>
      )}

      {newLink && (
        <Modal title="Link gerado!" onClose={() => setNewLink(null)}>
          <p className="text-zinc-400 text-sm mb-3">
            Envie este link para o músico freelancer. Ele abre o repertório com as cifras já no tom certo, sem precisar de login.
          </p>
          <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-3">
            <span className="text-indigo-300 text-sm truncate flex-1">{newLink}</span>
            <button onClick={() => handleCopy(newLink)} className="text-zinc-400 hover:text-white">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage(newLink))}`}
            target="_blank" rel="noreferrer"
            className="mt-3 block text-center px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-white font-medium"
          >
            Enviar pelo WhatsApp
          </a>
        </Modal>
      )}
    </div>
  );
};
