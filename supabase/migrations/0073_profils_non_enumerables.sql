-- ============================================================================
-- 0073 — ON NE PEUT PLUS ASPIRER LES MEMBRES, LE GRAPHE SOCIAL NI LES GOÛTS
--
-- 🔴 VÉRIFIÉ EN PRODUCTION, avec la seule clé anonyme publiée dans le bundle JS :
--      GET /profiles       → 200, la liste complète (nom, ville, bio, type)
--      GET /follows        → 200, le graphe social entier
--      GET /dish_tastings  → 200, ce que chaque personne a goûté, par user_id
--
--    Avec un membre inscrit c'est anecdotique. Avec dix mille, c'est un fichier
--    de personnes prêt à l'emploi : qui suit qui, qui aime quoi, qui habite où.
--
-- ⚠ ET ON S'APPRÊTAIT À Y AJOUTER L'HISTORIQUE DE DÉPLACEMENTS. « Où la
--   personne se situe, ce qu'elle aime, où elle est déjà allée » est la
--   définition d'un profil de déplacement. Le poser sur une table énumérable
--   aurait transformé une fonctionnalité en fuite. Cette migration passe donc
--   AVANT le profil public, pas après.
--
-- ⚠ ON NE FERME PAS `profiles`, ON LE CONDITIONNE. Un nom d'auteur doit rester
--   lisible sous un récit publié, sinon le fil s'affiche sans auteurs. Le
--   prédicat dit exactement ça : est lisible qui S'EST DÉJÀ EXPRIMÉ
--   PUBLIQUEMENT. Un compte qui n'a rien publié n'apparaît nulle part, donc
--   n'a aucune raison d'être lisible.
--
-- ⚠ SECURITY DEFINER SUR LE PRÉDICAT, sinon récursion : la policy de `profiles`
--   interrogerait `posts`, dont la policy interrogerait `profiles`.
--
-- ⚠ `follows` ET `dish_tastings` PASSENT EN AUTHENTIFIÉ SEULEMENT. Vérifié côté
--   client : les seules lectures sont « est-ce que je suis cette personne » et
--   « mon carnet », toutes deux connectées. `statsAtlas()` ne touche pas aux
--   dégustations : le compteur public de l'atlas ne bouge pas.
--
-- ⚠ Le corps definitif du predicat est en 0073b (il rendait NULL, pas false).
-- ============================================================================

create or replace function public.profil_expose(p uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p = (select auth.uid())
      or public.is_staff()
      or exists (select 1 from public.posts x
                  where x.author_id = p and x.status = 'published')
      or exists (select 1 from public.pages g
                  where g.owner_id = p and g.is_published)
      or exists (select 1 from public.comments c
                   join public.posts x on x.id = c.post_id
                  where c.author_id = p and x.status = 'published')
      or exists (select 1 from public.reviews r
                   join public.pages g on g.id = r.page_id
                  where r.author_id = p and g.is_published);
$$;

revoke all on function public.profil_expose(uuid) from public, anon;
grant execute on function public.profil_expose(uuid) to anon, authenticated;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (public.profil_expose(id));

revoke select on public.follows        from anon;
revoke select on public.dish_tastings  from anon;
