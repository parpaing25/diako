-- ============================================================================
-- 0026 — LE RAIL VIVANT : tendances + chiffres réels
--
-- ⚠ LA LEÇON DE FONENAKO, REPRISE ICI AVANT DE LA REFAIRE. Sur le site frère,
--   « en vogue » classait par nombre TOTAL de vues. Ce total ne fait que
--   monter : un récit de six mois à 500 vues bat pour toujours un récit
--   d'avant-hier qui en a fait 60 — alors que le second intéresse
--   manifestement plus de monde EN CE MOMENT. Les gagnants d'hier
--   verrouillaient la vitrine et rien de neuf ne pouvait y entrer.
--
--   Ici on classe donc sur un RYTHME : l'attention rapportée à l'âge du
--   récit. Un récit récent qui marche monte tout de suite, un ancien
--   redescend tout seul — aucun ménage à faire.
--
-- ⚠ POIDS. Une réaction est un acte volontaire, un commentaire l'est plus
--   encore, et sur un site de voyage un ENREGISTREMENT est le signal le plus
--   fort qui soit : celui qui garde un récit prépare son départ.
--   Le tirage pondéré final se fait côté client (src/lib/tendance.ts) pour que
--   le rail change à chaque visite sans nouvelle requête.
-- ============================================================================

create or replace function public.recits_en_vogue(p_limite integer default 12)
returns table (
  id uuid, body text, media jsonb, place text, dish text,
  created_at timestamptz, reactions_count integer, comments_count integer,
  saves_count integer, auteur_nom text, auteur_avatar text, score numeric
)
language sql stable security definer set search_path = public as $$
  select p.id, p.body, p.media, p.place, p.dish, p.created_at,
         p.reactions_count, p.comments_count, p.saves_count,
         pr.display_name, pr.avatar_url,
         -- attention / âge^0,7 : le même barème que le fil de Fonenako.
         round(
           (p.reactions_count * 20 + p.comments_count * 30 + p.saves_count * 40)::numeric
           / power(greatest(extract(epoch from (now() - p.created_at)) / 86400, 1), 0.7)::numeric
         , 3)
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
   where p.status = 'published'
     and (p.reactions_count + p.comments_count + p.saves_count) > 0
   order by 12 desc, p.created_at desc
   limit least(greatest(coalesce(p_limite, 12), 1), 30)
$$;

-- Les chiffres du site, VRAIS, en un seul appel.
-- ⚠ Rien d'arrondi vers le haut, rien d'inventé : sur la version précédente de
--   Diako le rail affichait « Nosy Be 1.2k posts ». Un compteur qui ment une
--   fois ne se rattrape jamais.
create or replace function public.stats_diako()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'recits',        (select count(*) from public.posts  where status = 'published'),
    'etablissements',(select count(*) from public.pages  where is_published),
    'destinations',  (select count(*) from public.places),
    'plats',         (select count(*) from public.dishes),
    'membres',       (select count(*) from public.profiles),
    'vues_7j',       (select count(*) from public.page_views
                       where created_at > now() - interval '7 days')
  )
$$;

revoke execute on function public.recits_en_vogue(integer) from public;
revoke execute on function public.stats_diako()            from public;
grant  execute on function public.recits_en_vogue(integer) to anon, authenticated;
grant  execute on function public.stats_diako()            to anon, authenticated;
