-- ============================================================================
-- 0016 — « AUTOUR DE MOI » : ce que le projet frère ne sait pas faire
--
-- Fonenako rattache la position GPS à la VILLE la plus proche, en JavaScript,
-- contre un fichier de 23 villes codées en dur — où Ampefy ne figure même pas.
-- C'est suffisant pour orienter un fil d'annonces immobilières : on cherche un
-- logement dans SA ville, on ne déménage pas selon les mètres.
--
-- En voyage, la question est littéralement géographique : on est sur une
-- plage, il est midi, on veut ce qui est à moins de dix kilomètres. Diako a de
-- vraies coordonnées en base, sur les lieux ET sur les établissements : le
-- calcul se fait donc ici, et rend une DISTANCE.
--
-- Haversine écrit à la main : aucune extension à installer, et sur quelques
-- centaines de lignes c'est instantané. On ajoutera un index GiST le jour où
-- il y aura des dizaines de milliers de fiches — pas avant.
--
-- ⚠ REPLI HONNÊTE : un établissement sans coordonnées ne peut pas être classé
--   par distance. Plutôt que de l'écarter (il deviendrait invisible) ou de lui
--   inventer une position, on le rend APRÈS les autres, sans distance, et le
--   site affiche « à situer ».
--
-- Vérifié : depuis le lac Itasy, 20 établissements à moins de 25 km, le
-- premier à 0,0 km. Depuis Antananarivo au même rayon : zéro — Ampefy est à
-- 85 km à vol d'oiseau.
-- ============================================================================

create or replace function public.distance_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision)
returns double precision
language sql immutable parallel safe as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

comment on function public.distance_km is
  'Distance orthodromique en km (haversine). Ecrite a la main : aucune extension a installer.';

create or replace function public.autour_de_moi(
  p_lat double precision,
  p_lng double precision,
  p_rayon_km double precision default 25,
  p_categorie text default null,
  p_limite integer default 20)
returns table (
  id uuid, slug text, name text, categories text[], short_desc text,
  cover_url text, place_name text, landmark text, phone text,
  price_min_ar bigint, price_min_unit text, rating_avg numeric, rating_count integer,
  completeness smallint, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select p.id, p.slug, p.name, p.categories, p.short_desc, p.cover_url,
         pl.name_fr, p.landmark, p.phone,
         p.price_min_ar, p.price_min_unit, p.rating_avg, p.rating_count,
         p.completeness,
         case
           when p.lat is not null and p.lng is not null
             then public.distance_km(p_lat, p_lng, p.lat, p.lng)
           -- À défaut, la distance du LIEU auquel la fiche est rattachée :
           -- « Ampefy » vaut mieux que rien pour situer un hôtel d'Ampefy.
           when pl.lat is not null and pl.lng is not null
             then public.distance_km(p_lat, p_lng, pl.lat, pl.lng)
           else null
         end as d
    from public.pages p
    left join public.places pl on pl.id = p.place_id
   where p.is_published
     and (p_categorie is null or p_categorie = any(p.categories))
     and (
       (p.lat is not null and p.lng is not null
         and public.distance_km(p_lat, p_lng, p.lat, p.lng) <= p_rayon_km)
       or (p.lat is null and pl.lat is not null and pl.lng is not null
         and public.distance_km(p_lat, p_lng, pl.lat, pl.lng) <= p_rayon_km)
     )
   order by d nulls last, p.completeness desc
   limit least(greatest(coalesce(p_limite, 20), 1), 50)
$$;

-- La destination la plus proche : « vous êtes vers Ampefy ».
create or replace function public.lieu_le_plus_proche(
  p_lat double precision, p_lng double precision)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when pl.id is null then null else jsonb_build_object(
    'id', pl.id, 'slug', pl.slug, 'nom', pl.name_fr, 'region', pl.region,
    'distance_km', round(public.distance_km(p_lat, p_lng, pl.lat, pl.lng)::numeric, 1),
    'nb_etablissements', pl.nb_pages, 'nb_recits', pl.nb_posts,
    'resume', pl.summary
  ) end
  from public.places pl
  where pl.lat is not null and pl.lng is not null and pl.is_touristique
  order by public.distance_km(p_lat, p_lng, pl.lat, pl.lng)
  limit 1
$$;

revoke execute on function public.distance_km(double precision,double precision,double precision,double precision)
  from public, anon, authenticated;
revoke execute on function public.autour_de_moi(double precision,double precision,double precision,text,integer)
  from public, anon, authenticated;
revoke execute on function public.lieu_le_plus_proche(double precision,double precision)
  from public, anon, authenticated;

grant execute on function public.distance_km(double precision,double precision,double precision,double precision)
  to anon, authenticated;
grant execute on function public.autour_de_moi(double precision,double precision,double precision,text,integer)
  to anon, authenticated;
grant execute on function public.lieu_le_plus_proche(double precision,double precision)
  to anon, authenticated;
