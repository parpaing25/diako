-- ============================================================================
-- 0052 — LA CARTE CHARGE CE QU'ON REGARDE, ET DIT CE QU'ELLE CACHE
--
-- 🔴 LA CARTE MONTRAIT 600 ÉTABLISSEMENTS SUR 3 302, SANS LE DIRE. `pages_carte`
--    plafonne en dur à 1 000 et l'écran demandait 600 : plus des deux tiers de
--    l'annuaire n'apparaissaient nulle part sur la carte, et rien à l'écran ne
--    le signalait. Une carte qui tait ce qu'elle omet ment sur la couverture du
--    service — un visiteur concluait qu'il n'y a rien à Morondava.
--
-- ⚠ ET ELLE NE MONTRAIT AUCUN DES 2 429 SITES. Parcs nationaux, sommets,
--   plages, cascades : la moitié de l'intérêt du pays était absente de l'écran
--   qui sert justement à savoir « qu'est-ce qu'il y a par ici ».
--
-- ⚠ CHARGEMENT PAR ZONE VISIBLE, pas par plafond global. À l'échelle du pays,
--   5 700 épingles ne sont de toute façon pas lisibles ; à l'échelle d'une
--   ville, on veut TOUT ce qui est là. La zone visible est le bon critère.
--
-- ⚠ ON REND AUSSI LE COMPTE TOTAL DE LA ZONE. C'est ce qui permet à l'écran
--   d'écrire « 800 affichés sur 1 240 ici — zoomez » au lieu de laisser croire
--   que la carte est complète. Une troncature muette se lit comme une absence.
-- ============================================================================

create or replace function public.carte_zone(
  p_sud   double precision,
  p_ouest double precision,
  p_nord  double precision,
  p_est   double precision,
  p_categorie text default null,
  p_types text[] default array['page','site'],
  p_limite integer default 800
)
returns table (
  genre text, id uuid, slug text, name text, categories text[],
  cover_url text, lat double precision, lng double precision,
  precision_geo text, place_name text,
  price_min_ar bigint, price_min_unit text,
  rating_avg numeric, rating_count integer,
  total_zone bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with etabs as (
    select 'page'::text as genre, p.id, p.slug, p.name, p.categories, p.cover_url,
           coalesce(p.lat, pl.lat)::double precision as lat,
           coalesce(p.lng, pl.lng)::double precision as lng,
           case when p.lat is not null then 'exacte' else 'lieu' end as precision_geo,
           pl.name_fr as place_name, p.price_min_ar, p.price_min_unit,
           p.rating_avg, p.rating_count,
           -- ⚠ L'ORDRE DÉCIDE QUI SURVIT À LA TRONCATURE : les fiches les plus
           --   complètes d'abord, pas les premières venues.
           (p.completeness, p.rating_count) as rang
      from public.pages p
      left join public.places pl on pl.id = p.place_id
     where p.is_published
       and coalesce(p.lat, pl.lat) between p_sud  and p_nord
       and coalesce(p.lng, pl.lng) between p_ouest and p_est
       and (p_categorie is null or p_categorie = any(p.categories))
       and 'page' = any(p_types)
  ),
  sites as (
    select 'site'::text, a.id, a.slug, a.name, array[a.kind], a.cover_url,
           coalesce(a.lat, pl.lat)::double precision,
           coalesce(a.lng, pl.lng)::double precision,
           case when a.lat is not null then 'exacte' else 'lieu' end,
           pl.name_fr, null::bigint, null::text, null::numeric, null::integer,
           -- Un site décrit passe devant un site qui n'est qu'un nom.
           ((case when a.description is not null then 2
                  when a.summary is not null then 1 else 0 end)::smallint, 0)
      from public.attractions a
      left join public.places pl on pl.id = a.place_id
     where a.is_published
       and coalesce(a.lat, pl.lat) between p_sud  and p_nord
       and coalesce(a.lng, pl.lng) between p_ouest and p_est
       and (p_categorie is null or p_categorie = a.kind)
       and 'site' = any(p_types)
  ),
  tout as (select * from etabs union all select * from sites)
  select genre, id, slug, name, categories, cover_url, lat, lng, precision_geo,
         place_name, price_min_ar, price_min_unit, rating_avg, rating_count,
         count(*) over () as total_zone
    from tout
   order by rang desc
   limit least(greatest(coalesce(p_limite, 800), 1), 1500);
$$;

revoke all on function public.carte_zone(double precision, double precision, double precision, double precision, text, text[], integer) from public;
grant execute on function public.carte_zone(double precision, double precision, double precision, double precision, text, text[], integer) to anon, authenticated;
