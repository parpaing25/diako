-- ============================================================================
-- 0074 — CHAQUE PUBLICATION DÉCIDE DE SA VISIBILITÉ
--
-- Demande du propriétaire, mot pour mot : « sur l'historique, elle peut décider
-- quoi rendre publique, ou pas ».
--
-- ⚠ POURQUOI `status` NE SUFFISAIT PAS. Il vaut `published`, `hidden` ou
--   `removed` — trois états de MODÉRATION, pas de choix personnel. `hidden` est
--   ce que pose le déclencheur au 3ᵉ signalement : s'en servir pour « je garde
--   ça pour moi » mélangerait un retrait subi et une décision volontaire, et le
--   jour où la modération lèverait un masquage elle republierait un texte que
--   son auteur voulait privé.
--
-- ⚠ `prive` EST LE DÉFAUT POUR LE PASSÉ ? NON — et c'est délibéré. Les 28
--   récits existants ont été écrits pour être lus : les basculer en privé
--   viderait le fil et trahirait l'intention de leur auteur. Le défaut est
--   PUBLIC pour l'existant, et le choix est offert à chaque publication à
--   partir de maintenant.
--
-- ⚠ EN REVANCHE L'HISTORIQUE DÉDUIT, LUI, EST PRIVÉ PAR DÉFAUT. « Où elle est
--   déjà allée » n'est pas quelque chose qu'elle a publié : c'est quelque chose
--   qu'on a calculé sur elle. Un profil de déplacement ne peut pas être
--   opt-out rétroactif — d'où `profiles.lieux_publics` à false.
-- ============================================================================

alter table public.posts add column if not exists visibilite text not null default 'public';
alter table public.posts drop constraint if exists posts_visibilite_check;
alter table public.posts add constraint posts_visibilite_check
  check (visibilite = any (array['public','prive']));

comment on column public.posts.visibilite is
  'Choix de l''AUTEUR. Distinct de `status`, qui est la moderation : `hidden` est subi, `prive` est voulu. Ne jamais confondre les deux.';

alter table public.profiles add column if not exists lieux_publics boolean not null default false;

comment on column public.profiles.lieux_publics is
  'Autorise l''affichage, sur le profil public, des LIEUX DEDUITS des publications. Faux par defaut : un historique de deplacements ne peut pas etre opt-out retroactif.';

grant select (lieux_publics) on public.profiles to anon, authenticated;
grant update (lieux_publics) on public.profiles to authenticated;

-- ⚠ LE FIL NE MONTRE QUE LE PUBLIC. Sans ce filtre, une publication marquée
--   privée resterait dans le fil de tout le monde : le réglage aurait l'air de
--   marcher (elle disparaît du profil) tout en ne protégeant rien.
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
as $$
  select coalesce(jsonb_agg(x order by ordre), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'body', p.body, 'media', p.media,
      'place', p.place, 'dish', p.dish, 'page_name', p.page_name,
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
     and case p_mode
       when 'abonnements' then exists (
         select 1 from public.follows f
          where f.follower_id = (select auth.uid()) and f.target_id = p.author_id)
       when 'assiettes' then p.dish_id is not null
       when 'pres_de_moi' then
         p_lat is not null and pl.lat is not null
         and public.distance_km(p_lat, p_lng, pl.lat, pl.lng) <= 150
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
$$;;
