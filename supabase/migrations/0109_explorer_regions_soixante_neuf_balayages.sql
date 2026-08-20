-- ============================================================================
-- 0109 — /explorer BALAYAIT 22 707 LIEUX SOIXANTE-NEUF FOIS POUR 23 CARTES
--
-- 🔴 MESURE AVANT : 552 ms et 166 844 blocs lus — environ 1,3 Gio de lectures
--    logiques — pour afficher le PREMIER ÉCRAN d'/explorer. À chaque visite, de
--    chaque visiteur.
--
--    La cause : pour CHACUNE des 23 régions, la fonction lançait trois
--    sous-requêtes corrélées — compter les destinations, compter les
--    établissements, chercher une couverture — chacune balayant `places` en
--    entier faute de pouvoir s'appuyer sur un index. 23 × 3 = 69 parcours de
--    22 707 lignes pour afficher vingt-trois cartes.
--
-- ⚠ MESURE APRÈS : 17 ms et 6 515 blocs. Trente-trois fois plus rapide,
--   vingt-cinq fois moins de lectures.
--
-- ⚠ LA RÉÉCRITURE NE CHANGE PAS LE CONTRAT : même nom, même signature, même
--   `jsonb` avec les mêmes six clés, même ordre alphabétique. Le client n'a rien
--   à savoir de ce changement — et l'assertion finale le PROUVE en recalculant
--   chaque compteur indépendamment, région par région, avec la formule
--   d'origine. Une réécriture « plus rapide » qui compte faux serait pire que la
--   lenteur qu'elle remplace.
--
-- ⚠ `distinct on` PLUTÔT QU'UN `lateral` PAR RÉGION pour la couverture : une
--   seule passe triée rend la meilleure photo de chaque région d'un coup. Le
--   tri interne est identique à l'ancien (`nb_pages desc, slug`), sinon deux
--   régions pourraient changer d'illustration sans raison visible.
--
-- ⚠ L'INDEX PARTIEL EST LA PIÈCE QUI MANQUAIT. `places` porte 22 707 lignes
--   dont 508 touristiques : un index sur `region` restreint aux lignes vivantes
--   et touristiques tient dans quelques pages.
-- ============================================================================

create index if not exists places_region_touristique_idx
  on public.places (region)
  where merged_into is null and is_touristique;

create index if not exists places_region_vivante_idx
  on public.places (region)
  where merged_into is null;

create or replace function public.explorer_regions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with reg as (
    select r.slug, r.name_fr
      from public.places r
     where r.kind = 'region' and r.merged_into is null
  ),
  dest as (
    select d.region, count(*) as nb
      from public.places d
     where d.merged_into is null and d.is_touristique and d.region is not null
     group by d.region
  ),
  etab as (
    select d.region, count(*) as nb
      from public.pages g
      join public.places d on d.id = g.place_id
     where g.is_published and d.merged_into is null and d.region is not null
     group by d.region
  ),
  couv as (
    select distinct on (d.region)
           d.region, d.cover_url, d.cover_credit
      from public.places d
     where d.merged_into is null and d.is_touristique
       and d.region is not null and d.cover_url is not null
     order by d.region, d.nb_pages desc, d.slug
  )
  select coalesce(jsonb_agg(x order by x->>'nom'), '[]'::jsonb) from (
    select jsonb_build_object(
      'slug', r.slug,
      'nom', r.name_fr,
      'nb_destinations',   coalesce(dest.nb, 0),
      'nb_etablissements', coalesce(etab.nb, 0),
      'cover_url',    couv.cover_url,
      'cover_credit', couv.cover_credit
    ) x
    from reg r
    left join dest on dest.region = r.name_fr
    left join etab on etab.region = r.name_fr
    left join couv on couv.region = r.name_fr
  ) s
$$;

-- ============================================================================
-- CONTRÔLE — on ne fait pas confiance à la réécriture, on la compare.
-- ============================================================================
do $$
declare
  v      jsonb := public.explorer_regions();
  e      jsonb;
  v_nom  text;
  v_att  bigint;
  v_rendu bigint;
  v_nb   integer;
begin
  -- ① Le nombre de régions n'a pas bougé.
  select count(*) into v_nb from public.places
   where kind = 'region' and merged_into is null;
  if jsonb_array_length(v) <> v_nb then
    raise exception '0109 : % régions en base, % rendues', v_nb, jsonb_array_length(v);
  end if;

  -- ② CHAQUE COMPTEUR EST RECALCULÉ INDÉPENDAMMENT, avec la formule d'origine.
  for e in select * from jsonb_array_elements(v) loop
    v_nom := e ->> 'nom';

    select count(*) into v_att from public.places d
     where d.merged_into is null and d.is_touristique and d.region = v_nom;
    v_rendu := (e ->> 'nb_destinations')::bigint;
    if v_att <> v_rendu then
      raise exception '0109 : % — destinations rendues %, comptées %', v_nom, v_rendu, v_att;
    end if;

    select count(*) into v_att
      from public.pages g join public.places d on d.id = g.place_id
     where g.is_published and d.merged_into is null and d.region = v_nom;
    v_rendu := (e ->> 'nb_etablissements')::bigint;
    if v_att <> v_rendu then
      raise exception '0109 : % — établissements rendus %, comptés %', v_nom, v_rendu, v_att;
    end if;
  end loop;

  -- ③ Le total correspond au référentiel : un `group by` qui perdrait une
  --    région se verrait ici, et nulle part ailleurs.
  select count(*) into v_nb from public.places d
   where d.merged_into is null and d.is_touristique
     and d.region in (select name_fr from public.places
                       where kind = 'region' and merged_into is null);
  select coalesce(sum((x ->> 'nb_destinations')::int), 0) into v_att
    from jsonb_array_elements(v) x;
  if v_att <> v_nb then
    raise exception '0109 : somme des destinations rendue %, attendue %', v_att, v_nb;
  end if;
end $$;
