-- ============================================================================
-- 0049 — LE CRÉDIT DE LA PHOTO, STOCKÉ AVEC LA PHOTO
--
-- 🔴 UNE PHOTO SANS SON AUTEUR EST UNE VIOLATION, PAS UN OUBLI DE FORME. Les
--    images de Wikimedia Commons sont sous licences variées — CC BY, CC BY-SA,
--    domaine public — et la plupart exigent de nommer l'auteur ET la licence.
--    Sans colonne pour le porter, la seule option honnête serait de ne pas
--    afficher de photo du tout.
--
-- ⚠ LE CRÉDIT VOYAGE AVEC L'IMAGE, dans la même ligne. Le mettre dans un
--   fichier de correspondance à côté, ou dans un pied de page global, c'est
--   garantir qu'il se perdra au premier remaniement — et une fiche partagée
--   seule doit emporter son crédit.
--
-- ⚠ TROIS CHAMPS, PAS UN. `cover_credit` (l'auteur, tel que Commons le donne),
--   `cover_licence` (le nom court : « CC BY-SA 4.0 »), `cover_source` (l'URL de
--   la page du fichier, qui porte l'historique complet). La licence exige les
--   trois ; une chaîne unique les rendrait inaffichables séparément.
--
-- ⚠ La RPC d'import qui accompagnait cette migration a été supprimée en 0054.
-- ============================================================================

alter table public.attractions add column if not exists cover_credit  text;
alter table public.attractions add column if not exists cover_licence text;
alter table public.attractions add column if not exists cover_source  text;
