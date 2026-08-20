-- ============================================================================
-- 0108 — DIX-HUIT SITES PUBLIÉS EN DOUBLE, AU MÊME POINT EXACT
--
-- 🔴 CE QUE ÇA DONNE À L'ÉCRAN. « Parc national de l'Isalo » apparaît deux fois
--    dans /sites, aux mêmes coordonnées ; « Parc national d'Ankarafantsika »
--    aussi ; « Parc national de Midongy Befotaka » trois fois. Un visiteur qui
--    compare deux fiches identiques se demande laquelle est la bonne, et le
--    compteur « 2 469 sites » annonce plus que ce qui existe.
--
-- ⚠ LA RÈGLE EST VOLONTAIREMENT ÉTROITE : même nom normalisé ET mêmes
--   coordonnées à quatre décimales près, soit environ onze mètres. Rien d'autre.
--
-- 🔴 ET C'EST L'ÉTROITESSE QUI COMPTE ICI, PAS LE NOMBRE. Une première règle,
--    plus large — même nom, moins de 500 m — remontait 20 « hadivory » groupés
--    dans un rayon de 480 m. Or un hadivory est un fossé défensif merina, et ils
--    sont CONCENTRIQUES autour d'un village : ces vingt-là sont vingt fossés
--    réels, pas vingt copies. Les fusionner aurait effacé la structure même du
--    site. Avec la règle stricte, aucun hadivory ne remonte — la preuve que le
--    resserrement était le bon geste, et pas de la prudence décorative.
--
--    Ce projet a déjà payé la version large de cette erreur : un premier
--    rapprochement par sous-chaîne avait rangé six îles sous « Nosy Be », et un
--    essai de dédoublonnage sans `is_touristique` aurait fusionné des milliers
--    de hameaux réels (0087).
--
-- ⚠ « Tsitondroina » apparaît DEUX FOIS dans la liste des groupes, à deux
--   endroits différents (-23,53/46,54 et -21,47/47,40). Ce sont deux sommets
--   distincts, chacun dupliqué : c'est pour cela que le regroupement porte sur
--   le triplet (nom, latitude, longitude) et jamais sur le nom seul.
--
-- ⚠ ON DÉPUBLIE, ON NE SUPPRIME PAS. Depuis 0089, `places.attraction_ids`
--   référence des sites : supprimer une ligne casserait ces listes en silence.
--   Et la trace reste, pour qu'un réimport se voie.
--
-- ⚠ LAQUELLE ON GARDE : la mieux renseignée (photo, puis description), et à
--   égalité la plus ancienne. Sans ce départage, deux exécutions de la même
--   migration pourraient garder des lignes différentes.
-- ============================================================================

do $$
declare n integer;
begin
  with classees as (
    select id,
           row_number() over (
             partition by lower(extensions.unaccent(trim(name))),
                          round(lat::numeric, 4),
                          round(lng::numeric, 4)
             order by (cover_url is not null) desc,
                      (description is not null) desc,
                      created_at,
                      id
           ) as rang
      from public.attractions
     where is_published
  )
  update public.attractions a
     set is_published = false
    from classees c
   where c.id = a.id and c.rang > 1;

  get diagnostics n = row_count;
  raise notice '0108 : % doublon(s) dépublié(s)', n;
end $$;

-- ============================================================================
-- CONTRÔLE
-- ============================================================================
do $$
declare
  v_restant integer;
  v_publies integer;
  v_noms    text;
begin
  -- ① Plus aucun groupe identique parmi les fiches publiées.
  select count(*), string_agg(distinct n, ', ')
    into v_restant, v_noms
    from (
      select lower(extensions.unaccent(trim(name))) as n
        from public.attractions
       where is_published
       group by lower(extensions.unaccent(trim(name))),
                round(lat::numeric, 4), round(lng::numeric, 4)
      having count(*) > 1
    ) g;
  if v_restant > 0 then
    raise exception '0108 : % groupe(s) encore en double : %', v_restant, v_noms;
  end if;

  -- ② CHAQUE GROUPE A GARDÉ EXACTEMENT UN SURVIVANT. Le vrai risque d'un
  --    `row_number()` mal partitionné n'est pas d'en laisser deux, c'est de
  --    n'en laisser AUCUN — et un site qui disparaît ne se signale pas.
  select count(*) into v_restant
    from (
      select lower(extensions.unaccent(trim(name))) as n,
             round(lat::numeric, 4) as la, round(lng::numeric, 4) as lo
        from public.attractions
       group by 1, 2, 3
      having count(*) > 1
         and count(*) filter (where is_published) = 0
    ) g;
  if v_restant > 0 then
    raise exception '0108 : % groupe(s) de doublons ont perdu TOUTES leurs fiches', v_restant;
  end if;

  -- ③ L'annuaire n'a pas fondu.
  select count(*) into v_publies from public.attractions where is_published;
  if v_publies < 2400 then
    raise exception '0108 : seulement % sites publiés restants — la dépublication a mordu trop large', v_publies;
  end if;
end $$;
