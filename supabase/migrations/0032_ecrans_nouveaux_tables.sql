-- ============================================================================
-- 0032 — LES TABLES DES ÉCRANS NOUVEAUX (DESIGN-HANDOFF §6)
--
-- Carnet de goûts, sites et parcs, événements, projets de voyage, offres,
-- demandes, guides éditoriaux, départs de circuits.
--
-- ⚠ POURQUOI ON CRÉE LES TABLES AVANT D'OUVRIR LA NAVIGATION. La règle du
--   projet est qu'aucune entrée de menu ne mène à un écran non branché : un
--   onglet vide coûte plus cher en confiance que son absence. La seule façon
--   de tenir cette règle ET de livrer les écrans, c'est de brancher d'abord
--   l'écriture. Une fois ces tables en place, les pages sont vides mais
--   VRAIES : ce qu'on y écrit se garde.
--
-- ⚠ CE QUI EXISTE DÉJÀ et n'est pas recréé : tours, tour_prices, tour_days,
--   tour_inclusions, reports, blocks.
-- ============================================================================

/* ── ① LE CARNET DE GOÛTS ──────────────────────────────────────────────────
   L'aventure culinaire. C'est la SEULE brique sociale qui fonctionne avec un
   seul membre inscrit : marquer un plat goûté n'a besoin de personne d'autre.
   Le référentiel (95 plats, 254 variantes) existe depuis le lot 1.          */
create table if not exists public.dish_tastings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  dish_id    uuid not null references public.dishes(id) on delete cascade,
  -- La publication d'où vient le marquage, quand il vient d'une « Assiette ».
  post_id    uuid references public.posts(id) on delete set null,
  tasted_at  date not null default current_date,
  note       text,
  created_at timestamptz not null default now(),
  -- ⚠ Un plat goûté UNE fois. Sans cette contrainte, « 47 plats goûtés »
  --   compterait les doublons et le carnet mentirait sur sa progression.
  constraint dish_tastings_unique unique (user_id, dish_id)
);
create index if not exists dish_tastings_user on public.dish_tastings (user_id, tasted_at desc);
create index if not exists dish_tastings_dish on public.dish_tastings (dish_id);

/* ── ② LES DÉPARTS DE CIRCUITS ─────────────────────────────────────────────
   Les autres tables de circuit existent déjà. Manquait celle-ci : un départ
   garanti est une information commerciale forte, et elle a une date.        */
create table if not exists public.tour_departures (
  id          uuid primary key default gen_random_uuid(),
  tour_id     uuid not null references public.tours(id) on delete cascade,
  starts_on   date not null,
  seats_total smallint,
  seats_left  smallint,
  guaranteed  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists tour_departures_tour on public.tour_departures (tour_id, starts_on);

/* ── ③ SITES ET PARCS ──────────────────────────────────────────────────────
   ⚠ LA DOUBLE GRILLE RÉSIDENT / NON-RÉSIDENT EST LA RÉALITÉ DU PAYS. Les
     parcs nationaux malgaches facturent un tarif malgache et un tarif
     étranger, et l'écart est d'un facteur cinq à dix. Afficher un seul prix
     tromperait la moitié des visiteurs, dans un sens ou dans l'autre.
   ⚠ LE GUIDE SE FACTURE PAR GROUPE, pas par personne : une famille de cinq
     paie le même guide qu'un couple. Le confondre avec un prix par personne
     multiplierait l'estimation par cinq.
   ⚠ `fady` : les interdits locaux. Aucun concurrent ne les porte. C'est une
     marque de respect autant qu'une information utile.                      */
create table if not exists public.attractions (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  name                text not null,
  kind                text not null default 'parc',
  place_id            uuid references public.places(id) on delete set null,
  manager             text,
  summary             text,
  description         text,
  cover_url           text,
  lat                 double precision,
  lng                 double precision,
  fee_resident_ar     bigint,
  fee_nonresident_ar  bigint,
  guide_required      boolean not null default false,
  guide_fee_group_ar  bigint,
  ticket_validity_days smallint,
  circuits            jsonb not null default '[]'::jsonb,
  fady                text[] not null default '{}',
  best_months         smallint[] not null default '{}',
  gear_needed         text[] not null default '{}',
  species             text[] not null default '{}',
  opening_hours       text,
  rates_checked_at    date,
  is_published        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists attractions_place on public.attractions (place_id);
create index if not exists attractions_publiees on public.attractions (is_published) where is_published;

/* ── ④ ÉVÉNEMENTS ──────────────────────────────────────────────────────────
   ⚠ `yearly` EXISTE POUR LES PHÉNOMÈNES NATURELS. Les baleines à Sainte-Marie,
     les litchis à Toamasina, les jacarandas d'Antananarivo reviennent chaque
     année aux mêmes semaines. Les saisir comme des événements datés une seule
     fois les ferait disparaître le 1er janvier suivant.                     */
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  kind         text not null default 'culturel',
  place_id     uuid references public.places(id) on delete set null,
  page_id      uuid references public.pages(id) on delete set null,
  starts_on    date not null,
  ends_on      date,
  yearly       boolean not null default false,
  summary      text,
  description  text,
  poster_url   text,
  price_ar     bigint,
  price_unit   text,
  organizer    text,
  is_published boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists events_dates on public.events (starts_on) where is_published;
create index if not exists events_place on public.events (place_id);

/* ── ⑤ PROJETS DE VOYAGE ET OFFRES ─────────────────────────────────────────
   L'inverse de l'annonce : le voyageur décrit une fois, les pros répondent.  */
create table if not exists public.trip_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  envies        text[] not null default '{}',
  place_ids     uuid[] not null default '{}',
  date_from     date,
  date_to       date,
  date_flex_days smallint,
  adults        smallint not null default 1,
  children_ages smallint[] not null default '{}',
  budget_ar     bigint,
  budget_eur    integer,
  notes         text,
  status        text not null default 'ouvert'
                check (status in ('ouvert','clos','honore')),
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);
-- ⚠ UN SEUL PROJET ACTIF PAR MEMBRE. Sans cet index, un voyageur pourrait en
--   ouvrir dix et les agences répondraient dix fois au même voyage.
create unique index if not exists trip_requests_un_actif
  on public.trip_requests (user_id) where status = 'ouvert';

create table if not exists public.trip_offers (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.trip_requests(id) on delete cascade,
  page_id      uuid not null references public.pages(id) on delete cascade,
  author_id    uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  body         text,
  price_ar     bigint,
  price_unit   text not null default 'par_personne',
  pax          smallint,
  includes     text[] not null default '{}',
  excludes     text[] not null default '{}',
  valid_until  date,
  status       text not null default 'envoyee'
               check (status in ('envoyee','acceptee','refusee','retiree')),
  created_at   timestamptz not null default now()
);
create index if not exists trip_offers_request on public.trip_offers (request_id, created_at desc);
create index if not exists trip_offers_page on public.trip_offers (page_id);

-- ⚠ CINQ OFFRES MAXIMUM PAR PRO ET PAR PROJET. C'est une contrainte
--   anti-harcèlement, pas une limite technique : sans elle, une agence peut
--   noyer un voyageur sous vingt propositions et le projet devient inutilisable.
create or replace function public.trip_offers_plafond()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.trip_offers
       where request_id = new.request_id and page_id = new.page_id
         and status <> 'retiree') >= 5 then
    raise exception 'Cinq propositions au maximum par projet.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trip_offers_plafond_trg on public.trip_offers;
create trigger trip_offers_plafond_trg before insert on public.trip_offers
  for each row execute function public.trip_offers_plafond();

/* ── ⑥ DEMANDES ────────────────────────────────────────────────────────────
   ⚠ `first_reply_at` ALIMENTE « RÉPOND EN N HEURES » sur la page publique.
     C'est une mesure, jamais une déclaration du gérant.                     */
create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references public.pages(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  kind          text not null default 'sejour'
                check (kind in ('sejour','table','activite','circuit','devis')),
  date_from     date,
  date_to       date,
  adults        smallint not null default 1,
  children_ages smallint[] not null default '{}',
  message       text,
  contact_name  text,
  contact_phone text,
  status        text not null default 'nouvelle'
                check (status in ('nouvelle','vue','repondue','confirmee','honoree','annulee')),
  first_reply_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists bookings_page on public.bookings (page_id, created_at desc);
create index if not exists bookings_user on public.bookings (user_id, created_at desc);

/* ── ⑦ GUIDES ÉDITORIAUX ───────────────────────────────────────────────────
   ⚠ UNE SEULE SOURCE DE VÉRITÉ, EN BASE. Jamais de copie en dur dans le code :
     un guide dupliqué dans un composant diverge du jour où quelqu'un corrige
     l'un des deux.                                                          */
create table if not exists public.guides (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  kind         text not null default 'quand_partir'
               check (kind in ('quand_partir','aller_a','manger_pour','week_end','choisir_agence')),
  place_id     uuid references public.places(id) on delete set null,
  summary      text,
  body         text,
  cover_url    text,
  is_published boolean not null default false,
  published_at timestamptz,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists guides_publies on public.guides (is_published, published_at desc);
