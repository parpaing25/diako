-- ============================================================================
-- 0028 — LES TROIS FICHES QUE 0027 A MANQUÉES
--
-- ⚠ MA FAUTE, ET ELLE EST INSTRUCTIVE. J'ai recopié les slugs à la main depuis
--   la liste des NOMS au lieu de les prendre dans le résultat de la requête.
--   Deux portent le suffixe de la commune — `chez-jacky-ampefy`,
--   `la-chaumiere-ampefy` — et un est raccourci — `kavitaha-hotel`. Mes
--   `update … where slug = …` n'ont donc touché aucune ligne.
--
--   Sans erreur, sans avertissement : un UPDATE qui ne trouve rien RÉUSSIT.
--   C'est pour ça qu'il faut recompter après coup au lieu de faire confiance
--   au « success » de la migration — j'ai vu 6 points au lieu de 9.
-- ============================================================================

update public.pages p
   set lat = v.lat, lng = v.lng, geo_source = v.src
from (values
  ('chez-jacky-ampefy',   -19.059004, 46.739631, 'OSM node/5549671622'),
  ('kavitaha-hotel',      -19.042504, 46.737106, 'OSM node/2407681715'),
  ('la-chaumiere-ampefy', -19.060082, 46.745978, 'OSM node/6092549554')
) as v(slug, lat, lng, src)
where p.slug = v.slug;
