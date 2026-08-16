-- ============================================================================
-- 0091 — /sites : LA RÉGION D'ABORD, LE TYPE ENSUITE
--
-- 🔴 CE QUE ÇA CORRIGE. /sites est une liste à plat de 2 476 fiches triées par
--    nom. Le voyageur qui arrive dessus ne cherche pas « une grotte » dans
--    l'absolu : il sait déjà qu'il descend vers Toliara ou qu'il monte à
--    Diego, et il veut savoir ce qu'il y a LÀ-BAS. Une liste alphabétique de
--    2 476 lignes ne répond jamais à cette question — elle s'arrête aux « A ».
--    D'où deux niveaux : 23 cartes de région, puis les sites d'une région avec
--    leurs filtres.
--
-- 🔴 ET SURTOUT : 801 « sommets » sur 2 476 viennent d'un fond toponymique, pas
--    d'un guide. Ce sont des collines nommées — aucune description, aucune
--    photo, aucun intérêt touristique établi. Mélangées au reste par ordre
--    alphabétique, elles NOIENT les 226 fiches réellement documentées : le
--    Parc national de l'Isalo se retrouve derrière quarante bosses anonymes.
--    On ne les cache pas — elles restent atteignables, un randonneur peut les
--    vouloir — mais l'ordre par défaut fait remonter ce qui est documenté, et
--    les compteurs `nb_avec_photo` / `nb_avec_description` sont rendus À
--    L'ÉCRAN pour qu'il puisse trier honnêtement au lieu de faire semblant.
--
-- ⚠ CE QUI EST VIDE SE DIT VIDE. Mesuré à l'instant sur les 2 476 sites
--   publiés : tarif résident 0, fady 0, meilleurs mois 0, tarif non-résident 6,
--   description 157, photo 226. Ces champs sont rendus TELS QUELS — `null` pour
--   un tarif absent, jamais `0`. Un « 0 Ar » inventé ferait croire à une entrée
--   gratuite ; un tableau de mois fabriqué enverrait quelqu'un sous la pluie.
--
-- ⚠ LES 11 SITES SANS `place_id` NE SONT PAS À MADAGASCAR. Vérifié un par un :
--   sept médinas et mosquées des Comores (Moroni, Mutsamudu, Domoni, Ikoni,
--   Itsandra, Ntsudjini), le musée national des Comores, le marché Volo Volo,
--   Geyser Reef et l'île Juan de Nova (Îles Éparses). Leur inventer une région
--   malgache par « le lieu le plus proche » rangerait une médina comorienne
--   dans le Diana. Ils restent donc HORS de la grille des régions — joignables
--   par la carte et la recherche, jamais par un rattachement faux.
--   C'est pourquoi la somme des 23 régions fait 2 465 et non 2 476 : l'écart
--   est nommé, pas subi. Le bloc de contrôle final le vérifie.
--
-- ⚠ CE QUI N'EST PAS TOUCHÉ. 0088 crée `explorer_regions` / `explorer_region`
--   pour les DESTINATIONS (`places`). Les deux fonctions d'ici portent sur les
--   SITES (`attractions`) : autre référentiel, autres noms, aucun recouvrement.
-- ============================================================================


-- ── ① L'INDEX QUI MANQUAIT ───────────────────────────────────────────────────
-- ⚠ MESURÉ, PAS SUPPOSÉ. Sans lui, retrouver les villes d'une région balaie les
--   22 707 lieux de `places` (hameaux et villages compris) pour en garder 5 :
--   « Rows Removed by Filter: 22589 », 1 273 blocs lus. Sur la première page du
--   Diana c'était 1 273 blocs sur 2 588 — LA MOITIÉ du coût de l'écran pour
--   lire 118 lignes. `places_region_idx` existe déjà mais indexe TOUS les
--   lieux : il ne sait pas isoler les villes.
--
-- ⚠ LES AUTRES INDEX NÉCESSAIRES EXISTENT DÉJÀ, vérifié dans `pg_indexes` :
--   `places_region_idx` (filtre par région), `attractions_place` (jointure
--   site → lieu), `attractions_kind_idx` (filtre par type),
--   `place_access_place_idx` (état de la route). On n'en rajoute pas.
--   En particulier PAS d'index sur « a une photo / a une description » : le tri
--   porte sur les sites d'UNE région — 367 lignes au maximum (Diana) — et un
--   tri de 367 lignes se fait en mémoire. Un index de 2 476 lignes que le
--   planificateur n'utiliserait jamais coûterait à chaque écriture pour rien.
-- ⚠ LE PRÉDICAT DOIT RECOPIER MOT POUR MOT le filtre de la vue (`lng` compris).
--   Un index partiel plus large reste utilisable, mais PostgreSQL doit alors
--   revérifier `lng is not null` sur le tas — et les colonnes `include` ne
--   servent qu'à rendre des valeurs, jamais à filtrer : on perdrait justement
--   le parcours index-seul qu'on est venu chercher.
create index if not exists places_villes_par_region_idx
  on public.places (region)
  include (slug, name_fr, lat, lng)
  where kind = 'ville'
    and merged_into is null
    and lat is not null
    and lng is not null;


-- ── ② DEUX TABLES DE CORRESPONDANCE, ÉCRITES UNE SEULE FOIS ──────────────────
-- Même forme que `dk_kinds_envie` : `immutable`, ni `security definer` ni
-- `search_path` — elles ne lisent AUCUN objet, ce sont des `case` purs. Le
-- `search_path` ne protège que ce qui résout un nom de table ; l'imposer ici
-- empêcherait seulement le planificateur de les inliner.

-- ⚠ MÊME DÉCOUPAGE QUE `src/lib/grandesRegions.ts`, aux mêmes codes. Les deux
--   doivent bouger ensemble : si l'écran groupe sur « hauts-plateaux » et que
--   le serveur répond « hautes-terres », la carte de région tombe dans aucun
--   groupe et DISPARAÎT de /sites sans la moindre erreur.
-- ⚠ Les 23 régions y sont toutes et une seule fois — le bloc de contrôle final
--   lève si l'une d'elles ressort sans grande région.
create or replace function public.dk_grande_region(p_region text)
returns text
language sql
immutable
as $$
  select case p_region
    when 'Diana'             then 'nord'
    when 'Sava'              then 'nord'
    when 'Analamanga'        then 'hauts-plateaux'
    when 'Vakinankaratra'    then 'hauts-plateaux'
    when 'Itasy'             then 'hauts-plateaux'
    when 'Bongolava'         then 'hauts-plateaux'
    when 'Amoron''i Mania'   then 'hauts-plateaux'
    when 'Haute Matsiatra'   then 'hauts-plateaux'
    when 'Analanjirofo'      then 'est'
    when 'Atsinanana'        then 'est'
    when 'Alaotra-Mangoro'   then 'est'
    when 'Vatovavy'          then 'est'
    when 'Fitovinany'        then 'est'
    when 'Atsimo-Atsinanana' then 'est'
    when 'Boeny'             then 'ouest'
    when 'Sofia'             then 'ouest'
    when 'Betsiboka'         then 'ouest'
    when 'Melaky'            then 'ouest'
    when 'Menabe'            then 'ouest'
    when 'Atsimo-Andrefana'  then 'sud'
    when 'Androy'            then 'sud'
    when 'Anosy'             then 'sud'
    when 'Ihorombe'          then 'sud'
    else null::text
  end
$$;

-- ⚠ MÊMES LIBELLÉS QUE `ETIQUETTE` dans `src/pages/Sites.tsx`. Le contrat veut
--   `{code, libelle, n}` : le libellé part du serveur pour que la facette soit
--   lisible sans table de correspondance côté écran.
-- ⚠ LE REPLI REND LE CODE, JAMAIS `null`. Un type ajouté demain apparaîtrait
--   sous son code brut — moche, mais visible. Un `null` ferait un bouton vide
--   sur lequel personne ne clique, et le type entier deviendrait inatteignable.
create or replace function public.dk_libelle_type(p_kind text)
returns text
language sql
immutable
as $$
  select case p_kind
    when 'reserve'        then 'Réserves et parcs nationaux'
    when 'parc'           then 'Forêts et parcs'
    when 'sommet'         then 'Sommets et massifs'
    when 'plage'          then 'Côtes, baies et plages'
    when 'patrimoine'     then 'Patrimoine'
    when 'site'           then 'Lacs, îles et rivières'
    when 'point_de_vue'   then 'Points de vue'
    when 'cascade'        then 'Cascades'
    when 'grotte'         then 'Grottes'
    when 'musee'          then 'Musées'
    when 'parc_animalier' then 'Parcs animaliers'
    when 'oeuvre'         then 'Œuvres'
    when 'aire'           then 'Aires de pique-nique'
    when 'source'         then 'Sources'
    when 'source_chaude'  then 'Sources chaudes'
    else p_kind
  end
$$;


-- ── ③ LA VUE : « OÙ EST CE SITE », ÉCRIT UNE SEULE FOIS ─────────────────────
-- ⚠ POURQUOI UNE VUE ET PAS LE MÊME BLOC COPIÉ DANS LES DEUX FONCTIONS. La
--   carte de région annonce « Antsiranana, Ambanja, Ambilobe » et la liste doit
--   ranger les mêmes sites sous les mêmes villes. Deux copies du calcul de
--   proximité divergent au premier ajustement : la carte promettrait une ville
--   que le filtre ne rendrait pas. Une seule définition, deux lecteurs.
--
-- ⚠ ELLE N'EST PAS PUBLIQUE. `security_invoker` + révocations plus bas : elle
--   n'est lisible que depuis les deux fonctions `security definer`, dont le
--   propriétaire est `postgres`. Exposée telle quelle, elle laisserait tirer
--   les 2 465 lignes d'un coup en contournant la pagination.
drop view if exists public.sites_localises;

create view public.sites_localises
  with (security_invoker = true)
as
with villes as materialized (
  -- ⚠ `materialized` N'EST PAS DÉCORATIF. Sans lui le planificateur relit les
  --   villes POUR CHAQUE SITE : 765 ms sur la grille des 23 régions, contre
  --   70 ms une fois les 118 lignes lues une seule fois. Mesuré.
  -- ⚠ On écarte les villes fusionnées (`merged_into`) : 20 des 138 sont des
  --   doublons déjà absorbés, s'en servir afficherait un nom périmé.
  select v.id, v.slug, v.name_fr, v.region, v.lat, v.lng
    from public.places v
   where v.kind = 'ville'
     and v.merged_into is null
     and v.lat is not null
     and v.lng is not null
),
sites as (
  -- ⚠ LA JOINTURE INTERNE SUR `l` EST VOULUE : elle laisse dehors les 11 fiches
  --   sans `place_id` — celles des Comores et des Îles Éparses. Un `left join`
  --   les ferait entrer avec une région nulle, donc dans aucune carte, mais en
  --   gonflant les totaux : l'écran afficherait « 2 476 » et n'en montrerait
  --   jamais que 2 465. Mieux vaut un total qui dit la vérité.
  select a.id, a.slug, a.name, a.kind, a.lat, a.lng, a.place_id,
         a.cover_url, a.cover_credit, a.summary, a.description,
         a.guide_required, a.fee_nonresident_ar, a.fee_resident_ar,
         a.best_months, a.fady,
         r.name_fr as region_nom, r.slug as region_slug
    from public.attractions a
    join public.places l on l.id = a.place_id
    join public.places r on r.kind = 'region' and r.name_fr = l.region
   where a.is_published
)
select
  s.id,
  s.slug,
  s.name                        as nom,
  s.kind,
  s.region_nom,
  s.region_slug,
  public.dk_grande_region(s.region_nom) as grande_region,

  -- ── LA VILLE LA PLUS PROCHE, TOUJOURS ──────────────────────────────────────
  -- ⚠ « à 32 km d'Antsiranana » répond à la question qu'on se pose avant de
  --   partir ; un couple de coordonnées, non. Et le lieu de rattachement ne
  --   suffit pas : 1 567 sites sur 2 465 sont accrochés à un hameau ou à un
  --   village que personne ne trouve sur une carte.
  -- ⚠ LE RATTACHEMENT PASSE D'ABORD (`v.id = s.place_id`) : quand le lieu du
  --   site EST une ville, c'est celle-là qu'on nomme, même si une autre est
  --   géométriquement un peu plus près. Mesuré : 409 sites dans ce cas, la
  --   ville rattachée est déjà la plus proche pour 400 d'entre eux — les 9
  --   autres suivent le choix éditorial plutôt qu'un écart de quelques km.
  -- ⚠ TOUJOURS DANS LA MÊME RÉGION, et jamais au-delà de 200 km. Le plafond ne
  --   retire rien aujourd'hui (le pire cas mesuré est à 175 km) : il est là
  --   pour qu'un futur site mal placé rende « pas de ville connue » au lieu
  --   d'annoncer une ville à 600 km, ce qu'un lecteur croirait.
  w.slug    as ville_slug,
  w.name_fr as ville_nom,
  case when w.id is null then null else
    round(sqrt( power((s.lat - w.lat) * 111.0, 2)
              + power((s.lng - w.lng) * 111.0 * cos(radians(s.lat)), 2)
              )::numeric, 0)::integer
  end as km_ville,

  -- ⚠ L'ÉTAT DE LA ROUTE EST UN TEXTE ÉCRIT À LA MAIN (« RN7 goudronnée »,
  --   « Piste en 4x4 depuis la RN7 »), pas un calcul. 42 accès saisis, qui
  --   couvrent 180 sites : les 2 285 autres rendent `null` et l'écran ne dit
  --   RIEN. On ne déduit aucune durée de trajet d'une distance à vol d'oiseau —
  --   une heure de piste et une heure de goudron ne font pas les mêmes km.
  -- ⚠ Choix déterministe quand plusieurs accès existent : celui qui part de la
  --   ville retenue, sinon le plus court, sinon l'`id`. Sans ce départage, deux
  --   chargements de la même page pourraient afficher deux routes différentes.
  (select pa.road_state
     from public.place_access pa
    where pa.place_id = s.place_id
      and pa.road_state is not null
    order by (pa.from_place_id = w.id) desc, pa.distance_km nulls last, pa.id
    limit 1) as etat_route,

  -- Le résumé court d'abord, la description en repli : 219 fiches ont l'un,
  -- 157 l'autre. `nullif(btrim(...))` parce qu'une chaîne de blancs n'est pas
  -- un résumé — elle remplirait la vignette d'un vide qui a l'air d'un bogue.
  coalesce(nullif(btrim(s.summary), ''), nullif(btrim(s.description), '')) as resume,

  s.cover_url,
  s.cover_credit,                      -- ⚠ le crédit ne quitte JAMAIS sa photo
  s.guide_required as guide_obligatoire,

  -- ⚠ RENDUS TELS QUELS, `null` COMPRIS. 6 fiches sur 2 476 portent un tarif
  --   non-résident, 0 un tarif résident. Un `coalesce(..., 0)` ici et l'écran
  --   annoncerait l'entrée gratuite de 2 470 sites.
  s.fee_nonresident_ar as tarif_non_resident_ar,
  s.fee_resident_ar    as tarif_resident_ar,

  -- ⚠ `best_months` est un tableau NOT NULL : il sort vide (0 fiche renseignée
  --   sur 2 476), ce qui se lit « rien de saisi ». On n'invente pas de saison.
  s.best_months,
  -- ⚠ `fady_n` COMPTE, il n'affirme pas. 0 aujourd'hui partout : cela veut dire
  --   « aucun fady saisi », PAS « aucun fady sur place ». L'écran doit se taire
  --   sur 0, jamais écrire « aucun interdit » — ce serait un conseil faux.
  cardinality(s.fady) as fady_n,

  (s.cover_url is not null)                                   as a_une_photo,
  (nullif(btrim(coalesce(s.description, '')), '') is not null) as a_une_description,
  -- `complet` au sens du contrat : une description ET une photo.
  (s.cover_url is not null
   and nullif(btrim(coalesce(s.description, '')), '') is not null) as complet,

  -- ── LA CLÉ DE TRI ET DE CURSEUR ────────────────────────────────────────────
  -- ⚠ TRI TOTAL, DÉPARTAGÉ JUSQU'AU SLUG. Le slug est unique : deux sites ne
  --   peuvent pas partager une clé. Sans ce départage, une page « voir plus »
  --   saute des fiches ou en répète — et personne ne s'en aperçoit avant de
  --   compter.
  -- ⚠ '0' = renseigné, '1' = manquant, et on trie EN CROISSANT : les fiches
  --   complètes ('00…') sortent en tête, puis photo seule, puis description
  --   seule, puis le fond toponymique ('11…'). Le nom reste dans l'ordre
  --   alphabétique À L'INTÉRIEUR de chaque palier — un tri décroissant aurait
  --   rangé les noms de Z vers A, ce qui se lit comme un bogue.
  -- ⚠ LA PHOTO PÈSE PLUS QUE LA DESCRIPTION dans une grille de vignettes : une
  --   carte sans image se lit comme une fiche vide, même bien décrite.
  -- ⚠ `collate "C"` : le curseur compare la clé reçue avec `>`, et le tri doit
  --   trancher EXACTEMENT pareil. Une collation linguistique ignore le tiret au
  --   premier niveau — « nosy-be » et « nosybe » s'y comparent égaux — et la
  --   frontière de page devient impossible à raisonner. L'ordre des octets est
  --   exact et sans surprise.
  ( (case when s.cover_url is not null then '0' else '1' end)
 || (case when nullif(btrim(coalesce(s.description, '')), '') is not null
          then '0' else '1' end)
 || ':' || s.slug ) collate "C" as ordre

from sites s
left join lateral (
  select v.id, v.slug, v.name_fr, v.lat, v.lng
    from villes v
   where v.region = s.region_nom
     and sqrt( power((s.lat - v.lat) * 111.0, 2)
             + power((s.lng - v.lng) * 111.0 * cos(radians(s.lat)), 2) ) <= 200
   order by (v.id = s.place_id) desc,
            sqrt( power((s.lat - v.lat) * 111.0, 2)
                + power((s.lng - v.lng) * 111.0 * cos(radians(s.lat)), 2) )
   limit 1
) w on true;

comment on view public.sites_localises is
  'Interne à 0091. Chaque site publié avec sa région, sa ville la plus proche, '
  'sa distance et l''état de la route quand il est connu. Lue uniquement par '
  'sites_par_region() et sites_de_la_region() — non exposée à l''API.';


-- ── ④ LA GRILLE DES 23 RÉGIONS ───────────────────────────────────────────────
-- ⚠ `drop` avant `create` : `create or replace` NE CHANGE PAS un type de retour
--   (42P13), et une signature laissée derrière ferait une surcharge — PostgREST
--   répond alors 300 « Multiple Choices » et l'écran ne charge plus rien.
drop function if exists public.sites_par_region();

create function public.sites_par_region()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with reg as (
    -- Référencée quatre fois : PostgreSQL la matérialise d'office, la vue
    -- n'est donc calculée qu'UNE fois pour les 2 465 sites (~70 ms mesurés).
    select region_slug, region_nom, grande_region, slug, kind,
           ville_nom, cover_url, cover_credit, a_une_photo, a_une_description
      from public.sites_localises
  ),
  socle as (
    select region_slug, region_nom, grande_region,
           count(*)                                   as nb_sites,
           count(*) filter (where a_une_photo)        as nb_avec_photo,
           count(*) filter (where a_une_description)  as nb_avec_description
      from reg
     group by region_slug, region_nom, grande_region
  ),
  -- ⚠ « LES PLUS DOTÉES » = celles qui portent le plus de sites, pas les plus
  --   peuplées. C'est ce que la carte promet : par où passer pour en voir.
  villes_rang as (
    select region_slug, ville_nom,
           row_number() over (partition by region_slug
                              order by count(*) desc, ville_nom) as rn
      from reg
     where ville_nom is not null
     group by region_slug, ville_nom
  ),
  top_villes as (
    select region_slug, jsonb_agg(ville_nom order by rn) as villes
      from villes_rang where rn <= 3 group by region_slug
  ),
  types_rang as (
    select region_slug, kind, count(*) as n,
           row_number() over (partition by region_slug
                              order by count(*) desc, kind) as rn
      from reg group by region_slug, kind
  ),
  top_types as (
    select region_slug,
           jsonb_agg(jsonb_build_object('code', kind, 'n', n) order by rn) as types
      from types_rang where rn <= 3 group by region_slug
  ),
  -- ⚠ LA PHOTO DE COUVERTURE SORT D'UN SITE DE LA RÉGION, avec SON crédit pris
  --   sur la MÊME ligne. Les 23 régions n'ont aucune photo en propre ; celle
  --   d'un site décrit est la plus sûre. `distinct on` + tri complet pour que
  --   la carte ne change pas d'image à chaque rechargement.
  -- ⚠ Amoron'i Mania n'a ni photo ni description (0 sur 20 sites) : sa carte
  --   sortira sans image. C'est exact, et c'est mieux qu'une photo d'ailleurs.
  couverture as (
    select distinct on (region_slug) region_slug, cover_url, cover_credit
      from reg
     where cover_url is not null
     order by region_slug, a_une_description desc, slug
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug',                s.region_slug,
           'nom',                 s.region_nom,
           'grande_region',       s.grande_region,
           'nb_sites',            s.nb_sites,
           'nb_avec_photo',       s.nb_avec_photo,
           'nb_avec_description', s.nb_avec_description,
           'villes',              coalesce(v.villes, '[]'::jsonb),
           'types',               coalesce(t.types,  '[]'::jsonb),
           'cover_url',           c.cover_url,
           'cover_credit',        c.cover_credit
         )
         -- ⚠ LA DOCUMENTATION D'ABORD, LE VOLUME ENSUITE. Trier sur `nb_sites`
         --   mettrait le Diana en tête pour 367 fiches dont 318 ne sont que des
         --   noms de collines, et l'Analamanga (17 photos, 17 descriptions)
         --   derrière l'Anosy (6 photos pour 176 fiches). Le voyageur cliquerait
         --   sur la région la plus grosse pour tomber sur la plus vide.
         order by s.nb_avec_photo desc, s.nb_avec_description desc,
                  s.nb_sites desc, s.region_nom),
         '[]'::jsonb)
    from socle s
    left join top_villes v on v.region_slug = s.region_slug
    left join top_types  t on t.region_slug = s.region_slug
    left join couverture c on c.region_slug = s.region_slug;
$$;


-- ── ⑤ LES SITES D'UNE RÉGION, FILTRÉS ET PAGINÉS ─────────────────────────────
drop function if exists public.sites_de_la_region(text, text[], text, boolean, text, integer);

create function public.sites_de_la_region(
  p_region     text,
  p_types      text[]  default null,
  p_ville      text    default null,
  p_sans_guide boolean default null,
  p_curseur    text    default null,
  p_limite     integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  -- ⚠ PLAFOND DUR À 100. Le contrat l'impose, et PostgREST tronque de toute
  --   façon à 1 000 lignes EN SILENCE : mieux vaut un plafond qu'on connaît.
  v_lim   integer := least(greatest(coalesce(p_limite, 24), 1), 100);
  v_cle   text    := lower(btrim(coalesce(p_region, '')));
  v_slug  text;
  v_nom   text;
  v_res   jsonb;
begin
  -- ⚠ ON ACCEPTE LE SLUG **OU** LE NOM. L'écran d'aujourd'hui envoie
  --   « Haute Matsiatra », la maquette enverra « haute-matsiatra ». Et
  --   « Amoron'i Mania » s'écrit avec une apostrophe droite : une courbe, et un
  --   filtre exact rendrait une page blanche sans le moindre message d'erreur.
  --   Deux clés acceptées, la casse ignorée — la page blanche est évitée.
  select r.slug, r.name_fr into v_slug, v_nom
    from public.places r
   where r.kind = 'region'
     and (r.slug = v_cle or lower(r.name_fr) = v_cle)
   limit 1;

  -- Région inconnue : on rend une enveloppe vide et bien formée. L'écran sait
  -- afficher « aucun site » ; il ne sait pas afficher une exception.
  if v_slug is null then
    return jsonb_build_object(
      'region',    null,
      'facettes',  jsonb_build_object('types', '[]'::jsonb, 'villes', '[]'::jsonb),
      'elements',  '[]'::jsonb,
      'curseur',   null,
      'total',     0);
  end if;

  with reg as (
    -- Toute la région, SANS filtre : c'est la base des facettes et de
    -- `nb_sites`. Référencée plusieurs fois ⇒ matérialisée d'office.
    -- ⚠ COLONNES ÉNUMÉRÉES, jamais `*`, même sur une vue à soi : le jour où on
    --   ajoute un champ à la vue, il partirait sinon dans la réponse sans que
    --   personne l'ait décidé — c'est comme ça qu'une donnée privée sort.
    select slug, nom, kind, ville_slug, ville_nom, km_ville, etat_route, resume,
           cover_url, cover_credit, guide_obligatoire, tarif_non_resident_ar,
           tarif_resident_ar, best_months, fady_n, complet, ordre
      from public.sites_localises
     where region_slug = v_slug
  ),
  filtre as (
    select * from reg r
     where (p_types is null or cardinality(p_types) = 0 or r.kind = any(p_types))
       and (p_ville is null or r.ville_slug = p_ville)
       -- ⚠ TRIS ÉTATS. `null` = tout ; `true` = on peut y aller seul ;
       --   `false` = guide obligatoire. Le contrat nomme le filtre « sans
       --   guide », donc `true` doit rendre `guide_obligatoire = false` — d'où
       --   la négation, qui est le genre de détail qu'on inverse une fois sur
       --   deux et qui envoie un randonneur seul là où un guide est exigé.
       and (p_sans_guide is null or r.guide_obligatoire = not p_sans_guide)
  ),
  page as (
    -- ⚠ CURSEUR, PAS `offset`. Avec un `offset`, publier une fiche entre deux
    --   clics décale toute la suite : on saute une ligne ou on la revoit.
    select * from filtre f
     where p_curseur is null or f.ordre > p_curseur
     order by f.ordre
     limit v_lim
  ),
  -- ⚠ LES FACETTES COMPTENT LA RÉGION ENTIÈRE (`reg`), PAS LA PAGE ni le
  --   résultat filtré. Annoncer « Grottes · 3 » parce que la page en montre 3
  --   alors que la région en a 27 est pire que ne rien annoncer : le lecteur
  --   conclut qu'il n'y a rien à voir et n'ouvre jamais le filtre.
  --   Corollaire pour l'écran : ces nombres sont ceux de la RÉGION, ils ne se
  --   recoupent pas avec un autre filtre déjà actif — à étiqueter comme tels.
  f_types as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'code', x.kind, 'libelle', public.dk_libelle_type(x.kind), 'n', x.n)
             order by x.n desc, x.kind), '[]'::jsonb) as j
      from (select kind, count(*) as n from reg group by kind) x
  ),
  f_villes as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'slug', x.ville_slug, 'nom', x.ville_nom, 'n', x.n)
             order by x.n desc, x.ville_nom), '[]'::jsonb) as j
      from (select ville_slug, ville_nom, count(*) as n
              from reg where ville_slug is not null
             group by ville_slug, ville_nom) x
  ),
  els as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'slug',                  p.slug,
             'nom',                   p.nom,
             'kind',                  p.kind,
             'ville',                 p.ville_nom,
             'km_ville',              p.km_ville,
             'etat_route',            p.etat_route,
             'resume',                p.resume,
             'cover_url',             p.cover_url,
             'cover_credit',          p.cover_credit,
             'guide_obligatoire',     p.guide_obligatoire,
             'tarif_non_resident_ar', p.tarif_non_resident_ar,
             'tarif_resident_ar',     p.tarif_resident_ar,
             'best_months',           p.best_months,
             'fady_n',                p.fady_n,
             'complet',               p.complet)
             order by p.ordre), '[]'::jsonb) as j,
           max(p.ordre) as dernier,
           count(*)     as n
      from page p
  )
  select jsonb_build_object(
           'region', jsonb_build_object(
             'slug',          v_slug,
             'nom',           v_nom,
             'grande_region', public.dk_grande_region(v_nom),
             'nb_sites',      (select count(*) from reg)),
           'facettes', jsonb_build_object(
             'types',  (select j from f_types),
             'villes', (select j from f_villes)),
           'elements', e.j,
           -- ⚠ PAGE INCOMPLÈTE ⇒ CURSEUR NUL, c'est le seul signal de fin. Rendre
           --   la dernière clé sur une page courte ferait redemander une page
           --   vide à chaque clic sur « voir plus », indéfiniment.
           'curseur', case when e.n < v_lim then null else e.dernier end,
           'total',   (select count(*) from filtre))
    into v_res
    from els e;

  return v_res;
end $$;


-- ── ⑥ LES TROIS RÉVOCATIONS, PUIS LA PREUVE ─────────────────────────────────
-- ⚠ Supabase pose un `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ... TO anon`
--   sur toute fonction créée dans `public` (voir 0071) : ce droit est accordé À
--   `anon` DIRECTEMENT, révoquer `public` ne le retire pas. On nomme les trois.
revoke all on function public.dk_grande_region(text)  from public, anon, authenticated;
revoke all on function public.dk_libelle_type(text)   from public, anon, authenticated;
revoke all on function public.sites_par_region()      from public, anon, authenticated;
revoke all on function public.sites_de_la_region(text, text[], text, boolean, text, integer)
  from public, anon, authenticated;
revoke all on table public.sites_localises from public, anon, authenticated;

-- ⚠ ON NE REND QUE CE QUI DOIT L'ÊTRE. Les deux fonctions de l'écran sont
--   ouvertes à `anon` ET `authenticated` — /sites se consulte sans compte.
--   Les deux tables de correspondance et la vue restent fermées : elles ne sont
--   appelées QUE de l'intérieur, où le rôle courant est le propriétaire.
grant execute on function public.sites_par_region() to anon, authenticated;
grant execute on function public.sites_de_la_region(text, text[], text, boolean, text, integer)
  to anon, authenticated;

-- Contrôle 1 — rien d'indu n'est resté ouvert.
do $$
declare v_reste text;
begin
  select string_agg(f, ', ' order by f) into v_reste from (
    select 'dk_grande_region' as f
     where has_function_privilege('anon', 'public.dk_grande_region(text)', 'execute')
        or has_function_privilege('authenticated', 'public.dk_grande_region(text)', 'execute')
    union all
    select 'dk_libelle_type'
     where has_function_privilege('anon', 'public.dk_libelle_type(text)', 'execute')
        or has_function_privilege('authenticated', 'public.dk_libelle_type(text)', 'execute')
    union all
    select 'sites_localises (vue)'
     where has_table_privilege('anon', 'public.sites_localises', 'select')
        or has_table_privilege('authenticated', 'public.sites_localises', 'select')
  ) s;
  if v_reste is not null then
    raise exception 'reste ouvert à anon/authenticated : %', v_reste;
  end if;
end $$;

-- Contrôle 2 — et /sites n'est pas fermé par excès de zèle.
do $$
declare v_perdu text;
begin
  -- ⚠ Colonnes nommées explicitement : `unnest(...) r` donne un alias de TABLE
  --   qui porte aussi un nom de colonne `r`, et un `r` nu s'y lit de deux
  --   façons. On ne laisse pas le doute décider.
  select string_agg(t.qui || ' → ' || t.fonction, ', ' order by t.qui, t.fonction)
    into v_perdu
    from (
      select q.qui, f.fonction
        from unnest(array['anon', 'authenticated']) as q(qui)
       cross join unnest(array[
         'public.sites_par_region()',
         'public.sites_de_la_region(text,text[],text,boolean,text,integer)'
       ]) as f(fonction)
    ) t
   where not has_function_privilege(t.qui, t.fonction, 'execute');
  if v_perdu is not null then
    raise exception
      '% — /sites rendrait 42501 au lieu de ses régions', v_perdu;
  end if;
end $$;


-- ── ⑦ LE CONTRAT, VÉRIFIÉ SUR LA VRAIE BASE ─────────────────────────────────
-- ⚠ Ces contrôles ne sont pas décoratifs : chacun correspond à une panne muette
--   déjà rencontrée sur ce projet — un compteur qui ment, une page qui saute,
--   une région qui disparaît.
do $$
declare
  v_reg    jsonb;
  v_n      integer;
  v_somme  integer;
  v_publie integer;
  v_sans    integer;
  v_regions integer;
  v_diana   jsonb;
  v_cur     text;
  v_vus     text[] := '{}'::text[];
  v_lot     text[];
  v_tour    integer := 0;
  v_total   integer;
  v_vue     integer[];
  v_src     integer[];
begin
  v_reg := public.sites_par_region();

  -- (a) Les 23 régions sont là. Une région oubliée, et TOUS ses sites
  --     deviennent inatteignables par /sites sans qu'aucune erreur ne sorte.
  v_regions := jsonb_array_length(v_reg);
  if v_regions <> 23 then
    raise exception 'sites_par_region rend % régions au lieu de 23', v_regions;
  end if;

  -- (b) Aucune région sans grande région : sinon sa carte tombe dans aucun
  --     groupe de l'écran et disparaît silencieusement.
  if exists (select 1 from jsonb_array_elements(v_reg) e
              where e->>'grande_region' is null) then
    raise exception 'une région au moins n''est rattachée à aucune grande région';
  end if;

  -- (c) Le compte est bouclé : 23 régions + les 11 fiches hors Madagascar
  --     = les sites publiés. Si un jour la somme dérive, c'est qu'une région
  --     s'est mise à en perdre — on le saura ici, pas en production.
  select sum((e->>'nb_sites')::integer) into v_somme
    from jsonb_array_elements(v_reg) e;
  select count(*) into v_publie from public.attractions where is_published;
  select count(*) into v_sans   from public.attractions
   where is_published and place_id is null;
  if v_somme + v_sans <> v_publie then
    raise exception
      'comptes incohérents : % en régions + % hors rattachement <> % publiés',
      v_somme, v_sans, v_publie;
  end if;

  -- (d) La facette annonce le vrai. On compare le compte d'un type à ce que le
  --     filtre sur ce type rend réellement — c'est exactement le mensonge que
  --     le point ⑤ du cahier des charges interdit.
  v_diana := public.sites_de_la_region('diana');
  select (f->>'n')::integer into v_n
    from jsonb_array_elements(v_diana->'facettes'->'types') f
   where f->>'code' = 'plage';
  if v_n is not null then
    select (public.sites_de_la_region('diana', array['plage'])->>'total')::integer
      into v_total;
    if v_total <> v_n then
      raise exception 'facette « plage » annonce % et le filtre rend %', v_n, v_total;
    end if;
  end if;

  -- (e) Le slug et le nom ouvrent la même région.
  if (public.sites_de_la_region('Diana')->'region'->>'slug')
     is distinct from (v_diana->'region'->>'slug') then
    raise exception 'le nom et le slug d''une région ne rendent pas la même page';
  end if;

  -- (f) LE CURSEUR NE SAUTE NI NE RÉPÈTE. On déroule toute la région par pages
  --     de 24 et on vérifie qu'on a vu chaque site une fois et une seule.
  --     C'est LE test qui manquait : une pagination qui perd des lignes ne se
  --     voit qu'en les comptant.
  v_total := (v_diana->>'total')::integer;
  loop
    v_tour := v_tour + 1;
    if v_tour > 200 then
      raise exception 'le curseur ne se termine pas — boucle sur /sites';
    end if;
    select coalesce(array_agg(e->>'slug'), '{}'::text[])
      into v_lot
      from jsonb_array_elements(v_diana->'elements') e;
    v_vus := v_vus || v_lot;
    v_cur := v_diana->>'curseur';
    exit when v_cur is null;
    v_diana := public.sites_de_la_region('diana', null, null, null, v_cur, 24);
  end loop;

  -- ⚠ `array_length` d'un tableau vide rend `null`, pas `0` — sans le
  --   `coalesce`, la comparaison vaudrait `null` et le contrôle passerait
  --   silencieusement au lieu de lever. C'est le genre de test qui rassure à
  --   tort pendant des mois.
  if coalesce(array_length(v_vus, 1), 0) <> v_total then
    raise exception 'le curseur a rendu % fiches pour un total de %',
      coalesce(array_length(v_vus, 1), 0), v_total;
  end if;
  if (select count(distinct x) from unnest(v_vus) x) <> v_total then
    raise exception 'le curseur répète des fiches : % distinctes sur % rendues',
      (select count(distinct x) from unnest(v_vus) x), v_total;
  end if;

  -- (g) RIEN N'A ÉTÉ FABRIQUÉ. On compte les champs renseignés dans la vue et
  --     dans la table source SUR LA MÊME POPULATION. Tout écart signerait un
  --     `coalesce` de trop : un « 0 Ar » qui promet une entrée gratuite là où
  --     personne n'a saisi de tarif, un mois de saison sorti de nulle part.
  --     Attendu aujourd'hui : 0 tarif résident, 6 non-résidents, 0 mois, 0 fady.
  select array[count(*) filter (where tarif_resident_ar is not null),
               count(*) filter (where tarif_non_resident_ar is not null),
               count(*) filter (where cardinality(best_months) > 0),
               count(*) filter (where fady_n > 0)]::integer[]
    into v_vue
    from public.sites_localises;

  select array[count(*) filter (where a.fee_resident_ar is not null),
               count(*) filter (where a.fee_nonresident_ar is not null),
               count(*) filter (where cardinality(a.best_months) > 0),
               count(*) filter (where cardinality(a.fady) > 0)]::integer[]
    into v_src
    from public.attractions a
    join public.places l on l.id = a.place_id
    join public.places r on r.kind = 'region' and r.name_fr = l.region
   where a.is_published;

  if v_vue is distinct from v_src then
    raise exception
      'valeurs fabriquées — vue % <> table % '
      '(tarif résident, tarif non-résident, mois, fady)', v_vue, v_src;
  end if;

  raise notice
    '0091 — % régions, % sites rattachés, % hors Madagascar (Comores et Îles '
    'Éparses), curseur vérifié sur % fiches du Diana',
    v_regions, v_somme, v_sans, v_total;
end $$;
