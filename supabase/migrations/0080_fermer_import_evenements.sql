-- ============================================================================
-- 0080 — ON REFERME LA PORTE D'IMPORT DES ÉVÉNEMENTS
--
-- ⚠ Même raison qu'en 0054 et 0058 : le jeton a voyagé dans un script et dans
--   des requêtes HTTP, il n'a jamais eu la valeur d'un secret. Une porte
--   d'écriture ouverte sur `events` permettrait d'annoncer un festival qui
--   n'existe pas — sur l'écran même qui sert à décider d'un déplacement.
--
-- ⚠ 42 événements insérés, tous avec leur source : la contrainte
--   `events_source_obligatoire` l'a garanti ligne par ligne, pas la bonne
--   volonté de l'import.
-- ============================================================================

drop function if exists public.import_evenements(text, jsonb);;
