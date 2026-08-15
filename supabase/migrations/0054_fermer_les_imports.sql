-- ============================================================================
-- 0054 — ON REFERME LES PORTES D'IMPORT
--
-- 🔴 CINQ FONCTIONS D'ÉCRITURE ÉTAIENT OUVERTES À `anon`. Elles sont protégées
--    par un jeton partagé, mais ce jeton a voyagé dans des scripts et dans des
--    requêtes HTTP : il n'a jamais eu la valeur d'un secret. Tant qu'elles
--    existent, n'importe qui l'ayant vu passer peut insérer dans `pages` et
--    `attractions` — et un annuaire qu'un inconnu peut remplir n'est plus un
--    annuaire.
--
-- ⚠ ELLES ONT FAIT LEUR TRAVAIL : 3 302 établissements, 2 474 sites, 157
--   textes et 198 photos. Le prochain import recréera ce dont il a besoin,
--   avec un jeton neuf. Le coût de les recréer est de dix minutes ; le coût de
--   les laisser est permanent.
--
-- ⚠ `compter_sites` et `carte_zone` RESTENT : ce sont des lectures, elles
--   servent l'écran, et elles ne franchissent aucune porte.
-- ============================================================================

drop function if exists public.import_osm_lot(text, jsonb);
drop function if exists public.import_osm_sites(text, jsonb);
drop function if exists public.import_wikidata(text, jsonb);
drop function if exists public.import_wikipedia(text, jsonb);
drop function if exists public.import_photos(text, jsonb);
