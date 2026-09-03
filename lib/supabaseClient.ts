import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.SUPABASE_URL as string) || '';
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY as string) || '';

export const isSupabaseConfigured =
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  !supabaseUrl.includes('SEU_PROJETO') &&
  !supabaseAnonKey.includes('SUA_CHAVE');

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase não configurado. Defina SUPABASE_URL e SUPABASE_ANON_KEY (veja README.md).'
  );
}

// Usa uma URL válida como fallback só para o cliente não lançar erro na
// inicialização quando não configurado — index.tsx intercepta esse caso
// e mostra uma tela de instruções antes de qualquer chamada real ser feita.
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key'
);
