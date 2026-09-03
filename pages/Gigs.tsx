import React, { useState } from 'react';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useSupabaseTable } from '../lib/useSupabaseTable';
import { Gig } from '../types';
import { Modal, Input, PrimaryButton, formatCurrency } from '../components/ui';

export const Gigs: React.FC = () => {
  const { rows: gigs, insert, remove } = useSupabaseTable<Gig>('gigs', 'date', true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().substring(0, 10), city: '', venue: '', event_type: '', fee: 0, cost: 0, notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await insert(form as Partial<Gig>);
    setIsModalOpen(false);
    setForm({ date: new Date().toISOString().substring(0, 10), city: '', venue: '', event_type: '', fee: 0, cost: 0, notes: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-indigo-500 pb-2">
        <h2 className="text-3xl font-extrabold text-white">Shows</h2>
        <PrimaryButton onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
          <PlusCircle className="w-4 h-4" /> Novo Show
        </PrimaryButton>
      </div>

      <div className="bg-zinc-900 rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-800 text-zinc-400 text-sm">
            <tr>
              <th className="p-4">Data</th>
              <th className="p-4">Local</th>
              <th className="p-4">Tipo</th>
              <th className="p-4">Cachê</th>
              <th className="p-4">Custo</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {gigs.map((gig) => (
              <tr key={gig.id} className="border-t border-zinc-800">
                <td className="p-4">{new Date(gig.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="p-4">{gig.venue} — {gig.city}</td>
                <td className="p-4 text-zinc-400">{gig.event_type}</td>
                <td className="p-4 text-teal-400 font-semibold">{formatCurrency(gig.fee)}</td>
                <td className="p-4 text-red-400">{formatCurrency(gig.cost)}</td>
                <td className="p-4">
                  <button onClick={() => remove(gig.id)} className="text-zinc-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {gigs.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-zinc-500 italic">Nenhum show cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal title="Novo Show" onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <Input placeholder="Cidade" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input placeholder="Local (casa de show, evento...)" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            <Input placeholder="Tipo de evento" value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} />
            <Input type="number" placeholder="Cachê (R$)" value={form.fee} onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })} />
            <Input type="number" placeholder="Custo (R$)" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
            <Input placeholder="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <PrimaryButton type="submit" className="w-full">Salvar</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  );
};
