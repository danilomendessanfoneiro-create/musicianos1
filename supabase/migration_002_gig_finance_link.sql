-- ============================================================================
-- MIGRAÇÃO 002 — Só rode isto se você JÁ tinha executado o schema.sql antes
-- (ou seja, já tem as tabelas gigs/transactions criadas no seu Supabase).
-- Se está criando o projeto do zero, ignore este arquivo: o schema.sql
-- principal já vem com essas colunas.
-- ============================================================================

alter table gigs add column if not exists fee_received boolean not null default false;
alter table gigs add column if not exists cost_paid boolean not null default false;

alter table transactions add column if not exists gig_id uuid references gigs (id) on delete cascade;
alter table transactions add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_source_check'
  ) then
    alter table transactions add constraint transactions_source_check
      check (source in ('manual', 'gig_fee', 'gig_cost'));
  end if;
end $$;

create index if not exists transactions_gig_id_idx on transactions (gig_id);
