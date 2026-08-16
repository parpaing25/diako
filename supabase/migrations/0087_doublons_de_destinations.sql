-- ============================================================================
-- 0087 — LA MÊME VILLE, DEUX FOIS DANS LE CATALOGUE
--
-- 🔴 CE QUE LE PROPRIÉTAIRE A VU. « Ambalavao » apparaît DEUX FOIS dans
--    Explorer : `ambalavao-3` (ville, Haute Matsiatra, 6 établissements) et
--    `ambalavao` (ville, Haute Matsiatra, 1 établissement, 1 récit). Même
--    ville, 400 mètres d'écart. Et pire, invisible depuis l'écran :
--    `antananarivo-2` porte 521 établissements pendant qu'`antananarivo` en
--    porte 58 — la capitale est coupée en deux, et une recherche d'hôtel à
--    Tananarive rend l'une ou l'autre moitié selon la fiche ouverte.
--
-- 🔴 POURQUOI LA DÉDUPLICATION DE 0066 LES A RATÉS. Elle groupe sur `norm`, et
--    `norm` est une colonne GÉNÉRÉE qui concatène `name_fr` ET `name_mg` :
--      · `ambalavao`   → « ambalavao ambalavao » (il porte son nom malgache)
--      · `ambalavao-3` → « ambalavao »           (il ne l'a pas)
--    Deux valeurs différentes, donc deux groupes, donc aucun doublon détecté.
--    Le doublon le PLUS VISIBLE du site passait au travers d'un filet posé
--    exprès pour lui. Une clé de rapprochement qui inclut un champ facultatif
--    n'est pas une clé de rapprochement.
--
-- ⚠ LA RÈGLE EXIGE LES TROIS CONDITIONS ENSEMBLE : même nom FRANÇAIS
--   normalisé, MÊME RÉGION, et moins de 10 km. Aucune n'est décorative —
--   « Ambatolampy » existe en Vakinankaratra ET en Analamanga, « Ambalavao »
--   dans six régions différentes. Ce sont des villages distincts qui portent le
--   même nom, ce qui est banal à Madagascar ; les fusionner détruirait de la
--   donnée vraie et ferait disparaître des lieux réels.
--
-- ⚠ ON GARDE LA LIGNE LA PLUS RICHE, et on lui reporte ce que l'autre avait et
--   qu'elle n'a pas — photo et crédit, résumé, raisons d'y aller, nom malgache,
--   coordonnées. Perdre une photo dans une fusion serait absurde : c'est
--   précisément ce qui manque le plus au produit.
--
-- ⚠ LES QUINZE RATTACHEMENTS SONT RÉÉCRITS AVANT LE MARQUAGE. `places` est
--   référencée par quinze colonnes (relevées dans pg_constraint, pas devinées).
--   En oublier une laisserait des établissements, des récits ou des accès
--   accrochés à une fiche que plus personne n'affiche : ils disparaîtraient du
--   site sans être supprimés de la base — le pire des deux mondes.
-- ============================================================================

-- Le couple à fusionner : (garde, absorbe). On garde le plus riche.
create temporary table dk_fusion on commit drop as
with candidats as (
  select
    p.id, p.slug, p.name_fr, p.name_mg, p.region, p.lat, p.lng,
    p.nb_pages, p.nb_posts, p.cover_url, p.cover_credit, p.cover_licence,
    p.cover_source, p.summary, p.why_go,
    -- ⚠ Le nom FRANÇAIS seul, sans le malgache : c'est tout le correctif.
    regexp_replace(lower(unaccent(coalesce(p.name_fr, ''))), '[^a-z0-9]+', ' ', 'g') as cle
  from public.places p
  -- 🔴 `is_touristique` N'EST PAS UN DÉTAIL, C'EST LE GARDE-FOU PRINCIPAL. Sans
  --    lui, la même règle appliquée aux 22 000 lieux du fond toponymique
  --    fusionnerait des MILLIERS de hameaux homonymes voisins — « Ambalavaokely »
  --    quatre fois en Haute Matsiatra à moins de dix kilomètres. Ce sont des
  --    hameaux distincts et réels : les confondre détruirait la carte du pays
  --    pour régler un défaut d'affichage. Le doublon signalé porte sur les
  --    DESTINATIONS, c'est-à-dire sur ce que le catalogue montre ; on ne touche
  --    qu'à elles. Vérifié à blanc : 13 paires, toutes des villes évidentes.
  where p.merged_into is null and p.is_touristique
    and p.region is not null and p.lat is not null
),
paires as (
  select a.id as garde, b.id as absorbe
  from candidats a
  join candidats b
    on b.cle = a.cle
   and b.region = a.region
   and b.id <> a.id
   -- ⚠ Distance en kilomètres, approximation plane : à 10 km près et sous ces
   --   latitudes, elle est très largement suffisante pour trancher.
   and sqrt(power((a.lat - b.lat) * 111.0, 2)
          + power((a.lng - b.lng) * 111.0 * cos(radians(a.lat)), 2)) <= 10
   -- La plus riche gagne : établissements, puis récits, puis une photo, puis
   -- l'identifiant pour que le choix soit TOTAL et reproductible.
   and (a.nb_pages, a.nb_posts, (a.cover_url is not null)::int, a.id)
     > (b.nb_pages, b.nb_posts, (b.cover_url is not null)::int, b.id)
)
select distinct on (absorbe) garde, absorbe from paires order by absorbe, garde;

-- ── Ce que l'absorbée avait et que la gardée n'a pas ────────────────────────
update public.places g set
  cover_url     = coalesce(g.cover_url,     a.cover_url),
  cover_credit  = coalesce(g.cover_credit,  a.cover_credit),
  cover_licence = coalesce(g.cover_licence, a.cover_licence),
  cover_source  = coalesce(g.cover_source,  a.cover_source),
  summary       = coalesce(g.summary,       a.summary),
  why_go        = coalesce(g.why_go,        a.why_go),
  name_mg       = coalesce(g.name_mg,       a.name_mg),
  is_touristique = g.is_touristique or a.is_touristique
from dk_fusion f
join public.places a on a.id = f.absorbe
where g.id = f.garde;

-- ── Les quinze rattachements, un par un ─────────────────────────────────────
update public.attractions   t set place_id       = f.garde from dk_fusion f where t.place_id       = f.absorbe;
update public.dishes        t set typical_place_id = f.garde from dk_fusion f where t.typical_place_id = f.absorbe;
update public.events        t set place_id       = f.garde from dk_fusion f where t.place_id       = f.absorbe;
update public.guides        t set place_id       = f.garde from dk_fusion f where t.place_id       = f.absorbe;
update public.pages         t set place_id       = f.garde from dk_fusion f where t.place_id       = f.absorbe;
update public.place_aliases t set place_id       = f.garde from dk_fusion f where t.place_id       = f.absorbe;
update public.posts         t set place_id       = f.garde from dk_fusion f where t.place_id       = f.absorbe;
update public.tour_days     t set place_id       = f.garde from dk_fusion f where t.place_id       = f.absorbe;
update public.tours         t set start_place_id = f.garde from dk_fusion f where t.start_place_id = f.absorbe;
update public.tours         t set end_place_id   = f.garde from dk_fusion f where t.end_place_id   = f.absorbe;
update public.places        t set parent_id      = f.garde from dk_fusion f where t.parent_id      = f.absorbe;

-- ⚠ CES DEUX-LÀ ONT UNE CLÉ COMPOSITE. Un simple report créerait un doublon de
--   clé primaire quand les deux fiches portent le même mois ou le même départ :
--   on ne reporte donc que ce qui n'existe pas déjà chez la gardée, et on
--   supprime le reste. La saisonnalité de la fiche la plus riche fait foi.
delete from public.place_seasons s
 using dk_fusion f
 where s.place_id = f.absorbe
   and exists (select 1 from public.place_seasons g
                where g.place_id = f.garde and g.month = s.month);
update public.place_seasons s set place_id = f.garde from dk_fusion f where s.place_id = f.absorbe;

delete from public.place_access a
 using dk_fusion f
 where a.place_id = f.absorbe
   and exists (select 1 from public.place_access g
                where g.place_id = f.garde and g.from_place_id = a.from_place_id
                  and g.mode = a.mode);
update public.place_access a set place_id      = f.garde from dk_fusion f where a.place_id      = f.absorbe;
update public.place_access a set from_place_id = f.garde from dk_fusion f where a.from_place_id = f.absorbe;

-- ⚠ Une fiche ne peut pas être son propre parent, et une chaîne de fusions ne
--   doit pas laisser un parent qui pointe vers une absorbée.
update public.places set parent_id = null where parent_id = id;

-- ── Le marquage, en dernier ─────────────────────────────────────────────────
update public.places p set merged_into = f.garde, is_touristique = false
from dk_fusion f where p.id = f.absorbe;

-- ── Les compteurs dénormalisés sont refaits, pas additionnés ────────────────
-- ⚠ Additionner les deux compteurs donnerait un total FAUX si un même
--   établissement était rattaché aux deux fiches. On recompte.
update public.places p set
  nb_pages = (select count(*) from public.pages g where g.place_id = p.id and g.is_published),
  nb_posts = (select count(*) from public.posts o where o.place_id = p.id and o.status = 'published')
where p.id in (select garde from dk_fusion);

-- ── Contrôle : plus aucun doublon selon la règle ────────────────────────────
do $$
declare v_reste text;
begin
  with c as (
    select p.id, p.slug, p.region, p.lat, p.lng,
           regexp_replace(lower(unaccent(coalesce(p.name_fr,''))), '[^a-z0-9]+', ' ', 'g') cle
      from public.places p
     -- ⚠ MÊME PÉRIMÈTRE QUE LA FUSION. Un contrôle plus large que ce qu'on a
     --   traité lèverait sur les hameaux homonymes qu'on a délibérément laissés
     --   tranquilles, et bloquerait la migration pour un défaut inexistant.
     where p.merged_into is null and p.is_touristique
       and p.region is not null and p.lat is not null
  )
  select string_agg(distinct a.slug || ' / ' || b.slug, ', ')
    into v_reste
    from c a join c b
      on b.cle = a.cle and b.region = a.region and a.id < b.id
     and sqrt(power((a.lat - b.lat) * 111.0, 2)
            + power((a.lng - b.lng) * 111.0 * cos(radians(a.lat)), 2)) <= 10;
  if v_reste is not null then
    raise exception '0087 : des doublons subsistent : %', v_reste;
  end if;
end $$;
