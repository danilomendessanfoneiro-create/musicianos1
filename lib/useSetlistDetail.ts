import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Setlist, SetlistItem, SetlistShare, Song } from '../types';

export function useSetlistDetail(setlistId: string) {
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [items, setItems] = useState<SetlistItem[]>([]);
  const [shares, setShares] = useState<SetlistShare[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ data: setlistData }, { data: itemsData }, { data: sharesData }] = await Promise.all([
      supabase.from('setlists').select('*').eq('id', setlistId).single(),
      supabase
        .from('setlist_items')
        .select('*, song:songs(*)')
        .eq('setlist_id', setlistId)
        .order('position', { ascending: true }),
      supabase.from('setlist_shares').select('*').eq('setlist_id', setlistId),
    ]);
    setSetlist((setlistData as Setlist) || null);
    setItems((itemsData as unknown as SetlistItem[]) || []);
    setShares((sharesData as SetlistShare[]) || []);
    setLoading(false);
  }, [setlistId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addSong = async (song: Song) => {
    const position = items.length;
    const { data } = await supabase
      .from('setlist_items')
      .insert({
        setlist_id: setlistId,
        song_id: song.id,
        position,
        performance_key: song.original_key,
      })
      .select('*, song:songs(*)')
      .single();
    if (data) setItems((prev) => [...prev, data as unknown as SetlistItem]);
  };

  const removeItem = async (itemId: string) => {
    await supabase.from('setlist_items').delete().eq('id', itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const updateItem = async (itemId: string, patch: Partial<SetlistItem>) => {
    const { data } = await supabase.from('setlist_items').update(patch).eq('id', itemId).select('*, song:songs(*)').single();
    if (data) setItems((prev) => prev.map((i) => (i.id === itemId ? (data as unknown as SetlistItem) : i)));
  };

  const reorder = async (fromIndex: number, toIndex: number) => {
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setItems(next);
    await Promise.all(next.map((item, idx) => supabase.from('setlist_items').update({ position: idx }).eq('id', item.id)));
  };

  const createShareLink = async (): Promise<string | null> => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;
    const { data, error } = await supabase
      .from('setlist_shares')
      .insert({ setlist_id: setlistId, created_by: userData.user.id })
      .select()
      .single();
    if (error || !data) return null;
    setShares((prev) => [...prev, data as SetlistShare]);
    return (data as SetlistShare).share_token;
  };

  const revokeShare = async (shareId: string) => {
    await supabase.from('setlist_shares').delete().eq('id', shareId);
    setShares((prev) => prev.filter((s) => s.id !== shareId));
  };

  return { setlist, items, shares, loading, addSong, removeItem, updateItem, reorder, createShareLink, revokeShare, refresh };
}
