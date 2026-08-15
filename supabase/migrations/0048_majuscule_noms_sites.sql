-- ============================================================================
-- 0048 — « cascade de Mahamanina » devient « Cascade de Mahamanina »
--
-- ⚠ 122 sites importés de Wikidata portaient un nom commençant par une
--   minuscule : Wikidata écrit ses libellés en casse de phrase (« parc national
--   Tsingy de Bemaraha »), pas en nom propre. Sur une fiche, en tête de liste
--   et dans un titre de page, ça se lit comme une faute de frappe — et sur des
--   milliers de lignes, comme un site négligé.
--
-- ⚠ ON NE TOUCHE QUE LA PREMIÈRE LETTRE. Une capitalisation mot à mot
--   donnerait « Parc National Tsingy De Bemaraha » : en français les noms
--   communs et les prépositions restent en minuscules. Seule l'initiale est
--   fautive, seule l'initiale est corrigée.
--
-- ⚠ ON LAISSE LES NOMS QUI COMMENCENT PAR AUTRE CHOSE (chiffre, guillemet) et
--   ceux qui sont déjà corrects : `~ '^[a-zà-ÿ]'` ne matche que le cas visé.
-- ============================================================================

update public.attractions
   set name = upper(left(name, 1)) || substr(name, 2)
 where name ~ '^[a-zàâçéèêëîïôûùüÿñæœ]';
