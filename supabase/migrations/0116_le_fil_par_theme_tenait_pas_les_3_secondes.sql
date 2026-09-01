-- ============================================================================
-- 0116 — LE FIL PAR THÈME NE TENAIT PAS LES 3 SECONDES DU VISITEUR
--
-- 🔴 CE QUI S'EST PASSÉ, ET POURQUOI 0115 A PARU VERTE. Les quatre contrôles de
--    0115 sont passés, `feed_filtre('th_hotels')` rendait les bonnes 45
--    publications, et les compteurs étaient justes. Tout était vérifié — par le
--    connecteur, qui se connecte avec un rôle privilégié.
--
--    Le site, lui, appelle avec la clé **anon**. Et `anon` porte
--    `statement_timeout = 3s` (`authenticated` : 8s). Mesuré sur le vrai chemin
--    REST, les deux RPC rendaient :
--        {"code":"57014","message":"canceling statement due to statement timeout"}
--    soit un HTTP 500 pour chaque visiteur non connecté. La fonctionnalité était
--    morte en production tout en étant « vérifiée ».
--
--    ⚠ LA LEÇON : un contrôle exécuté par le connecteur ne prouve RIEN sur le
--      délai. Le rôle qui teste doit être celui qui consomme. Le contrôle final
--      de cette migration se met donc explicitement en `anon`, avec 3 secondes.
--
-- 🔴 LA CAUSE. `post_du_theme` partait des ÉTABLISSEMENTS :
--
--        from public.posts p
--        join public.pages pg
--          on pg.is_published and pg.categories && cats
--         and (mention explicite ... or pg.norm = dk_norm(p.page_name))
--
--    `pg.categories && array['hotel']` sélectionne 1 428 fiches, et c'est
--    SEULEMENT ensuite que le `or` élimine celles qui ne concernent pas la
--    publication. Répété pour chacune des 417 publications du fil : 101 206
--    blocs lus, 4 842 ms pour UNE page de fil.
--
-- ⚠ LA CORRECTION EST UN RENVERSEMENT DE SENS, pas un index de plus. On part
--   des LIENS DE LA PUBLICATION — au plus quelques lignes — et on vérifie
--   ensuite la catégorie de la fiche atteinte. Les deux chemins deviennent deux
--   recherches par index :
--     · `post_mentions_pkey (post_id, page_id)` pour la mention explicite ;
--     · `pages_norm_eq_idx (norm)` — posé par 0115 — pour le nom libre.
--   Mesuré : 22 ms au lieu de 4 842, pour un résultat identique.
--
-- ⚠ LE RÉSULTAT NE DOIT PAS BOUGER D'UNE LIGNE. Une réécriture pour la vitesse
--   qui change une réponse est un bug déguisé en optimisation : les comptes
--   attendus sont donc écrits en dur dans le contrôle ci-dessous, relevés avant
--   la réécriture.
-- ============================================================================

create or replace function public.post_du_theme(p_post uuid, p_theme text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select case
    when p_theme = 'th_lieux' then exists (
      select 1 from public.posts p where p.id = p_post and p.place_id is not null)

    when p_theme = 'th_plats' then exists (
      select 1 from public.posts p
       where p.id = p_post and (p.dish_id is not null or p.kind = 'assiette'))

    when public.fil_cats_du_theme(p_theme) is not null then (
      -- ① LA MENTION EXPLICITE. On entre par `post_mentions_pkey (post_id,
      --    page_id)` : au plus quelques lignes, jamais les 1 428 fiches.
      exists (
        select 1
          from public.post_mentions m
          join public.pages pg on pg.id = m.page_id
         where m.post_id = p_post
           and pg.is_published
           and pg.categories && public.fil_cats_du_theme(p_theme))
      or
      -- ② LE NOM LIBRE saisi par l'auteur, résolu par ÉGALITÉ sur `pages.norm`
      --    (index `pages_norm_eq_idx`). 309 publications portent un nom ; 46
      --    seulement tombent sur une fiche — d'où le second chemin, sans lequel
      --    on perdrait une partie des récits d'hôtel.
      exists (
        select 1
          from public.posts p
          join public.pages pg on pg.norm = public.dk_norm(p.page_name)
         where p.id = p_post
           and coalesce(trim(p.page_name), '') <> ''
           and pg.is_published
           and pg.categories && public.fil_cats_du_theme(p_theme))
    )

    -- ⚠ LE GARDE-FOU. Thème inconnu = rien, jamais tout.
    else false
  end;
$fn$;

comment on function public.post_du_theme(uuid, text) is
  'Une publication appartient-elle a un theme du fil ? Liens reels uniquement, jamais le texte. Part des liens de la publication (0116), pas des 1428 fiches. Theme inconnu = false.';

-- ============================================================================
-- CONTRÔLE ① — LE RÉSULTAT EST INCHANGÉ.
-- ============================================================================
do $ctrl$
declare
  v_attendu constant jsonb := jsonb_build_object(
    'th_hotels', 45, 'th_restaurants', 1, 'th_plats', 3,
    'th_lieux', 416, 'th_location', 0, 'th_voyages', 0);
  v_cle text;
  v_n   integer;
begin
  foreach v_cle in array array['th_hotels','th_restaurants','th_plats',
                               'th_lieux','th_location','th_voyages'] loop
    select count(*) into v_n
      from public.posts p
     where p.status = 'published' and p.visibilite = 'public'
       and public.post_du_theme(p.id, v_cle);
    if v_n <> (v_attendu ->> v_cle)::integer then
      raise exception '0116 : theme % rend % publications, % avant la reecriture — le resultat a change',
        v_cle, v_n, (v_attendu ->> v_cle);
    end if;
  end loop;

  if jsonb_array_length(public.feed_filtre('th_faute_de_frappe', null, 30, null, null, null)) <> 0 then
    raise exception '0116 : le garde-fou du theme inconnu ne tient plus';
  end if;
end $ctrl$;

-- ============================================================================
-- CONTRÔLE ② — ÇA TIENT DANS LE BUDGET DU VISITEUR.
--
-- ⚠ C'EST LE CONTRÔLE QUI MANQUAIT À 0115. On prend le rôle `anon` et son
--   `statement_timeout` de 3 s : si l'une des deux RPC les dépasse, le bloc
--   entier est annulé (57014) et la migration ne passe pas. Le seul contrôle de
--   vitesse qui vaille est celui qui s'exécute dans les conditions du visiteur.
--
-- ⚠ `set local` : la portée s'arrête à la transaction, rien ne fuit ensuite.
-- ============================================================================
do $ctrl$
declare
  v_debut timestamptz := clock_timestamp();
  v_ms    numeric;
begin
  set local role anon;
  set local statement_timeout = '3s';

  perform public.feed_filtre('th_hotels', null, 12, null, null, null);
  perform public.feed_filtre('th_lieux', null, 12, null, null, null);
  perform public.fil_themes_comptes();

  reset role;
  v_ms := round(extract(epoch from (clock_timestamp() - v_debut)) * 1000);
  raise notice '0116 : les trois appels du visiteur en % ms (budget anon : 3000)', v_ms;

  -- ⚠ On refuse aussi ce qui PASSE de justesse : 1,5 s pour ouvrir un onglet,
  --   c'est deja injouable sur la 3G malgache que ce produit vise.
  if v_ms > 1500 then
    raise exception '0116 : % ms pour trois appels — trop lent pour la cible (3G, Android d''entree de gamme)', v_ms;
  end if;
end $ctrl$;
