-- ============================================================================
-- 0035 — « Y ALLER » : les temps de route RÉELS
--
-- ⚠ LE CHIFFRE QUE PERSONNE NE PUBLIE. Le référentiel porte, pour 41
--   destinations, la distance ET la durée réelle. Leur rapport donne la
--   vitesse effective — et c'est elle qui manque à tout voyageur qui prépare
--   un itinéraire à Madagascar :
--       goudron  46 km/h · piste 23 km/h · bateau 29 · pirogue 15 · 4×4 14
--   Un planificateur qui compte 90 km/h se trompe du simple au double, et
--   c'est ainsi qu'on arrive de nuit sur une piste.
--
-- ⚠ LA VITESSE EST CALCULÉE, JAMAIS SAISIE. Elle dérive de deux colonnes déjà
--   relevées sur le terrain. La saisir à la main créerait une troisième valeur
--   qui divergerait des deux autres au premier changement.
--
-- ⚠ `price_ar` N'EST RENSEIGNÉ QUE SUR UNE LIGNE SUR 42. Il est rendu, mais
--   l'écran ne doit surtout pas en faire une colonne : quarante-et-une cases
--   vides donneraient l'impression d'un tableau cassé plutôt que d'une donnée
--   manquante.
-- ============================================================================

create or replace function public.y_aller()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trajets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug',        d.slug,
               'nom',         d.name_fr,
               'region',      d.region,
               'depuis',      coalesce(o.name_fr, 'Antananarivo'),
               'mode',        a.mode,
               'km',          a.distance_km,
               'heures',      a.duration_h,
               -- Une décimale suffit : « 41,7 km/h » se lit, « 41,6666 » non.
               'kmh',         round((a.distance_km / nullif(a.duration_h, 0))::numeric, 1),
               'etat_route',  a.road_state,
               'toute_annee', a.all_year,
               'depart',      a.departure_point,
               'operateurs',  a.operators,
               'prix_ar',     a.price_ar)
             order by a.duration_h)
        from public.place_access a
        join public.places d on d.id = a.place_id
        left join public.places o on o.id = a.from_place_id
    ), '[]'::jsonb),
    'par_mode', coalesce((
      select jsonb_agg(m order by m->>'mode')
        from (
          select jsonb_build_object(
                   'mode', a.mode,
                   'n', count(*),
                   'kmh_moyen', round(avg(a.distance_km / nullif(a.duration_h, 0))::numeric, 0)
                 ) as m
            from public.place_access a
           group by a.mode
        ) t
    ), '[]'::jsonb),
    'nb_destinations', (select count(distinct place_id) from public.place_access),
    'nb_lieux',        (select count(*) from public.places)
  );
$$;

revoke execute on function public.y_aller() from public;
grant  execute on function public.y_aller() to anon, authenticated;
