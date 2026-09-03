-- ============================================================================
-- MUSICIANOS — Schema do Supabase (Postgres)
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.
-- ============================================================================

-- Extensão para gerar tokens de compartilhamento
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- PERFIS (1 perfil por usuário autenticado, criado automaticamente no signup)
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Músico',
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ----------------------------------------------------------------------------
-- CRM — Leads
-- ----------------------------------------------------------------------------
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  venue text not null default '',
  channel text not null default 'WhatsApp',
  value numeric not null default 0,
  status text not null default 'Novo',
  last_contact date not null default current_date,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SHOWS (Gigs)
-- ----------------------------------------------------------------------------
create table if not exists gigs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  city text not null default '',
  venue text not null default '',
  event_type text not null default '',
  fee numeric not null default 0,
  cost numeric not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- FINANÇAS
-- ----------------------------------------------------------------------------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  description text not null default '',
  amount numeric not null default 0,
  type text not null check (type in ('income', 'expense')),
  category text not null default '',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PROJETOS
-- ----------------------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  due_date date,
  cost numeric not null default 0,
  status text not null default 'planning' check (status in ('planning', 'in-progress', 'completed', 'on-hold')),
  description text not null default '',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- REPERTÓRIO — Músicas/Cifras (conteúdo cadastrado pelo próprio músico)
-- body_chordpro guarda letra + acordes no formato [C]texto (padrão ChordPro simplificado)
-- ----------------------------------------------------------------------------
create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  artist text not null default '',
  original_key text not null default 'C',
  bpm integer,
  tags text[] not null default '{}',
  body_chordpro text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists songs_user_id_idx on songs (user_id);
create index if not exists songs_title_search_idx on songs using gin (to_tsvector('portuguese', title || ' ' || artist));

-- ----------------------------------------------------------------------------
-- SETLISTS — Repertório organizado para um show específico
-- Pode (opcionalmente) estar ligado a um Gig
-- ----------------------------------------------------------------------------
create table if not exists setlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gig_id uuid references gigs (id) on delete set null,
  title text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists setlist_items (
  id uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references setlists (id) on delete cascade,
  song_id uuid not null references songs (id) on delete cascade,
  position integer not null default 0,
  performance_key text not null default 'C', -- tom escolhido para ESTE show (pode ser != original_key)
  notes text not null default ''
);

-- ----------------------------------------------------------------------------
-- COMPARTILHAMENTO — link público (sem login) para freelancers
-- share_token é o que vai na URL: /s/<share_token>
-- ----------------------------------------------------------------------------
create table if not exists setlist_shares (
  id uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references setlists (id) on delete cascade,
  share_token text not null unique default encode(gen_random_bytes(9), 'base64'),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz, -- null = nunca expira
  created_at timestamptz not null default now()
);

-- limpa caracteres problemáticos de URL no token gerado por default
create or replace function clean_share_token()
returns trigger as $$
begin
  new.share_token := regexp_replace(new.share_token, '[^a-zA-Z0-9]', '', 'g');
  return new;
end;
$$ language plpgsql;

drop trigger if exists clean_share_token_trigger on setlist_shares;
create trigger clean_share_token_trigger
  before insert on setlist_shares
  for each row execute procedure clean_share_token();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table profiles enable row level security;
alter table leads enable row level security;
alter table gigs enable row level security;
alter table transactions enable row level security;
alter table projects enable row level security;
alter table songs enable row level security;
alter table setlists enable row level security;
alter table setlist_items enable row level security;
alter table setlist_shares enable row level security;

-- Perfis: qualquer usuário logado pode ver perfis (nomes), só o dono edita o seu
create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- Tabelas simples "dono só vê o seu": leads, gigs, transactions, projects, songs, setlists
do $$
declare
  t text;
begin
  foreach t in array array['leads', 'gigs', 'transactions', 'projects', 'songs', 'setlists']
  loop
    execute format('create policy "%1$s_owner_all" on %1$s for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;

-- setlist_items: acesso segue o dono do setlist pai
create policy "setlist_items_owner_all" on setlist_items for all
  using (exists (select 1 from setlists s where s.id = setlist_id and s.user_id = auth.uid()))
  with check (exists (select 1 from setlists s where s.id = setlist_id and s.user_id = auth.uid()));

-- setlist_shares: só o dono do setlist cria/gerencia o link
create policy "setlist_shares_owner_all" on setlist_shares for all
  using (exists (select 1 from setlists s where s.id = setlist_id and s.user_id = auth.uid()))
  with check (exists (select 1 from setlists s where s.id = setlist_id and s.user_id = auth.uid()));

-- ============================================================================
-- ACESSO PÚBLICO DE LEITURA PARA QUEM TEM O LINK (freelancer sem login)
-- Feito via função SECURITY DEFINER para não expor todo o resto dos dados.
-- ============================================================================
create or replace function get_shared_setlist(token text)
returns table (
  setlist_title text,
  setlist_notes text,
  gig_date date,
  gig_venue text,
  gig_city text,
  owner_name text,
  song_title text,
  song_artist text,
  performance_key text,
  original_key text,
  body_chordpro text,
  position integer,
  item_notes text
)
language sql
security definer
set search_path = public
as $$
  select
    st.title, st.notes,
    g.date, g.venue, g.city,
    p.name,
    so.title, so.artist,
    si.performance_key, so.original_key, so.body_chordpro,
    si.position, si.notes
  from setlist_shares ss
  join setlists st on st.id = ss.setlist_id
  left join gigs g on g.id = st.gig_id
  join profiles p on p.id = st.user_id
  join setlist_items si on si.setlist_id = st.id
  join songs so on so.id = si.song_id
  where ss.share_token = token
    and (ss.expires_at is null or ss.expires_at > now())
  order by si.position asc;
$$;

grant execute on function get_shared_setlist(text) to anon, authenticated;
