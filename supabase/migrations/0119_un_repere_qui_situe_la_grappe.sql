-- ============================================================================
-- 0119 — « AUTOUR DE H1 » NE SITUE RIEN : le repère d'une grappe devient un lieu
--
-- 🔴 CE QUE ÇA CORRIGE. Depuis 0118, cliquer une grappe ouvre sa composition,
--    avec un sous-titre censé la situer. Ce sous-titre lit `exemple`, que
--    `carte_grappes` calcule en prenant LE NOM LE PLUS COURT de la case :
--    `(array_agg(name order by length(name)))[1]`.
--
--    Sur la case d'Antananarivo — 1 285 points — ce nom est « Bar ». Ailleurs :
--    « H1 », « HRN », « JIM ». Le panneau annonçait donc « 1 780 points ici,
--    autour de H1 » : un repère qui ne repère rien, vu en capture.
--
-- ⚠ LE BON REPÈRE ÉTAIT DÉJÀ DANS LA REQUÊTE, jamais utilisé : chaque point
--   est rattaché à une commune (`places.name_fr`), et la commune la PLUS
--   PORTÉE par les points d'une case est, par construction, la localité autour
--   de laquelle ils se trouvent. Sur la même case : « Antananarivo ».
--
-- ⚠ `mode()` IGNORE LES NULL et tranche les ex æquo de façon déterministe. Le
--   repli reste le nom le plus court — pour une case qui ne porterait aucun
--   rattachement — mais il est désormais départagé par le nom lui-même : sans
--   ce second critère, deux noms de même longueur sortaient dans un ordre qui
--   pouvait changer d'un appel à l'autre, et le sous-titre du panneau bougeait
--   sans que rien n'ait bougé.
--
-- ⚠ RIEN D'AUTRE NE CHANGE : même signature, mêmes colonnes, même filtrage.
--   Seul le contenu d'`exemple` s'améliore, et l'infobulle des pastilles avec.
-- ============================================================================

create or replace function public.carte_grappes(
  p_sud       double precision,
  p_ouest     double precision,
  p_nord      double precision,
  p_est       double precision,
  p_pas       double precision,
  p_categorie text   default null,
  p_familles  text[] default null
)
returns table(
  lat double precision, lng double precision, n bigint, n_sites bigint,
  exemple text, total_zone bigint,
  familles jsonb,
  familles_zone jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with tout as (
    select 'page'::text as genre, p.name,
           pl.name_fr as commune,
           public.dk_famille_carte('page', p.categories, null) as famille,
           coalesce(p.lat, pl.lat)::double precision as lat,
           coalesce(p.lng, pl.lng)::double precision as lng
      from public.pages p
      left join public.places pl on pl.id = p.place_id
     where p.is_published
       and coalesce(p.lat, pl.lat) between p_sud and p_nord
       and coalesce(p.lng, pl.lng) between p_ouest and p_est
       and (p_categorie is null or p_categorie = any(p.categories))
    union all
    select 'site', a.name,
           pl.name_fr,
           public.dk_famille_carte('site', null, a.kind),
           coalesce(a.lat, pl.lat)::double precision,
           coalesce(a.lng, pl.lng)::double precision
      from public.attractions a
      left join public.places pl on pl.id = a.place_id
     where a.is_published
       and coalesce(a.lat, pl.lat) between p_sud and p_nord
       and coalesce(a.lng, pl.lng) between p_ouest and p_est
       and (p_categorie is null or p_categorie = a.kind)
  ),
  -- 🔴 LA LÉGENDE COMPTE AVANT LE FILTRE, ET C'EST TOUT L'INTÉRÊT. Si elle
  --    comptait après, cocher « Restaurants » afficherait « Plages 0 » — et
  --    plus rien ne dirait qu'il y a 318 plages à décocher pour retrouver.
  legende as (
    select coalesce(jsonb_object_agg(famille, n), '{}'::jsonb) as j
      from (select famille, count(*) as n from tout group by famille) x
  ),
  garde as (
    select * from tout
     where p_familles is null or famille = any(p_familles)
  ),
  grille as (
    select
      -- ⚠ On rend le CENTRE de la case, pas la moyenne des points : la moyenne
      --   fait sauter la pastille d'une case à l'autre au moindre déplacement,
      --   et l'œil perd le repère.
      floor(lat / p_pas) * p_pas + p_pas / 2 as clat,
      floor(lng / p_pas) * p_pas + p_pas / 2 as clng,
      count(*) as n,
      count(*) filter (where genre = 'site') as n_sites,
      -- La commune la plus portée par les points de la case ; à défaut, le nom
      -- le plus court, départagé pour rester stable d'un appel à l'autre.
      coalesce(
        mode() within group (order by commune),
        (array_agg(name order by length(name), name))[1]
      ) as exemple,
      jsonb_object_agg(famille, nf) filter (where famille is not null) as familles
    from (
      select lat, lng, genre, name, commune, famille,
             count(*) over (partition by floor(lat / p_pas), floor(lng / p_pas),
                            famille) as nf
        from garde
    ) g
    group by 1, 2
  )
  select clat, clng, n, n_sites, exemple,
         (select count(*) from garde) as total_zone,
         coalesce(familles, '{}'::jsonb),
         (select j from legende)
    from grille
   order by n desc
   limit 400;
$$;

-- ── Contrôle 1 : la plus grosse grappe du pays se nomme enfin ─────────────
-- ⚠ ON ÉPROUVE LE CAS QUI A ÉCHOUÉ, pas un cas commode : c'est la case
--   d'Antananarivo qui affichait « Bar », et c'est elle qui doit dire
--   « Antananarivo ».
do $$
declare v_exemple text; v_n bigint;
begin
  select exemple, n into v_exemple, v_n
    from public.carte_grappes(-26.0, 42.0, -11.0, 51.0, 0.5)
   order by n desc limit 1;
  if v_exemple is null or length(v_exemple) < 4 then
    raise exception '0119 : la plus grosse grappe (% points) se nomme « % » — un repère de moins de 4 lettres n''en est pas un',
      v_n, v_exemple;
  end if;
  raise notice '0119 : plus grosse grappe = % points, autour de %', v_n, v_exemple;
end $$;

-- ── Contrôle 2 : aucune grappe ne reste sans repère ───────────────────────
-- 🔴 UN SOUS-TITRE ABSENT N'EST PAS GRAVE — l'écran ne l'affiche pas. Mais un
--    repère NULL sur une grappe qui porte des communes signalerait que le
--    `coalesce` ne joue pas, et personne ne le verrait avant un signalement.
do $$
declare v_sans int; v_total int;
begin
  select count(*) filter (where exemple is null), count(*)
    into v_sans, v_total
    from public.carte_grappes(-26.0, 42.0, -11.0, 51.0, 0.5);
  if v_sans > 0 then
    raise exception '0119 : % grappes sur % sans aucun repère', v_sans, v_total;
  end if;
end $$;

-- ── Contrôle 3 : chronométré SOUS LE RÔLE anon, timeout de production ────
-- ⚠ `mode() within group` est un agrégat ordonné : il TRIE chaque groupe. Sur
--   la vue du pays — 5 705 points en une seule requête — c'est exactement le
--   genre d'ajout qui passe en test et expire chez le visiteur. On le mesure
--   sous le rôle qui porte le plafond de 3 s.
do $$
declare t0 timestamptz; v_ms numeric; v_n int;
begin
  execute 'set local role anon';
  execute 'set local statement_timeout = ''3s''';
  t0 := clock_timestamp();
  select count(*) into v_n from public.carte_grappes(-26.0, 42.0, -11.0, 51.0, 0.225);
  v_ms := 1000 * extract(epoch from clock_timestamp() - t0);
  execute 'reset role';
  if v_ms > 1500 then
    raise exception '0119 : % ms sous anon — le tri de mode() coûte trop cher pour le plafond de 3 s', round(v_ms);
  end if;
  raise notice '0119 : % grappes sous anon en % ms', v_n, round(v_ms);
end $$;
