import React, { useState } from 'react';
import { PlusCircle, ListMusic, Trash2 } from 'lucide-react';
import { useSupabaseTable } from '../../lib/useSupabaseTable';
import { Setlist, Gig } from '../../types';
import { Modal, Input, Select, PrimaryButton } from '../../components/ui';
import { SetlistEditor } from './SetlistEditor';

export const Setlists: React.FC = () => {
  const { rows: setlists, insert, remove } = useSupabaseTable<Setlist>('setlists');
  const { rows: gigs } = useSupabaseTable<Gig>('gigs', 'date', true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', gig_id: '', notes: '' });
  const [openSetlistId, setOpenSetlistId] = useState<string | null>(null);

  if (openSetlistId) {
    return <SetlistEditor setlistId={openSetlistId} onBack={() => setOpenSetlistId(null)} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await insert({ title: form.title, gig_id: form.gig_id || null, notes: form.notes } as Partial<Setlist>);
    setIsModalOpen(false);
    setForm({ title: '', gig_id: '', notes: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-indigo-500 pb-2">
        <h2 className="text-3xl font-extrabold text-white">Setlists</h2>
        <PrimaryButton onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
          <PlusCircle className="w-4 h-4" /> Novo Setlist
        </PrimaryButton>
      </div>

      <p className="text-zinc-400 text-sm max-w-2xl">
        Monte o repertório de um show com as tonalidades definidas e gere um link para enviar aos músicos
        freelancers — mesmo sem tempo de ensaio, eles chegam sabendo exatamente o que tocar e em qual tom.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {setlists.map((s) => {
          const gig = gigs.find((g) => g.id === s.gig_id);
          return (
            <div
              key={s.id}
              className="bg-zinc-900 p-5 rounded-2xl hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer"
              onClick={() => setOpenSetlistId(s.id)}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <ListMusic className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-semibold text-white">{s.title}</h3>
                </div>
                <button onClick={(e) => { e.stopPropagation(); remove(s.id); }} className="text-zinc-500 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {gig && (
                <p className="text-zinc-400 text-sm mt-1">
                  {new Date(gig.date + 'T00:00:00').toLocaleDateString('pt-BR')} · {gig.venue}
                </p>
              )}
            </div>
          );
        })}
        {setlists.length === 0 && <p className="text-zinc-500 italic col-span-full">Nenhum setlist criado ainda.</p>}
      </div>

      {isModalOpen && (
        <Modal title="Novo Setlist" onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input placeholder="Nome do setlist (ex: Show Bar do Zé)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <Select value={form.gig_id} onChange={(e) => setForm({ ...form, gig_id: e.target.value })}>
              <option value="">Não vincular a um show</option>
              {gigs.map((g) => (
                <option key={g.id} value={g.id}>
                  {new Date(g.date + 'T00:00:00').toLocaleDateString('pt-BR')} — {g.venue}
                </option>
              ))}
            </Select>
            <Input placeholder="Notas (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <PrimaryButton type="submit" className="w-full">Criar Setlist</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  );
};
