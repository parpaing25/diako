-- ============================================================================
-- 0113 — DEUX DÉCLENCHEURS RECALCULAIENT LE MÊME COMPTEUR
--
-- 🔴 CE QUI SE PASSAIT. La table `pages` portait DEUX déclencheurs AFTER, tous
--    deux occupés à recalculer la MÊME colonne : `places.nb_pages`.
--
--      - `trg_pages_compteur`  -> maj_compteurs_referentiels()  (tout UPDATE)
--      - `pages_maj_nb_pages`  -> maj_nb_pages()  (UPDATE OF place_id, is_published)
--
--    Comparées ligne à ligne, les deux font le même travail sur `pages` : un
--    `count(*)` des fiches publiées du lieu, écrit dans `places.nb_pages`.
--    Chaque écriture produisait donc DEUX mises à jour de `places` — deux
--    versions de ligne, deux entrées de journal, deux fois le travail du
--    ramasse-miettes, pour un résultat identique. Sur un import de 3 254 fiches,
--    6 508 écritures là où 3 254 suffisent.
--
-- ⚠ ET LE DOUBLON ÉTAIT AUSSI PLUS LARGE. `trg_pages_compteur` se déclenchait
--   sur TOUT UPDATE — un changement de téléphone, d'horaires, de photo — alors
--   que `nb_pages` ne peut bouger que si `place_id` ou `is_published` change.
--   `pages_maj_nb_pages` est restreint à ces deux colonnes : il ne travaille
--   que quand il y a une raison.
--
-- ⚠ ON RETIRE LE DÉCLENCHEUR, PAS LA FONCTION. `maj_compteurs_referentiels()`
--   sert AUSSI à `trg_menu_compteur` sur `menu_items`, où elle entretient
--   `dishes.nb_restaurants` — une tout autre branche de son corps. La supprimer
--   casserait le compteur des plats en silence.
--
-- 🔴 POURQUOI IL N'Y A PAS DE SONDE D'ÉCRITURE ICI, ET C'EST INSTRUCTIF. Le
--    réflexe serait de vérifier en dépubliant une fiche et en regardant le
--    compteur bouger. Essayé : il ne bouge pas. `pages_avant_ecriture()` porte
--    `if pg_trigger_depth() <= 1 then new.is_published := old.is_published`,
--    c'est-à-dire un GEL du statut de publication pour toute écriture directe.
--    Une sonde qui tente ce chemin ne mesure donc pas le déclencheur : elle
--    mesure le gel, et échoue pour une raison sans rapport. La première version
--    de cette migration s'y est cassée le nez. La preuve passe donc par la
--    définition des déclencheurs et par le recomptage intégral.
--
-- ⚠ LE CONTRAT NE CHANGE PAS. Le compteur est RECALCULÉ par un `count(*)` à
--   chaque fois, jamais incrémenté : deux passages ou un seul donnent le même
--   nombre. Retirer le doublon ne peut donc pas fausser une valeur.
-- ============================================================================

drop trigger if exists trg_pages_compteur on public.pages;

-- ============================================================================
-- CONTRÔLE
-- ============================================================================
do $$
declare
  v_restants integer;
  v_faux     integer;
  v_menu     integer;
  v_def      text;
begin
  -- ① Un seul déclencheur de compteur sur `pages`, et c'est le bon.
  select count(*) into v_restants
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal and n.nspname = 'public' and c.relname = 'pages'
     and p.proname in ('maj_nb_pages', 'maj_compteurs_referentiels');
  if v_restants <> 1 then
    raise exception '0113 : % déclencheur(s) de compteur sur pages, attendu 1', v_restants;
  end if;

  -- ② IL COUVRE BIEN LES TROIS ÉVÉNEMENTS ET LES DEUX COLONNES. Un déclencheur
  --    survivant mais restreint au seul INSERT laisserait le compteur figer à
  --    la première dépublication — sans que rien ne le signale.
  select pg_get_triggerdef(t.oid) into v_def
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal and c.relname = 'pages' and p.proname = 'maj_nb_pages';
  if v_def not like '%INSERT%' or v_def not like '%DELETE%' or v_def not like '%UPDATE%'
     or v_def not like '%place_id%' or v_def not like '%is_published%' then
    raise exception '0113 : le déclencheur restant ne couvre pas tous les cas : %', v_def;
  end if;

  -- ③ LE COMPTEUR DES PLATS EST INTACT. C'est le risque de ce changement :
  --    retirer un déclencheur qui partage sa fonction avec un autre.
  select count(*) into v_menu
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal and n.nspname = 'public' and c.relname = 'menu_items';
  if v_menu = 0 then
    raise exception '0113 : menu_items n''a plus de déclencheur — le compteur des plats est mort';
  end if;

  -- ④ AUCUNE VALEUR N'A BOUGÉ : on recompte les 22 707 lignes indépendamment.
  select count(*) into v_faux
    from public.places pl
   where coalesce(pl.nb_pages, 0) <> (
     select count(*) from public.pages g where g.place_id = pl.id and g.is_published);
  if v_faux > 0 then
    raise exception '0113 : % lieu(x) ont un nb_pages faux', v_faux;
  end if;
end $$;
