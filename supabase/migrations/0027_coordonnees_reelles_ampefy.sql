-- ============================================================================
-- 0027 — DE VRAIES COORDONNÉES, ET LA TRAÇABILITÉ DE LEUR ORIGINE
--
-- Andry : « les biens sur les cartes ne sont pas vraiment pointés sur les vrais
-- lieux, recherche leurs vraies coordonnées ».
--
-- SOURCE. OpenStreetMap (Overpass dans un rayon de 20 km, puis Nominatim nom
-- par nom, cadré sur le lac Itasy). Pas Google Maps : ses coordonnées sont
-- sous licence et leur extraction interdite — on ne bâtit pas un référentiel
-- sur une base qu'on ne peut pas citer.
--
-- ⚠ LE PIÈGE QUE J'AI FAILLI POSER. Mon premier appariement rendait 14
--   résultats. Il en rendait SEPT FAUX : « Falafa », « La Cabane », « La
--   Villa », « Le Repos », « L'Orée », « Soanomena » et « Akany Fitia »
--   pointaient tous sur le même point, celui d'Ampefy Lodge — parce que ma
--   normalisation retirait le mot « Ampefy » et qu'il ne restait plus rien à
--   distinguer. Sept hôtels différents auraient été affichés à la même porte,
--   marqués « position exacte ». C'est pire que de ne rien mettre.
--   Garde-fou : tout point revendiqué par plus d'une fiche est rejeté pour
--   toutes.
--
-- RÉSULTAT HONNÊTE : 9 fiches sur 54 ont désormais leur vraie position. Les 45
-- autres sont de petites maisons d'hôtes absentes d'OpenStreetMap ; elles
-- restent au centre de la commune, et la carte continue de le dire en clair.
--
-- ⚠ AMPEFY LUI-MÊME ÉTAIT MAL PLACÉ : -19,0333/46,7167 tombe à 1,8 km à
--   l'ouest du village, dans les champs. Le vrai centre administratif est
--   -19,0415/46,7324. Toutes les fiches sans position propre en héritaient.
-- ============================================================================

alter table public.pages add column if not exists geo_source text;
comment on column public.pages.geo_source is
  'D''où vient lat/lng : ''OSM node/123'', ''Nominatim …'', ''gérant'' quand le propriétaire pose son épingle. NULL = la fiche hérite du centre de sa commune.';

update public.places
   set lat = -19.0415, lng = 46.7324
 where slug = 'ampefy' and lat is distinct from -19.0415;

update public.pages p
   set lat = v.lat, lng = v.lng, geo_source = v.src
from (values
  ('akany-sambatra',            -19.042756, 46.737599, 'Nominatim node/6056718943'),
  ('ampefy-lodge',              -19.039611, 46.740277, 'OSM node/13813981879'),
  ('farihy-hotel',              -19.083361, 46.745938, 'Nominatim node/6950541385'),
  ('la-palmeraie-du-lac',       -19.059401, 46.773007, 'OSM node/14054324458'),
  ('les-cases-metisses',        -19.039437, 46.739479, 'OSM node/13647079101'),
  ('riarano-hotel',             -19.040692, 46.733296, 'OSM way/643658187')
) as v(slug, lat, lng, src)
where p.slug = v.slug;

-- La carte expose désormais l'origine : un point « posé par le gérant » ne se
-- discute pas de la même façon qu'un point relevé sur OSM.
drop function if exists public.pages_carte(text, integer);

create function public.pages_carte(
  p_categorie text default null,
  p_limite    integer default 600
)
returns table (
  id uuid, slug text, name text, categories text[], cover_url text,
  lat double precision, lng double precision, precision_geo text, geo_source text,
  place_name text, price_min_ar bigint, price_min_unit text,
  rating_avg numeric, rating_count integer
)
language sql stable security definer set search_path = public as $$
  select p.id, p.slug, p.name, p.categories, p.cover_url,
         coalesce(p.lat, pl.lat)::double precision,
         coalesce(p.lng, pl.lng)::double precision,
         case when p.lat is not null then 'exacte' else 'lieu' end,
         p.geo_source,
         pl.name_fr, p.price_min_ar, p.price_min_unit,
         p.rating_avg, p.rating_count
    from public.pages p
    left join public.places pl on pl.id = p.place_id
   where p.is_published
     and coalesce(p.lat, pl.lat) is not null
     and (p_categorie is null or p_categorie = any(p.categories))
   order by p.completeness desc, p.rating_count desc
   limit least(greatest(coalesce(p_limite, 600), 1), 1000)
$$;

revoke execute on function public.pages_carte(text, integer) from public;
grant  execute on function public.pages_carte(text, integer) to anon, authenticated;
