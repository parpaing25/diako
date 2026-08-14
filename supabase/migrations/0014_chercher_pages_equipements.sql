-- ============================================================================
-- 0014 — LE FILTRE D'ÉQUIPEMENTS DANS LA RECHERCHE PUBLIQUE
--
-- « Un hôtel avec piscine » doit marcher depuis la barre de recherche du site,
-- pas seulement depuis l'agent. Même règle que pour `agent_chercher` : TOUS
-- les équipements demandés sont exigés, pas au moins un. C'est ainsi qu'on
-- parle — « avec piscine ET wifi » veut dire les deux.
-- ============================================================================

create or replace function public.chercher_pages(
  p_lieu text default null,
  p_categorie text default null,
  p_prix_max bigint default null,
  p_plat text default null,
  p_curseur_score smallint default null,
  p_curseur_id uuid default null,
  p_limite integer default 12,
  p_equipements text[] default null)
returns table (
  id uuid, slug text, name text, categories text[], short_desc text,
  cover_url text, place_slug text, place_name text, landmark text,
  price_min_ar bigint, price_min_unit text, rating_avg numeric, rating_count integer,
  verification_status text, completeness smallint, prix_du_plat bigint)
language sql stable security definer set search_path = public as $$
  with lieu as (
    select id from public.places where p_lieu is not null and slug = p_lieu
  ), zone as (
    select d.id from lieu l cross join lateral public.lieu_et_descendants(l.id) d
  ), plat as (
    select id from public.dishes where p_plat is not null and slug = p_plat
  )
  select p.id, p.slug, p.name, p.categories, p.short_desc, p.cover_url,
         pl.slug, pl.name_fr, p.landmark,
         p.price_min_ar, p.price_min_unit, p.rating_avg, p.rating_count,
         p.verification_status, p.completeness,
         (select min(mi.price_ar) from public.menu_items mi
           where mi.page_id = p.id and mi.in_stock
             and mi.dish_id = (select plat.id from plat)) as prix_du_plat
    from public.pages p
    left join public.places pl on pl.id = p.place_id
   where p.is_published
     and (p_lieu is null      or p.place_id in (select zone.id from zone))
     and (p_categorie is null or p_categorie = any(p.categories))
     and (p_prix_max is null  or (p.price_min_ar is not null and p.price_min_ar <= p_prix_max))
     and (p_equipements is null or cardinality(p_equipements) = 0 or not exists (
           select 1 from unnest(p_equipements) e
            where not exists (select 1 from public.page_amenities pa
                               where pa.page_id = p.id and pa.code = e)))
     and (p_plat is null      or exists (
            select 1 from public.menu_items mi
             where mi.page_id = p.id and mi.in_stock
               and mi.dish_id = (select plat.id from plat)))
     and (p_curseur_score is null or p_curseur_id is null
          or (p.completeness, p.id) < (p_curseur_score, p_curseur_id))
   order by p.completeness desc, p.id desc
   limit least(greatest(coalesce(p_limite, 12), 1), 40)
$$;

revoke execute on function public.chercher_pages(text,text,bigint,text,smallint,uuid,integer,text[])
  from public, anon, authenticated;
grant execute on function public.chercher_pages(text,text,bigint,text,smallint,uuid,integer,text[])
  to anon, authenticated;
