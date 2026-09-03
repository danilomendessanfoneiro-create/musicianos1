import React, { useRef, useState } from 'react';
import { ArrowLeft, Info, FileUp, Loader2 } from 'lucide-react';
import { Song } from '../../types';
import { MAJOR_KEYS, MINOR_KEYS, normalizeKey } from '../../lib/chordpro';
import { Input, Select, Textarea, PrimaryButton } from '../../components/ui';
import { ChordProRenderer } from './ChordProRenderer';

const PLACEHOLDER = `{c: Intro}
[C]Ao lon[Am]ge daqui [F]nada [G]mais
{c: Refrão}
[C]Digite a letra e coloque os acordes entre colchetes
[Am]assim como [F]nesta [G]linha de exemplo`;

interface SongFormProps {
  song: Song | null;
  onCancel: () => void;
  onSave: (data: Partial<Song>) => Promise<void>;
}

export const SongForm: React.FC<SongFormProps> = ({ song, onCancel, onSave }) => {
  const [title, setTitle] = useState(song?.title || '');
  const [artist, setArtist] = useState(song?.artist || '');
  const [originalKey, setOriginalKey] = useState(song?.original_key || 'C');
  const [bpm, setBpm] = useState<string>(song?.bpm ? String(song.bpm) : '');
  const [tagsText, setTagsText] = useState(song?.tags?.join(', ') || '');
  const [body, setBody] = useState(song?.body_chordpro || '');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportWarning(null);
    try {
      const { importPdfToChordPro } = await import('../../lib/pdfImport');
      const { body: extracted, titleGuess, keyGuess } = await importPdfToChordPro(file);
      setBody(extracted);
      if (titleGuess && !title) setTitle(titleGuess);
      if (keyGuess) setOriginalKey(normalizeKey(keyGuess));
      setImportWarning(
        keyGuess
          ? `Extraído do PDF (tom detectado: ${normalizeKey(keyGuess)}) — confira o alinhamento dos acordes abaixo antes de salvar.`
          : 'Extraído do PDF — não encontrei "Tom:" no arquivo, confira/ajuste o tom original manualmente. Revise também o alinhamento dos acordes abaixo antes de salvar.'
      );
    } catch (err) {
      setImportWarning('Não consegui ler esse PDF. Ele precisa ter texto selecionável (não pode ser um PDF escaneado/imagem).');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      title,
      artist,
      original_key: originalKey,
      bpm: bpm ? Number(bpm) : null,
      tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      body_chordpro: body,
    });
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <button onClick={onCancel} className="flex items-center gap-2 text-zinc-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <h2 className="text-2xl font-extrabold text-white">{song ? 'Editar Música' : 'Nova Música'}</h2>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <Input placeholder="Título da música" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <Input placeholder="Artista / Banda original" value={artist} onChange={(e) => setArtist(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={originalKey} onChange={(e) => setOriginalKey(e.target.value)}>
              <optgroup label="Maiores">
                {MAJOR_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </optgroup>
              <optgroup label="Menores">
                {MINOR_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </optgroup>
            </Select>
            <Input type="number" placeholder="BPM" value={bpm} onChange={(e) => setBpm(e.target.value)} />
          </div>
          <Input placeholder="Tags separadas por vírgula (ex: rock, casamento)" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handlePdfSelected}
              className="hidden"
              id="pdf-import-input"
            />
            <label
              htmlFor="pdf-import-input"
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium cursor-pointer text-sm"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              {importing ? 'Lendo PDF...' : 'Importar de PDF'}
            </label>
            <span className="text-xs text-zinc-500">PDF com texto selecionável (não escaneado)</span>
          </div>
          {importWarning && <p className="text-yellow-400 text-xs">{importWarning}</p>}

          <div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
              <Info className="w-3 h-3" />
              Coloque o acorde entre colchetes antes da sílaba: <code className="text-indigo-300">[C]como assim</code>. Use <code className="text-indigo-300">{'{c: Refrão}'}</code> para marcar seções.
            </div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              placeholder={PLACEHOLDER}
            />
          </div>

          <PrimaryButton type="submit" disabled={saving} className="w-full">
            {saving ? 'Salvando...' : 'Salvar Música'}
          </PrimaryButton>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-6 max-h-[70vh] overflow-y-auto">
          <h3 className="text-sm text-zinc-500 uppercase tracking-wide mb-3">Pré-visualização</h3>
          <ChordProRenderer body={body || PLACEHOLDER} />
        </div>
      </form>
    </div>
  );
};
