import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase não configurado. Defina SUPABASE_URL e SUPABASE_ANON_KEY em .env.local (veja README.md).'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
