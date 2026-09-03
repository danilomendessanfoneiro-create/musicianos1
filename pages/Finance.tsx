import React, { useState } from 'react';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useSupabaseTable } from '../lib/useSupabaseTable';
import { Transaction } from '../types';
import { Modal, Input, Select, PrimaryButton, formatCurrency } from '../components/ui';

export const Finance: React.FC = () => {
  const { rows: transactions, insert, remove } = useSupabaseTable<Transaction>('transactions', 'date', false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().substring(0, 10), description: '', amount: 0, type: 'income' as 'income' | 'expense', category: '',
  });

  const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await insert(form as Partial<Transaction>);
    setIsModalOpen(false);
    setForm({ date: new Date().toISOString().substring(0, 10), description: '', amount: 0, type: 'income', category: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-indigo-500 pb-2">
        <h2 className="text-3xl font-extrabold text-white">Finanças</h2>
        <PrimaryButton onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
          <PlusCircle className="w-4 h-4" /> Novo Lançamento
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-6 bg-zinc-800 rounded-2xl border-t-4 border-green-500">
          <h3 className="text-sm text-zinc-400">Receitas</h3>
          <p className="text-2xl font-bold text-green-400">{formatCurrency(income)}</p>
        </div>
        <div className="p-6 bg-zinc-800 rounded-2xl border-t-4 border-red-500">
          <h3 className="text-sm text-zinc-400">Despesas</h3>
          <p className="text-2xl font-bold text-red-400">{formatCurrency(expense)}</p>
        </div>
        <div className="p-6 bg-zinc-800 rounded-2xl border-t-4 border-teal-500">
          <h3 className="text-sm text-zinc-400">Saldo</h3>
          <p className="text-2xl font-bold text-teal-400">{formatCurrency(income - expense)}</p>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-800 text-zinc-400 text-sm">
            <tr><th className="p-4">Data</th><th className="p-4">Descrição</th><th className="p-4">Categoria</th><th className="p-4">Valor</th><th className="p-4"></th></tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-t border-zinc-800">
                <td className="p-4">{new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="p-4">{t.description}</td>
                <td className="p-4 text-zinc-400">{t.category}</td>
                <td className={`p-4 font-semibold ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                  {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                </td>
                <td className="p-4">
                  <button onClick={() => remove(t.id)} className="text-zinc-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-zinc-500 italic">Nenhum lançamento.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal title="Novo Lançamento" onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'income' | 'expense' })}>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
            </Select>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <Input placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
            <Input placeholder="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Input type="number" placeholder="Valor (R$)" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            <PrimaryButton type="submit" className="w-full">Salvar</PrimaryButton>
          </form>
        </Modal>
      )}
    </div>
  );
};
