-- ============================================================================
-- 0041 — RATTACHER L'IMPORT OSM A LA VILLE LA PLUS PROCHE
--
-- L'import 0039 a rattache chaque etablissement a sa REGION, faute de mieux :
-- c'est la seule chose que la requete Overpass donnait de facon fiable. Mais
-- « /lieu/analamanga » avec 1 090 adresses n'aide personne — la question d'un
-- voyageur n'est jamais « ou dormir en Analamanga », elle est « ou dormir a
-- Antananarivo ».
--
-- Le referentiel porte 46 villes AVEC leurs coordonnees. On rattache donc
-- chaque fiche importee a la ville la plus proche, quand elle est assez proche
-- pour que le rattachement soit VRAI.
--
-- ⚠ LE RAYON EST PLAFONNE A 25 km, ET C'EST LE POINT ESSENTIEL. Sans plafond,
--   une gargote perdue a 300 km de tout se verrait rattachee a la ville la plus
--   proche et apparaitrait dans « ou manger a Toliara » — un mensonge sur la
--   localisation, exactement ce que ce projet s'interdit. Au-dela du rayon, la
--   fiche RESTE sur sa region : moins precis, mais vrai.
--
-- ⚠ ON NE TOUCHE QUE LES FICHES IMPORTEES (`source` commence par
--   « OpenStreetMap »). Les 54 fiches d'Ampefy saisies a la main gardent leur
--   rattachement, qui a ete verifie.
-- ============================================================================

with villes as (
  select id, slug, name_fr, lat, lng, region
    from public.places
   where kind in ('ville', 'commune') and lat is not null
),
proches as (
  select pg.id as page_id,
         v.id   as ville_id,
         public.distance_km(pg.lat, pg.lng, v.lat, v.lng) as km,
         row_number() over (
           partition by pg.id
           order by public.distance_km(pg.lat, pg.lng, v.lat, v.lng)
         ) as rang
    from public.pages pg
    join public.places reg on reg.id = pg.place_id and reg.kind = 'region'
    join villes v on v.region = reg.region
   where pg.source like 'OpenStreetMap%' and pg.lat is not null
)
update public.pages pg
   set place_id = p.ville_id
  from proches p
 where p.page_id = pg.id and p.rang = 1 and p.km <= 25;

-- Meme traitement pour les sites et parcs.
with villes as (
  select id, lat, lng, region from public.places
   where kind in ('ville', 'commune') and lat is not null
),
proches as (
  select a.id as site_id, v.id as ville_id,
         public.distance_km(a.lat, a.lng, v.lat, v.lng) as km,
         row_number() over (partition by a.id
           order by public.distance_km(a.lat, a.lng, v.lat, v.lng)) as rang
    from public.attractions a
    join public.places reg on reg.id = a.place_id and reg.kind = 'region'
    join villes v on v.region = reg.region
   where a.manager like 'OpenStreetMap%' and a.lat is not null
)
update public.attractions a
   set place_id = p.ville_id
  from proches p
 where p.site_id = a.id and p.rang = 1 and p.km <= 25;

-- Les compteurs denormalises suivent : le declencheur de 0037 ne se declenche
-- pas sur un UPDATE de masse assez tot pour tout couvrir, on recalcule.
update public.places pl
   set nb_pages = (select count(*) from public.pages pg
                    where pg.place_id = pl.id and pg.is_published),
       nb_posts = (select count(*) from public.posts p
                    where p.place_id = pl.id and p.status = 'published');
