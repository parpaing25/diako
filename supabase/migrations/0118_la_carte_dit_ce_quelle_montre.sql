-- ============================================================================
-- 0118 — LA CARTE DIT CE QU'ELLE MONTRE : familles, légende, filtres qui vivent
--
-- Demande du propriétaire, capture à l'appui : « la carte n'est pas belle à voir
-- du tout, mets des légendes, mets des filtres pour filtrer que les restau, les
-- sites touristiques ou autre, change d'icône à chaque type ».
--
-- 🔴 TROIS DÉFAUTS, DONT DEUX INVISIBLES DEPUIS L'ÉCRAN.
--
--    ① LES FILTRES DISPARAISSENT À L'OUVERTURE. L'écran compte ses pastilles
--      dans le tableau `points`, qui est VIDE en vue d'ensemble (on y sert des
--      grappes). La ligne `if (n === 0) return null` les efface donc toutes :
--      au niveau du pays — la vue par défaut, celle de la capture — il ne reste
--      aucun filtre. Ils réapparaissent au zoom 11, sans que rien n'explique
--      pourquoi.
--
--    ② `p_categorie` EXISTE DEPUIS TOUJOURS ET N'A JAMAIS ÉTÉ APPELÉ. Les deux
--      fonctions savent filtrer côté serveur ; le client filtrait à la main un
--      tableau DÉJÀ tronqué à 800 lignes sur 5 705. Cocher « Restaurants »
--      cherchait donc les restaurants parmi 800 points arbitraires, pas parmi
--      les 1 872 de la base.
--
--    ③ UNE GRAPPE NE DIT PAS CE QU'ELLE CONTIENT. « 1.1k » en turquoise sur
--      Antananarivo : des hôtels ? des sommets ? On ne pouvait pas le savoir
--      sans zoomer. C'est ce que `familles` corrige.
--
-- ⚠ CE QUI EST AJOUTÉ NE CASSE PAS L'EXISTANT. Les paramètres gardent leur nom
--   et leur place, les nouveaux ont un défaut, les colonnes s'ajoutent à la fin.
--   PostgREST appelle par NOM : le client déjà en ligne continue de fonctionner
--   entre cette migration et le redéploiement. Le `drop` + `create` est dans la
--   transaction de la migration, donc atomique — à aucun instant la fonction
--   n'est absente.
--
-- ⚠ SEPT FAMILLES, RECOMPTÉES EN BASE LE 01/09/2026 (5 705 points) :
--   manger 1 872 · dormir 1 428 · nature 956 · sommet 828 · culture 349 ·
--   plage 318 · service 110. Aucune n'est vide, aucune n'écrase les autres.
--
-- 🔴 LES 618 ATTRACTIONS DE `kind = 'site'` NE SONT PAS DU PATRIMOINE. Échantillon
--    lu en base : « Lac Masay », « Somory Rivière », « Piscine Naturelle »,
--    « Kapaky Rivière ». Ce sont des points d'eau : elles vont dans `nature`.
--    Les ranger dans `culture` aurait fait de la famille culturelle la deuxième
--    du pays, à tort.
-- ============================================================================

-- ── LA TABLE DES FAMILLES, ÉCRITE UNE SEULE FOIS ───────────────────────────
-- ⚠ UNE FICHE PEUT PORTER PLUSIEURS CATÉGORIES (65 en portent 2 à 5 : « hôtel
--   + restaurant + agence + site »). Un point n'a qu'une épingle : la priorité
--   est donc DÉCIDÉE ici, pas subie par l'ordre du tableau. Un hôtel qui sert à
--   manger reste un hôtel — c'est ce qu'on vient y chercher.
create or replace function public.dk_famille_carte(
  p_genre      text,
  p_categories text[],
  p_kind       text
)
returns text
language sql
immutable
as $$
  select case
    when p_genre = 'page' then case
      when 'hotel'                  = any(p_categories) then 'dormir'
      when 'restaurant'             = any(p_categories) then 'manger'
      when 'agence_voyage'          = any(p_categories) then 'service'
      when 'location_vehicule'      = any(p_categories) then 'service'
      when 'transporteur'           = any(p_categories) then 'service'
      when 'guide'                  = any(p_categories) then 'service'
      when 'organisateur_evenement' = any(p_categories) then 'service'
      when 'site_attraction'        = any(p_categories) then 'culture'
      else 'service'
    end
    else case p_kind
      when 'plage'          then 'plage'
      when 'sommet'         then 'sommet'
      when 'point_de_vue'   then 'sommet'
      when 'parc'           then 'nature'
      when 'reserve'        then 'nature'
      when 'parc_animalier' then 'nature'
      when 'cascade'        then 'nature'
      when 'grotte'         then 'nature'
      when 'source'         then 'nature'
      when 'aire'           then 'nature'
      when 'site'           then 'nature'
      when 'patrimoine'     then 'culture'
      when 'musee'          then 'culture'
      when 'oeuvre'         then 'culture'
      -- ⚠ UN GENRE INCONNU NE DISPARAÎT PAS. Il tombe dans `culture`, qui est
      --   visible et filtrable. Rendre `null` l'aurait fait sortir de toute
      --   famille : le point resterait sur la carte, mais aucun filtre ne le
      --   trouverait, et aucun compteur ne l'annoncerait — invisible en silence.
      else 'culture'
    end
  end
$$;

comment on function public.dk_famille_carte(text, text[], text) is
  'La famille d''un point de carte. Sept valeurs : dormir, manger, plage, nature, sommet, culture, service. Source unique — le client lit ce que cette fonction décide, il ne redérive rien.';

-- ── ① LES GRAPPES, AVEC LEUR COMPOSITION ───────────────────────────────────
drop function if exists public.carte_grappes(
  double precision, double precision, double precision, double precision,
  double precision, text);

create function public.carte_grappes(
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
  -- Ce que CETTE grappe contient : {"dormir": 40, "manger": 96, …}
  familles jsonb,
  -- Ce que la ZONE contient, toutes familles confondues et AVANT filtrage.
  familles_zone jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with tout as (
    select 'page'::text as genre, p.name,
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
  --    Une case de filtre doit annoncer ce qu'elle ALLUMERAIT, pas ce qui
  --    reste allumé.
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
      (array_agg(name order by length(name)))[1] as exemple,
      jsonb_object_agg(famille, nf) filter (where famille is not null) as familles
    from (
      select lat, lng, genre, name, famille,
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

-- ── ② LES POINTS, AVEC LEUR FAMILLE ────────────────────────────────────────
drop function if exists public.carte_zone(
  double precision, double precision, double precision, double precision,
  text, text[], integer);

create function public.carte_zone(
  p_sud       double precision,
  p_ouest     double precision,
  p_nord      double precision,
  p_est       double precision,
  p_categorie text    default null,
  p_types     text[]  default array['page','site'],
  p_limite    integer default 800,
  p_familles  text[]  default null
)
returns table(
  genre text, id uuid, slug text, name text, categories text[], cover_url text,
  lat double precision, lng double precision, precision_geo text,
  place_name text, price_min_ar bigint, price_min_unit text,
  rating_avg numeric, rating_count integer, total_zone bigint,
  -- La famille est DÉCIDÉE PAR LE SERVEUR : l'épingle, la légende et le filtre
  -- lisent la même valeur. Recalculée dans le client, elle divergerait au
  -- premier code ajouté en base.
  famille text,
  familles_zone jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with etabs as (
    select 'page'::text as genre, p.id, p.slug, p.name, p.categories, p.cover_url,
           coalesce(p.lat, pl.lat)::double precision as lat,
           coalesce(p.lng, pl.lng)::double precision as lng,
           case when p.lat is not null then 'exacte' else 'lieu' end as precision_geo,
           pl.name_fr as place_name, p.price_min_ar, p.price_min_unit,
           p.rating_avg, p.rating_count,
           public.dk_famille_carte('page', p.categories, null) as famille,
           -- ⚠ L'ORDRE DÉCIDE QUI SURVIT À LA TRONCATURE : les fiches les plus
           --   complètes d'abord, pas les premières venues.
           (p.completeness, p.rating_count) as rang
      from public.pages p
      left join public.places pl on pl.id = p.place_id
     where p.is_published
       and coalesce(p.lat, pl.lat) between p_sud  and p_nord
       and coalesce(p.lng, pl.lng) between p_ouest and p_est
       and (p_categorie is null or p_categorie = any(p.categories))
       and 'page' = any(p_types)
  ),
  sites as (
    select 'site'::text, a.id, a.slug, a.name, array[a.kind], a.cover_url,
           coalesce(a.lat, pl.lat)::double precision,
           coalesce(a.lng, pl.lng)::double precision,
           case when a.lat is not null then 'exacte' else 'lieu' end,
           pl.name_fr, null::bigint, null::text, null::numeric, null::integer,
           public.dk_famille_carte('site', null, a.kind),
           -- Un site décrit passe devant un site qui n'est qu'un nom.
           ((case when a.description is not null then 2
                  when a.summary is not null then 1 else 0 end)::smallint, 0)
      from public.attractions a
      left join public.places pl on pl.id = a.place_id
     where a.is_published
       and coalesce(a.lat, pl.lat) between p_sud  and p_nord
       and coalesce(a.lng, pl.lng) between p_ouest and p_est
       and (p_categorie is null or p_categorie = a.kind)
       and 'site' = any(p_types)
  ),
  tout as (select * from etabs union all select * from sites),
  legende as (
    select coalesce(jsonb_object_agg(famille, n), '{}'::jsonb) as j
      from (select famille, count(*) as n from tout group by famille) x
  ),
  garde as (
    select * from tout
     where p_familles is null or famille = any(p_familles)
  )
  select genre, id, slug, name, categories, cover_url, lat, lng, precision_geo,
         place_name, price_min_ar, price_min_unit, rating_avg, rating_count,
         count(*) over () as total_zone,
         famille,
         (select j from legende)
    from garde
   order by rang desc
   limit least(greatest(coalesce(p_limite, 800), 1), 1500);
$$;

grant execute on function public.carte_grappes(
  double precision, double precision, double precision, double precision,
  double precision, text, text[]) to anon, authenticated;
grant execute on function public.carte_zone(
  double precision, double precision, double precision, double precision,
  text, text[], integer, text[]) to anon, authenticated;
-- ⚠ La table des familles n'est pas appelée directement par le site : les deux
--   fonctions ci-dessus s'en servent, et elles sont SECURITY DEFINER.
revoke all on function public.dk_famille_carte(text, text[], text) from public, anon;

-- ── Contrôle 1 : les sept familles existent, et aucune n'est vide ──────────
-- 🔴 UNE FAMILLE VIDE EST UNE CASE DE FILTRE QUI N'OUVRE SUR RIEN. Le fichier
--    de règles l'interdit pour la navigation ; c'est la même faute ici.
do $$
declare v_j jsonb; f text; v_manque text := '';
begin
  select familles_zone into v_j
    from public.carte_grappes(-26.0, 42.0, -11.0, 51.0, 0.5) limit 1;
  foreach f in array array['dormir','manger','plage','nature','sommet','culture','service'] loop
    if coalesce((v_j->>f)::int, 0) = 0 then v_manque := v_manque || f || ' '; end if;
  end loop;
  if v_manque <> '' then
    raise exception '0118 : familles vides sur tout Madagascar : % — une case de filtre qui n''ouvre sur rien', v_manque;
  end if;
  raise notice '0118 : composition du pays = %', v_j;
end $$;

-- ── Contrôle 2 : la somme des familles = le total des points ───────────────
-- ⚠ Si un genre tombait hors famille, il resterait sur la carte sans qu'aucun
--   filtre ni compteur ne le voie. C'est le défaut qu'on ne verrait jamais.
do $$
declare v_j jsonb; v_somme int; v_total int;
begin
  select familles_zone, total_zone into v_j, v_total
    from public.carte_grappes(-26.0, 42.0, -11.0, 51.0, 0.5) limit 1;
  select sum(value::int) into v_somme from jsonb_each_text(v_j);
  if v_somme <> v_total then
    raise exception '0118 : % points classés en famille pour % sur la carte — % perdus en silence',
      v_somme, v_total, v_total - v_somme;
  end if;
end $$;

-- ── Contrôle 3 : le filtre serveur filtre VRAIMENT ────────────────────────
do $$
declare v_tout int; v_manger int; v_attendu int;
begin
  select total_zone into v_tout
    from public.carte_grappes(-26.0, 42.0, -11.0, 51.0, 0.5) limit 1;
  select total_zone into v_manger
    from public.carte_grappes(-26.0, 42.0, -11.0, 51.0, 0.5, null, array['manger']) limit 1;
  select (familles_zone->>'manger')::int into v_attendu
    from public.carte_grappes(-26.0, 42.0, -11.0, 51.0, 0.5) limit 1;
  if v_manger <> v_attendu then
    raise exception '0118 : filtre « manger » rend % points, la légende en annonce %', v_manger, v_attendu;
  end if;
  if v_manger >= v_tout then
    raise exception '0118 : le filtre ne filtre rien (% sur %)', v_manger, v_tout;
  end if;
  -- Et la légende ne bouge PAS quand un filtre est actif : c'est ce qui permet
  -- de décocher. Une légende qui suit le filtre s'effondre à zéro partout.
  select (familles_zone->>'plage')::int into v_attendu
    from public.carte_grappes(-26.0, 42.0, -11.0, 51.0, 0.5, null, array['manger']) limit 1;
  if coalesce(v_attendu, 0) = 0 then
    raise exception '0118 : la légende s''effondre quand un filtre est actif — on ne peut plus le retirer';
  end if;
end $$;

-- ── Contrôle 4 : chronométré SOUS LE RÔLE anon, timeout de production ─────
-- 🔴 RÈGLE DU 01/09 (0115/0116) : un contrôle passé par le connecteur tourne
--    avec un rôle privilégié et ne prouve RIEN sur le délai. anon porte
--    statement_timeout = 3 s. On rejoue le pire cas — tout Madagascar, la vue
--    d'ouverture — sous ce rôle et ce plafond. Dernier bloc de la migration :
--    `set local` vaut jusqu'à la fin de la transaction.
do $$
declare t0 timestamptz; v_ms numeric; v_n int;
begin
  execute 'set local role anon';
  execute 'set local statement_timeout = ''3s''';
  t0 := clock_timestamp();
  select count(*) into v_n from public.carte_grappes(-26.0, 42.0, -11.0, 51.0, 0.225);
  perform count(*) from public.carte_zone(-19.0, 47.4, -18.8, 47.6, null,
                                          array['page','site'], 800);
  v_ms := 1000 * extract(epoch from clock_timestamp() - t0);
  execute 'reset role';
  if v_ms > 1500 then
    raise exception '0118 : % ms sous anon — trop près du plafond de 3 s pour tenir sur une base chargée', round(v_ms);
  end if;
  raise notice '0118 : % grappes + une zone détaillée sous anon en % ms', v_n, round(v_ms);
end $$;
