-- ============================================================================
-- 0029 — LES FICHES DESTINATION (C1) ET PLAT (C6) DE LA MAQUETTE
--
-- Ces deux écrans manquaient complètement, alors que TOUTE la donnée qui les
-- alimente est déjà en base depuis le lot 1 : 178 lieux avec leur région,
-- leur saisonnalité mois par mois et leurs accès ; 95 plats avec leurs alias,
-- leur famille et leur régime.
--
-- ⚠ C'est le référentiel qui constitue le fossé défensif du produit (TDR §1.5).
--   Le laisser invisible revenait à construire l'avantage et à ne pas le
--   montrer : `place_seasons` répond à « quand partir », `place_access` à
--   « comment y aller », et personne ne pouvait les lire.
--
-- ⚠ COUVERTURE RÉELLE, mesurée en posant ces fonctions : 5 lieux sur 178 ont
--   leur saisonnalité, 41 ont leurs accès. Le calendrier ne s'affiche donc que
--   là où il est renseigné — douze cases grises se liraient « déconseillé
--   toute l'année », ce qui serait un mensonge par omission.
--
-- Une fiche = UN appel. Sur 3G, cinq requêtes pour un écran, c'est cinq
-- aller-retours de 185 ms avant le premier pixel utile.
-- ============================================================================

create or replace function public.fiche_destination(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'lieu', to_jsonb(p) - 'norm',
    -- Les 12 mois, TOUJOURS les 12 : un calendrier à trous laisse croire à une
    -- absence d'information alors que c'est notre meilleure donnée.
    'saisons', (
      select jsonb_agg(jsonb_build_object('mois', m.mois, 'note', ps.rating, 'raison', ps.reason)
                       order by m.mois)
        from generate_series(1, 12) as m(mois)
        left join public.place_seasons ps on ps.place_id = p.id and ps.month = m.mois
    ),
    'acces', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'depuis', dep.name_fr, 'mode', a.mode, 'km', a.distance_km,
               'heures', a.duration_h, 'etat_route', a.road_state,
               'toute_annee', a.all_year, 'depart', a.departure_point,
               'operateurs', a.operators, 'prix_ar', a.price_ar)
             order by a.duration_h nulls last), '[]'::jsonb)
        from public.place_access a
        join public.places dep on dep.id = a.from_place_id
       where a.place_id = p.id
    ),
    -- Les compteurs sont CALCULÉS ici, jamais lus dans nb_pages/nb_posts : ces
    -- colonnes dénormalisées dérivent, et un « 34 pages » faux sur la page
    -- d'une destination se voit tout de suite.
    'nb_ou_dormir', (select count(*) from public.pages g
                      where g.is_published and g.place_id = p.id and 'hotel' = any(g.categories)),
    'nb_ou_manger', (select count(*) from public.pages g
                      where g.is_published and g.place_id = p.id and 'restaurant' = any(g.categories)),
    'nb_pages', (select count(*) from public.pages g where g.is_published and g.place_id = p.id),
    'nb_recits', (select count(*) from public.posts o where o.status='published' and o.place_id = p.id),
    'prix_des', (select min(g.price_min_ar) from public.pages g
                  where g.is_published and g.place_id = p.id and g.price_min_ar is not null),
    'enfants', (select coalesce(jsonb_agg(jsonb_build_object('slug', e.slug, 'nom', e.name_fr)
                                          order by e.name_fr), '[]'::jsonb)
                  from public.places e where e.parent_id = p.id)
  )
  from public.places p
  where p.slug = p_slug
$$;

create or replace function public.fiche_plat(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plat', to_jsonb(d) - 'norm',
    -- Les variantes orthographiques sont AFFICHÉES, pas seulement indexées :
    -- elles disent au lecteur « oui, c'est bien le plat que tu cherchais »,
    -- et elles expliquent pourquoi la recherche le trouve.
    'alias', (select coalesce(jsonb_agg(a.alias order by a.alias), '[]'::jsonb)
                from public.dish_aliases a where a.dish_id = d.id),
    'adresses', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'slug', g.slug, 'nom', g.name, 'lieu', pl.name_fr,
               'prix_ar', mi.price_ar, 'unite', mi.price_unit,
               'note', g.rating_avg, 'nb_avis', g.rating_count,
               'signature', mi.is_signature, 'dispo', mi.in_stock,
               'photo', coalesce(mi.photo_url, g.cover_url))
             order by mi.price_ar nulls last), '[]'::jsonb)
        from public.menu_items mi
        join public.pages g on g.id = mi.page_id and g.is_published
        left join public.places pl on pl.id = g.place_id
       where mi.dish_id = d.id
    ),
    'prix_min', (select min(mi.price_ar) from public.menu_items mi
                  join public.pages g on g.id = mi.page_id and g.is_published
                 where mi.dish_id = d.id),
    'prix_max', (select max(mi.price_ar) from public.menu_items mi
                  join public.pages g on g.id = mi.page_id and g.is_published
                 where mi.dish_id = d.id),
    'nb_recits', (select count(*) from public.posts o
                   where o.status='published' and o.dish_id = d.id)
  )
  from public.dishes d
  where d.slug = p_slug
$$;

revoke execute on function public.fiche_destination(text) from public;
revoke execute on function public.fiche_plat(text)        from public;
grant  execute on function public.fiche_destination(text) to anon, authenticated;
grant  execute on function public.fiche_plat(text)        to anon, authenticated;
