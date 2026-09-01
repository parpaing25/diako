-- ============================================================================
-- 0117 — « DESTINATION » REPREND SON SENS : les lieux qu'on va VOIR
--
-- Demande du propriétaire, en substance : « Destination devrait sonner comme
-- lieu, pas hôtels ou chambres. Qui entre dans Destinations doit voir des lieux
-- de visite, des photos de plage, des endroits magnifiques. On enlève les
-- villes de Destinations — les villes vont ailleurs. Destinations, ce sont les
-- lieux emblématiques à visiter à Madagascar. »
--
-- 🔴 CE QUE LE COMPTEUR CACHAIT. `stats_diako` annonçait 508 « destinations » :
--    recompté ce 01/09/2026, ce sont 208 villages, 87 hameaux, 72 villes,
--    63 quartiers, 13 régions… et seulement 61 lieux qu'un voyageur appellerait
--    une destination. L'écran /explorer déversait ce mélange par paliers
--    administratifs : Nosy Iranja, l'Isalo et l'Allée des Baobabs étaient
--    enterrés sous la géographie communale.
--
-- ⚠ LA DONNÉE EXISTAIT DÉJÀ, ET ELLE EST BONNE. Les 61 fiches des genres
--   `ile`, `plage`, `parc`, `site`, `zone_touristique` portent TOUTES un
--   résumé, et 39 une photo créditée. Rien à reclasser, rien à inventer :
--   il suffit d'une fonction qui les serve seules, et d'un écran qui les
--   montre en photo d'abord.
--
-- ⚠ PAS DE PAGINATION : 61 lignes, résumés compris, tiennent dans une seule
--   réponse (~15 Ko). Le « voir plus » de l'écran se sert dans le tableau
--   déjà reçu. Le jour où le référentiel émblématique dépasse quelques
--   centaines de fiches, cette décision est à revoir — pas avant.
--
-- ⚠ LE TRI EST TOTAL (photo, puis résumé, puis nom, départagé au slug) :
--   même contrat que 0089 — un tri partiel rend un ordre qui change d'un
--   appel à l'autre et l'écran paraît instable sans erreur.
-- ============================================================================

create or replace function public.destinations_emblematiques()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.places p
               where p.merged_into is null
                 and p.kind in ('ile','plage','parc','site','zone_touristique')),
    'elements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', s.slug, 'nom', s.name_fr, 'kind', s.kind,
               'region', s.region, 'summary', s.summary,
               'cover_url', s.cover_url, 'cover_credit', s.cover_credit,
               'saisons', s.saisons, 'ville', s.ville,
               'nb_etablissements', s.nb_etablissements,
               'nb_recits', s.nb_recits)
             order by s.kind,
                      s.cover_url is null,
                      (s.summary is null or btrim(s.summary) = ''),
                      s.name_fr, s.slug)
        from (
          select p.slug, p.name_fr, p.kind, p.region, p.summary,
                 p.cover_url, p.cover_credit,
                 exists(select 1 from public.place_seasons ps
                         where ps.place_id = p.id) as saisons,
                 -- La ville d'appui (« près de Morondava ») : celle du
                 -- rattachement déjà en base, jamais déduite de la distance.
                 (select v.name_fr from public.places v
                   where v.id = p.ville_proche_id) as ville,
                 (select count(*) from public.pages g
                   where g.is_published and g.place_id = p.id) as nb_etablissements,
                 (select count(*) from public.posts o
                   where o.status = 'published' and o.place_id = p.id) as nb_recits
            from public.places p
           where p.merged_into is null
             and p.kind in ('ile','plage','parc','site','zone_touristique')
        ) s
    ), '[]'::jsonb)
  )
$$;

-- L'écran des destinations est public : lisible sans compte, comme /explorer.
grant execute on function public.destinations_emblematiques() to anon, authenticated;

-- ── `stats_diako` : le compteur « destinations » dit désormais la même chose
--    que l'écran ────────────────────────────────────────────────────────────
-- 🔴 AVANT : `is_touristique`, soit 508 fiches dont 430 localités. Le rail
--    affichait « 508 destinations » au-dessus d'un écran qui en montre 61 :
--    l'un des deux mentait forcément. `localites` continue de compter tout le
--    référentiel — c'est son rôle, et il ne change pas.
create or replace function public.stats_diako()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'recits',        (select count(*) from public.posts  where status = 'published'),
    'etablissements',(select count(*) from public.pages  where is_published),
    'destinations',  (select count(*) from public.places
                       where merged_into is null
                         and kind in ('ile','plage','parc','site','zone_touristique')),
    'localites',     (select count(*) from public.places where merged_into is null),
    'sites',         (select count(*) from public.attractions where is_published),
    'plats',         (select count(*) from public.dishes),
    'membres',       (select count(*) from public.profiles),
    'vues_7j',       (select count(*) from public.page_views
                       where created_at > now() - interval '7 days')
  )
$$;

-- ── Contrôle 1 : chaque famille propose vraiment quelque chose ──────────────
-- ⚠ Un `kind` mal orthographié rendrait une section vide EN SILENCE — le même
--   piège que 0089 verrouille pour les envies.
do $$
declare k text; v jsonb; v_n integer; v_vides text := '';
begin
  v := public.destinations_emblematiques();
  foreach k in array array['ile','plage','parc','site','zone_touristique'] loop
    select count(*) into v_n
      from jsonb_array_elements(v->'elements') e
     where e->>'kind' = k;
    if coalesce(v_n, 0) = 0 then v_vides := v_vides || k || ' '; end if;
  end loop;
  if v_vides <> '' then
    raise exception '0117 : ces familles ne rendent RIEN : %', v_vides;
  end if;
  if (v->>'total')::int <> jsonb_array_length(v->'elements') then
    raise exception '0117 : total (%) ≠ éléments rendus (%)',
      v->>'total', jsonb_array_length(v->'elements');
  end if;
end $$;

-- ── Contrôle 2 : le compteur du rail et l'écran disent le même chiffre ──────
do $$
declare v_stats integer; v_ecran integer;
begin
  v_stats := (public.stats_diako()->>'destinations')::int;
  v_ecran := (public.destinations_emblematiques()->>'total')::int;
  if v_stats <> v_ecran then
    raise exception '0117 : stats_diako dit % destinations, l''écran en sert % — l''un des deux ment',
      v_stats, v_ecran;
  end if;
end $$;

-- ── Contrôle 3 : chronométré SOUS LE RÔLE anon, timeout de production ───────
-- 🔴 RÈGLE DU 01/09 (migration 0115/0116) : un contrôle exécuté par le
--    connecteur tourne avec un rôle privilégié et ne prouve RIEN sur le délai.
--    anon porte statement_timeout=3s en production : on rejoue l'appel sous ce
--    rôle et ce plafond. Ce bloc est le DERNIER de la migration — `set local`
--    vaut jusqu'à la fin de la transaction.
do $$
declare t0 timestamptz; v_ms numeric;
begin
  execute 'set local role anon';
  execute 'set local statement_timeout = ''3s''';
  t0 := clock_timestamp();
  perform public.destinations_emblematiques();
  perform public.stats_diako();
  v_ms := 1000 * extract(epoch from clock_timestamp() - t0);
  execute 'reset role';
  if v_ms > 1000 then
    raise exception '0117 : % ms sous anon — trop près du plafond de 3 s pour tenir sur une base chargée', round(v_ms);
  end if;
  raise notice '0117 : destinations_emblematiques + stats_diako sous anon en % ms', round(v_ms);
end $$;
