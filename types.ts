export type ViewState =
  | 'dashboard'
  | 'crm'
  | 'gigs'
  | 'finance'
  | 'projects'
  | 'repertoire'
  | 'setlists'
  | 'audio-analyzer';

export enum LeadStatus {
  NEW = 'Novo',
  NEGOTIATING = 'Negociação',
  BOOKED = 'Fechado',
  LOST = 'Perdido',
}

export interface Profile {
  id: string;
  name: string;
  role: 'user' | 'admin';
}

export interface Lead {
  id: string;
  user_id: string;
  name: string;
  venue: string;
  channel: string;
  value: number;
  status: LeadStatus;
  last_contact: string;
}

export interface Gig {
  id: string;
  user_id: string;
  date: string;
  city: string;
  venue: string;
  event_type: string;
  fee: number;
  cost: number;
  notes: string;
  fee_received: boolean;
  cost_paid: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  gig_id?: string | null;
  source?: 'manual' | 'gig_fee' | 'gig_cost';
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  due_date: string | null;
  cost: number;
  status: 'planning' | 'in-progress' | 'completed' | 'on-hold';
  description: string;
}

// ------------------- Repertório / Cifras -------------------

export interface Song {
  id: string;
  user_id: string;
  title: string;
  artist: string;
  original_key: string;
  bpm: number | null;
  tags: string[];
  body_chordpro: string; // letra com acordes no formato [C]texto
  created_at: string;
  updated_at: string;
}

export interface Setlist {
  id: string;
  user_id: string;
  gig_id: string | null;
  title: string;
  notes: string;
  created_at: string;
}

export interface SetlistItem {
  id: string;
  setlist_id: string;
  song_id: string;
  position: number;
  performance_key: string;
  notes: string;
  // preenchido via join no client:
  song?: Song;
}

export interface SetlistShare {
  id: string;
  setlist_id: string;
  share_token: string;
  created_by: string;
  expires_at: string | null;
  created_at: string;
}

export interface SharedSetlistRow {
  setlist_title: string;
  setlist_notes: string;
  gig_date: string | null;
  gig_venue: string | null;
  gig_city: string | null;
  owner_name: string;
  song_title: string;
  song_artist: string;
  performance_key: string;
  original_key: string;
  body_chordpro: string;
  position: number;
  item_notes: string;
}
