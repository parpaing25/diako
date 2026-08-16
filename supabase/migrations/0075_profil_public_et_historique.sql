-- ============================================================================
-- 0075 — LE PROFIL PUBLIC, ET L'HISTORIQUE DE SON PROPRIÉTAIRE
--
-- Deux lectures qui se ressemblent et qu'il ne faut surtout pas confondre :
--
--  · `profil_public(id)`   — ce que TOUT LE MONDE voit d'une personne
--  · `mes_publications()`  — ce que SON PROPRIÉTAIRE voit de lui-même
--
-- ⚠ LA DIFFÉRENCE N'EST PAS UN FILTRE EN PLUS, C'EST DEUX FONCTIONS. Une seule
--   fonction avec un drapeau « je suis le propriétaire » finit toujours par
--   fuiter : il suffit d'un appelant qui oublie le drapeau. Deux fonctions
--   séparées ne peuvent pas se tromper.
--
-- ⚠ LE PROFIL PUBLIC NE REND JAMAIS : e-mail, téléphone, NIF, STAT, ni les
--   publications privées. Il ne rend les LIEUX VISITÉS que si la personne a
--   levé `lieux_publics` — faux par défaut.
--
-- ⚠ PAGINATION PAR CURSEUR, jamais offset : l'historique grandit, et un offset
--   décale tout dès qu'une publication s'ajoute pendant la lecture.
-- ============================================================================

create or replace function public.profil_public(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when not public.profil_expose(p_id) then null else
    jsonb_build_object(
      'id', pr.id,
      'nom', pr.display_name,
      'avatar', pr.avatar_url,
      'couverture', pr.cover_url,
      'bio', pr.bio,
      'ville', pr.home_place,
      'type', pr.account_type,
      'metier', case when pr.account_type = 'pro' then pr.metier_pro end,
      'verification', pr.verification,
      'membre_depuis', pr.created_at,
      'nb_abonnes', pr.followers_count,
      'nb_abonnements', pr.following_count,
      -- ⚠ On recompte les publications VISIBLES, on ne lit pas `posts_count` :
      --   ce compteur inclut les privées, et afficher « 40 récits » au-dessus
      --   d'une liste de 12 se lit comme une panne.
      'nb_publications', (select count(*) from public.posts x
                           where x.author_id = pr.id
                             and x.status = 'published' and x.visibilite = 'public'),
      -- Les etablissements qu'il gere : c'est ce qu'on vient chercher chez un pro.
      'pages', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'slug', g.slug, 'nom', g.name, 'categories', g.categories,
                 'photo', g.cover_url, 'lieu', pl.name_fr)
               order by g.name)
          from public.pages g
          left join public.places pl on pl.id = g.place_id
         where g.owner_id = pr.id and g.is_published), '[]'::jsonb),
      -- ⚠ Les lieux ne sortent QUE sur autorisation explicite.
      'lieux', case when pr.lieux_publics then coalesce((
        select jsonb_agg(distinct pl.name_fr order by pl.name_fr)
          from public.posts x
          join public.places pl on pl.id = x.place_id
         where x.author_id = pr.id
           and x.status = 'published' and x.visibilite = 'public'), '[]'::jsonb) end
    )
  end
  from public.profiles pr
  where pr.id = p_id;
$$;

-- Les publications VISIBLES d'un membre, pour son profil public.
create or replace function public.publications_publiques(
  p_id uuid, p_curseur timestamptz default null, p_limite integer default 12)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'body', p.body, 'media', p.media,
      'place', p.place, 'dish', p.dish, 'created_at', p.created_at,
      'reactions_count', p.reactions_count, 'comments_count', p.comments_count,
      'price_ar', p.price_ar, 'price_unit', p.price_unit, 'price_on', p.price_on
    ) as x
    from public.posts p
   where p.author_id = p_id
     and p.status = 'published' and p.visibilite = 'public'
     and public.profil_expose(p_id)
     and (p_curseur is null or p.created_at < p_curseur)
   order by p.created_at desc
   limit least(greatest(p_limite, 1), 30)
  ) s;
$$;

-- ── L'historique COMPLET, réservé à son propriétaire ────────────────────────
create or replace function public.mes_publications(
  p_curseur timestamptz default null, p_limite integer default 12, p_kind text default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'body', p.body, 'media', p.media,
      'place', p.place, 'dish', p.dish, 'created_at', p.created_at,
      'status', p.status, 'visibilite', p.visibilite,
      'reactions_count', p.reactions_count, 'comments_count', p.comments_count,
      'saves_count', p.saves_count,
      'price_ar', p.price_ar, 'price_unit', p.price_unit, 'price_on', p.price_on
    ) as x
    from public.posts p
   where p.author_id = (select auth.uid())
     and p.status <> 'removed'
     and (p_kind is null or p.kind = p_kind)
     and (p_curseur is null or p.created_at < p_curseur)
   order by p.created_at desc
   limit least(greatest(p_limite, 1), 30)
  ) s;
$$;

-- Le tableau de bord du compte : des faits, aucun chiffre inventé.
create or replace function public.mon_activite()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'publications', (select count(*) from public.posts
                      where author_id = (select auth.uid()) and status = 'published'),
    'privees',      (select count(*) from public.posts
                      where author_id = (select auth.uid())
                        and status = 'published' and visibilite = 'prive'),
    'bons_plans',   (select count(*) from public.posts
                      where author_id = (select auth.uid())
                        and status = 'published' and kind = 'bon_plan'),
    'assiettes',    (select count(*) from public.posts
                      where author_id = (select auth.uid())
                        and status = 'published' and kind = 'assiette'),
    'lieux',        (select count(distinct place_id) from public.posts
                      where author_id = (select auth.uid())
                        and status = 'published' and place_id is not null),
    'plats_goutes', (select count(*) from public.dish_tastings
                      where user_id = (select auth.uid())),
    'carnet',       (select count(*) from public.page_saves
                      where user_id = (select auth.uid())),
    'mes_pages',    (select count(*) from public.pages
                      where owner_id = (select auth.uid()))
  );
$$;

revoke all on function public.profil_public(uuid) from public, anon;
revoke all on function public.publications_publiques(uuid, timestamptz, integer) from public, anon;
revoke all on function public.mes_publications(timestamptz, integer, text) from public, anon;
revoke all on function public.mon_activite() from public, anon;

grant execute on function public.profil_public(uuid) to anon, authenticated;
grant execute on function public.publications_publiques(uuid, timestamptz, integer) to anon, authenticated;
grant execute on function public.mes_publications(timestamptz, integer, text) to authenticated;
grant execute on function public.mon_activite() to authenticated;;
