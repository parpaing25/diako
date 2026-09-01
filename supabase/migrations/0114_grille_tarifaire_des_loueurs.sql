-- ────────────────────────────────────────────────────────────────────────────
-- 0114 — LA GRILLE TARIFAIRE DES LOUEURS DE VÉHICULES
--
-- POURQUOI. La catégorie `location_vehicule` existait (23 fiches) mais un
-- loueur n'était qu'une fiche `pages` avec UN prix d'appel. Or le contenu
-- utile d'un loueur, c'est sa grille : 4×4 avec chauffeur à tant la journée,
-- citadine sans chauffeur à tant, carburant en sus ou non, caution. Sans
-- table dédiée, le bot de collecte jetait cette information.
--
-- MODÈLE. Copie assumée de `room_types` (0007) : table fille de `pages`
-- rattachée par `page_id`, mêmes politiques RLS (0008), même déclencheur de
-- prix d'appel. Un type de véhicule = une ligne, comme un type de chambre.
--
-- ⚠ `price_day_ar` est NULLABLE, et c'est un choix : sur `room_types`, le
--   NOT NULL de `base_price_ar` a fait jeter en silence 46 chambres sur 77
--   collectées (constat du 23/08/2026). Une grille sans prix vaut mieux que
--   pas de grille : l'affichage dira « prix sur demande ».
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.vehicle_offers (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references public.pages(id) on delete cascade,
  vehicle_type  text not null check (vehicle_type in
                  ('4x4','berline','citadine','minibus','van','moto','quad','bateau','velo','camion','autre')),
  model         text,                        -- « Toyota Land Cruiser », libre
  photos        text[] not null default '{}',
  seats         smallint check (seats is null or seats > 0),
  with_driver   boolean not null default true,   -- à Madagascar, la norme
  fuel_included boolean,                      -- null = non précisé, pas « non »
  km_included_per_day integer check (km_included_per_day is null or km_included_per_day >= 0),
  price_day_ar  bigint check (price_day_ar is null or price_day_ar >= 0),
  price_note    text,                         -- « hors carburant, RN7 uniquement »
  deposit_ar    bigint check (deposit_ar is null or deposit_ar >= 0),
  price_on      date,                         -- date du relevé, jamais inventée
  status        text not null default 'actif' check (status in ('actif','indisponible')),
  sort_order    smallint not null default 0,
  source        text,                         -- d'où vient la ligne (bot, gérant…)
  created_at    timestamptz not null default now()
);

create index if not exists vehicle_offers_page_idx on public.vehicle_offers(page_id, sort_order);

comment on table public.vehicle_offers is
  'Grille tarifaire d''un loueur. Une ligne par type de vehicule, prix par jour en ariary. price_day_ar nullable : une grille sans prix vaut mieux que pas de grille.';

-- RLS — exactement la règle des tables filles de 0008 : lecture si la page
-- est publiée ou à moi, écriture par le gérant ou l'admin.
alter table public.vehicle_offers enable row level security;

drop policy if exists vehicle_offers_lecture on public.vehicle_offers;
drop policy if exists vehicle_offers_gerer   on public.vehicle_offers;
create policy vehicle_offers_lecture on public.vehicle_offers for select
  using (public.page_publiee(page_id) or public.page_a_moi(page_id));
create policy vehicle_offers_gerer on public.vehicle_offers for all
  using (public.page_a_moi(page_id) or public.is_admin())
  with check (public.page_a_moi(page_id) or public.is_admin());

-- Comme en 0008 : l'anonyme lit, n'écrit pas.
revoke insert, update, delete on public.vehicle_offers from anon;
grant select on public.vehicle_offers to anon, authenticated;
grant insert, update, delete on public.vehicle_offers to authenticated;

-- Prix d'appel : un loueur sans chambre ni carte doit ressortir « à partir de
-- X Ar le jour ». On étend maj_prix_page (0008) d'une branche, en dernière
-- position pour ne changer aucun résultat existant.
create or replace function public.maj_prix_page(p uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_prix bigint; v_unite text; v_maj timestamptz;
begin
  select least(
           (select min(sr.price_ar) from public.season_rates sr
              join public.room_types rt on rt.id = sr.room_type_id
             where rt.page_id = p and rt.status = 'actif'),
           (select min(rt.base_price_ar) from public.room_types rt
             where rt.page_id = p and rt.status = 'actif')
         ),
         (select max(sr.checked_at) from public.season_rates sr
            join public.room_types rt on rt.id = sr.room_type_id where rt.page_id = p)
    into v_prix, v_maj;

  if v_prix is not null then
    v_unite := 'nuit';
  else
    select min(price_ar) into v_prix from public.menu_items
      where page_id = p and price_ar is not null and in_stock;
    if v_prix is not null then
      v_unite := 'plat';
    else
      select min(price_ar) into v_prix from public.activities
        where page_id = p and price_ar is not null;
      if v_prix is not null then
        v_unite := 'personne';
      else
        select min(tp.price_ar) into v_prix from public.tour_prices tp
          join public.tours t on t.id = tp.tour_id where t.page_id = p;
        if v_prix is not null then
          v_unite := 'personne';
        else
          select min(vo.price_day_ar) into v_prix from public.vehicle_offers vo
            where vo.page_id = p and vo.status = 'actif' and vo.price_day_ar is not null;
          if v_prix is not null then v_unite := 'jour'; end if;
        end if;
      end if;
    end if;
  end if;

  update public.pages
     set price_min_ar = v_prix,
         price_min_unit = v_unite,
         rates_checked_at = coalesce(v_maj, rates_checked_at)
   where id = p
     and (price_min_ar is distinct from v_prix or price_min_unit is distinct from v_unite);
end $$;

-- Même déclencheur que les autres tables d'offres (0008 §2).
drop trigger if exists trg_prix_vehicle_offers on public.vehicle_offers;
create trigger trg_prix_vehicle_offers after insert or update or delete on public.vehicle_offers
  for each row execute function public.trg_maj_prix();
