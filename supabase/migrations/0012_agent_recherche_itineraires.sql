-- ============================================================================
-- 0012 — CE QUE L'AGENT DIAKO APPELLERA
--
-- Le partage des rôles, écrit une fois pour toutes :
--   · le modèle de langue TRADUIT « un hôtel à Ampefy avec piscine chauffée,
--     200 000 Ar la nuit » en paramètres structurés ;
--   · `agent_chercher` RÉPOND avec des faits pris en base ;
--   · le modèle REFORMULE la réponse.
--
-- Ce découpage n'est pas cosmétique : c'est ce qui empêche l'agent d'inventer
-- un hôtel, un prix ou une piscine. Il ne peut citer que ce que la fonction
-- lui rend, et la fonction ne rend que ce qui est saisi.
--
-- La sortie est du jsonb volontairement bavard : elle contient le POURQUOI de
-- chaque résultat (« piscine chauffée : oui », « chambre 2 pers. à 95 000 Ar »)
-- pour que l'agent puisse justifier sa proposition au lieu de la présenter
-- comme une évidence.
-- ============================================================================

-- ── 1. LES TRAJETS ──────────────────────────────────────────────────────────
-- « Comment y aller » est l'une des trois questions les plus fréquentes, et la
-- réponse malgache n'est jamais celle d'un calculateur d'itinéraire : 142 km
-- entre Ambalavao et Ihosy, c'est trois heures et demie, pas une heure et
-- demie.
--
-- ⚠ PRIX : seul le tarif direct Tana → Toliara est sourcé (≈ 80 000 Ar en
--   taxi-brousse, 2026). Je ne répartis PAS ce montant au prorata des tronçons :
--   ça produirait des chiffres qui auraient l'air de données. Les autres
--   `price_ar` sont NULL, et l'agent devra dire « transport non chiffré »
--   plutôt qu'un montant inventé. C'est une collecte de terrain à faire.
insert into public.place_access
  (place_id, from_place_id, mode, distance_km, duration_h, road_state, all_year, operators, price_ar)
select a.id, d.id, v.mode, v.km, v.h, v.etat, v.toute_annee,
       string_to_array(v.transporteurs, ',')::text[], v.prix
from (values
  -- RN1 puis RN43 — la sortie de week-end des Tananariviens
  ('ampefy',       'antananarivo', 'goudron', 121,  2.3, 'RN1 goudronnée jusqu''à Analavory, puis 11 km jusqu''à Ampefy', true,  'Coopératives RN1', null::bigint),
  ('analavory',    'antananarivo', 'goudron', 110,  2.1, 'RN1 goudronnée', true, 'Coopératives RN1', null),

  -- RN7, du nord au sud. Les durées sont les durées RÉELLES, pas la distance
  -- divisée par une vitesse moyenne européenne.
  ('ambatolampy',  'antananarivo', 'goudron',  69,  1.5, 'RN7 goudronnée, trafic dense à la sortie de Tana', true, 'Coopératives RN7', null),
  ('antsirabe',    'antananarivo', 'goudron', 170,  3.5, 'RN7 goudronnée, nids-de-poule ponctuels', true, 'Cotisse,Soatrans', null),
  ('ambositra',    'antsirabe',    'goudron',  93,  2.0, 'RN7 goudronnée', true, 'Cotisse,Soatrans', null),
  ('fianarantsoa', 'ambositra',    'goudron', 152,  3.5, 'RN7 goudronnée, route de montagne sinueuse', true, 'Cotisse,Soatrans', null),
  ('ambalavao',    'fianarantsoa', 'goudron',  50,  1.0, 'RN7 goudronnée', true, 'Coopératives RN7', null),
  ('ihosy',        'ambalavao',    'goudron', 142,  3.5, 'Section la plus dégradée de la RN7 : bitume abîmé, nids-de-poule marqués', true, 'Coopératives RN7', null),
  ('ranohira',     'ihosy',        'goudron',  91,  1.5, 'RN7 goudronnée, traversée du plateau de l''Horombe', true, 'Coopératives RN7', null),
  ('isalo',        'ihosy',        'goudron',  91,  1.5, 'RN7 goudronnée jusqu''à Ranohira, entrée du parc', true, 'Coopératives RN7', null),
  ('toliara',      'ranohira',     'goudron', 243,  4.5, 'RN7 goudronnée, traversée de Sakaraha et de la forêt de Zombitse', true, 'Coopératives RN7', null),
  ('toliara',      'antananarivo', 'goudron', 950, 20.0, 'RN7 sur toute sa longueur — 18 à 24 h en direct, à ne pas faire d''une traite', true, 'Cotisse,Soatrans,Kofmad', 80000),

  -- Les prolongements de la RN7 vers la côte
  ('ifaty',        'toliara',      'piste',    25,  1.0, 'Piste sableuse le long de la côte', true, 'Taxi-brousse local', null),
  ('anakao',       'toliara',      'bateau',   40,  1.5, 'Vedette depuis Toliara, selon la mer', true, 'Vedettes locales', null),

  -- Les autres axes structurants
  ('toamasina',    'antananarivo', 'goudron', 350,  7.0, 'RN2 goudronnée, route de montagne très sinueuse', true, 'Coopératives RN2', null),
  ('andasibe',     'antananarivo', 'goudron', 140,  3.0, 'RN2 goudronnée', true, 'Coopératives RN2', null),
  ('mahajanga',    'antananarivo', 'goudron', 570, 10.0, 'RN4 goudronnée, l''une des meilleures routes du pays', true, 'Coopératives RN4', null),
  ('morondava',    'antananarivo', 'goudron', 700, 14.0, 'RN34 puis RN35, état inégal', true, 'Coopératives ouest', null),
  ('antsiranana',  'antananarivo', 'goudron',1100, 24.0, 'RN4 puis RN6 — trajet très long, l''avion est souvent préféré', true, 'Coopératives nord', null),
  ('nosy-be',      'ankify',       'bateau',    8,  0.6, 'Vedette rapide depuis l''embarcadère d''Ankify', true, 'Vedettes régulières', null),
  ('nosy-boraha',  'toamasina',    'bateau',  160,  2.5, 'Vedette depuis Soanierana Ivongo, après 3 h de route depuis Toamasina', false, 'Vedettes El Condor,Gasikara Be', null),
  ('tsingy-de-bemaraha','morondava','4x4',    200,  8.0, 'Piste difficile, deux bacs à traverser. FERMÉ en saison des pluies', false, '4x4 avec chauffeur', null)
) as v(vers, depuis, mode, km, h, etat, toute_annee, transporteurs, prix)
join public.places a on a.slug = v.vers
join public.places d on d.slug = v.depuis
where not exists (
  select 1 from public.place_access pa
   where pa.place_id = a.id and pa.from_place_id = d.id and pa.mode = v.mode
);

-- ── 2. LA RECHERCHE DE L'AGENT ──────────────────────────────────────────────
--
-- Règles de combinaison, choisies pour coller à la façon dont on parle :
--   · p_equipements : TOUS exigés. « avec piscine chauffée ET wifi » veut dire
--     les deux, pas l'un ou l'autre.
--   · p_cuisines : AU MOINS UNE. « japonais ou thaï » est une alternative.
--   · p_personnes : au moins une chambre doit accueillir ce nombre d'adultes.
--   · p_budget_max : porte sur le tarif réel de la chambre quand une capacité
--     est demandée, sinon sur le prix plancher de l'établissement.
create or replace function public.agent_chercher(
  p_lieu        text default null,
  p_categorie   text default null,
  p_budget_max  bigint default null,
  p_budget_min  bigint default null,
  p_equipements text[] default null,
  p_cuisines    text[] default null,
  p_plat        text default null,
  p_personnes   smallint default null,
  p_limite      integer default 10)
returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  with lieu as (
    -- On accepte un slug OU du texte libre : « majunga » comme « mahajanga ».
    select coalesce(
      (select id from public.places where p_lieu is not null and slug = p_lieu),
      (select r.id from public.resoudre_lieu(coalesce(p_lieu, ''), 1) r)
    ) as id
  ), zone as (
    select z.id from lieu l cross join lateral public.lieu_et_descendants(l.id) z
    where l.id is not null
  ), plat as (
    select coalesce(
      (select id from public.dishes where p_plat is not null and slug = p_plat),
      (select r.id from public.resoudre_plat(coalesce(p_plat, ''), 1) r)
    ) as id
  ), retenus as (
    select p.*,
           -- La chambre la moins chère qui accueille le nombre demandé.
           (select jsonb_build_object(
                     'nom', rt.name, 'prix_ar', rt.base_price_ar,
                     'adultes', rt.max_adults, 'enfants', rt.max_children,
                     'eau_chaude', rt.hot_water, 'vue', rt.view)
              from public.room_types rt
             where rt.page_id = p.id and rt.status = 'actif'
               and (p_personnes is null or coalesce(rt.max_adults, 0) >= p_personnes)
               and (p_budget_max is null or rt.base_price_ar <= p_budget_max)
             order by rt.base_price_ar
             limit 1) as chambre,
           (select min(mi.price_ar) from public.menu_items mi
             where mi.page_id = p.id and mi.in_stock
               and mi.dish_id = (select plat.id from plat)) as prix_plat
      from public.pages p
     where p.is_published
       and (not exists (select 1 from zone) or p.place_id in (select zone.id from zone))
       and (p_categorie is null or p_categorie = any(p.categories))
       -- TOUS les équipements demandés, pas au moins un.
       and (p_equipements is null or cardinality(p_equipements) = 0 or not exists (
             select 1 from unnest(p_equipements) e
              where not exists (select 1 from public.page_amenities pa
                                 where pa.page_id = p.id and pa.code = e)))
       -- AU MOINS UNE des cuisines demandées.
       and (p_cuisines is null or cardinality(p_cuisines) = 0 or exists (
             select 1 from public.page_cuisines pc
              where pc.page_id = p.id and pc.cuisine_slug = any(p_cuisines)))
       and ((select plat.id from plat) is null or exists (
             select 1 from public.menu_items mi
              where mi.page_id = p.id and mi.in_stock
                and mi.dish_id = (select plat.id from plat)))
       -- Une capacité demandée exige une chambre qui la satisfasse.
       and (p_personnes is null or exists (
             select 1 from public.room_types rt
              where rt.page_id = p.id and rt.status = 'actif'
                and coalesce(rt.max_adults, 0) >= p_personnes
                and (p_budget_max is null or rt.base_price_ar <= p_budget_max)))
       -- Le budget porte sur le prix plancher quand aucune capacité n'est demandée.
       and (p_personnes is not null or p_budget_max is null
            or (p.price_min_ar is not null and p.price_min_ar <= p_budget_max))
       and (p_budget_min is null or p.price_min_ar is null or p.price_min_ar >= p_budget_min)
  )
  select coalesce(jsonb_agg(s.j order by s.rang desc, s.nom), '[]'::jsonb) from (
    select r.name as nom, r.completeness as rang,
           jsonb_build_object(
             'nom', r.name, 'slug', r.slug, 'url', '/p/' || r.slug,
             'categories', r.categories,
             'destination', (select name_fr from public.places where id = r.place_id),
             'repere', r.landmark,
             'resume', r.short_desc,
             'telephone', r.phone, 'whatsapp', r.whatsapp,
             'prix_a_partir_de_ar', r.price_min_ar, 'unite', r.price_min_unit,
             'niveau_de_prix', r.price_level,
             'note', case when r.rating_count > 0 then r.rating_avg end,
             'nb_avis', r.rating_count,
             'verifie', r.verification_status <> 'none',
             'fiche_tenue_par_le_proprietaire', r.owner_id is not null,
             'chambre_correspondante', r.chambre,
             'prix_du_plat_ar', r.prix_plat,
             'equipements', coalesce((
               select jsonb_agg(a.label_fr order by a.rang)
                 from public.page_amenities pa join public.amenities a on a.code = pa.code
                where pa.page_id = r.id), '[]'::jsonb),
             'cuisines', coalesce((
               select jsonb_agg(c.label_fr order by c.rang)
                 from public.page_cuisines pc join public.cuisines c on c.slug = pc.cuisine_slug
                where pc.page_id = r.id), '[]'::jsonb),
             'completude', r.completeness,
             'source', r.source
           ) as j
      from retenus r
     order by r.completeness desc, r.rating_avg desc, r.name
     limit least(greatest(coalesce(p_limite, 10), 1), 25)
  ) s
$$;

-- ── 3. LES ITINÉRAIRES ──────────────────────────────────────────────────────
-- « Un itinéraire dans le sud » : on rend la chaîne ordonnée des étapes d'un
-- axe, avec les distances et les durées réelles, et ce qui est référencé à
-- chaque arrêt. L'agent compose le récit ; la base fournit la géographie.
create or replace function public.itineraire_axe(p_axe text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(j order by ordre), '[]'::jsonb) from (
    select
      row_number() over (order by coalesce(pa.distance_km, 0)) as ordre,
      jsonb_build_object(
        'etape', pl.name_fr,
        'slug', pl.slug,
        'type', pl.kind,
        'region', pl.region,
        'resume', pl.summary,
        'a_voir', pl.why_go,
        'depuis', (select name_fr from public.places where id = pa.from_place_id),
        'distance_km', pa.distance_km,
        'duree_h', pa.duration_h,
        'etat_route', pa.road_state,
        'ouvert_toute_l_annee', pa.all_year,
        'transporteurs', pa.operators,
        'prix_transport_ar', pa.price_ar,
        'nb_etablissements', pl.nb_pages,
        'nb_recits', pl.nb_posts,
        'a_partir_de_ar', (
          select min(p.price_min_ar) from public.pages p
           where p.place_id = pl.id and p.is_published and p.price_min_ar is not null)
      ) as j
    from public.places pl
    left join lateral (
      select * from public.place_access pa2 where pa2.place_id = pl.id
       order by pa2.distance_km limit 1
    ) pa on true
    where pl.axe = p_axe and pl.is_touristique
  ) s
$$;

-- Les trajets connus au départ d'un lieu — « comment aller à Morondava ».
create or replace function public.trajets_depuis(p_lieu text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'vers', a.name_fr, 'slug', a.slug,
           'mode', pa.mode, 'distance_km', pa.distance_km, 'duree_h', pa.duration_h,
           'etat_route', pa.road_state, 'ouvert_toute_l_annee', pa.all_year,
           'transporteurs', pa.operators, 'prix_ar', pa.price_ar)
         order by pa.distance_km), '[]'::jsonb)
    from public.place_access pa
    join public.places d on d.id = pa.from_place_id
    join public.places a on a.id = pa.place_id
   where d.slug = p_lieu
$$;

-- ── 4. PRIVILÈGES ───────────────────────────────────────────────────────────
revoke execute on function public.agent_chercher(text,text,bigint,bigint,text[],text[],text,smallint,integer)
  from public, anon, authenticated;
revoke execute on function public.itineraire_axe(text)  from public, anon, authenticated;
revoke execute on function public.trajets_depuis(text)  from public, anon, authenticated;

-- L'agent doit répondre AVANT l'inscription : c'est par lui qu'on découvrira
-- le site, et c'est ce que Google suivra.
grant execute on function public.agent_chercher(text,text,bigint,bigint,text[],text[],text,smallint,integer)
  to anon, authenticated;
grant execute on function public.itineraire_axe(text)  to anon, authenticated;
grant execute on function public.trajets_depuis(text)  to anon, authenticated;
