import React, { useState } from 'react';
import { PlusCircle, Trash2, Pencil, Check } from 'lucide-react';
import { useSupabaseTable } from '../lib/useSupabaseTable';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Gig } from '../types';
import { Modal, Input, Textarea, PrimaryButton, formatCurrency } from '../components/ui';

const emptyForm = {
  date: new Date().toISOString().substring(0, 10),
  city: '',
  venue: '',
  event_type: '',
  fee: '',
  cost: '',
  notes: '',
  fee_received: false,
  cost_paid: false,
};

type FormState = typeof emptyForm;

export const Gigs: React.FC = () => {
  const { rows: gigs, insert, update, remove } = useSupabaseTable<Gig>('gigs', 'date', true);
  const { session } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGig, setEditingGig] = useState<Gig | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const openNew = () => {
    setEditingGig(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (gig: Gig) => {
    setEditingGig(gig);
    setForm({
      date: gig.date,
      city: gig.city,
      venue: gig.venue,
      event_type: gig.event_type,
      fee: String(gig.fee ?? ''),
      cost: String(gig.cost ?? ''),
      notes: gig.notes,
      fee_received: gig.fee_received,
      cost_paid: gig.cost_paid,
    });
    setIsModalOpen(true);
  };

  // Mantém a transação de Finanças em sincronia com o show (cria/atualiza/remove)
  const syncGigTransaction = async (gig: Gig, kind: 'gig_fee' | 'gig_cost') => {
    if (!session) return;
    const isFee = kind === 'gig_fee';
    const shouldExist = isFee ? gig.fee_received : gig.cost_paid;
    const amount = isFee ? gig.fee : gig.cost;

    const { data: existingRows } = await supabase
      .from('transactions')
      .select('*')
      .eq('gig_id', gig.id)
      .eq('source', kind);
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;

    if (shouldExist) {
      const label = isFee ? 'Cachê' : 'Despesa do show';
      const place = gig.venue || gig.city || 'Show';
      const payload = {
        date: gig.date,
        description: `${label} — ${place}`,
        amount,
        type: isFee ? ('income' as const) : ('expense' as const),
        category: 'Show',
        gig_id: gig.id,
        source: kind,
      };
      if (existing) {
        await supabase.from('transactions').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('transactions').insert({ ...payload, user_id: session.user.id });
      }
    } else if (existing) {
      await supabase.from('transactions').delete().eq('id', existing.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<Gig> = {
      date: form.date,
      city: form.city,
      venue: form.venue,
      event_type: form.event_type,
      fee: Number(form.fee) || 0,
      cost: Number(form.cost) || 0,
      notes: form.notes,
      fee_received: form.fee_received,
      cost_paid: form.cost_paid,
    };

    const saved = editingGig ? await update(editingGig.id, payload) : await insert(payload);
    if (saved) {
      await syncGigTransaction(saved, 'gig_fee');
      await syncGigTransaction(saved, 'gig_cost');
    }
    setIsModalOpen(false);
    setEditingGig(null);
    setForm(emptyForm);
  };

  const handleDelete = async (gig: Gig) => {
    await supabase.from('transactions').delete().eq('gig_id', gig.id).eq('source', 'gig_fee');
    await supabase.from('transactions').delete().eq('gig_id', gig.id).eq('source', 'gig_cost');
    await remove(gig.id);
  };

  const toggleFeeReceived = async (gig: Gig) => {
    const updated = await update(gig.id, { fee_received: !gig.fee_received });
    if (updated) await syncGigTransaction(updated, 'gig_fee');
  };

  const toggleCostPaid = async (gig: Gig) => {
    const updated = await update(gig.id, { cost_paid: !gig.cost_paid });
    if (updated) await syncGigTransaction(updated, 'gig_cost');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-indigo-500 pb-2">
        <h2 className="text-3xl font-extrabold text-white">Shows</h2>
        <PrimaryButton onClick={openNew} className="flex items-center gap-2">
          <PlusCircle className="w-4 h-4" /> Novo Show
        </PrimaryButton>
      </div>

      <p className="text-zinc-500 text-sm max-w-2xl">
        Marque <span className="text-teal-400 font-medium">Recebido</span> quando o cachê cair na conta e{' '}
        <span className="text-red-400 font-medium">Pago</span> quando a despesa do show for quitada — isso lança
        (ou remove) o valor automaticamente em Finanças.
      </p>

      <div className="bg-zinc-900 rounded-2xl overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-zinc-800 text-zinc-400 text-sm">
            <tr>
              <th className="p-4">Data</th>
              <th className="p-4">Local</th>
              <th className="p-4">Tipo</th>
              <th className="p-4">Cachê</th>
              <th className="p-4 text-center">Recebido</th>
              <th className="p-4">Custo</th>
              <th className="p-4 text-center">Pago</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {gigs.map((gig) => (
              <tr key={gig.id} className="border-t border-zinc-800">
                <td className="p-4 whitespace-nowrap">{new Date(gig.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="p-4">{gig.venue} — {gig.city}</td>
                <td className="p-4 text-zinc-400">{gig.event_type}</td>
                <td className="p-4 text-teal-400 font-semibold whitespace-nowrap">{formatCurrency(gig.fee)}</td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => toggleFeeReceived(gig)}
                    className={`w-6 h-6 rounded-md border flex items-center justify-center mx-auto transition-colors ${
                      gig.fee_received ? 'bg-teal-600 border-teal-600' : 'border-zinc-600 hover:border-teal-500'
                    }`}
                    title="Marcar cachê como recebido (lança em Finanças)"
                  >
                    {gig.fee_received && <Check className="w-4 h-4 text-white" />}
                  </button>
                </td>
                <td className="p-4 text-red-400 whitespace-nowrap">{formatCurrency(gig.cost)}</td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => toggleCostPaid(gig)}
                    className={`w-6 h-6 rounded-md border flex items-center justify-center mx-auto transition-colors ${
                      gig.cost_paid ? 'bg-red-600 border-red-600' : 'border-zinc-600 hover:border-red-500'
                    }`}
                    title="Marcar despesa como paga (lança em Finanças)"
                  >
                    {gig.cost_paid && <Check className="w-4 h-4 text-white" />}
                  </button>
                </td>
                <td className="p-4">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => openEdit(gig)} className="text-zinc-500 hover:text-indigo-400">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(gig)} className="text-zinc-500 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {gigs.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-zinc-500 italic">Nenhum show cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal title={editingGig ? 'Editar Show' : 'Novo Show'} onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <Input placeholder="Cidade" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input placeholder="Local (casa de show, evento...)" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            <Input placeholder="Tipo de evento" value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} />

            <div>
              <Input
                type="number"
                step="0.01"
                placeholder="Cachê (R$)"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
              />
              <label className="flex items-center gap-2 mt-1.5 ml-1 text-sm text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.fee_received}
                  onChange={(e) => setForm({ ...form, fee_received: e.target.checked })}
                  className="rounded"
                />
                Cachê já recebido (lança em Finanças)
              </label>
            </div>

            <div>
              <Input
                type="number"
                step="0.01"
                placeholder="Custo (R$)"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
              <label className="flex items-center gap-2 mt-1.5 ml-1 text-sm text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.cost_paid}
                  onChange={(e) => setForm({ ...form, cost_paid: e.target.checked })}
                  className="rounded"
                />
                Despesa já paga (lança em Finanças)
              </label>
            </div>

            <Textarea placeholder="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            <PrimaryButton type="submit" className="w-full">{editingGig ? 'Salvar Alterações' : 'Salvar'}</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  );
};
