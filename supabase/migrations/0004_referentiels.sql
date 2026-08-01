-- ============================================================================
-- 0004 — RÉFÉRENTIELS : LIEUX, PLATS, ÉQUIPEMENTS
--
-- C'est le squelette de Diako. Sans lui, « un hôtel à Majunga » et « où manger
-- du ravitoto » sont impossibles : les 28 publications actuelles rangent leur
-- lieu dans une colonne de TEXTE LIBRE (posts.place), donc « Majunga » et
-- « Mahajanga » sont deux lieux différents pour la machine, et personne n'écrit
-- « ravitoto sy henakisoa » de la même façon.
--
-- Trois décisions assumées, différentes du TDR :
--
--  ① PAS de ltree ni de earthdistance. Le TDR les prévoyait pour l'arbre des
--    lieux et la recherche géographique. Sur ~200 lignes, un index GiST est de
--    la cérémonie : parent_id et un tri par distance calculée à la volée font
--    le travail. On les ajoutera le jour où le référentiel dépassera 10 000
--    lieux — pas avant.
--
--  ② unaccent + pg_trgm, eux, sont indispensables et non négociables. Le
--    premier fait que « Tuléar » trouve Toliara ; le second que « ravitotoo »
--    (faute de frappe) trouve quand même ravitoto.
--
--  ③ La forme normalisée est une colonne CALCULÉE (generated always as stored),
--    pas un champ entretenu par déclencheur. Une colonne calculée ne peut pas
--    diverger de sa source ; un déclencheur oublié sur une mise à jour, si.
--
-- Conventions du projet respectées : aucun CREATE TYPE (text + CHECK), montants
-- en bigint d'ariary entiers, RLS avec sous-SELECT (select auth.uid()).
-- ============================================================================

create extension if not exists unaccent  with schema extensions;
create extension if not exists pg_trgm   with schema extensions;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. NORMALISATION
--
-- « Île Sainte-Marie » et « ile sainte marie » doivent donner la même clé.
-- La fonction est déclarée IMMUTABLE — c'est la condition pour s'en servir
-- dans une colonne calculée et dans un index. Elle le mérite : elle ne lit
-- aucune table et ne dépend d'aucun réglage de session.
--
-- ⚠ Tout est qualifié en dur (extensions.unaccent, dictionnaire nommé
--   explicitement). La forme à un argument, unaccent(text), est seulement
--   STABLE : elle résout le dictionnaire via search_path, donc PostgreSQL la
--   refuse dans un index. La forme à deux arguments est immuable.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.dk_norm(t text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))),
    '[^a-z0-9]+', ' ', 'g'))
$$;

comment on function public.dk_norm(text) is
  'Forme comparable d''un libellé : sans accent, en minuscules, ponctuation réduite à des espaces. Sert aux colonnes calculées et aux index de recherche.';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LIEUX
--
-- Un lieu touristique malgache est une ZONE, pas un point : « Ampefy » désigne
-- le bourg, le lac Itasy et les geysers d'Analavory, sur une dizaine de
-- kilomètres. D'où radius_km, qui évite de placer un hôtel « hors de la ville »
-- parce qu'il est à 4 km du centre.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.places (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  name_fr        text not null,
  name_mg        text,
  kind           text not null check (kind in (
                   'pays','region','axe','district','ville','commune',
                   'zone_touristique','quartier','plage','ile','parc','site')),
  parent_id      uuid references public.places(id) on delete set null,
  lat            double precision,
  lng            double precision,
  radius_km      numeric(5,1) not null default 5,
  region         text,
  axe            text check (axe in (
                   'rn7-sud','nord','est','ouest-baobabs','sava','sud-est',
                   'hautes-terres','extreme-sud')),
  is_touristique boolean not null default false,
  summary        text,
  why_go         text[],
  nb_pages       integer not null default 0,
  nb_posts       integer not null default 0,
  created_at     timestamptz not null default now(),

  -- Clé de recherche : le nom français ET le nom malgache dans le même champ,
  -- pour qu'une seule comparaison couvre « Tuléar » et « Toliara ».
  norm text generated always as (
    public.dk_norm(name_fr) || ' ' || public.dk_norm(coalesce(name_mg, ''))
  ) stored
);

create index if not exists places_parent_idx on public.places(parent_id);
create index if not exists places_region_idx  on public.places(region) where region is not null;
create index if not exists places_touris_idx  on public.places(is_touristique) where is_touristique;
create index if not exists places_norm_idx    on public.places using gin (norm extensions.gin_trgm_ops);

comment on table public.places is
  'Référentiel des lieux. Un lieu est une zone (radius_km), pas un point : Ampefy couvre le bourg, le lac Itasy et Analavory.';

-- Les alias sont ce qui fait vraiment marcher la recherche. Un Malgache écrit
-- « Majunga », l'orthographe officielle est « Mahajanga », et les deux doivent
-- mener au même endroit.
create table if not exists public.place_aliases (
  place_id uuid not null references public.places(id) on delete cascade,
  alias    text not null,
  norm     text generated always as (public.dk_norm(alias)) stored,
  primary key (place_id, alias)
);

create index if not exists place_aliases_norm_idx
  on public.place_aliases using gin (norm extensions.gin_trgm_ops);

-- « Quand partir ? » est la première question d'un voyageur étranger, et la
-- réponse change du tout au tout selon l'endroit : les baleines à Sainte-Marie
-- en juillet, les cyclones sur l'est en février.
create table if not exists public.place_seasons (
  place_id uuid not null references public.places(id) on delete cascade,
  month    smallint not null check (month between 1 and 12),
  rating   text not null check (rating in ('ideale','correcte','deconseillee')),
  reason   text,
  primary key (place_id, month)
);

-- « Comment y aller ? » vient juste après. Les durées sont les durées RÉELLES :
-- 250 km de piste, c'est six heures, pas deux heures et demie.
create table if not exists public.place_access (
  id              uuid primary key default gen_random_uuid(),
  place_id        uuid not null references public.places(id) on delete cascade,
  from_place_id   uuid not null references public.places(id) on delete cascade,
  mode            text not null check (mode in (
                    'goudron','piste','4x4','avion','bateau','pirogue','train')),
  distance_km     integer,
  duration_h      numeric(4,1),
  road_state      text,
  all_year        boolean not null default true,
  departure_point text,
  operators       text[],
  price_ar        bigint check (price_ar is null or price_ar >= 0)
);

create index if not exists place_access_place_idx on public.place_access(place_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. PLATS
--
-- La pièce maîtresse. « Où manger du ravitoto » n'a de sens que s'il existe un
-- terme canonique derrière lequel se rangent ravi-toto, ravitoto sy henakisoa,
-- ravitoto sy hena-kisoa, ravitoto au porc et feuilles de manioc pilées.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.dishes (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  name_fr          text not null,
  name_mg          text,
  family           text check (family in (
                     'laoka','grillade','soupe','riz','mofo','dessert',
                     'boisson','street-food','fruit-de-mer')),
  description      text,
  ingredients      text[],
  has_pork         boolean not null default false,
  has_beef         boolean not null default false,
  has_seafood      boolean not null default false,
  has_peanut       boolean not null default false,
  is_vegetarian    boolean not null default false,
  typical_place_id uuid references public.places(id) on delete set null,
  price_min_ar     bigint check (price_min_ar is null or price_min_ar >= 0),
  price_max_ar     bigint check (price_max_ar is null or price_max_ar >= 0),
  photo_url        text,
  spice_level      smallint check (spice_level between 0 and 3),
  nb_restaurants   integer not null default 0,
  created_at       timestamptz not null default now(),

  norm text generated always as (
    public.dk_norm(name_fr) || ' ' || public.dk_norm(coalesce(name_mg, ''))
  ) stored,

  constraint dishes_prix_coherent
    check (price_min_ar is null or price_max_ar is null or price_min_ar <= price_max_ar)
);

create index if not exists dishes_family_idx on public.dishes(family) where family is not null;
create index if not exists dishes_norm_idx   on public.dishes using gin (norm extensions.gin_trgm_ops);

comment on table public.dishes is
  'Référentiel des plats malgaches. Sans lui, la recherche par plat est impossible : personne n''écrit un plat de la même façon.';

create table if not exists public.dish_aliases (
  dish_id uuid not null references public.dishes(id) on delete cascade,
  alias   text not null,
  norm    text generated always as (public.dk_norm(alias)) stored,
  primary key (dish_id, alias)
);

create index if not exists dish_aliases_norm_idx
  on public.dish_aliases using gin (norm extensions.gin_trgm_ops);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ÉQUIPEMENTS
--
-- « Piscine » doit être une case cochée, jamais un mot noyé dans une
-- description : c'est la seule façon d'en faire un filtre. Le code est la clé
-- primaire — un équipement ne change pas d'identité, et ça rend les jointures
-- lisibles à l'œil nu.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.amenities (
  code       text primary key,
  label_fr   text not null,
  label_mg   text,
  icon       text,
  category   text not null check (category in (
               'confort','restauration','activite','acces','services','famille','pro')),
  applies_to text[] not null default array['hotel']::text[],
  rang       smallint not null default 100
);

comment on table public.amenities is
  'Équipements cochables. Remplace les listes codées en dur et les dizaines de colonnes booléennes.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RATTACHEMENT DES PUBLICATIONS À UN LIEU
--
-- posts.place restait du texte libre : la publication « Ampefy » et la
-- recherche « ampefy » ne se rencontraient jamais. On garde la colonne texte
-- (c'est ce que l'auteur a saisi, et ça reste affichable tel quel) et on ajoute
-- le rattachement au référentiel, qui est ce sur quoi on cherche.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.posts
  add column if not exists place_id uuid references public.places(id) on delete set null;

create index if not exists posts_place_idx on public.posts(place_id) where place_id is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS
--
-- Les référentiels sont un bien commun : tout le monde les lit, y compris un
-- visiteur non connecté — c'est la condition pour que la recherche marche avant
-- l'inscription, et pour que Google indexe les pages de destination. Seul un
-- administrateur écrit : ce sont des données éditoriales, pas du contenu
-- d'utilisateur.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.places        enable row level security;
alter table public.place_aliases enable row level security;
alter table public.place_seasons enable row level security;
alter table public.place_access  enable row level security;
alter table public.dishes        enable row level security;
alter table public.dish_aliases  enable row level security;
alter table public.amenities     enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'places','place_aliases','place_seasons','place_access',
    'dishes','dish_aliases','amenities'
  ] loop
    execute format('drop policy if exists %I_lecture on public.%I', t, t);
    execute format('drop policy if exists %I_admin   on public.%I', t, t);
    execute format('create policy %I_lecture on public.%I for select using (true)', t, t);
    execute format(
      'create policy %I_admin on public.%I for all using (public.is_admin()) with check (public.is_admin())',
      t, t);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RÉSOLUTION D'UN TERME DE RECHERCHE
--
-- Le cœur du dispositif. « majunga » doit rendre Mahajanga, « tulear » Toliara,
-- « ravitotoo » ravitoto. Trois niveaux, du plus sûr au plus permissif :
--   ① égalité exacte sur la forme normalisée (nom ou alias) → score 1
--   ② début de mot                                          → score 0,9
--   ③ ressemblance trigramme, pour absorber les fautes       → score = similarity
--
-- STABLE et non VOLATILE : PostgreSQL peut alors mémoriser le résultat dans une
-- même requête, ce qui compte quand l'autocomplétion tire à chaque frappe.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.resoudre_lieu(p_terme text, p_limite integer default 8)
returns table (id uuid, slug text, name_fr text, kind text, region text, score real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with t as (select public.dk_norm(p_terme) as q)
  select p.id, p.slug, p.name_fr, p.kind, p.region, max(s.score)::real as score
  from t
  cross join lateral (
    select p2.id as pid,
           case
             when p2.norm = t.q or p2.norm like t.q || ' %' then 1.0
             when p2.norm like t.q || '%' or p2.norm like '% ' || t.q || '%' then 0.9
             else similarity(p2.norm, t.q)
           end as score
    from public.places p2
    where t.q <> '' and (p2.norm % t.q or p2.norm like '%' || t.q || '%')
    union all
    select a.place_id,
           case
             when a.norm = t.q then 1.0
             when a.norm like t.q || '%' then 0.9
             else similarity(a.norm, t.q)
           end
    from public.place_aliases a
    where t.q <> '' and (a.norm % t.q or a.norm like '%' || t.q || '%')
  ) s
  join public.places p on p.id = s.pid
  group by p.id, p.slug, p.name_fr, p.kind, p.region
  having max(s.score) >= 0.3
  order by max(s.score) desc, p.is_touristique desc, p.nb_pages desc, p.name_fr
  limit least(greatest(coalesce(p_limite, 8), 1), 30)
$$;

create or replace function public.resoudre_plat(p_terme text, p_limite integer default 8)
returns table (id uuid, slug text, name_fr text, family text, score real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with t as (select public.dk_norm(p_terme) as q)
  select d.id, d.slug, d.name_fr, d.family, max(s.score)::real as score
  from t
  cross join lateral (
    select d2.id as did,
           case
             when d2.norm = t.q or d2.norm like t.q || ' %' then 1.0
             when d2.norm like t.q || '%' or d2.norm like '% ' || t.q || '%' then 0.9
             else similarity(d2.norm, t.q)
           end as score
    from public.dishes d2
    where t.q <> '' and (d2.norm % t.q or d2.norm like '%' || t.q || '%')
    union all
    select a.dish_id,
           case
             when a.norm = t.q then 1.0
             when a.norm like t.q || '%' then 0.9
             else similarity(a.norm, t.q)
           end
    from public.dish_aliases a
    where t.q <> '' and (a.norm % t.q or a.norm like '%' || t.q || '%')
  ) s
  join public.dishes d on d.id = s.did
  group by d.id, d.slug, d.name_fr, d.family
  having max(s.score) >= 0.3
  order by max(s.score) desc, d.nb_restaurants desc, d.name_fr
  limit least(greatest(coalesce(p_limite, 8), 1), 30)
$$;

-- Autocomplétion unifiée : une seule requête pour la barre de recherche, qui
-- doit répondre « Ampefy — destination » ET « Ravitoto — plat » dès la
-- troisième lettre, sans que le client ait à orchestrer deux appels.
create or replace function public.suggerer(p_terme text, p_limite integer default 8)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(x order by x.score desc, x.libelle), '[]'::jsonb)
  from (
    select 'lieu'::text as type, l.slug, l.name_fr as libelle,
           coalesce(l.region, l.kind) as detail, l.score
    from public.resoudre_lieu(p_terme, p_limite) l
    union all
    select 'plat', d.slug, d.name_fr, coalesce(d.family, 'plat'), d.score
    from public.resoudre_plat(p_terme, p_limite) d
  ) x
  limit least(greatest(coalesce(p_limite, 8), 1), 20)
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. PRIVILÈGES
-- ⚠ Rappel des migrations 0002/0003 : fermer une fonction demande TROIS
--   révocations — PUBLIC (défaut PostgreSQL), anon puis authenticated
--   (privilèges par défaut de Supabase).
-- ────────────────────────────────────────────────────────────────────────────
revoke execute on function public.resoudre_lieu(text, integer) from public, anon, authenticated;
revoke execute on function public.resoudre_plat(text, integer) from public, anon, authenticated;
revoke execute on function public.suggerer(text, integer)      from public, anon, authenticated;

-- La recherche doit marcher AVANT l'inscription : c'est par elle qu'un
-- visiteur découvre le site, et c'est elle que Google suit.
grant execute on function public.resoudre_lieu(text, integer) to anon, authenticated;
grant execute on function public.resoudre_plat(text, integer) to anon, authenticated;
grant execute on function public.suggerer(text, integer)      to anon, authenticated;

revoke insert, update, delete on
  public.places, public.place_aliases, public.place_seasons, public.place_access,
  public.dishes, public.dish_aliases, public.amenities
  from anon, authenticated;
