-- ============================================================================
-- 0090 — QUARANTE-QUATRE FICHES DE L'ANNUAIRE S'APPELAIENT UNE DATE
--
-- 🔴 LES DEUX PREMIÈRES PAGES DE /sites NE MONTRAIENT QUE DES DATES. L'annuaire
--    se lit par nom croissant, 24 fiches par page. Cinquante et une fiches
--    publiées commencent par un chiffre, dont QUARANTE-QUATRE ne sont rien
--    d'autre qu'une date : « 29 mars 1947 » dix-neuf fois, « 26 juin 1960 »
--    quinze fois, plus les variantes (« 26 jona 1960 », « 26 Jona 1960 »,
--    « 26 jiona 1960 », « 26 jona 1960 - 26 jona 2010 », « 24 jolay 1976 »,
--    « 14 octobre 1960 », « 8 mars »). Le visiteur qui ouvrait l'annuaire
--    recevait donc deux écrans pleins de cartes identiques AVANT le premier
--    parc national — et quinze cartes intitulées « 26 juin 1960 » ne lui
--    apprenaient rien : ni de quoi il s'agit, ni laquelle est près de chez lui.
--
--    Et il n'y a rien d'autre à lire sur ces fiches. Sur les 44 : ZÉRO
--    description, ZÉRO résumé, ZÉRO photo, ZÉRO source — mesuré, pas supposé.
--    Le nom est LA SEULE CHOSE que le site sache en dire. Aucune mise en page
--    ne rattrape ça : c'est la donnée qu'il faut réparer, et avant la refonte.
--
-- ① CE QUE CES FICHES SONT — VÉRIFIÉ AVANT DE TOUCHER À QUOI QUE CE SOIT.
--    Les 44 sont de genre `patrimoine`, sans exception. Le 26 juin 1960 est la
--    date de l'indépendance malgache, le 29 mars 1947 celle de l'insurrection.
--    Les 39 que l'on saura réparer se répartissent sur 33 localités distinctes
--    dans 12 régions. Une même date portée par des dizaines d'objets bâtis
--    dispersés dans tout le pays, ce sont des monuments et des stèles dont
--    le nom OSM est l'inscription gravée elle-même. LA DATE N'EST DONC PAS
--    FAUSSE, ELLE EST INSUFFISANTE : on ne la remplace pas, on la complète.
--
-- ② LE SEUL MATÉRIAU EST CELUI QUI EST DÉJÀ EN BASE : le genre (`patrimoine`)
--    et la localité rattachée par `place_id`. « 29 mars 1947 —
--    Moramanga » n'affirme pas un fait de plus que les deux colonnes qui l'ont
--    produit.
--    ⚠ AUCUN NOM DE MONUMENT, AUCUN ARCHITECTE, AUCUNE ANNÉE D'ÉRECTION n'est
--      inventé ici. « Monument » n'ajoute rien à `kind = 'patrimoine'`, et la
--      base emploie déjà le mot pour exactement ces objets-là : « Monument
--      commémoratif du 29 mars 1947 » (Vatomandry), « Stèle du 29 mars 1947 »
--      (Antsalova), « Stèle Indépendance 26 juin 1960 » (Bekopaka).
--
-- ⚠ CINQ FICHES RESTENT INTOUCHÉES, ET C'EST LA BONNE DÉCISION. Leur `place_id`
--   désigne une RÉGION (Boeny ×4, Sofia ×1), pas une commune.
--   « 26 juin 1960 — Boeny » ferait croire à une localité qui
--   n'existe pas, et ne distinguerait même pas les quatre fiches rattachées à
--   Boeny. Un nom à demi faux est pire qu'un nom pauvre : on laisse la date nue
--   et ON LES COMPTE. Le contrôle 1 admet ces cinq-là, et elles seules.
--
-- ⚠ DEUX FICHES RESTENT HOMONYMES APRÈS COUP : deux « 26 juin 1960
--   — Sambava ». Ce ne sont PAS des doublons d'import — 383 m les séparent,
--   ce sont deux objets réels. La base ne connaît rien qui les départage ; leur
--   coller un numéro d'ordre inventerait une distinction que personne ne peut
--   vérifier sur le terrain. Elles gagnent quand même leur commune, ce qui les
--   sépare des treize autres « 26 juin 1960 ».
--
-- ⚠ LE `slug` NE CHANGE PAS. Il est peut-être déjà partagé, indexé ou dans un
--   sitemap : renommer un affichage n'autorise pas à casser des adresses. Rien
--   ici ne l'écrit — et le contrôle 2 le PROUVE en comparant à un instantané
--   pris avant l'`update`, au lieu de se fier à une relecture du code. La table
--   `attractions` ne porte aujourd'hui aucun déclencheur (vérifié), donc aucun
--   recalcul de slug depuis `name` ; mais un déclencheur ajouté demain le ferait
--   en silence, et c'est précisément ce que le contrôle attrape.
--
-- ⚠ ON N'EFFLEURE PAS LES NOMS QUI CONTIENNENT UNE DATE SANS S'Y RÉDUIRE.
--   « Kianja 29 mars 1947 », « Mozea Tolom-Panafahana 1947 », « Place 29 Mars
--   1947 », « Georges Lo-Lam 1915-1970 » disent déjà ce qu'ils sont. Le motif
--   est ancré (`^…$`) : il ne retient que les noms ENTIÈREMENT faits de nombres,
--   de noms de mois et de séparateurs. Le contrôle 3 vérifie qu'aucun nom hors
--   de ce périmètre n'a bougé.
--
-- ⚠ ET ON EXIGE UN NOM DE MOIS. Sans cette seconde condition, le motif
--   accepterait « 1150 », « 1245 », « 895 » — des sommets dont l'ALTITUDE a
--   atterri dans la colonne `name` — et produirait « 1150 — <commune> », une
--   absurdité. Ces fiches-là sont dépubliées depuis 0051 ; la garde reste, pour
--   le jour où l'une d'elles repasserait en publication.
--
-- ⚠ LA CASSE DU MOIS EST NORMALISÉE (« 26 Juin 1960 » → « 26 juin 1960 »).
--   En français un nom de mois s'écrit en minuscules, et les trois variantes de
--   casse présentes en base fabriquaient trois libellés différents pour une
--   seule et même date. Une date ne contient aucun nom propre : passer en
--   minuscules ne peut rien abîmer ici — et le contrôle 4 vérifie que la date
--   d'origine survit intégralement dans le nom produit.
--
-- ⚠ LE SÉPARATEUR EST « — » (espace, tiret cadratin, espace), stable et unique
--   dans les noms produits. La carte de /sites affiche DÉJÀ la commune sous le
--   titre, et le titre est en `truncate` : le suffixe y fait doublon et c'est
--   lui qui sera coupé sur une carte étroite. Une refonte qui voudrait
--   n'afficher que la partie gauche peut donc couper sur ce séparateur de façon
--   déterministe. Partout ailleurs — titre de page, résultat de recherche, bulle
--   de carte, choix d'un projet de voyage — la fiche voyage SANS sa commune :
--   c'est là que le suffixe est indispensable, et c'est pourquoi il est dans la
--   donnée et non dans un composant.
--
-- ③ CE QUE LE MÊME IMPORT A ABÎMÉ AILLEURS, ET QU'ON NE RÉPARE PAS ICI.
--   Recensé en SQL, laissé en l'état FAUTE DE POUVOIR LE FAIRE SANS INVENTER :
--     · « Hadivory » ×29 (patrimoine) — dont 28 dans la SEULE commune
--       d'Arivonimamo. Le suffixe de localité ne les distinguerait pas d'un
--       pouce : la recette qui marche ci-dessous marche parce que les dates sont
--       DISPERSÉES sur 33 localités. Ici elle ne donnerait que 28 « Hadivory —
--       Arivonimamo ». Rien en base ne permet de les départager.
--     · « Antrema » ×21 (reserve, Boeny) — une aire protégée unique dont
--       l'import a gardé 21 morceaux. Ce n'est pas un problème de nom mais de
--       doublons ; les fusionner est une autre décision, à prendre à part.
--     · Noms qui répètent leur propre genre : « Source » ×3, « Cascade »,
--       « Plage », « Point de vue », « Eglise ».
--     · Étiquettes OSM anglaises restées telles quelles : « Soccer Field » ×3,
--       « Viewpoint » — ni l'une ni l'autre n'est un site à visiter.
--     · Sigles illisibles : « APUV », « FLM », « FMM », « HOUSE », « Rn7 ».
--     · « Tsingy » ×5, « Kelilalina » ×5, « Tsitondroina » ×5 : noms génériques
--       réels, dispersés — réparables par la même recette le jour où quelqu'un
--       tranchera qu'ils doivent l'être.
--   Aucun nom purement numérique ni aucune coordonnée ne subsiste parmi les
--   fiches PUBLIÉES : 0051 les avait déjà dépubliées.
-- ============================================================================

do $$
declare
  -- ⚠ LE MOTIF EST ÉCRIT UNE SEULE FOIS, puis réutilisé par l'`update` ET par
  --   les quatre contrôles. Deux copies d'une expression pareille auraient
  --   divergé au premier ajustement, et le contrôle final aurait alors validé
  --   autre chose que ce que la migration a réellement modifié.
  v_mois constant text :=
    '(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre'
    || '|octobre|novembre|décembre|decembre|janoary|febroary|martsa|marsa'
    || '|aprily|mey|jiona|jona|jolay|aogositra|septambra|oktobra|novambra'
    || '|desambra)';

  -- « uniquement une date » = le nom entier n'est fait que de nombres, de noms
  -- de mois et de séparateurs (espace, tiret, tiret demi-cadratin, / , .).
  v_date_seule constant text :=
    '^[\s\-–/,.]*((\d{1,4})|' || v_mois || ')([\s\-–/,.]+((\d{1,4})|'
    || v_mois || '))*[\s\-–/,.]*$';

  -- …ET il contient au moins un nom de mois entier, sinon « 1150 » passerait.
  v_a_un_mois constant text := '\m' || v_mois || '\M';

  v_renommees integer;
  v_laissees  integer;
  v_homonymes integer;
  v_faute     integer;
  v_details   text;
begin
  -- Instantané d'avant : c'est lui qui rend les contrôles 2, 3 et 4 probants.
  drop table if exists _0090_avant;
  create temporary table _0090_avant as
    select id, slug, name from public.attractions;

  update public.attractions a
     -- 🔴 LE MOT « MONUMENT » A ÉTÉ RETIRÉ, ET C'EST IMPORTANT. Il était déduit
     --    de `kind = 'patrimoine'` — or ce genre ne veut pas dire « monument ».
     --    La preuve est dans la base elle-même : « Kianja 29 mars 1947 » et
     --    « Place 29 Mars 1947 » sont des PLACES publiques portant la même date,
     --    et rien ne distingue leurs 39 voisines anonymes. Écrire « Monument du
     --    29 mars 1947 » devant une place, une stèle ou un jardin, c'est
     --    inventer la nature de l'objet — exactement ce que cette migration
     --    prétend éviter. On n'ajoute donc QUE la commune, qui est une donnée.
     set name = regexp_replace(btrim(lower(a.name)), '\s+', ' ', 'g')
                || ' — ' || p.name_fr,
         updated_at = now()
    from public.places p
   where p.id = a.place_id
     and a.is_published
     and a.kind = 'patrimoine'
     -- ⚠ Une RÉGION n'est ni une commune ni une ville : elle ne peut pas servir
     --   de complément de nom. Voir le bloc « cinq fiches intouchées ».
     and p.kind in ('ville', 'village', 'commune', 'zone_touristique')
     and a.name ~* v_date_seule
     and a.name ~* v_a_un_mois;
  get diagnostics v_renommees = row_count;

  -- ── Contrôle 1 : plus aucun nom-date RÉPARABLE ne subsiste ────────────────
  -- ⚠ L'assertion porte sur ce qu'on SAVAIT réparer. Écrite « aucun nom n'est
  --   plus jamais une date », elle lèverait sur les cinq fiches qu'on a
  --   délibérément épargnées faute de commune — et la seule façon de la faire
  --   passer serait de leur inventer un lieu. Une assertion qui pousse à mentir
  --   est une mauvaise assertion.
  select count(*), string_agg(a.slug, ', ' order by a.slug)
    into v_faute, v_details
    from public.attractions a
    join public.places p on p.id = a.place_id
   where a.is_published
     and a.kind = 'patrimoine'
     and p.kind in ('ville', 'village', 'commune', 'zone_touristique')
     and a.name ~* v_date_seule
     and a.name ~* v_a_un_mois;
  if v_faute > 0 then
    raise exception
      '0090 : % fiche(s) portent encore un nom qui n''est QU''une date alors '
      'qu''une commune était disponible : %', v_faute, v_details;
  end if;

  -- Ce qui reste, et pourquoi : uniquement des fiches sans localité utilisable.
  select count(*) into v_laissees
    from public.attractions a
    left join public.places p on p.id = a.place_id
   where a.is_published
     and a.name ~* v_date_seule
     and a.name ~* v_a_un_mois;

  -- ── Contrôle 2 : AUCUNE ADRESSE N'A BOUGÉ ─────────────────────────────────
  select count(*) into v_faute
    from public.attractions a
    join _0090_avant b on b.id = a.id
   where a.slug is distinct from b.slug;
  if v_faute > 0 then
    raise exception
      '0090 : % slug(s) ont changé — des adresses partagées viennent de casser',
      v_faute;
  end if;

  -- ── Contrôle 3 : rien n'a été renommé hors du périmètre annoncé ───────────
  -- ⚠ C'est ce contrôle qui protège « Stèle du 29 mars 1947 » et ses voisins :
  --   si l'ancre du motif sautait un jour, la migration lèverait au lieu
  --   d'écraser des noms corrects.
  select count(*), string_agg(b.name, ' | ' order by b.name)
    into v_faute, v_details
    from public.attractions a
    join _0090_avant b on b.id = a.id
   where a.name is distinct from b.name
     and not (b.name ~* v_date_seule and b.name ~* v_a_un_mois);
  if v_faute > 0 then
    raise exception
      '0090 : % nom(s) modifiés hors périmètre : %', v_faute, v_details;
  end if;

  -- ── Contrôle 4 : la date d'origine survit dans le nom produit ─────────────
  -- ⚠ On complète, on ne remplace pas : si un nom renommé ne contenait plus sa
  --   propre date, l'information de la source aurait été perdue.
  select count(*) into v_faute
    from public.attractions a
    join _0090_avant b on b.id = a.id
   where a.name is distinct from b.name
     and position(regexp_replace(btrim(lower(b.name)), '\s+', ' ', 'g')
                  in a.name) = 0;
  if v_faute > 0 then
    raise exception
      '0090 : % fiche(s) ont perdu leur date d''origine en cours de route',
      v_faute;
  end if;

  -- Homonymes résiduels : attendus, assumés, jamais silencieux.
  select coalesce(sum(n), 0) into v_homonymes from (
    select count(*) as n
      from public.attractions a
      join _0090_avant b on b.id = a.id
     where a.name is distinct from b.name
     group by a.name having count(*) > 1
  ) s;

  drop table _0090_avant;

  raise notice
    '0090 : % fiches renommées, % laissées sans commune utilisable, '
    '% homonymes résiduels assumés.', v_renommees, v_laissees, v_homonymes;
end $$;
