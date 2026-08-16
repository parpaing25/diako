-- ============================================================================
-- 0096 — LE CRÉDIT DE LA PHOTO DE PLAT, STOCKÉ AVEC LE PLAT
--
-- 🔴 POURQUOI CES COLONNES. Les 95 plats vont recevoir des photos de Wikimedia
--    Commons (moissonneur scripts/photos_plats.py). Commons héberge du CC BY et
--    du CC BY-SA : ces licences EXIGENT de nommer l'auteur ET la licence. Sans
--    colonne pour les porter, une photo posée n'est pas « gratuite », elle est
--    en infraction — même règle que 0049 sur `attractions` et 0082 sur `places`.
--
-- ⚠ MÊMES TROIS CHAMPS QUE 0049, adaptés au préfixe local : la colonne image de
--   `dishes` s'appelle `photo_url` (pas `cover_url`), donc `photo_credit`
--   (l'auteur tel que Commons le donne), `photo_licence` (le nom court :
--   « CC BY-SA 4.0 »), `photo_source` (l'URL de la page du fichier, qui porte
--   l'historique complet). Le crédit voyage dans la même ligne que l'image.
--
-- ⚠ LE PIÈGE 0082 A ÉTÉ VÉRIFIÉ ET NE S'APPLIQUE PAS ICI. Sur `places`, anon
--   n'avait que des grants PAR COLONNE : une colonne ajoutée n'héritait de rien
--   et cassait la lecture. Sur `dishes`, pg_class.relacl porte un grant de
--   TABLE (`anon=r`, `authenticated=r`) et pg_attribute.attacl est vide sur
--   toutes les colonnes : les colonnes neuves héritent donc de la lecture sans
--   grant explicite. L'assertion ci-dessous le PROUVE au moment où la migration
--   passe — si quelqu'un bascule un jour `dishes` en grants par colonne, elle
--   échouera ICI et pas en production trois jours plus tard.
--
-- ⚠ AUCUN DROIT D'ÉCRITURE ACCORDÉ. Poser une photo de plat reste un acte
--   d'administration (service_role), comme le reste du référentiel.
-- ============================================================================

alter table public.dishes add column if not exists photo_credit  text;
alter table public.dishes add column if not exists photo_licence text;
alter table public.dishes add column if not exists photo_source  text;

do $$
begin
  if not has_column_privilege('anon', 'public.dishes', 'photo_credit', 'select')
     or not has_column_privilege('authenticated', 'public.dishes', 'photo_credit', 'select') then
    raise exception 'les nouvelles colonnes de dishes ne sont pas lisibles — la table est passée en grants par colonne (piège 0082), ajouter un grant select explicite';
  end if;
end $$;
