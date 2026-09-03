import React from 'react';
import { useSupabaseTable } from '../lib/useSupabaseTable';
import { Gig, Lead, Transaction, LeadStatus } from '../types';
import { Card, formatCurrency } from '../components/ui';

const statusColor = (status: LeadStatus) => {
  switch (status) {
    case LeadStatus.NEW: return 'bg-yellow-600';
    case LeadStatus.NEGOTIATING: return 'bg-blue-600';
    case LeadStatus.BOOKED: return 'bg-green-600';
    case LeadStatus.LOST: return 'bg-red-600';
    default: return 'bg-zinc-500';
  }
};

export const Dashboard: React.FC = () => {
  const { rows: gigs } = useSupabaseTable<Gig>('gigs', 'date', true);
  const { rows: leads } = useSupabaseTable<Lead>('leads');
  const { rows: finance } = useSupabaseTable<Transaction>('transactions');

  const negotiatingLeads = leads.filter((l) => l.status === LeadStatus.NEGOTIATING).length;
  const totalIncome = finance.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = finance.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netBalance = totalIncome - totalExpense;

  const upcomingGigs = gigs
    .filter((g) => new Date(g.date) >= new Date(new Date().toDateString()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-extrabold text-white mb-6 border-b border-indigo-500 pb-2">Visão Geral</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card title="Shows Cadastrados" value={gigs.length} color="border-indigo-500" />
        <Card title="Leads em Negociação" value={negotiatingLeads} color="border-yellow-500" />
        <Card title="Receita Bruta (Total)" value={formatCurrency(totalIncome)} color="border-green-500" />
        <Card title="Saldo Líquido" value={formatCurrency(netBalance)} color={netBalance >= 0 ? 'border-teal-500' : 'border-red-500'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-zinc-900 p-6 rounded-2xl shadow-2xl">
          <h3 className="text-xl font-semibold mb-4 text-indigo-300">Próximos Shows</h3>
          {upcomingGigs.length > 0 ? (
            <ul className="space-y-3">
              {upcomingGigs.map((gig) => (
                <li key={gig.id} className="flex justify-between items-center p-4 bg-zinc-800 rounded-xl shadow-md">
                  <div>
                    <p className="text-lg font-medium">{new Date(gig.date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                    <p className="text-zinc-400 text-sm">{gig.venue} em {gig.city}</p>
                  </div>
                  <span className="text-teal-400 font-bold">{formatCurrency(gig.fee)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-zinc-500 italic">Nenhum show agendado em breve.</p>
          )}
        </div>

        <div className="bg-zinc-900 p-6 rounded-2xl shadow-2xl">
          <h3 className="text-xl font-semibold mb-4 text-yellow-300">Funil de Leads ({leads.length})</h3>
          <ul className="space-y-3">
            {Object.values(LeadStatus).map((status) => {
              const count = leads.filter((l) => l.status === status).length;
              return (
                <li key={status} className="flex justify-between items-center p-3 bg-zinc-800 rounded-lg">
                  <span>{status}</span>
                  <span className={`px-3 py-1 text-xs font-bold text-white rounded-full ${statusColor(status)}`}>{count}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};
