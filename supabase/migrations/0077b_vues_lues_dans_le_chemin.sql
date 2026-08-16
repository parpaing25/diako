-- ============================================================================
-- 0077b — LES VUES ÉTAIENT COMPTÉES SUR LA MAUVAISE COLONNE
--
-- 🔴 J'AI JOINT SUR `page_views.ref`, QUI EST NUL. Vérifié : les 3 vues de
--    publications enregistrées portent `path = '/post/<uuid>'` et `ref = NULL`.
--    L'identifiant est dans le CHEMIN, pas dans la colonne prévue pour lui.
--
--    Le terme « vues » du classement valait donc toujours zéro. Le bloc « en
--    vogue » aurait continué de classer sur les seules réactions, en donnant
--    l'impression d'avoir été enrichi — le pire des deux : une fonctionnalité
--    annoncée, un comportement inchangé, et personne pour s'en apercevoir.
--
-- ⚠ On lit donc le chemin. `ref` reste inutilisée ici : la remplir demanderait
--   de toucher au traceur côté client, et la donnée déjà collectée resterait
--   inexploitable. On prend ce qui existe.
-- ============================================================================

create or replace function public.recits_en_vogue(
  p_limite integer default 12,
  p_lat double precision default null,
  p_lng double precision default null
)
returns table (
  id uuid, body text, media jsonb, place text, dish text, created_at timestamptz,
  reactions_count integer, comments_count integer, saves_count integer,
  display_name text, avatar_url text, score numeric, vues bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with vues as (
    select substring(v.path from '^/post/([0-9a-fA-F-]{36})$') as post_id,
           count(*) as n
      from public.page_views v
     where v.path like '/post/%'
       and v.created_at > now() - interval '30 days'
     group by 1
  )
  select p.id, p.body, p.media, p.place, p.dish, p.created_at,
         p.reactions_count, p.comments_count, p.saves_count,
         pr.display_name, pr.avatar_url,
         round(
           (
             p.reactions_count * 20
             + p.comments_count * 30
             + p.saves_count * 40
             + coalesce(v.n, 0) * 2
             + case
                 when p_lat is null or pl.lat is null then 0
                 else greatest(0, 60 - public.distance_km(p_lat, p_lng, pl.lat, pl.lng) * 0.3)
               end
           )::numeric
           / power(greatest(extract(epoch from (now() - p.created_at)) / 86400, 1), 0.7)::numeric
         , 3) as score,
         coalesce(v.n, 0) as vues
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    left join public.places pl on pl.id = p.place_id
    left join vues v on v.post_id = p.id::text
   where p.status = 'published'
     and p.visibilite = 'public'
   order by score desc, p.created_at desc
   limit least(greatest(coalesce(p_limite, 12), 1), 30);
$$;

do $$
declare v_n bigint;
begin
  select sum(vues) into v_n from public.recits_en_vogue(30);
  if v_n is null or v_n = 0 then
    raise warning 'aucune vue rattachee : verifier le format de page_views.path';
  end if;
end $$;;
