import React, { useState } from 'react';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useSupabaseTable } from '../lib/useSupabaseTable';
import { Project } from '../types';
import { Modal, Input, Select, Textarea, PrimaryButton, formatCurrency } from '../components/ui';

const STATUS_LABEL: Record<Project['status'], string> = {
  planning: 'Planejamento',
  'in-progress': 'Em andamento',
  completed: 'Concluído',
  'on-hold': 'Pausado',
};

export const Projects: React.FC = () => {
  const { rows: projects, insert, update, remove } = useSupabaseTable<Project>('projects', 'due_date', true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', due_date: '', cost: 0, description: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await insert({ ...form, status: 'planning' } as Partial<Project>);
    setIsModalOpen(false);
    setForm({ title: '', due_date: '', cost: 0, description: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-indigo-500 pb-2">
        <h2 className="text-3xl font-extrabold text-white">Projetos</h2>
        <PrimaryButton onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
          <PlusCircle className="w-4 h-4" /> Novo Projeto
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <div key={p.id} className="bg-zinc-900 p-5 rounded-2xl">
            <div className="flex justify-between items-start">
              <h3 className="font-semibold text-white">{p.title}</h3>
              <button onClick={() => remove(p.id)} className="text-zinc-500 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <p className="text-zinc-400 text-sm mt-1">{p.description}</p>
            <p className="text-teal-400 text-sm font-semibold mt-2">{formatCurrency(p.cost)}</p>
            {p.due_date && <p className="text-zinc-500 text-xs mt-1">Prazo: {new Date(p.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>}
            <Select value={p.status} onChange={(e) => update(p.id, { status: e.target.value as Project['status'] })} className="mt-3 text-sm">
              {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </div>
        ))}
        {projects.length === 0 && <p className="text-zinc-500 italic">Nenhum projeto cadastrado.</p>}
      </div>

      {isModalOpen && (
        <Modal title="Novo Projeto" onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <Input type="number" placeholder="Custo estimado (R$)" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
            <Textarea placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            <PrimaryButton type="submit" className="w-full">Salvar</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  );
};
