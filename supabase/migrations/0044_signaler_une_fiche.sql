-- ============================================================================
-- 0044 — ON PEUT ENFIN SIGNALER UNE ERREUR SUR UNE FICHE
--
-- 🔴 CE QUE ÇA CORRIGE. Le rail de droite conclut sur : « Les tarifs affichés
--    sont ceux relevés à la publication. Ils changent — signalez-nous une
--    erreur depuis la fiche. » Ce contrôle N'EXISTE SUR AUCUNE FICHE : le seul
--    signalement du site est celui d'une publication, dans le menu « … » d'un
--    récit. La phrase engageait le produit sur un geste qu'il n'offrait pas, et
--    sur le point le plus sensible — la fraîcheur des prix.
--
-- ⚠ ET C'EST DEVENU LE CANAL LE PLUS UTILE DU SITE. 3 158 fiches viennent
--   d'OpenStreetMap : un nom relevé par un contributeur, parfois il y a des
--   années. Un établissement fermé, déplacé ou renommé n'a aucun moyen d'être
--   corrigé aujourd'hui — sauf si un visiteur peut le dire.
--
-- ⚠ ON NE SUPPRIME RIEN AUTOMATIQUEMENT. Le masquage au 3ᵉ signalement vaut
--   pour du contenu abusif, pas pour une fiche d'annuaire : trois personnes
--   agacées pourraient faire disparaître un hôtel qui existe. Ces signalements
--   alimentent une file, relue à la main.
-- ============================================================================

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type = any (array['post','comment','profile','message','page','attraction']));
