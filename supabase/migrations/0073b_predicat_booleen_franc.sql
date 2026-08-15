-- ============================================================================
-- 0073b — LE PRÉDICAT REND UN BOOLÉEN, PLUS JAMAIS NULL
--
-- ⚠ `profil_expose()` rendait NULL pour un compte sans publication : la chaîne
--   commence par `p = (select auth.uid())`, et pour un visiteur anonyme
--   `auth.uid()` est NULL, donc la comparaison est NULL — et `NULL or false`
--   reste NULL.
--
--   En clause `USING` d'une policy, NULL vaut refus : le comportement était donc
--   JUSTE. Mais il l'était par accident. Le jour où quelqu'un écrit
--   `where not public.profil_expose(x)` pour lister les comptes discrets,
--   `not NULL` vaut NULL, la ligne disparaît, et la requête rend silencieusement
--   un ensemble vide au lieu de la liste attendue.
--
-- ⚠ Un prédicat de sécurité doit répondre oui ou non. « Peut-être » est une
--   dette qu'un autre paiera.
-- ============================================================================

create or replace function public.profil_expose(p uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    p = (select auth.uid())
    or coalesce(public.is_staff(), false)
    or exists (select 1 from public.posts x
                where x.author_id = p and x.status = 'published')
    or exists (select 1 from public.pages g
                where g.owner_id = p and g.is_published)
    or exists (select 1 from public.comments c
                 join public.posts x on x.id = c.post_id
                where c.author_id = p and x.status = 'published')
    or exists (select 1 from public.reviews r
                 join public.pages g on g.id = r.page_id
                where r.author_id = p and g.is_published),
    false);
$$;

do $$
begin
  if public.profil_expose('00000000-0000-0000-0000-000000000001') is not false then
    raise exception 'profil_expose doit rendre false pour un compte inconnu';
  end if;
end $$;
