-- ============================================================================
-- 0007 — LES ÉTABLISSEMENTS : PAGE → OFFRE → TARIF
--
-- C'est l'objet zéro qui manquait. Jusqu'ici les quatre « établissements »
-- du site étaient des objets écrits en dur dans src/data/apercu.ts : le
-- bungalow à 85 000 Ar, le menu à 12 000 Ar et la note « 4.6 (18 avis) »
-- étaient des chaînes de caractères. Un gérant ne pouvait rien publier, et
-- un voyageur ne pouvait rien trouver.
--
-- PRINCIPE DIRECTEUR — trois niveaux, jamais une table monolithe :
--
--   PAGE (l'établissement)
--     └─ OFFRE  (une chambre, un plat, une activité, un circuit)
--          └─ TARIF (le prix, avec son unité, sa saison et sa base)
--
-- Le projet frère a tout mis dans une table de 90 colonnes avec des blocs
-- « -- Parking specific », « -- Colocation specific » : chaque nouveau type de
-- bien y a ajouté des colonnes nulles pour tous les autres. En voyage ce
-- serait fatal — hôtel + restaurant + circuit dans une seule table donneraient
-- 250 colonnes dont 230 vides sur chaque ligne.
--
-- UN HÔTEL N'A PAS *UN* PRIX. Il a cinq types de chambres × trois saisons.
-- C'est exactement ce que room_types + season_rates permet d'exprimer — tout
-- en acceptant UNE seule ligne « toute l'année », parce que beaucoup
-- d'établissements malgaches pratiquent un tarif ferme et que si on impose
-- quatre saisons, personne ne remplit.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LA PAGE
--
-- `categories` est un TABLEAU, et ce n'est pas un détail : un écolodge d'Ifaty
-- est à la fois un hôtel, un restaurant et un organisateur d'excursions. Le
-- forcer dans une catégorie unique, c'est le rendre introuvable deux fois sur
-- trois.
--
-- `landmark` — « en face de la station Jovenna, après le pont » — n'est pas un
-- champ folklorique : l'adressage normalisé n'existe pas à Madagascar, et
-- c'est ce repère qui permet réellement de trouver l'endroit.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.pages (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  owner_id       uuid references public.profiles(id) on delete set null,
  name           text not null,

  categories     text[] not null default '{}',
  subcategory    text,

  short_desc     text,
  long_desc      text,

  place_id       uuid references public.places(id) on delete set null,
  address        text,
  landmark       text,
  lat            double precision,
  lng            double precision,

  phone          text,
  whatsapp       text,
  email          text,
  website        text,
  facebook       text,

  logo_url       text,
  cover_url      text,
  cover_offset_y smallint not null default 50,
  gallery        jsonb not null default '[]'::jsonb,

  languages      text[] not null default '{fr,mg}',
  payment_methods text[] not null default '{especes}',
  price_level    smallint check (price_level between 1 and 4),

  -- ⚠ Colonnes à valeur commerciale : verrouillées par déclencheur plus bas.
  --   Un propriétaire ne doit pas pouvoir se déclarer « vérifié » lui-même.
  verification_status text not null default 'none'
                 check (verification_status in ('none','phone','place','documents','partner')),
  is_published   boolean not null default true,

  rating_avg     numeric(2,1) not null default 0,
  rating_count   integer not null default 0,
  views_count    integer not null default 0,

  -- ⭐ Dénormalisé et maintenu par déclencheur. Sans lui, AUCUN filtre budget
  --   n'est possible : il faudrait joindre trois tables d'offres à chaque
  --   requête de liste. C'est ce champ qui répond à « un hôtel à moins de
  --   120 000 Ar la nuit à Majunga ».
  price_min_ar   bigint check (price_min_ar is null or price_min_ar >= 0),
  price_min_unit text check (price_min_unit in ('nuit','plat','personne','jour','circuit')),
  rates_checked_at timestamptz,
  completeness   smallint not null default 0 check (completeness between 0 and 100),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  norm text generated always as (public.dk_norm(name)) stored,

  constraint pages_categories_valides check (
    categories <@ array['hotel','restaurant','agence_voyage','guide','transporteur',
                        'location_vehicule','site_attraction','organisateur_evenement']::text[]
  )
);

create index if not exists pages_place_idx on public.pages(place_id) where is_published;
create index if not exists pages_cat_idx   on public.pages using gin(categories);
create index if not exists pages_owner_idx on public.pages(owner_id);
create index if not exists pages_norm_idx  on public.pages using gin (norm extensions.gin_trgm_ops);
create index if not exists pages_prix_idx  on public.pages(price_min_ar) where is_published and price_min_ar is not null;

comment on table public.pages is
  'Un etablissement : hotel, restaurant, agence, guide. categories est un tableau car un ecolodge est les trois a la fois.';

create table if not exists public.page_amenities (
  page_id uuid not null references public.pages(id) on delete cascade,
  code    text not null references public.amenities(code) on delete cascade,
  primary key (page_id, code)
);

-- Horaires structurés, pas une chaîne « Ouvert · ferme à 22 h » affichée pour
-- tout le monde y compris pour une agence de voyage.
create table if not exists public.page_hours (
  page_id uuid not null references public.pages(id) on delete cascade,
  jour    smallint not null check (jour between 0 and 6),  -- 0 = dimanche
  ouvre   time,
  ferme   time,
  ferme_toute_la_journee boolean not null default false,
  primary key (page_id, jour)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. LES CHAMBRES ET LEURS TARIFS
--
-- hot_water et moustiquaire ne sont pas du confort accessoire à Madagascar :
-- ce sont des critères de décision. Ils méritent leur colonne, pas une ligne
-- perdue dans une description.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.room_types (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references public.pages(id) on delete cascade,
  name          text not null,
  description   text,
  photos        text[] not null default '{}',
  units_count   smallint not null default 1 check (units_count > 0),
  max_adults    smallint check (max_adults > 0),
  max_children  smallint check (max_children >= 0),
  surface_m2    smallint,
  private_bath  boolean not null default true,
  hot_water     boolean not null default false,
  view          text,
  base_price_ar bigint not null check (base_price_ar >= 0),
  price_unit    text not null default 'chambre' check (price_unit in ('chambre','personne')),
  extra_person_ar bigint check (extra_person_ar is null or extra_person_ar >= 0),
  status        text not null default 'actif' check (status in ('actif','ferme','travaux')),
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists room_types_page_idx on public.room_types(page_id, sort_order);

create table if not exists public.season_rates (
  id            uuid primary key default gen_random_uuid(),
  room_type_id  uuid not null references public.room_types(id) on delete cascade,
  season_label  text not null default 'Toute l''année',
  from_date     date,
  to_date       date,
  price_ar      bigint not null check (price_ar >= 0),
  price_unit    text not null default 'chambre' check (price_unit in ('chambre','personne')),
  board         text check (board in ('chambre_seule','petit_dej','demi_pension','pension_complete','all_in')),
  min_nights    smallint not null default 1 check (min_nights > 0),
  resident_price_ar bigint check (resident_price_ar is null or resident_price_ar >= 0),
  checked_at    timestamptz not null default now(),
  constraint season_rates_dates check (from_date is null or to_date is null or from_date <= to_date)
);

create index if not exists season_rates_room_idx on public.season_rates(room_type_id);

comment on table public.season_rates is
  'Tarifs par saison. UNE seule ligne « Toute l''annee » est valide : imposer quatre saisons ferait fuir la moitie des etablissements.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. LA CARTE
--
-- menu_items.dish_id est LE lien qui fait tout marcher : c'est lui qui permet
-- de répondre « voici les huit restaurants qui servent du ravitoto, et le prix
-- chez chacun ». Sans lui, on ne peut chercher que du texte.
--
-- Il reste facultatif : un restaurateur qui saisit « Poulet coco maison » sans
-- le rattacher au référentiel doit pouvoir publier quand même. C'est le nom
-- libre qui prime à l'affichage, le rattachement ne sert qu'à la recherche.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.menu_sections (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages(id) on delete cascade,
  name       text not null,
  service    text check (service in ('midi','soir','tous')),
  sort_order smallint not null default 0
);

create index if not exists menu_sections_page_idx on public.menu_sections(page_id, sort_order);

create table if not exists public.menu_items (
  id           uuid primary key default gen_random_uuid(),
  page_id      uuid not null references public.pages(id) on delete cascade,
  section_id   uuid references public.menu_sections(id) on delete set null,
  name         text not null,
  dish_id      uuid references public.dishes(id) on delete set null,
  description  text,
  price_ar     bigint check (price_ar is null or price_ar >= 0),
  price_unit   text not null default 'portion'
                 check (price_unit in ('portion','2_personnes','kg','part','verre')),
  photo_url    text,
  availability text not null default 'permanent'
                 check (availability in ('permanent','plat_du_jour','saisonnier','sur_commande')),
  tags         text[] not null default '{}',
  side_dish    text,
  is_signature boolean not null default false,
  in_stock     boolean not null default true,
  sort_order   smallint not null default 0,
  norm text generated always as (public.dk_norm(name)) stored
);

-- ⭐ L'index de LA requête du produit : « qui sert ce plat, et à quel prix ».
create index if not exists menu_items_dish_idx on public.menu_items(dish_id, price_ar)
  where dish_id is not null and in_stock;
create index if not exists menu_items_page_idx on public.menu_items(page_id, sort_order);
create index if not exists menu_items_norm_idx on public.menu_items using gin (norm extensions.gin_trgm_ops);

-- Mode dégradé indispensable : photographier la carte papier prend trente
-- secondes, saisir soixante lignes prend une soirée. Sans cette échappatoire,
-- une gargote ne publiera jamais sa carte.
create table if not exists public.menu_photos (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages(id) on delete cascade,
  url        text not null,
  legende    text,
  sort_order smallint not null default 0
);

create index if not exists menu_photos_page_idx on public.menu_photos(page_id, sort_order);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. LES ACTIVITÉS
--
-- Le troisième métier du gérant d'Ifaty — sortie en pirogue, snorkeling —
-- n'existait nulle part, pas même en maquette. C'est pourtant souvent le tiers
-- de son chiffre d'affaires.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.pages(id) on delete cascade,
  name        text not null,
  description text,
  photos      text[] not null default '{}',
  duration_h  numeric(4,1) check (duration_h is null or duration_h > 0),
  price_ar    bigint check (price_ar is null or price_ar >= 0),
  price_unit  text not null default 'personne'
                check (price_unit in ('personne','groupe','vehicule','bateau')),
  min_people  smallint check (min_people is null or min_people > 0),
  max_people  smallint check (max_people is null or max_people > 0),
  includes    text[] not null default '{}',
  months_open smallint[],
  sort_order  smallint not null default 0
);

create index if not exists activities_page_idx on public.activities(page_id, sort_order);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. LES CIRCUITS
--
-- Une agence n'avait strictement aucun objet à publier : sa page affichait à
-- la place des chambres et un menu malgache. duration_days est un ENTIER
-- filtrable, jamais du texte — « 8 jours » écrit à la main ne se filtre pas.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.tours (
  id             uuid primary key default gen_random_uuid(),
  page_id        uuid not null references public.pages(id) on delete cascade,
  slug           text unique not null,
  title          text not null,
  summary        text,
  description    text,
  duration_days  smallint not null check (duration_days > 0),
  duration_nights smallint check (duration_nights >= 0),
  difficulty     text check (difficulty in ('facile','modere','sportif','expedition')),
  format         text check (format in ('privatif','groupe','depart_garanti')),
  group_min      smallint check (group_min is null or group_min > 0),
  group_max      smallint check (group_max is null or group_max > 0),
  start_place_id uuid references public.places(id) on delete set null,
  end_place_id   uuid references public.places(id) on delete set null,
  axe            text,
  transports     text[] not null default '{}',
  guide_langs    text[] not null default '{fr}',
  parks_included boolean not null default false,
  months_open    smallint[],
  photos         text[] not null default '{}',
  created_at     timestamptz not null default now(),
  norm text generated always as (public.dk_norm(title)) stored
);

create index if not exists tours_page_idx  on public.tours(page_id);
create index if not exists tours_duree_idx on public.tours(duration_days);
create index if not exists tours_norm_idx  on public.tours using gin (norm extensions.gin_trgm_ops);

-- L'itinéraire jour par jour : c'est ce qu'un voyageur lit avant de choisir.
create table if not exists public.tour_days (
  tour_id   uuid not null references public.tours(id) on delete cascade,
  jour      smallint not null check (jour > 0),
  titre     text not null,
  detail    text,
  place_id  uuid references public.places(id) on delete set null,
  nuitee    text,
  primary key (tour_id, jour)
);

-- Le prix d'un circuit dépend du nombre de participants : à deux on paie le
-- double par personne de ce qu'on paie à huit. Une colonne unique ne peut pas
-- le dire.
create table if not exists public.tour_prices (
  id        uuid primary key default gen_random_uuid(),
  tour_id   uuid not null references public.tours(id) on delete cascade,
  base_pax  smallint not null check (base_pax > 0),
  price_ar  bigint not null check (price_ar >= 0),
  price_unit text not null default 'personne' check (price_unit in ('personne','groupe')),
  unique (tour_id, base_pax)
);

create table if not exists public.tour_inclusions (
  id       uuid primary key default gen_random_uuid(),
  tour_id  uuid not null references public.tours(id) on delete cascade,
  libelle  text not null,
  inclus   boolean not null default true,
  sort_order smallint not null default 0
);

create index if not exists tour_inclusions_idx on public.tour_inclusions(tour_id, inclus, sort_order);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. LES AVIS
--
-- L'écran affichait « ★ 4.8 (9 avis) » en entête et « Aucun avis pour le
-- moment » dans l'onglet, sur la même page. Les deux étaient faux.
--
-- Un seul avis par personne et par établissement : sans cette contrainte,
-- la note moyenne se manipule en trois clics.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  note       smallint not null check (note between 1 and 5),
  note_proprete smallint check (note_proprete between 1 and 5),
  note_accueil  smallint check (note_accueil between 1 and 5),
  note_rapport  smallint check (note_rapport between 1 and 5),
  body       text,
  visite_le  date,
  status     text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now(),
  unique (page_id, author_id)
);

create index if not exists reviews_page_idx on public.reviews(page_id, created_at desc)
  where status = 'published';

create table if not exists public.review_replies (
  review_id  uuid primary key references public.reviews(id) on delete cascade,
  page_id    uuid not null references public.pages(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. ÉCRIRE À UNE PAGE
--
-- La structure interdisait d'écrire à un établissement : conversations est
-- (a_id, b_id) vers profiles avec `check (a_id < b_id)` et un index unique sur
-- la paire.
--
-- ⚠ On NE casse PAS cette contrainte, et c'est délibéré. Une conversation avec
--   un hôtel reste une conversation entre DEUX PERSONNES — le voyageur et le
--   gérant ; elle porte simplement SUR une page. On ajoute donc page_id et on
--   élargit l'unicité à (a_id, b_id, page_id).
--
--   Bénéfices : la RLS existante (« je vois mes conversations ») continue de
--   s'appliquer sans une ligne de changement, et les mêmes deux personnes
--   peuvent avoir en parallèle une conversation personnelle et une
--   conversation professionnelle sans qu'elles se mélangent.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.conversations
  add column if not exists page_id uuid references public.pages(id) on delete set null;

drop index if exists public.conversations_paire_idx;
create unique index if not exists conversations_paire_idx
  on public.conversations (a_id, b_id, coalesce(page_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists conversations_page_idx on public.conversations(page_id)
  where page_id is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. MENTIONNER UN ÉTABLISSEMENT DANS UN RÉCIT
--
-- « Je veux dire du bien de MON hôtel et de MON restaurant pour que le lecteur
-- clique. » Le récit remonte alors sur la fiche de l'établissement : c'est la
-- preuve sociale, et c'est ce qui donne à un gérant une raison de venir.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.post_mentions (
  post_id uuid not null references public.posts(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  primary key (post_id, page_id)
);

create index if not exists post_mentions_page_idx on public.post_mentions(page_id);

alter table public.posts
  add column if not exists dish_id uuid references public.dishes(id) on delete set null;

create index if not exists posts_dish_idx on public.posts(dish_id) where dish_id is not null;
