-- ============================================================================
-- 0023 — LA CARTE
--
-- ⚠ CE QUE J'AI TROUVÉ EN LA CONSTRUISANT. Sur 54 fiches publiées, ZÉRO n'a de
--   coordonnées propres : toutes retombent sur le centroïde de leur lieu. Une
--   carte qui empile 54 hôtels sur un seul point ne sert à rien.
--
--   Je ne les invente pas — décaler un hôtel « pour faire joli » revient à
--   dire au voyageur qu'il est là où il n'est pas. Deux réponses honnêtes :
--    ① `precision_geo` dit franchement si le point est exact ou approché ;
--    ② les fiches d'un même point sont REGROUPÉES et le clic les liste toutes.
--
--   Le jour où un gérant pose son épingle, sa fiche se détache du groupe
--   toute seule : rien à changer ici.
-- ============================================================================

create or replace function public.pages_carte(
  p_categorie text default null,
  p_limite    integer default 600
)
returns table (
  id uuid, slug text, name text, categories text[], cover_url text,
  lat double precision, lng double precision, precision_geo text,
  place_name text, price_min_ar bigint, price_min_unit text,
  rating_avg numeric, rating_count integer
)
language sql stable security definer set search_path = public as $$
  select p.id, p.slug, p.name, p.categories, p.cover_url,
         coalesce(p.lat, pl.lat)::double precision,
         coalesce(p.lng, pl.lng)::double precision,
         case when p.lat is not null then 'exacte' else 'lieu' end,
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

-- Lecture publique : une carte derrière un mur de connexion ne sert personne.
revoke execute on function public.pages_carte(text, integer) from public;
grant  execute on function public.pages_carte(text, integer) to anon, authenticated;
