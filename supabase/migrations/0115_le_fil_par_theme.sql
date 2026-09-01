-- ============================================================================
-- 0115 — LE FIL SE FILTRE PAR THÈME
--
-- 🔴 CE QUE ÇA CORRIGE. Le fil mélangeait tout : un récit de Nosy Be, une photo
--    de Tuléar, un bon plan de taxi-brousse, dans le même flux. Les six entrées
--    thématiques que le site sait servir — hôtels, restaurants, plats, lieux,
--    location de véhicule, voyages organisés — n'existaient que sous forme de
--    pastilles sur l'accueil, qui EXPÉDIAIENT le visiteur sur un autre écran
--    (`/recherche?cat=…`, `/sites?type=…`, `/location`). On quittait le fil
--    pour filtrer le fil.
--
-- ⚠ CE QUE CES MODES NE FONT PAS : deviner. Le classement d'une publication
--   s'appuie UNIQUEMENT sur des liens réels — `place_id`, `dish_id`,
--   `post_mentions`, ou un `page_name` qui tombe EXACTEMENT sur le nom
--   normalisé d'une fiche. Jamais sur le corps du texte.
--
--   🔴 MESURÉ LE 01/09/2026, ET C'EST LA RAISON DE CETTE RÈGLE. Un classement
--      par recherche de texte contre les 254 orthographes de l'atlas culinaire
--      range 96 publications dans « Brèdes ». Le terme fautif est `anana`,
--      l'alias malgache des brèdes — qui est aussi une sous-chaîne de
--      « Ant-anana-rivo ». 96 récits sur Tananarive seraient donc devenus des
--      récits de brèdes, sans qu'aucune erreur ne le signale. Le fil aurait eu
--      l'air de marcher tout en ne classant rien.
--
-- ⚠ UNE SEULE DÉFINITION DU CLASSEMENT : `post_du_theme()`. Le fil ET le
--   compteur l'appellent. Écrire le prédicat deux fois, c'est garantir qu'un
--   jour l'onglet annoncera « 45 récits » et en montrera 12 — le défaut exact
--   déjà payé sur les compteurs de destinations (0092) et de sites (0108).
--
-- ⚠ UN THÈME INCONNU NE REND RIEN, IL NE REND PAS TOUT. `feed_filtre` se
--   terminait par `else true` : n'importe quelle valeur de `p_mode` non
--   reconnue servait le fil ENTIER. Un thème mal orthographié côté client
--   aurait donc affiché les 417 publications du site sous l'étiquette
--   « Location de voiture », ce qui se lit comme une donnée fausse et non
--   comme une panne. `post_du_theme()` rend `false` sur un thème qu'elle ne
--   connaît pas, et l'onglet est honnêtement vide.
-- ============================================================================

-- ── ① Les catégories d'établissement derrière chaque thème ─────────────────
-- ⚠ `null` = ce thème ne se classe pas par établissement (lieux, plats). Ce
--   n'est PAS « aucune catégorie » : la distinction porte l'aiguillage de
--   `post_du_theme`, où un `array[]::text[]` vide ferait tout basculer sur la
--   branche établissement et ne rendrait jamais rien.
create or replace function public.fil_cats_du_theme(p_theme text)
returns text[]
language sql
immutable
parallel safe
set search_path to 'public'
as $fn$
  select case p_theme
    when 'th_hotels'      then array['hotel']
    when 'th_restaurants' then array['restaurant']
    -- Les deux vont ensemble : un transporteur qui loue avec chauffeur répond
    -- exactement à la même question que le loueur de 4x4 (19 + 9 fiches).
    when 'th_location'    then array['location_vehicule', 'transporteur']
    when 'th_voyages'     then array['agence_voyage']
  end;
$fn$;

comment on function public.fil_cats_du_theme(text) is
  'Les categories de pages derriere un theme du fil. NULL = theme non base sur les etablissements.';

-- ── ② LE classement d'une publication — la seule définition ────────────────
create or replace function public.post_du_theme(p_post uuid, p_theme text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select case
    -- « Récit de voyage » : il est rattaché à une destination du référentiel.
    when p_theme = 'th_lieux' then exists (
      select 1 from public.posts p where p.id = p_post and p.place_id is not null)

    -- « Récit culinaire » : un plat de l'atlas, ou une publication de type
    -- « assiette ». ⚠ AUCUNE publication ne porte de `dish_id` aujourd'hui
    --   (mesuré le 01/09/2026 : 0 sur 417) et `posts.dish` est vide partout :
    --   ce thème se remplira à mesure que l'on publie, il ne peut pas se
    --   remplir seul. Ce n'est pas une panne, et l'écran doit le dire.
    when p_theme = 'th_plats' then exists (
      select 1 from public.posts p
       where p.id = p_post and (p.dish_id is not null or p.kind = 'assiette'))

    -- Les thèmes portés par une catégorie d'établissement.
    -- ⚠ DEUX CHEMINS DE RATTACHEMENT, ET IL EN FAUT DEUX. `post_mentions` est
    --   le lien propre (55 lignes) ; `page_name` est le nom libre saisi par
    --   l'auteur (309 publications), dont 46 seulement tombent sur une fiche.
    --   Se limiter au lien propre perdrait une partie des récits d'hôtel.
    when public.fil_cats_du_theme(p_theme) is not null then exists (
      select 1
        from public.posts p
        join public.pages pg
          on pg.is_published
         and pg.categories && public.fil_cats_du_theme(p_theme)
         and (
           exists (select 1 from public.post_mentions m
                    where m.post_id = p.id and m.page_id = pg.id)
           or (coalesce(trim(p.page_name), '') <> ''
               and pg.norm = public.dk_norm(p.page_name)))
       where p.id = p_post)

    -- ⚠ LE GARDE-FOU. Thème inconnu = rien, jamais tout.
    else false
  end;
$fn$;

comment on function public.post_du_theme(uuid, text) is
  'Une publication appartient-elle a un theme du fil ? Liens reels uniquement, jamais le texte. Theme inconnu = false.';

-- ⚠ `pages.norm` n'avait qu'un index GIN trigramme, qui sert `like` et la
--   similarité mais PAS l'égalité : le rattachement par `page_name` faisait un
--   parcours complet des 3 254 fiches pour chaque publication examinée.
create index if not exists pages_norm_eq_idx on public.pages(norm) where is_published;

-- ── ③ Le fil apprend les six thèmes ────────────────────────────────────────
-- ⚠ DÉFINITION RELUE DEPUIS LA BASE avant réécriture (pg_get_functiondef), et
--   non recopiée depuis 0074 : 0102 y avait ajouté `place_slug` par patch
--   textuel. Repartir du fichier aurait fait DISPARAÎTRE le slug du lieu, donc
--   rendu toutes les puces du fil non cliquables — sans aucune erreur.
-- ⚠ `case` CHERCHÉ et non `case p_mode when …` : la forme simple n'accepte pas
--   plusieurs valeurs par branche en PostgreSQL.
create or replace function public.feed_filtre(
  p_mode    text default 'tout',
  p_curseur timestamptz default null,
  p_limite  integer default 12,
  p_lat     double precision default null,
  p_lng     double precision default null,
  p_apres_km double precision default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce(jsonb_agg(x order by ordre), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'body', p.body, 'media', p.media,
      'place', p.place, 'place_slug', pl.slug, 'dish', p.dish, 'page_name', p.page_name,
      'created_at', p.created_at,
      'reactions_count', p.reactions_count,
      'comments_count', p.comments_count,
      'saves_count', p.saves_count,
      'author', jsonb_build_object(
        'id', pr.id, 'name', pr.display_name,
        'avatar', pr.avatar_url, 'verification', pr.verification,
        'account_type', pr.account_type),
      'ma_reaction', (select r.type from public.reactions r
                       where r.post_id = p.id and r.user_id = (select auth.uid())),
      'enregistre', exists (select 1 from public.saves s
                             where s.post_id = p.id and s.user_id = (select auth.uid())),
      'distance_km', case
        when p_mode = 'pres_de_moi' and pl.lat is not null
          then round(public.distance_km(p_lat, p_lng, pl.lat, pl.lng)::numeric, 1)
        end
    ) as x,
    case
      when p_mode = 'pres_de_moi'
        then public.distance_km(p_lat, p_lng, pl.lat, pl.lng)
      else extract(epoch from (now() - p.created_at))
    end as ordre
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    left join public.places pl on pl.id = p.place_id
   where p.status = 'published'
     and (p.visibilite = 'public' or p.author_id = (select auth.uid()))
     and not exists (
       select 1 from public.blocks b
        where b.blocker_id = (select auth.uid()) and b.blocked_id = p.author_id)
     and case
       when p_mode = 'abonnements' then exists (
         select 1 from public.follows f
          where f.follower_id = (select auth.uid()) and f.target_id = p.author_id)
       when p_mode = 'assiettes' then p.dish_id is not null
       when p_mode = 'pres_de_moi' then
         p_lat is not null and pl.lat is not null
         and public.distance_km(p_lat, p_lng, pl.lat, pl.lng) <= 150
       -- ⚠ Les six thèmes passent TOUS par la définition unique, garde-fou
       --   compris : `post_du_theme` rend false sur un thème inconnu.
       when p_mode like 'th\_%' then public.post_du_theme(p.id, p_mode)
       else true
     end
     and (case
       when p_mode = 'pres_de_moi'
         then p_apres_km is null
              or public.distance_km(p_lat, p_lng, pl.lat, pl.lng) > p_apres_km
       else p_curseur is null or p.created_at < p_curseur
     end)
   order by ordre asc
   limit least(greatest(p_limite, 1), 30)
  ) s;
$fn$;

-- ── ④ Les compteurs des six onglets ────────────────────────────────────────
-- ⚠ POURQUOI UNE RPC PLUTÔT QUE DOUZE `count` CÔTÉ CLIENT : douze allers-retours
--   sur une 3G malgache pour douze nombres, à chaque ouverture de l'accueil.
-- ⚠ `recits` APPELLE `post_du_theme`, la même fonction que le fil. C'est ce
--   qui interdit au compteur d'annoncer autre chose que ce que l'onglet montre.
create or replace function public.fil_themes_comptes()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with themes(cle) as (
    values ('th_hotels'), ('th_restaurants'), ('th_plats'),
           ('th_lieux'), ('th_location'), ('th_voyages')
  ),
  pub as (
    select p.id from public.posts p
     where p.status = 'published' and p.visibilite = 'public'
  )
  select jsonb_object_agg(
    t.cle,
    jsonb_build_object(
      'fiches', case t.cle
        when 'th_plats' then (select count(*) from public.dishes)
        when 'th_lieux' then (select count(*) from public.places where is_touristique)
        else (select count(*) from public.pages pg
               where pg.is_published
                 and pg.categories && public.fil_cats_du_theme(t.cle))
      end,
      'recits', (select count(*) from pub where public.post_du_theme(pub.id, t.cle))
    )
  )
  from themes t;
$fn$;

comment on function public.fil_themes_comptes() is
  'Combien de fiches et combien de recits derriere chaque onglet thematique du fil.';

grant execute on function public.fil_cats_du_theme(text)  to anon, authenticated;
grant execute on function public.post_du_theme(uuid, text) to anon, authenticated;
grant execute on function public.fil_themes_comptes()      to anon, authenticated;

-- ============================================================================
-- CONTRÔLE — on PROUVE, on ne suppose pas.
-- ⚠ Une migration de fonction qui « a l'air » posée est exactement le genre de
--   changement qui se découvre cassé en production. Les quatre contrôles
--   ci-dessous échouent bruyamment plutôt que de laisser passer.
-- ============================================================================
do $ctrl$
declare
  v_tout    integer;
  v_theme   integer;
  v_inconnu integer;
  v_c       jsonb;
  v_cle     text;
begin
  -- ① LE FIL EXISTANT N'A PAS BOUGÉ. C'est le risque n°1 d'une réécriture :
  --    servir moins de publications qu'avant sous le mode « tout ».
  v_tout := jsonb_array_length(public.feed_filtre('tout', null, 30, null, null, null));
  if v_tout <> least((select count(*) from public.posts
                       where status = 'published' and visibilite = 'public'), 30) then
    raise exception '0115 : feed_filtre(tout) rend % publications — la reecriture en a perdu', v_tout;
  end if;

  -- ② `place_slug` A SURVÉCU. C'est la clé que 0102 avait ajoutée par patch
  --    textuel, donc celle qu'une réécriture fait disparaître en silence.
  if exists (
    select 1 from jsonb_array_elements(public.feed_filtre('tout', null, 5, null, null, null)) e
     where not (e ? 'place_slug')
  ) then
    raise exception '0115 : place_slug a disparu du fil — les puces de lieu ne sont plus cliquables';
  end if;

  -- ③ LE GARDE-FOU TIENT. Un thème inconnu doit rendre ZÉRO, pas tout le fil.
  v_inconnu := jsonb_array_length(
    public.feed_filtre('th_nimportequoi', null, 30, null, null, null));
  if v_inconnu <> 0 then
    raise exception '0115 : un theme inconnu rend % publications — le garde-fou ne tient pas', v_inconnu;
  end if;

  -- ④ LE COMPTEUR DIT LA MÊME CHOSE QUE L'ONGLET. Le défaut qu'on refuse.
  v_c := public.fil_themes_comptes();
  foreach v_cle in array array['th_hotels','th_restaurants','th_plats',
                               'th_lieux','th_location','th_voyages'] loop
    if not (v_c ? v_cle) then
      raise exception '0115 : le compteur ne connait pas le theme %', v_cle;
    end if;
    -- On ne compare que sous le plafond de 30 : au-dela, le fil pagine.
    v_theme := jsonb_array_length(public.feed_filtre(v_cle, null, 30, null, null, null));
    if (v_c -> v_cle ->> 'recits')::integer <= 30
       and v_theme <> (v_c -> v_cle ->> 'recits')::integer then
      raise exception '0115 : theme % — le compteur annonce % recits, le fil en rend %',
        v_cle, (v_c -> v_cle ->> 'recits'), v_theme;
    end if;
  end loop;

  raise notice '0115 : fil=% publications, comptes=%', v_tout, v_c;
end $ctrl$;
