import React, { useState } from 'react';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useSupabaseTable } from '../lib/useSupabaseTable';
import { Lead, LeadStatus } from '../types';
import { Modal, Input, Select, PrimaryButton, formatCurrency } from '../components/ui';

const STATUS_KEYS = Object.values(LeadStatus);

const statusColor = (status: LeadStatus) => {
  switch (status) {
    case LeadStatus.NEW: return 'text-yellow-400 border-yellow-400';
    case LeadStatus.NEGOTIATING: return 'text-blue-400 border-blue-400';
    case LeadStatus.BOOKED: return 'text-green-400 border-green-400';
    case LeadStatus.LOST: return 'text-red-400 border-red-400';
    default: return 'text-zinc-400 border-zinc-400';
  }
};

export const CRM: React.FC = () => {
  const { rows: leads, insert, update, remove } = useSupabaseTable<Lead>('leads');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', venue: '', channel: 'WhatsApp', value: 0, last_contact: new Date().toISOString().substring(0, 10) });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await insert({ ...form, status: LeadStatus.NEW } as Partial<Lead>);
    setIsModalOpen(false);
    setForm({ name: '', venue: '', channel: 'WhatsApp', value: 0, last_contact: new Date().toISOString().substring(0, 10) });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-indigo-500 pb-2">
        <h2 className="text-3xl font-extrabold text-white">Gestão de Contatos (CRM)</h2>
        <PrimaryButton onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
          <PlusCircle className="w-4 h-4" /> Novo Lead
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATUS_KEYS.map((status) => (
          <div key={status} className="bg-zinc-900 rounded-2xl p-4">
            <h3 className={`font-semibold mb-3 pb-2 border-b ${statusColor(status)}`}>{status}</h3>
            <div className="space-y-3">
              {leads.filter((l) => l.status === status).map((lead) => (
                <div key={lead.id} className="bg-zinc-800 p-3 rounded-xl">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-white">{lead.name}</p>
                      <p className="text-xs text-zinc-400">{lead.venue} · {lead.channel}</p>
                      <p className="text-teal-400 text-sm font-semibold mt-1">{formatCurrency(lead.value)}</p>
                    </div>
                    <button onClick={() => remove(lead.id)} className="text-zinc-500 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <Select
                    value={lead.status}
                    onChange={(e) => update(lead.id, { status: e.target.value as LeadStatus })}
                    className="mt-2 text-xs py-1"
                  >
                    {STATUS_KEYS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>
              ))}
              {leads.filter((l) => l.status === status).length === 0 && (
                <p className="text-zinc-600 text-sm italic">Vazio</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <Modal title="Novo Lead" onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input placeholder="Nome do contratante" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input placeholder="Local / Evento" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option>WhatsApp</option>
              <option>Email</option>
              <option>Instagram</option>
              <option>Referral</option>
            </Select>
            <Input type="number" placeholder="Valor (R$)" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
            <Input type="date" value={form.last_contact} onChange={(e) => setForm({ ...form, last_contact: e.target.value })} />
            <PrimaryButton type="submit" className="w-full">Salvar</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  );
};
