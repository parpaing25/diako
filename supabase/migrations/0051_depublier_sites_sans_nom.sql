-- ============================================================================
-- 0051 — « 10 », « 11 », « 12 » N'ÉTAIENT PAS DES SITES À VISITER
--
-- 🔴 44 ENTRÉES DE L'ANNUAIRE PORTAIENT UN NOMBRE POUR NOM. Elles viennent de
--    la première moisson OSM, qui retenait tout `historic=*` : des bornes et
--    des repères numérotés sont entrés comme « patrimoine ». Sur la page
--    /sites, triée par nom croissant, elles arrivaient EN PREMIER — le visiteur
--    tombait sur « 10 », « 11 », « 12 » avant le moindre parc national.
--
-- ⚠ ON DÉPUBLIE, ON NE SUPPRIME PAS. Certaines de ces lignes sont peut-être des
--   monuments réels mal nommés à la source ; « Rn7 » est la route nationale 7,
--   « FMM » une abréviation qu'on ne sait pas lire. Effacer, c'est trancher
--   sans savoir. `is_published = false` les sort de l'annuaire, garde la ligne,
--   et laisse la décision réversible.
--
-- ⚠ LES AMBASSADES ET CONSULATS NE SONT PAS DES SITES À VISITER non plus. Une
--   ambassade est une adresse utile en voyage, pas une visite — et l'annoncer
--   comme « réserve » est absurde.
--
-- ⚠ ON ÉPARGNE CE QUI RESSEMBLE À UNE DATE. « 29 mars 1947 » (l'insurrection
--   malgache) et « 8 mars » sont de vrais mémoriaux : le filtre ne prend que
--   les noms ENTIÈREMENT numériques, pas ceux qui contiennent un nombre.
-- ============================================================================

update public.attractions
   set is_published = false
 where is_published = true
   and (
     name ~ '^[0-9]+$'
     or length(trim(name)) <= 2
     or name ~* '^(ambassade|consulat)\M'
   );
