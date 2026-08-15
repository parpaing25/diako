-- ============================================================================
-- 0038 — LES DEUX DERNIÈRES FONCTIONS SANS `search_path` FIXÉ
--
-- ⚠ POURQUOI ÇA COMPTE MÊME SUR DES FONCTIONS PURES. Sans `search_path` figé,
--   un appelant qui manipule le sien peut faire résoudre un nom de table ou
--   d'opérateur vers un objet qu'il contrôle. `dk_norm` et `distance_km` ne
--   lisent aucune table aujourd'hui — mais la règle du projet ne souffre pas
--   d'exception, précisément parce qu'une fonction « pure » cesse de l'être le
--   jour où quelqu'un y ajoute une ligne.
--
-- Après cette migration, l'analyseur Supabase ne signale plus aucune fonction
-- à `search_path` mutable, et zéro table publique sans RLS.
-- ============================================================================

alter function public.dk_norm(text)
  set search_path = public, pg_temp;

alter function public.distance_km(double precision, double precision,
                                  double precision, double precision)
  set search_path = public, pg_temp;
