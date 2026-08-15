-- ============================================================================
-- 0043 — CHAQUE ADRESSE REJOINT SA LOCALITE, PLUS SA REGION NI UNE VILLE LOIN
--
-- 0041 rattachait a la ville la plus proche parmi 46, avec un plafond de 25 km.
-- Le referentiel en compte desormais 22 705, dont des milliers de villages :
-- on peut faire beaucoup plus precis, et le plafond peut se resserrer.
--
-- ⚠ LE PLAFOND PASSE DE 25 A 8 km, ET C'EST LE POINT ESSENTIEL. Avec un
--   maillage dense, 25 km n'est plus « faute de mieux » mais une erreur : une
--   gargote se verrait rattachee a un village qu'elle ne dessert pas, et
--   apparaitrait dans « ou manger a X » sans y etre. Au-dela de 8 km, la fiche
--   garde son rattachement actuel — moins precis, mais vrai.
--
-- ⚠ ON PREFERE UNE VILLE A UN HAMEAU A DISTANCE EGALE. Un hotel a 2 km du
--   centre d'Antsirabe et a 1,8 km d'un hameau voisin appartient a Antsirabe :
--   c'est la que le voyageur le cherche. Le poids ci-dessous traduit cela —
--   une ville « compte » comme si elle etait 3 km plus proche qu'elle n'est.
-- ============================================================================

with cibles as (
  select id, lat, lng, region, kind from public.places
   where kind in ('ville','commune','village','quartier','zone_touristique')
     and lat is not null
),
proches as (
  select pg.id as page_id, c.id as cible_id,
         public.distance_km(pg.lat, pg.lng, c.lat, c.lng) as km,
         row_number() over (
           partition by pg.id
           order by public.distance_km(pg.lat, pg.lng, c.lat, c.lng)
                    - case c.kind when 'ville' then 3 when 'zone_touristique' then 2 else 0 end
         ) as rang
    from public.pages pg
    join public.places ref on ref.id = pg.place_id
    join cibles c on c.region = ref.region
   where pg.source like 'OpenStreetMap%' and pg.lat is not null
)
update public.pages pg
   set place_id = p.cible_id
  from proches p
 where p.page_id = pg.id and p.rang = 1 and p.km <= 8;

with cibles as (
  select id, lat, lng, region, kind from public.places
   where kind in ('ville','commune','village','quartier','zone_touristique')
     and lat is not null
),
proches as (
  select a.id as site_id, c.id as cible_id,
         public.distance_km(a.lat, a.lng, c.lat, c.lng) as km,
         row_number() over (
           partition by a.id
           order by public.distance_km(a.lat, a.lng, c.lat, c.lng)
                    - case c.kind when 'ville' then 3 when 'zone_touristique' then 2 else 0 end
         ) as rang
    from public.attractions a
    join public.places ref on ref.id = a.place_id
    join cibles c on c.region = ref.region
   where a.manager like 'OpenStreetMap%' and a.lat is not null
)
update public.attractions a
   set place_id = p.cible_id
  from proches p
 where p.site_id = a.id and p.rang = 1 and p.km <= 8;

-- Les compteurs suivent.
update public.places pl
   set nb_pages = (select count(*) from public.pages pg
                    where pg.place_id = pl.id and pg.is_published),
       nb_posts = (select count(*) from public.posts p
                    where p.place_id = pl.id and p.status = 'published');

-- ⚠ LE DRAPEAU TOURISTIQUE SE LEVE SUR LA PREUVE, PAS SUR UNE INTUITION. Une
--   localite qui porte au moins trois adresses publiees est une destination :
--   elle a de quoi remplir un ecran. En dessous, elle reste hors d'`/explorer`,
--   qui montrerait sinon des milliers de pages presque vides.
update public.places
   set is_touristique = true
 where nb_pages >= 3 and not is_touristique;

drop function if exists public.import_lieux(text, jsonb);
