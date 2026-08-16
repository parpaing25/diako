-- ============================================================================
-- 0077 — « EN VOGUE » CROISE LES SIGNAUX, ET REGARDE OÙ EST LE LECTEUR
--
-- ⚠ CE QUI MANQUAIT. Le classement ne comptait que réactions, commentaires et
--   enregistrements. Trois signaux qui viennent tous du même petit groupe :
--   celui qui a déjà cliqué. Avec un membre inscrit, ils valent tous 0 ou 1, et
--   la liste devient l'ordre d'insertion déguisé en palmarès.
--
-- ⚠ LES VUES SONT LE SEUL SIGNAL QUE LAISSE UN VISITEUR SILENCIEUX — c'est-à-dire
--   presque tout le monde. `page_views` les porte déjà et personne ne les
--   lisait. Elles pèsent peu par unité (un clic ne vaut pas un commentaire),
--   mais elles sont mille fois plus nombreuses : c'est ce qui fait vivre le
--   classement AVANT d'avoir une communauté.
--
-- ⚠ LA PROXIMITÉ ENTRE EN DERNIER, ET SEULEMENT SI ON SAIT OÙ EST LE LECTEUR.
--   Un récit de Diego n'intéresse pas moins qu'un récit d'Antsirabe — il
--   intéresse moins QUELQU'UN QUI EST À ANTSIRABE. Sans position connue, le
--   terme vaut zéro et le classement reste celui de l'attention. On ne devine
--   jamais une position.
--
-- ⚠ L'ÂGE RESTE UN DIVISEUR, PAS UN FILTRE. Un récit d'hier peut passer devant
--   un récit du mois dernier, mais rien n'est exclu : sur un site qui compte
--   28 récits, filtrer sur sept jours viderait le bloc.
-- ============================================================================

drop function if exists public.recits_en_vogue(integer);

create function public.recits_en_vogue(
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
    -- ⚠ Fenêtre de 30 jours : une vue d'il y a six mois ne dit rien de ce qui
    --   est « en vogue cette semaine ».
    select v.ref as post_id, count(*) as n
      from public.page_views v
     where v.path like '/post/%' and v.created_at > now() - interval '30 days'
     group by v.ref
  )
  select p.id, p.body, p.media, p.place, p.dish, p.created_at,
         p.reactions_count, p.comments_count, p.saves_count,
         pr.display_name, pr.avatar_url,
         round(
           (
             -- Attention explicite : chère, rare, elle pèse lourd à l'unité.
             p.reactions_count * 20
             + p.comments_count * 30
             + p.saves_count * 40
             -- Attention silencieuse : bon marché, abondante, elle fait le fond.
             + coalesce(v.n, 0) * 2
             -- Proximité : un bonus, jamais un filtre. Décroît avec la distance
             -- et s'annule au-delà de ~200 km.
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

revoke all on function public.recits_en_vogue(integer, double precision, double precision) from public, anon;
grant execute on function public.recits_en_vogue(integer, double precision, double precision) to anon, authenticated;;
