-- ============================================================================
-- 0085 — LA CO-GESTION DEVIENT ATTEIGNABLE
--
-- 0076 a donné au gestionnaire tous les droits d'exploitation : vingt-neuf
-- policies passent par `page_a_moi()`, et l'écran de co-gestion vient d'être
-- livré. Il manquait le CHEMIN. Un gestionnaire nommé en bonne et due forme
-- n'avait aucun geste pour ouvrir la page qu'il gère :
--
--  ① `get_page_by_slug` filtrait `p.is_published or p.owner_id = auth.uid()`.
--     Sur une fiche NON publiée — c'est-à-dire précisément celle qu'on donne à
--     gérer pour qu'elle soit remplie avant publication — la fonction rendait
--     `null`. ProConsole affichait « établissement introuvable » AVANT même sa
--     garde d'accès : le gestionnaire lisait que la page n'existe pas.
--
--  ② L'écran /pro listait `pages` en direct sur `owner_id` seul. C'est son
--     unique chargement, et le lien « Gérer » vers /pro/:slug qu'il porte est
--     l'un des deux seuls du dépôt. Une page gérée n'apparaissait donc nulle
--     part : même corrigé, ① restait hors d'atteinte faute d'un lien pour y
--     aller.
--
-- ⚠ ON RÉUTILISE `page_a_moi(uuid)`, ON NE RÉÉCRIT PAS LA RÈGLE. Elle répond
--   déjà « ai-je le droit sur cette page ? » pour les vingt-neuf policies des
--   chambres, de la carte, des activités, des circuits et des demandes. Poser
--   ici une deuxième formulation du même droit garantit qu'un jour les deux
--   divergeront — et c'est toujours la copie oubliée qui devient le trou.
--
-- ⚠ CE QUE ÇA N'OUVRE PAS. `page_a_moi` est vraie pour le propriétaire et pour
--   les personnes nommées dans `page_gestionnaires`, personne d'autre ; elle
--   compare à `auth.uid()`, nul sans session, donc fausse pour tout visiteur
--   anonyme. Le gestionnaire voit désormais la fiche non publiée qu'il édite
--   déjà — `pages_gerer` lui en accorde l'UPDATE depuis 0076, et les policies
--   de lecture des tables filles lui rendent chambres, carte et circuits de
--   cette même page. Aucune donnée nouvelle : on lui rend visible ce qu'il a
--   le droit de modifier. La liste des gestionnaires, elle, reste fermée
--   (`pg_lecture` : un gestionnaire ne voit que sa propre ligne), et nommer ou
--   révoquer reste au seul propriétaire (`pg_proprietaire`).
--
-- ⚠ LA PROPRIÉTÉ NE DEVIENT PAS PARTAGEABLE POUR AUTANT. `owner_id` est gelé
--   par le déclencheur `pages_avant_ecriture`, et l'écran doit le dire : d'où
--   `mon_role` ci-dessous, rendu au client pour qu'il ne promette pas à un
--   gestionnaire des gestes que la base refusera.
-- ============================================================================

-- ── ① La fiche : le gestionnaire n'est plus éconduit ────────────────────────
--
-- ⚠ MÊME SIGNATURE, MÊME TYPE DE RETOUR (jsonb) : `create or replace` suffit,
--   les droits déjà posés sur la fonction sont conservés. Seules les deux
--   dernières lignes du corps changent — tout le reste est repris à
--   l'identique de ce qui tourne en production (`pg_get_functiondef`), parce
--   qu'une fonction de 90 lignes réécrite « de mémoire » perd toujours un
--   `coalesce` ou un `order by` au passage.
--
-- 🔴 ON NE RÉVOQUE RIEN ICI, ET C'EST DÉLIBÉRÉ. `get_page_by_slug` est LA
--    lecture de la fiche publique : elle doit rester exécutable par `anon`.
--    La règle des trois révocations de 0071 ferme les fonctions réservées aux
--    membres ; l'appliquer ici couperait chaque fiche d'hôtel à tout visiteur
--    non connecté. Le contrôle de fin de migration vérifie donc l'INVERSE :
--    que le droit anonyme n'a pas disparu.
create or replace function public.get_page_by_slug(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when p.id is null then null else jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'name', p.name, 'owner_id', p.owner_id,
    'categories', p.categories, 'subcategory', p.subcategory,
    'short_desc', p.short_desc, 'long_desc', p.long_desc,
    'address', p.address, 'landmark', p.landmark, 'lat', p.lat, 'lng', p.lng,
    'phone', p.phone, 'whatsapp', p.whatsapp, 'email', p.email,
    'website', p.website, 'facebook', p.facebook,
    'logo_url', p.logo_url, 'cover_url', p.cover_url, 'cover_offset_y', p.cover_offset_y,
    'gallery', p.gallery, 'languages', p.languages, 'payment_methods', p.payment_methods,
    'price_level', p.price_level, 'verification_status', p.verification_status,
    'is_published', p.is_published,
    'rating_avg', p.rating_avg, 'rating_count', p.rating_count,
    'price_min_ar', p.price_min_ar, 'price_min_unit', p.price_min_unit,
    'rates_checked_at', p.rates_checked_at, 'completeness', p.completeness,
    'place', case when pl.id is null then null else
      jsonb_build_object('id', pl.id, 'slug', pl.slug, 'name', pl.name_fr, 'region', pl.region) end,
    'amenities', coalesce((
      select jsonb_agg(jsonb_build_object('code', a.code, 'label', a.label_fr, 'category', a.category)
             order by a.rang)
        from public.page_amenities pa join public.amenities a on a.code = pa.code
       where pa.page_id = p.id), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('jour', h.jour, 'ouvre', h.ouvre, 'ferme', h.ferme,
                                          'ferme_journee', h.ferme_toute_la_journee) order by h.jour)
        from public.page_hours h where h.page_id = p.id), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.name, 'description', r.description, 'photos', r.photos,
               'units_count', r.units_count, 'max_adults', r.max_adults, 'max_children', r.max_children,
               'surface_m2', r.surface_m2, 'private_bath', r.private_bath, 'hot_water', r.hot_water,
               'view', r.view, 'base_price_ar', r.base_price_ar, 'price_unit', r.price_unit,
               'extra_person_ar', r.extra_person_ar, 'status', r.status,
               'rates', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', s.id, 'season_label', s.season_label, 'from_date', s.from_date,
                          'to_date', s.to_date, 'price_ar', s.price_ar, 'price_unit', s.price_unit,
                          'board', s.board, 'min_nights', s.min_nights,
                          'resident_price_ar', s.resident_price_ar) order by s.from_date nulls first)
                   from public.season_rates s where s.room_type_id = r.id), '[]'::jsonb))
             order by r.sort_order, r.base_price_ar)
        from public.room_types r where r.page_id = p.id and r.status <> 'ferme'), '[]'::jsonb),
    'menu_sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name, 'service', ms.service)
             order by ms.sort_order)
        from public.menu_sections ms where ms.page_id = p.id), '[]'::jsonb),
    'menu_items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', mi.id, 'section_id', mi.section_id, 'name', mi.name, 'dish_id', mi.dish_id,
               'dish_slug', d.slug, 'description', mi.description, 'price_ar', mi.price_ar,
               'price_unit', mi.price_unit, 'photo_url', mi.photo_url,
               'availability', mi.availability, 'tags', mi.tags, 'side_dish', mi.side_dish,
               'is_signature', mi.is_signature, 'in_stock', mi.in_stock)
             order by mi.sort_order, mi.name)
        from public.menu_items mi left join public.dishes d on d.id = mi.dish_id
       where mi.page_id = p.id), '[]'::jsonb),
    'menu_photos', coalesce((
      select jsonb_agg(jsonb_build_object('url', mp.url, 'legende', mp.legende) order by mp.sort_order)
        from public.menu_photos mp where mp.page_id = p.id), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ac.id, 'name', ac.name, 'description', ac.description, 'photos', ac.photos,
               'duration_h', ac.duration_h, 'price_ar', ac.price_ar, 'price_unit', ac.price_unit,
               'min_people', ac.min_people, 'max_people', ac.max_people, 'includes', ac.includes)
             order by ac.sort_order)
        from public.activities ac where ac.page_id = p.id), '[]'::jsonb),
    'tours', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'slug', t.slug, 'title', t.title, 'summary', t.summary,
               'description', t.description, 'duration_days', t.duration_days,
               'duration_nights', t.duration_nights, 'difficulty', t.difficulty,
               'format', t.format, 'group_min', t.group_min, 'group_max', t.group_max,
               'axe', t.axe, 'transports', t.transports, 'guide_langs', t.guide_langs,
               'parks_included', t.parks_included, 'months_open', t.months_open, 'photos', t.photos,
               'days', coalesce((
                 select jsonb_agg(jsonb_build_object('jour', td.jour, 'titre', td.titre,
                          'detail', td.detail, 'nuitee', td.nuitee) order by td.jour)
                   from public.tour_days td where td.tour_id = t.id), '[]'::jsonb),
               'prices', coalesce((
                 select jsonb_agg(jsonb_build_object('base_pax', tp.base_pax, 'price_ar', tp.price_ar,
                          'price_unit', tp.price_unit) order by tp.base_pax)
                   from public.tour_prices tp where tp.tour_id = t.id), '[]'::jsonb),
               'inclusions', coalesce((
                 select jsonb_agg(jsonb_build_object('libelle', ti.libelle, 'inclus', ti.inclus)
                          order by ti.inclus desc, ti.sort_order)
                   from public.tour_inclusions ti where ti.tour_id = t.id), '[]'::jsonb))
             order by t.duration_days)
        from public.tours t where t.page_id = p.id), '[]'::jsonb)
  ) end
  from public.pages p
  left join public.places pl on pl.id = p.place_id
  where p.slug = p_slug
  -- ⚠ `page_a_moi` REMPLACE le test `owner_id`, elle ne s'y ajoute pas : elle
  --   le contient déjà (propriétaire OU gestionnaire nommé). Le garder en plus
  --   aurait recréé la deuxième règle qu'on cherche justement à supprimer.
  -- ⚠ LE COÛT RESTE NUL POUR LE PUBLIC. `p.slug = p_slug` passe par l'index
  --   unique `pages_slug_key` : au plus une ligne atteint ce filtre, et sur une
  --   fiche publiée le `or` est satisfait à gauche sans appeler la fonction.
    and (p.is_published or public.page_a_moi(p.id))
$function$;

comment on function public.get_page_by_slug(text) is
  'Fiche complète en un aller-retour. Visible si publiée, ou si page_a_moi() : propriétaire ET gestionnaires nommés.';

-- ── ② « Mes établissements » : possédés ET gérés, avec le rôle ──────────────
--
-- 🔴 POURQUOI CE N'EST PAS RÉPARABLE CÔTÉ ÉCRAN. La policy `pages_lecture` dit
--    `is_published or owner_id = auth.uid() or is_staff()` — le gestionnaire
--    n'y est pas. Une requête `pages` depuis le navigateur, si habilement
--    filtrée soit-elle, ne rendra JAMAIS la fiche non publiée qu'il gère : la
--    RLS la retire sans erreur, et la liste serait fausse en silence. Cette
--    fonction est `security definer` et énumère elle-même les deux titres
--    d'accès ; c'est la seule façon d'obtenir une liste complète sans élargir
--    la lecture de `pages` à tout le monde.
--
-- ⚠ ON N'ÉLARGIT PAS `pages_lecture` POUR AUTANT. Y ajouter `page_a_moi` ferait
--   appeler cette fonction sur CHAQUE ligne de chaque recherche publique, pour
--   ne servir qu'un écran privé. Le coût serait payé par les voyageurs.
--
-- ⚠ LE TYPE DE RETOUR CHANGE (six colonnes en plus) : `create or replace` lève
--   42P13 sur une table de retour différente. D'où DROP + recréation — et donc
--   les droits À REFAIRE, ils partent avec la fonction.
--
-- ⚠ ET LA SIGNATURE CHANGE AUSSI (`p_limite`). Une fonction supplémentaire au
--   lieu d'un remplacement, c'est une SURCHARGE, et PostgREST rend alors 300
--   « fonction ambiguë » — c'est exactement ce qui a cassé `revendiquer_page`
--   en 0078. On supprime donc l'ancienne signature nommément, et on vérifie
--   plus bas qu'il n'en reste qu'une.
drop function if exists public.mes_etablissements();
drop function if exists public.mes_etablissements(integer);

create function public.mes_etablissements(p_limite integer default 200)
returns table (
  id             uuid,
  slug           text,
  name           text,
  categories     text[],
  cover_url      text,
  is_published   boolean,
  completeness   smallint,
  rating_avg     numeric,
  rating_count   integer,
  views_count    integer,
  price_min_ar   bigint,
  price_min_unit text,
  -- ⚠ « proprietaire » ou « gestionnaire ». L'écran DOIT pouvoir les
  --   distinguer : un gestionnaire ne peut ni céder la page, ni nommer qui que
  --   ce soit. Lui laisser croire le contraire, c'est lui faire découvrir la
  --   limite par un refus de la base, ce qui se lit comme une panne.
  mon_role       text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select g.id, g.slug, g.name, g.categories, g.cover_url,
         g.is_published, g.completeness,
         g.rating_avg, g.rating_count, g.views_count,
         g.price_min_ar, g.price_min_unit,
         case when g.owner_id = (select auth.uid()) then 'proprietaire'
              else 'gestionnaire' end
    from public.pages g
   where g.owner_id = (select auth.uid())
      or exists (select 1 from public.page_gestionnaires m
                  where m.page_id = g.id and m.user_id = (select auth.uid()))
   -- ⚠ ORDRE TOTAL ET STABLE : le nom seul ne suffit pas, deux enseignes
   --   peuvent le partager, et deux lignes ex æquo se réordonnent librement
   --   d'un appel à l'autre. `id` tranche.
   order by g.name, g.id
   -- ⚠ PLAFOND CHOISI, PAS SUBI. PostgREST coupe à 1 000 lignes SANS RIEN DIRE
   --   quoi qu'on demande : mieux vaut une borne qu'on écrit et qu'on connaît.
   --   Aucun compte ne s'en approche — un gérant tient une poignée de fiches —
   --   mais le jour où l'un s'en approchera, la limite sera lisible ici plutôt
   --   que cachée dans une configuration de passerelle.
   limit least(greatest(coalesce(p_limite, 200), 1), 500)
$function$;

comment on function public.mes_etablissements(integer) is
  'Les pages du membre connecté : possédées ET gérées. mon_role distingue les deux — un gestionnaire ne peut pas céder la page.';

-- ⚠ Sans session, `auth.uid()` est nul : les deux branches du `where` sont
--   fausses et la fonction rend zéro ligne. La révocation reste indispensable
--   — compter sur ce hasard, c'est n'avoir qu'une barrière là où 0071 en exige
--   deux.
revoke all on function public.mes_etablissements(integer) from public, anon;
grant execute on function public.mes_etablissements(integer) to authenticated;

-- ── Contrôle 1 : une seule signature, sinon PostgREST rend 300 ──────────────
do $$
declare v_n integer;
begin
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mes_etablissements';
  if v_n <> 1 then
    raise exception
      'il reste % versions de mes_etablissements — PostgREST rendrait 300 '
      '(PGRST203, fonction ambiguë)', v_n;
  end if;
end $$;

-- ── Contrôle 2 : la fonction privée est bien fermée ─────────────────────────
-- ⚠ On vérifie, on ne suppose pas : Supabase pose un `grant execute to anon`
--   par défaut sur toute fonction créée dans `public`, accordé À `anon`
--   DIRECTEMENT — révoquer `public` ne le retire pas (0071).
do $$
begin
  if has_function_privilege('anon', 'public.mes_etablissements(integer)', 'execute')
     or has_function_privilege('public', 'public.mes_etablissements(integer)', 'execute') then
    raise exception 'anon (ou public) garde execute sur mes_etablissements(integer)';
  end if;
  if not has_function_privilege('authenticated', 'public.mes_etablissements(integer)', 'execute') then
    raise exception 'authenticated a perdu execute sur mes_etablissements(integer) — /pro serait vide';
  end if;
end $$;

-- ── Contrôle 3 : la lecture publique n'est pas tombée ───────────────────────
-- ⚠ `get_page_by_slug` vient d'être remplacée et appelle désormais
--   `page_a_moi`. Les deux doivent rester exécutables par `anon`, sinon chaque
--   fiche d'établissement rend 42501 à un visiteur sans compte — le contraire
--   exact de ce que cette migration cherche à faire.
do $$
declare v_perdu text;
begin
  select string_agg(f, ', ' order by f) into v_perdu from (
    select f from unnest(array[
      'public.get_page_by_slug(text)',
      'public.page_a_moi(uuid)'
    ]) as f
     where not has_function_privilege('anon', f, 'execute')
  ) s;
  if v_perdu is not null then
    raise exception
      'anon a PERDU execute sur : % — la fiche publique rendrait 42501', v_perdu;
  end if;
end $$;
