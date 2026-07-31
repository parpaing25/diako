-- ============================================================================
-- DIAKO — migration 0001 : le socle (Lot 0)
--
-- RÈGLE DU PROJET : le schéma a UNE seule source de vérité, ce dossier
-- supabase/migrations/, numéroté et rejoué dans l'ordre. Jamais de SQL collé
-- à la main dans l'éditeur. Fonenako a payé cette leçon en production avec
-- « relation public.pro_pages does not exist » alors que le code s'en servait.
--
-- Contenu : profils, rôles, drapeaux applicatifs, audience anonyme,
--           fermeture des données personnelles.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
-- 1. PROFILS
-- ⚠ profiles.id = auth.users.id = auth.uid(). Il n'y a PAS de colonne user_id :
--   on filtre TOUJOURS par `id`. C'est le piège le plus récurrent du projet
--   frère.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  avatar_url    text,
  cover_url     text,
  bio           text,
  phone         text,
  home_place    text,                        -- remplacé par home_place_id au Lot 1
  language      text not null default 'fr',
  account_type  text not null default 'voyageur'
                  check (account_type in ('voyageur', 'pro')),
  verification  text not null default 'none'
                  check (verification in ('none', 'phone', 'documents', 'partner')),
  followers_count integer not null default 0,
  following_count integer not null default 0,
  posts_count     integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'Profil public. id = auth.uid() — filtrer par id, jamais par user_id.';

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Création automatique du profil à l'inscription.
-- Gère à la fois l'inscription par e-mail et les métadonnées Google
-- (full_name / name / avatar_url / picture).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    )), ''),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  -- Un profil qui rate ne doit JAMAIS empêcher une inscription.
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RÔLES — source de vérité UNIQUE des droits.
-- Fonenako fait cohabiter profiles.role (plan d'abonnement) ET user_roles
-- (droits admin) : deux systèmes concurrents. On ne rejoue pas cette erreur.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role    text not null check (role in ('moderateur', 'admin')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
     where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
     where user_id = (select auth.uid()) and role in ('admin', 'moderateur')
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ANTI-ESCALADE DE PRIVILÈGES
-- Un membre ne peut ni s'auto-vérifier, ni changer son type de compte en
-- douce vers un statut à valeur commerciale.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.prevent_profile_escalation()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Les RPC SECURITY DEFINER (postgres) et le service_role passent librement.
  if current_user <> 'authenticated' then return new; end if;
  if public.is_admin() then return new; end if;

  if new.verification is distinct from old.verification then
    raise exception 'Le statut de verification ne peut pas etre modifie ici.';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_no_escalation on public.profiles;
create trigger trg_profiles_no_escalation before update on public.profiles
  for each row execute function public.prevent_profile_escalation();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. DRAPEAUX APPLICATIFS — activer une fonctionnalité SANS redéployer.
-- Motif repris de Fonenako (app_flags), très utile pour ouvrir Google/Facebook
-- le jour où les identifiants OAuth sont configurés.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.app_flags (
  cle    text primary key,
  actif  boolean not null default false,
  maj    timestamptz not null default now()
);

insert into public.app_flags (cle, actif) values
  ('google_login', false),
  ('facebook_login', false),
  ('signup_open', true)
on conflict (cle) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. AUDIENCE ANONYME — aucune donnée personnelle, INSERT seul.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.page_views (
  id         bigserial primary key,
  path       text not null,
  ref        text,
  sid        text,
  created_at timestamptz not null default now(),
  constraint page_views_path_len check (char_length(path) < 200),
  constraint page_views_ref_len  check (ref is null or char_length(ref) < 200),
  constraint page_views_sid_len  check (sid is null or char_length(sid) < 64)
);
create index if not exists page_views_created_idx on public.page_views(created_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles   enable row level security;
alter table public.user_roles enable row level security;
alter table public.app_flags  enable row level security;
alter table public.page_views enable row level security;

-- profiles : lecture publique du profil, écriture strictement personnelle.
-- auth.uid() est enveloppé dans un sous-SELECT, sinon l'authentification est
-- réévaluée LIGNE PAR LIGNE (leçon d'optimisation de Fonenako).
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_insert on public.profiles;
create policy profiles_read   on public.profiles for select using (true);
create policy profiles_update on public.profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert
  with check (id = (select auth.uid()));

-- user_roles : chacun voit les siens, seul un admin écrit.
drop policy if exists user_roles_read  on public.user_roles;
drop policy if exists user_roles_write on public.user_roles;
create policy user_roles_read  on public.user_roles for select
  using (user_id = (select auth.uid()) or public.is_admin());
create policy user_roles_write on public.user_roles for all
  using (public.is_admin()) with check (public.is_admin());

-- app_flags : lecture publique (le client doit savoir si Google est ouvert).
drop policy if exists app_flags_read  on public.app_flags;
drop policy if exists app_flags_write on public.app_flags;
create policy app_flags_read  on public.app_flags for select using (true);
create policy app_flags_write on public.app_flags for all
  using (public.is_admin()) with check (public.is_admin());

-- page_views : on écrit, on ne lit jamais (sauf admin).
drop policy if exists page_views_insert on public.page_views;
drop policy if exists page_views_read   on public.page_views;
create policy page_views_insert on public.page_views for insert with check (true);
create policy page_views_read   on public.page_views for select using (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 7. FERMETURE DES DONNÉES PERSONNELLES
-- ⚠ LEÇON TECHNIQUE MAJEURE DU PROJET FRÈRE : `revoke select (colonne)` NE
--   FERME RIEN, parce que Supabase pose un GRANT au niveau TABLE que le revoke
--   colonne n'annule pas. La seule méthode qui marche est : REVOKE sur la
--   table, puis GRANT colonne par colonne.
--
-- CONSÉQUENCE PERMANENTE : tout select('*') anonyme renvoie 401. Il faut des
-- listes de colonnes explicites PARTOUT, et chaque nouvelle colonne exige un
-- GRANT explicite ajouté ici.
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  c record;
  sensibles text[] := array['email', 'phone'];
begin
  revoke select on public.profiles from anon;
  for c in
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and not (column_name = any (sensibles))
  loop
    execute format('grant select (%I) on public.profiles to anon', c.column_name);
  end loop;
end $$;

-- Aucune écriture directe pour un visiteur non connecté, hors audience.
revoke insert, update, delete on public.profiles   from anon;
revoke all on public.user_roles from anon;
grant insert on public.page_views to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. DURCISSEMENT — les fonctions trigger ne sont pas appelables par le client.
-- ────────────────────────────────────────────────────────────────────────────
revoke execute on function public.touch_updated_at()            from anon, authenticated;
revoke execute on function public.prevent_profile_escalation()  from anon, authenticated;
revoke execute on function public.handle_new_user()             from anon, authenticated;
grant  execute on function public.is_admin()                    to authenticated;
grant  execute on function public.is_staff()                    to authenticated;
