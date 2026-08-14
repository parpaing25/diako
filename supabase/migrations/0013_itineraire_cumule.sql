-- ============================================================================
-- 0013 — L'ITINÉRAIRE, CORRIGÉ
--
-- ⚠ DÉFAUT DE LA MIGRATION 0012, trouvé en testant « un itinéraire dans le
--   sud ». `itineraire_axe` ordonnait les étapes sur la distance d'un tronçon
--   QUELCONQUE partant du lieu. Conséquences visibles :
--     · les étapes sans aucun trajet saisi (Ranomafana, Anja, Tsaranoro…)
--       arrivaient EN TÊTE avec « ? km » ;
--     · Toliara sortait à 243 km — la longueur de son dernier tronçon, pas sa
--       position sur l'axe, qui est de 941 km.
--   Un itinéraire faux est pire qu'une absence d'itinéraire : il a l'air d'une
--   réponse.
--
--   La correction demande un parcours CUMULÉ depuis un point de départ. La
--   récursion suit le graphe des trajets et retient le plus court chemin vers
--   chaque lieu ; min() départage quand plusieurs routes mènent au même endroit
--   — Toliara est atteignable en direct depuis Tana ET par la chaîne de la RN7.
--   La profondeur est bornée à 8 : le graphe contient des cycles.
--
-- Vérifié après correction : Antsirabe 170 km · Ambositra 263 · Fianarantsoa
-- 415 · Ambalavao 465 · Isalo 698 · Toliara 941 · Ifaty 966. Les 941 km
-- concordent avec les 950 à 980 km annoncés par les sources pour la RN7.
-- ============================================================================

-- Les étapes touristiques de la RN7 n'avaient aucun trajet : sans embranchement
-- elles ne peuvent pas être placées sur l'axe.
insert into public.place_access
  (place_id, from_place_id, mode, distance_km, duration_h, road_state, all_year, operators)
select a.id, d.id, v.mode, v.km, v.h, v.etat, v.toute_annee, string_to_array(v.op, ',')::text[]
from (values
  ('ranomafana',   'fianarantsoa', 'goudron', 65,  1.5, 'RN25 goudronnée vers la côte est', true, 'Coopératives RN25'),
  ('anja',         'ambalavao',    'goudron', 13,  0.3, 'RN7, réserve à droite en descendant vers le sud', true, 'Taxi-brousse local'),
  ('andringitra',  'ambalavao',    'piste',   47,  2.5, 'Piste praticable en 4x4, difficile après la pluie', false, '4x4 avec chauffeur'),
  ('tsaranoro',    'ambalavao',    'piste',   45,  2.0, 'Piste en 4x4 depuis la RN7', false, '4x4 avec chauffeur'),
  ('antoetra',     'ambositra',    'piste',   35,  1.5, 'Piste en terre, 4x4 conseillé', false, '4x4 avec chauffeur'),
  ('zafimaniry',   'antoetra',     '4x4',     10,  3.0, 'Les villages se rejoignent à pied depuis Antoetra', true, 'Guide local à pied'),
  ('zombitse',     'ranohira',     'goudron', 90,  1.5, 'La RN7 traverse le parc : arrêt possible sur la route', true, 'Coopératives RN7'),
  ('mangily',      'ifaty',        'piste',    3,  0.2, 'Même piste côtière', true, 'Taxi-brousse local'),
  ('nosy-ve',      'anakao',       'pirogue',  3,  0.3, 'Pirogue à balancier depuis la plage d''Anakao', true, 'Piroguiers vezo'),
  ('tulear-recif', 'toliara',      'bateau',   5,  0.5, 'Sortie en bateau depuis Toliara ou Ifaty', true, 'Clubs de plongée'),
  ('lac-itasy',    'ampefy',       'goudron',  6,  0.3, 'À la sortie d''Ampefy', true, 'Taxi-brousse local'),
  ('allee-des-baobabs','morondava','piste',   20,  0.7, 'Piste de Belo, praticable toute l''année', true, 'Taxi-brousse local'),
  ('kirindy',      'morondava',    'piste',   60,  2.0, 'Piste de Belo puis embranchement', true, '4x4 avec chauffeur'),
  ('montagne-d-ambre','antsiranana','goudron',37,  1.0, 'Goudron jusqu''à Joffreville, puis piste courte', true, 'Taxi-brousse local'),
  ('ramena',       'antsiranana',  'goudron', 18,  0.5, 'Route goudronnée jusqu''à la plage', true, 'Taxi-brousse local'),
  ('ankarana',     'antsiranana',  'goudron',108,  2.5, 'RN6 goudronnée vers le sud', true, 'Coopératives RN6'),
  ('ankarafantsika','mahajanga',   'goudron',114,  2.0, 'RN4 goudronnée, le parc est sur la route de Tana', true, 'Coopératives RN4'),
  ('cirque-rouge', 'mahajanga',    'goudron', 12,  0.4, 'À un quart d''heure du centre', true, 'Taxi-brousse local'),
  ('ile-aux-nattes','nosy-boraha', 'pirogue',   4,  0.2, 'Cinq minutes de pirogue depuis la pointe sud', true, 'Piroguiers locaux'),
  ('analamazaotra','andasibe',     'goudron',   2,  0.1, 'À l''entrée du village', true, 'À pied')
) as v(vers, depuis, mode, km, h, etat, toute_annee, op)
join public.places a on a.slug = v.vers
join public.places d on d.slug = v.depuis
where not exists (
  select 1 from public.place_access pa
   where pa.place_id = a.id and pa.from_place_id = d.id and pa.mode = v.mode
);

create or replace function public.itineraire_axe(p_axe text, p_depuis text default 'antananarivo')
returns jsonb
language sql stable security definer set search_path = public as $$
  with recursive depart as (
    select id from public.places where slug = p_depuis
  ), chemin as (
    select d.id as place_id, 0::numeric as km, 0::numeric as h, 0 as profondeur
      from depart d
    union all
    select pa.place_id,
           c.km + coalesce(pa.distance_km, 0),
           c.h  + coalesce(pa.duration_h, 0),
           c.profondeur + 1
      from chemin c
      join public.place_access pa on pa.from_place_id = c.place_id
     where c.profondeur < 8
  ), atteint as (
    select place_id, min(km) as km_cumul, min(h) as h_cumul
      from chemin group by place_id
  )
  select coalesce(jsonb_agg(s.j order by s.km_cumul nulls last, s.nom), '[]'::jsonb)
  from (
    select pl.name_fr as nom, at.km_cumul,
      jsonb_build_object(
        'etape', pl.name_fr, 'slug', pl.slug, 'type', pl.kind, 'region', pl.region,
        'resume', pl.summary, 'a_voir', pl.why_go,
        'km_depuis_le_depart', at.km_cumul,
        'heures_de_route_cumulees', at.h_cumul,
        'derniere_etape', (
          select jsonb_build_object(
                   'depuis', dp.name_fr, 'distance_km', pa.distance_km,
                   'duree_h', pa.duration_h, 'mode', pa.mode,
                   'etat_route', pa.road_state, 'ouvert_toute_l_annee', pa.all_year,
                   'transporteurs', pa.operators, 'prix_ar', pa.price_ar)
            from public.place_access pa
            join public.places dp on dp.id = pa.from_place_id
           where pa.place_id = pl.id
           order by pa.distance_km limit 1),
        'saison_ce_mois', (
          select jsonb_build_object('note', ps.rating, 'raison', ps.reason)
            from public.place_seasons ps
           where ps.place_id = pl.id and ps.month = extract(month from now())::smallint),
        'nb_etablissements', pl.nb_pages,
        'nb_recits', pl.nb_posts,
        'a_partir_de_ar', (
          select min(p.price_min_ar) from public.pages p
           where p.place_id = pl.id and p.is_published and p.price_min_ar is not null)
      ) as j
    from public.places pl
    left join atteint at on at.place_id = pl.id
    where pl.is_touristique and (p_axe is null or pl.axe = p_axe)
  ) s
$$;

drop function if exists public.itineraire_axe(text);

revoke execute on function public.itineraire_axe(text, text) from public, anon, authenticated;
grant  execute on function public.itineraire_axe(text, text) to anon, authenticated;

-- Libellés d'équipements : les accents avaient sauté au passage par l'outil de
-- migration. Ils sont visibles à l'écran, donc ils comptent.
update public.amenities a set label_fr = v.bon
from (values
  ('randonnee','Randonnée'),('especes','Espèces'),('a-emporter','À emporter'),
  ('plongee','Plongée'),('cuisine-equipee','Cuisine équipée'),
  ('menu-vegetarien','Menu végétarien'),('petit-dejeuner','Petit déjeuner inclus'),
  ('groupe-electrogene','Groupe électrogène'),('peche','Pêche'),
  ('navette-aeroport','Navette aéroport'),('acces-4x4','Accès 4x4 nécessaire'),
  ('reception-24h','Réception 24h/24'),('famille','Adapté aux familles'),
  ('salle-reunion','Salle de réunion'),('animaux','Animaux acceptés'),
  ('acces-bateau','Accessible en bateau')
) as v(code, bon)
where a.code = v.code and a.label_fr <> v.bon;
