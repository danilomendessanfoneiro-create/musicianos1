import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { localSupabase } from './localBackend';

const supabaseUrl = (process.env.SUPABASE_URL as string) || '';
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY as string) || '';

export const isSupabaseConfigured =
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  !supabaseUrl.includes('SEU_PROJETO') &&
  !supabaseAnonKey.includes('SUA_CHAVE');

/**
 * Se o Supabase estiver configurado, usa o cliente real.
 * Caso contrário, usa um backend local (localStorage) com a mesma "forma"
 * de API (auth.*, from().*, rpc()) — assim nenhuma tela precisa saber qual
 * dos dois está em uso. Migrar pro Supabase de verdade depois é só
 * preencher o .env.local / as env vars do Vercel.
 */
export const supabase: SupabaseClient | typeof localSupabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : localSupabase;
