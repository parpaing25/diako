-- ============================================================================
-- 0017 — JOURNAL DES ERREURS VUES CHEZ LES UTILISATEURS
--
-- Une erreur qui ne se produit que sur un Android de 2019, à Toliara, en 3G,
-- n'apparaît JAMAIS dans la console du développeur. Sans trace, elle n'existe
-- pas — et elle fait pourtant fuir un utilisateur sur deux.
--
-- ⚠ ÉCRITURE OUVERTE, LECTURE FERMÉE. N'importe qui peut déposer une erreur —
--   c'est le principe même : le visiteur anonyme est justement celui qu'on ne
--   voit pas. Mais PERSONNE ne peut relire le journal hors de l'administration.
--   Sans cette asymétrie, la table deviendrait un canal de fuite : il suffirait
--   d'y lire les chemins et les navigateurs des autres.
--
-- Le client masque déjà courriels, téléphones et identifiants avant l'envoi ;
-- le garde-fou ci-dessous suppose qu'un client peut mentir.
-- ============================================================================

create table if not exists public.journal_erreurs (
  id         bigserial primary key,
  message    text not null,
  source     text,
  ligne      integer,
  pile       text,
  chemin     text,
  navigateur text,
  reseau     text,
  created_at timestamptz not null default now()
);

create index if not exists journal_erreurs_date_idx on public.journal_erreurs(created_at desc);
-- Regrouper par message est LA requête de diagnostic (« qu'est-ce qui casse le
-- plus »). Sans cet index, elle scanne toute la table.
create index if not exists journal_erreurs_msg_idx on public.journal_erreurs(left(message, 80));

alter table public.journal_erreurs enable row level security;

drop policy if exists journal_erreurs_deposer on public.journal_erreurs;
drop policy if exists journal_erreurs_lire    on public.journal_erreurs;
create policy journal_erreurs_deposer on public.journal_erreurs for insert with check (true);
create policy journal_erreurs_lire    on public.journal_erreurs for select using (public.is_staff());

revoke select, update, delete on public.journal_erreurs from anon, authenticated;
grant  insert on public.journal_erreurs to anon, authenticated;

-- Anti-inondation : une boucle de rendu peut produire des milliers de lignes
-- en une minute. On laisse tomber SILENCIEUSEMENT — un outil de diagnostic ne
-- doit jamais faire apparaître une erreur à l'utilisateur.
create or replace function public.limiter_journal_erreurs()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_recentes int;
begin
  select count(*) into v_recentes from public.journal_erreurs
   where created_at > now() - interval '1 minute';
  if v_recentes > 200 then return null; end if;
  return new;
end $$;

drop trigger if exists trg_limiter_journal on public.journal_erreurs;
create trigger trg_limiter_journal before insert on public.journal_erreurs
  for each row execute function public.limiter_journal_erreurs();

revoke execute on function public.limiter_journal_erreurs() from public, anon, authenticated;

-- Trente jours. Au-delà, une erreur n'apprend plus rien et la table gonfle
-- l'egress des sauvegardes.
create or replace function public.purger_journal_erreurs()
returns integer language sql security definer set search_path = public as $$
  with s as (delete from public.journal_erreurs
              where created_at < now() - interval '30 days' returning 1)
  select count(*)::int from s
$$;

revoke execute on function public.purger_journal_erreurs() from public, anon, authenticated;
