-- ============================================================================
-- 0031 — LES SIX RÉACTIONS NOMMÉES, ENFIN ACCEPTÉES PAR LA BASE
--
-- 🔴 DÉFAUT CORRIGÉ ICI, ET IL ÉTAIT EN PRODUCTION.
--    L'interface propose six réactions depuis la vague « fiches destination » :
--    utile, beau, jy_vais, bon_prix, prudence, plus le cœur. La contrainte de
--    la table, elle, n'a jamais bougé :
--
--        CHECK (type = ANY (ARRAY['jaime','adore','waouh','utile']))
--
--    Donc QUATRE des six boutons écrivaient une valeur refusée par Postgres.
--    Un clic sur « Beau », « J'y vais », « Bon prix » ou « Prudence » partait
--    en erreur 23514 et l'optimisme de l'interface était annulé. Personne ne
--    s'en est aperçu parce qu'il n'y a qu'un membre inscrit et que l'erreur
--    ressemblait à une latence.
--
--    ⚠ LA LEÇON : une liste de valeurs autorisées vit à DEUX endroits, le code
--      et la contrainte. Ajouter un bouton sans toucher la contrainte donne un
--      bouton qui a l'air de marcher.
--
-- ⚠ POURQUOI `jaime` DISPARAÎT. Le design final est explicite : « Des mots,
--   pas des visages. » Les six réactions sont des mots — Utile, Beau, J'y vais,
--   Bon prix, Merci, Prudence — parce que « Utile » et « Bon prix » sont
--   précisément les deux signaux qui font la valeur de Diako, et qu'un cœur ne
--   les dit pas. `jaime` n'est pas dans la liste.
--
-- ⚠ LES 7 LIGNES EXISTANTES SONT REPORTÉES SUR `utile`, PAS SUPPRIMÉES. Elles
--   viennent toutes du compte de test avant ouverture. `utile` est la réaction
--   la plus proche d'un « j'aime » générique. On ne perd aucune ligne, et les
--   compteurs dénormalisés restent justes puisque le nombre ne change pas.
-- ============================================================================

-- ① Reporter l'ancien code AVANT de resserrer la contrainte, sinon elle
--    échoue sur les lignes existantes.
update public.reactions set type = 'utile' where type in ('jaime', 'adore', 'waouh');

-- ② La contrainte suit enfin l'interface.
alter table public.reactions drop constraint if exists reactions_type_check;
alter table public.reactions add constraint reactions_type_check
  check (type = any (array['utile','beau','jy_vais','bon_prix','merci','prudence']));

-- ③ Une seule réaction par membre et par cible — règle du design final.
--    `post_id` est NOT NULL : pas besoin de clause partielle.
create unique index if not exists reactions_unique_membre_cible
  on public.reactions (user_id, post_id);
