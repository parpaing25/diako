-- ============================================================================
-- 0053 — UN LIEU QUI ABRITE UN PARC NATIONAL EST UNE DESTINATION
--
-- 🔴 CE QUE ÇA CORRIGE. `is_touristique` ne regardait QUE le nombre de fiches
--    d'établissement (règle posée en 0043 : `nb_pages >= 3`). Un lieu qui
--    abrite une réserve, une cascade ou un musée mais aucun hôtel n'était donc
--    pas une destination — il n'apparaissait pas dans /explorer, alors que
--    c'est précisément ce qu'on vient y chercher. 289 lieux dans ce cas.
--
-- ⚠ ON NE PREND PAS N'IMPORTE QUEL SITE. 1 427 lieux portent « du contenu »,
--   mais un sommet anonyme ou un méandre de rivière ne fait pas une
--   destination : les verser tous dans le catalogue le noierait sous des
--   villages qui n'ont rien à offrir, et rendrait /explorer inutilisable.
--   On retient les genres pour lesquels on se déplace VRAIMENT — réserve,
--   parc, cascade, grotte, musée, parc animalier, point de vue, plage.
--
-- ⚠ ON NE DÉCLASSE PERSONNE. Dix-neuf destinations n'ont encore ni fiche ni
--   site : ce sont des lieux rédigés à la main — Mer d'Émeraude, Tsiribihina,
--   Cirque Rouge, Pic Saint-Louis — qui portent déjà un texte. Leur page vaut
--   la visite ; les retirer parce qu'aucun hôtel n'y est encore saisi serait
--   confondre « pas de commerce » avec « rien à voir ».
-- ============================================================================

update public.places p
   set is_touristique = true
 where not p.is_touristique
   and exists (
     select 1 from public.attractions a
      where a.place_id = p.id
        and a.is_published
        and a.kind in ('reserve','parc','cascade','grotte','musee',
                       'parc_animalier','point_de_vue','plage')
   );
