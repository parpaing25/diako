-- ============================================================================
-- 0082 — UNE DESTINATION PEUT ENFIN AVOIR UNE PHOTO
--
-- 🔴 CE QUI MANQUAIT. `attractions` porte sa couverture depuis le lot 1
--    (`cover_url` + les trois champs de crédit posés en 0049). `places` — les
--    villes, les îles, les massifs, c'est-à-dire les DESTINATIONS — n'a jamais
--    rien eu. Résultat visible : l'entête d'Explorer est un aplat de couleur
--    de 160 px de haut, et la fiche /lieu/:slug ouvre sur un titre nu. Le
--    référentiel le plus défendable du produit se présentait sans une image.
--
-- ⚠ POURQUOI PAS « ON PREND LA PHOTO D'UN SITE DU COIN ». C'était tentant et
--   c'est faux : la photo d'un lodge ou d'un canyon ne représente pas une
--   ville, et le premier choix arbitraire — le site au plus petit `slug` —
--   aurait mis une photo de station-service en couverture d'Antsirabe. Une
--   couverture de destination est un CHOIX éditorial ; elle a donc sa colonne.
--
-- 🔴 LE PIÈGE DES DROITS PAR COLONNE. Sur `places`, `anon` et `authenticated`
--    n'ont pas de `GRANT SELECT` sur la TABLE : ils ont dix-neuf grants, un par
--    colonne. Une colonne ajoutée après coup n'hérite alors de RIEN — ni de la
--    table, qui n'a pas de grant global, ni des défauts. La lecture partirait
--    en « permission denied for table places » sur la moindre requête qui la
--    demande, et l'erreur accuserait la TABLE alors que dix-neuf colonnes
--    passent très bien. D'où le `grant select (...)` explicite plus bas : il
--    n'est pas décoratif, sans lui la migration casse la carte et l'annuaire.
--
-- ⚠ LES QUATRE CHAMPS DE 0049, À L'IDENTIQUE. `cover_credit` (l'auteur),
--   `cover_licence` (le nom court), `cover_source` (l'URL d'origine). Même
--   forme que sur `attractions` pour qu'un seul composant d'affichage serve
--   les deux — un crédit qui s'affiche différemment selon la table finit par
--   ne plus s'afficher du tout d'un côté.
--
-- ⚠ AUCUN DROIT D'ÉCRITURE ACCORDÉ. `anon` et `authenticated` gagnent la
--   LECTURE, rien d'autre. Poser une couverture de destination reste un acte
--   d'administration (service_role), comme le reste du référentiel : sinon
--   n'importe quel compte connecté repeint la page d'accueil d'une ville.
-- ============================================================================

alter table public.places add column if not exists cover_url     text;
alter table public.places add column if not exists cover_credit  text;
alter table public.places add column if not exists cover_licence text;
alter table public.places add column if not exists cover_source  text;

grant select (cover_url, cover_credit, cover_licence, cover_source)
  on public.places to anon, authenticated;

-- Vérification immédiate : si le grant n'a pas pris, on le sait ICI et pas en
-- production trois jours plus tard.
do $$
begin
  if not has_column_privilege('anon', 'public.places', 'cover_url', 'select') then
    raise exception 'anon ne peut pas lire places.cover_url — le grant par colonne a échoué';
  end if;
end $$;
