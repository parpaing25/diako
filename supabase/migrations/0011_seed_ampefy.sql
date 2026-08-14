-- ============================================================================
-- 0011 — LES 54 HÔTELS D'AMPEFY : LA PREMIÈRE DONNÉE RÉELLE DU PRODUIT
--
-- Source primaire : « Liste des Hôtels — Secteur AMPEFY », document de l'Office
-- du Tourisme du Lac Itasy transmis par l'éditeur. 54 établissements, nom et
-- téléphone. C'est peu par fiche, mais c'est VRAI et vérifiable — et un
-- annuaire complet de 54 hôtels avec leurs numéros vaut mieux que six fiches
-- inventées.
--
-- ⚠ CE QUI EST ENRICHI ET CE QUI NE L'EST PAS. Six établissements ont une
--   présence en ligne exploitable et ont été enrichis (description, niveau de
--   prix, équipements), chacun avec sa source dans la colonne `source`. Les
--   48 autres n'ont que leur nom et leur numéro : c'est écrit tel quel, et la
--   complétude calculée par la base les classera naturellement derrière.
--   Les compléter est un travail de terrain — appeler les numéros — pas un
--   travail de code.
--
-- ⚠ PRIX EN ARIARY : je n'en invente aucun. Les sources web donnent des
--   fourchettes en EUROS ; les convertir avec un taux supposé produirait des
--   chiffres qui auraient l'air de données. Un seul prix en ariary est
--   directement sourcé (Kavitaha, 93 000 Ar la double, Petit Futé) et il est
--   le seul saisi comme tarif. Pour les autres, on renseigne `price_level`
--   (1 à 4), qui est un signal robuste et n'engage pas un montant faux.
--
-- Ces fiches sont ÉDITORIALES : owner_id NULL. Un gérant pourra revendiquer la
-- sienne via revendiquer_page() (migration 0010).
-- ============================================================================

do $$
declare
  v_ampefy uuid;
  v_src    text := 'Liste des Hôtels — Secteur AMPEFY, Office du Tourisme du Lac Itasy (document transmis par l''éditeur, 2026)';
begin
  select id into v_ampefy from public.places where slug = 'ampefy';
  if v_ampefy is null then raise exception 'Le lieu « ampefy » est absent du référentiel.'; end if;

  insert into public.pages (slug, owner_id, name, categories, place_id, phone, source, is_published)
  select v.slug, null, v.nom, array['hotel']::text[], v_ampefy, v.tel, v_src, true
  from (values
    ('akany-fitia-ampefy',      'Akany Fitia Ampefy',        '+261 34 55 577 87'),
    ('akany-sambatra',          'Akany Sambatra',            '+261 34 16 371 65'),
    ('allamanda-lodge',         'Allamanda Lodge',           '+261 34 07 161 60'),
    ('ampefy-lodge',            'Ampefy Lodge',              '+261 34 07 465 00'),
    ('ao-antanana',             'Ao Antanàna',               '+261 34 55 909 77'),
    ('arcancia-auberge',        'Arcancia Auberge',          '+261 34 44 761 50'),
    ('auberge-la-taniere',      'Auberge La Tanière',        '+261 34 90 703 98'),
    ('auberge-mahatazana',      'Auberge Mahatazana',        '+261 34 18 256 15'),
    ('avila-auberge',           'Avila Auberge',             '+261 38 59 983 35'),
    ('belle-vue-ampefy',        'Belle-Vue',                 '+261 34 06 118 21'),
    ('chez-jacky-ampefy',       'Chez Jacky',                '+261 34 47 378 67'),
    ('chez-tasha',              'Chez Tasha',                '+261 33 87 780 06'),
    ('domaine-tsiazompaniry',   'Domaine Tsiazompaniry',     '+261 38 95 734 47'),
    ('eden-auberge',            'Eden Auberge',              '+261 34 67 904 81'),
    ('eden-bea',                'Eden Béa',                  '+261 38 60 919 70'),
    ('fahasovana-maison-hote',  'Fahasovana Maison d''Hôte', '+261 34 23 115 57'),
    ('fairy-tale-ampefy',       'Fairy-Tale',                '+261 38 84 189 62'),
    ('falafa-ampefy',           'Falafa Ampefy',             '+33 7 58 43 08 72'),
    ('fanirina-ranch',          'Fanirina Ranch',            '+261 34 65 118 44'),
    ('farihy-hotel',            'Farihy Hôtel',              '+261 32 07 413 55'),
    ('fitahiana-lodge',         'Fitahiana Lodge',           '+261 34 74 364 03'),
    ('hostellerie-du-grand-lac','Hostellerie du Grand Lac',  '+261 38 77 763 21'),
    ('hotel-lovasoa-ampefy',    'Hôtel Lovasoa',             '+261 38 05 964 07'),
    ('kavitaha-hotel',          'Kavitaha Hôtel Restaurant', '+261 34 10 459 70'),
    ('kiasa-house',             'Kiasa House',               '+261 38 42 715 60'),
    ('la-cabane-ampefy',        'La Cabane Ampefy',          '+261 38 58 461 76'),
    ('la-chaumiere-ampefy',     'La Chaumière',              '+261 38 50 799 24'),
    ('la-cigale-ampefy',        'La Cigale',                 '+261 34 17 118 26'),
    ('la-palmeraie-du-lac',     'La Palmeraie du Lac',       '+261 34 71 163 04'),
    ('la-sirene-hotel',         'La Sirène Hôtel',           '+261 38 29 100 71'),
    ('la-terrasse-auberge',     'La Terrasse Auberge',       '+261 34 16 937 16'),
    ('la-villa-ampefy',         'La Villa Ampefy',           '+261 34 78 092 15'),
    ('lapa-maison-hote',        'Lapa Maison d''Hôte',       '+261 38 75 904 56'),
    ('larome-lodge',            'L''Arôme Lodge',            '+261 33 82 858 77'),
    ('le-lac-itasy-centre',     'Le Lac Itasy Centre',       '+261 33 12 045 23'),
    ('le-repos-dampefy',        'Le Repos d''Ampefy',        '+261 34 05 057 23'),
    ('les-cases-metisses',      'Les Cases Métisses',        '+261 34 38 703 92'),
    ('loree-dampefy',           'L''Orée d''Ampefy',         '+261 38 53 405 59'),
    ('malala-nirina',           'Malala Nirina',             '+261 38 08 111 44'),
    ('montagna-lodge',          'Montagna Lodge',            '+261 34 27 754 37'),
    ('namaste-guest-house',     'Namaste Guest House',       '+261 34 03 853 73'),
    ('nosy-mamy-ampefy',        'Nosy Mamy',                 '+261 34 08 734 54'),
    ('ny-alondrano',            'Ny Alondrano',              '+261 38 06 608 25'),
    ('paulownia-ampefy',        'Paulownia',                 '+261 38 22 057 57'),
    ('relais-de-la-vierge',     'Relais de la Vierge',       '+261 34 09 701 80'),
    ('riarano-hotel',           'Riarano Hôtel',             '+261 34 40 531 44'),
    ('serenity-hotel-ampefy',   'Serenity Hôtel',            '+261 34 54 493 89'),
    ('serenity-house-ampefy',   'Serenity House',            '+261 38 44 415 99'),
    ('soanomena-ampefy',        'Soanomena Ampefy',          '+261 34 10 822 68'),
    ('villa-razaka',            'Villa Razaka',              '+261 34 29 698 07'),
    ('villa-skyla',             'Villa Skyla',               '+261 38 08 417 29'),
    ('villa-verone',            'Villa Verone',              '+261 38 38 012 13'),
    ('vohitra-resort',          'Vohitra Resort',            '+261 37 42 133 72'),
    ('vohitriniaina',           'Vohitriniaina',             '+261 34 66 454 69')
  ) as v(slug, nom, tel)
  on conflict (slug) do update set
    name = excluded.name, phone = excluded.phone, place_id = excluded.place_id,
    source = excluded.source;
end $$;

-- Kavitaha fait aussi restaurant : c'est écrit dans son nom même.
update public.pages set categories = array['hotel','restaurant']::text[]
 where slug = 'kavitaha-hotel';

-- ────────────────────────────────────────────────────────────────────────────
-- ENRICHISSEMENT — uniquement ce qui est sourcé, avec la source citée.
-- ────────────────────────────────────────────────────────────────────────────

update public.pages set
  short_desc = 'Villas au bord du lac Itasy, avec spa et restaurant. L''adresse haut de gamme du secteur.',
  long_desc  = 'Établissement en bordure du lac Itasy, à environ 2 km du centre d''Ampefy. Villas avec piscine privée, spa (massages et soins), restaurant et vue directe sur le lac. Comptez 150 à 200 € la nuit en villa double en haute saison. C''est l''un des rares hôtels du secteur à accepter la carte bancaire (Visa, Mastercard) : ailleurs, prévoyez des espèces en ariary.',
  price_level = 4,
  source = source || ' · Enrichi le 01/08/2026 depuis feelmadagascar.com'
 where slug = 'hostellerie-du-grand-lac';

update public.pages set
  short_desc = 'Chambres spacieuses avec piscine et jardin, à 5 km du centre sur la route de Soavinandriana.',
  long_desc  = 'Cadre calme à environ 5 km du centre d''Ampefy, sur la route de Soavinandriana. Chambres spacieuses, piscine entretenue, jardin, Wi-Fi fonctionnel. Fourchette relevée : 40 à 80 € la nuit selon la saison.',
  price_level = 3,
  source = source || ' · Enrichi le 01/08/2026 depuis feelmadagascar.com'
 where slug = 'farihy-hotel';

update public.pages set
  short_desc = 'Face au lac, deux piscines et un grand jardin. La valeur sûre des familles.',
  long_desc  = 'Établissement familial en bordure du lac Itasy, avec accès direct à l''eau. Deux piscines, grand jardin, restaurant. L''hôtel organise des sorties en pirogue et des randonnées. La chambre double est relevée à 93 000 Ar ; les fourchettes en ligne donnent 30 à 60 € la nuit selon la chambre et la saison.',
  price_level = 2,
  source = source || ' · Enrichi le 01/08/2026 depuis petitfute.co.uk et feelmadagascar.com'
 where slug = 'kavitaha-hotel';

update public.pages set
  short_desc = 'Lodge avec jardin et parking privé gratuit. Pas de piscine — c''est dit franchement.',
  long_desc  = 'Lodge à Ampefy, à 8,4 km des chutes de la Lily. Jardin, parking privé gratuit, balcon ou terrasse, petit déjeuner, connexion internet, adapté aux enfants. L''établissement N''A PAS de piscine — autant le savoir avant de réserver. Tarifs relevés à partir de 59 $ la nuit.',
  price_level = 3,
  source = source || ' · Enrichi le 01/08/2026 depuis planetofhotels.com et vacationcottage.com'
 where slug = 'allamanda-lodge';

update public.pages set
  short_desc = 'Hébergement style ranch, avec balades à cheval. Pas de piscine.',
  long_desc  = 'Sur la route d''Ampefy, avant le centre-ville. Ambiance ranch, restaurant sur place, et surtout des balades à cheval d''une à trois heures (environ 6 € la sortie). Pas de piscine. Fourchette relevée : 20 à 40 € la nuit.',
  price_level = 2,
  source = source || ' · Enrichi le 01/08/2026 depuis feelmadagascar.com'
 where slug = 'fanirina-ranch';

update public.pages set
  short_desc = 'Une des adresses les plus abordables d''Ampefy.',
  long_desc  = 'Hôtel du secteur d''Ampefy, régulièrement cité parmi les hébergements économiques du lac Itasy. Tarifs relevés à partir d''environ 16 à 25 $ la nuit.',
  price_level = 1,
  source = source || ' · Enrichi le 01/08/2026 depuis planetofhotels.com et madagascar-hotels-online.com'
 where slug = 'la-chaumiere-ampefy';

-- Les équipements, uniquement quand la source les nomme explicitement.
insert into public.page_amenities (page_id, code)
select p.id, v.code
from (values
  ('hostellerie-du-grand-lac','piscine'),
  ('hostellerie-du-grand-lac','spa'),
  ('hostellerie-du-grand-lac','massage'),
  ('hostellerie-du-grand-lac','restaurant-sur-place'),
  ('hostellerie-du-grand-lac','vue-lac'),
  ('hostellerie-du-grand-lac','carte-bancaire'),
  ('hostellerie-du-grand-lac','especes'),
  ('farihy-hotel','piscine'),
  ('farihy-hotel','wifi'),
  ('farihy-hotel','jardin'),
  ('farihy-hotel','especes'),
  ('kavitaha-hotel','piscine'),
  ('kavitaha-hotel','jardin'),
  ('kavitaha-hotel','restaurant-sur-place'),
  ('kavitaha-hotel','vue-lac'),
  ('kavitaha-hotel','excursion-bateau'),
  ('kavitaha-hotel','randonnee'),
  ('kavitaha-hotel','famille'),
  ('kavitaha-hotel','especes'),
  ('allamanda-lodge','jardin'),
  ('allamanda-lodge','parking'),
  ('allamanda-lodge','petit-dejeuner'),
  ('allamanda-lodge','wifi'),
  ('allamanda-lodge','terrasse'),
  ('allamanda-lodge','famille'),
  ('allamanda-lodge','especes'),
  ('fanirina-ranch','restaurant-sur-place'),
  ('fanirina-ranch','equitation'),
  ('fanirina-ranch','especes')
) as v(slug, code)
join public.pages p on p.slug = v.slug
on conflict (page_id, code) do nothing;

-- Le seul tarif en ariary directement sourcé de tout le lot.
do $$
declare v_page uuid; v_room uuid;
begin
  select id into v_page from public.pages where slug = 'kavitaha-hotel';
  if v_page is null then return; end if;
  if exists (select 1 from public.room_types where page_id = v_page) then return; end if;

  insert into public.room_types (page_id, name, description, units_count, max_adults, base_price_ar, price_unit)
  values (v_page, 'Chambre double', 'Tarif relevé sur Petit Futé (fiche Hôtel Kavitaha, Ampefy).',
          1, 2, 93000, 'chambre')
  returning id into v_room;
end $$;

-- Kavitaha sert aussi à manger : on lui pose sa cuisine, pas une carte
-- inventée. Le style suffit à le rendre trouvable ; les plats viendront de lui.
insert into public.page_cuisines (page_id, cuisine_slug)
select p.id, 'malgache' from public.pages p where p.slug = 'kavitaha-hotel'
on conflict do nothing;

-- Le compteur de la destination se recale tout seul par déclencheur, mais on
-- le force ici au cas où le lot aurait été rejoué.
update public.places pl set nb_pages = (
  select count(*) from public.pages where place_id = pl.id and is_published)
 where pl.slug = 'ampefy';
