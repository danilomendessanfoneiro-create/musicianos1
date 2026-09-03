import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook genérico para uma tabela "dona = usuário logado" (leads, gigs, transactions, projects, songs, setlists).
 * Faz select automático filtrado por user_id (via RLS) e expõe helpers de insert/update/delete otimistas.
 */
export function useSupabaseTable<T extends { id: string }>(
  table: string,
  orderBy: string = 'created_at',
  ascending = false
) {
  const { session } = useAuth();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderBy, { ascending });
    if (!error && data) setRows(data as T[]);
    setLoading(false);
  }, [table, orderBy, ascending, session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const insert = async (row: Partial<T>) => {
    if (!session) return null;
    const { data, error } = await supabase
      .from(table)
      .insert({ ...row, user_id: session.user.id })
      .select()
      .single();
    if (!error && data) setRows((prev) => [data as T, ...prev]);
    return error ? null : (data as T);
  };

  const update = async (id: string, patch: Partial<T>) => {
    const { data, error } = await supabase.from(table).update(patch as any).eq('id', id).select().single();
    if (!error && data) setRows((prev) => prev.map((r) => (r.id === id ? (data as T) : r)));
    return error ? null : (data as T);
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) setRows((prev) => prev.filter((r) => r.id !== id));
    return !error;
  };

  return { rows, loading, insert, update, remove, refresh };
}
