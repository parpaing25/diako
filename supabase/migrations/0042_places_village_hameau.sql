-- ============================================================================
-- 0042 — `village` ET `hameau` REJOIGNENT LE VOCABULAIRE DES LIEUX
--
-- Le référentiel d'origine décrivait 178 destinations touristiques : ville,
-- commune, zone touristique, plage, île, parc, site suffisaient. L'import
-- OpenStreetMap apporte l'échelon en dessous — les milliers de villages et de
-- hameaux du pays, qui sont le vrai maillage de Madagascar.
--
-- ⚠ ON N'ÉCRASE PAS LE SENS DES MOTS. Ranger un hameau de trente feux sous
--   « commune » aurait évité cette migration, au prix d'un référentiel qui ment
--   sur ce qu'il décrit : une commune est une entité administrative, un hameau
--   n'en est pas une. Le jour où quelqu'un filtrera « les communes », il
--   obtiendrait des lieux-dits.
--
-- ⚠ CES DEUX ÉCHELONS NE SONT PAS TOURISTIQUES PAR DÉFAUT. `/explorer` ne
--   montre que `is_touristique = true` : sans cela, la page d'exploration
--   noierait Nosy Be sous dix mille hameaux. Le drapeau ne sera levé que sur
--   les localités qui portent réellement des adresses.
-- ============================================================================

alter table public.places drop constraint if exists places_kind_check;
alter table public.places add constraint places_kind_check
  check (kind = any (array[
    'pays','region','axe','district','ville','commune','village','hameau',
    'zone_touristique','quartier','plage','ile','parc','site'
  ]));
