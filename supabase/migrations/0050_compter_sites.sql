-- ============================================================================
-- 0050 — COMBIEN DE SITES, PAR GENRE
--
-- ⚠ POURQUOI UNE RPC ET PAS UN `count` CÔTÉ CLIENT. PostgREST plafonne toute
--   réponse à 1 000 lignes SANS LE DIRE : compter 2 474 sites en les
--   ramenant tous aurait rendu 1 000, et l'écran aurait affiché un total faux
--   avec l'aplomb d'un chiffre exact. Le compte se fait là où sont les données.
--
-- ⚠ ÇA SERT AUSSI À NE PAS PROPOSER DE FILTRE VIDE. Un onglet « Grottes » qui
--   ouvre sur une page blanche est pire que pas d'onglet du tout : le visiteur
--   croit que le site est cassé, pas que la donnée manque.
-- ============================================================================

create or replace function public.compter_sites()
returns table (kind text, n bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.kind, count(*)
    from public.attractions a
   where a.is_published = true
   group by a.kind
   order by count(*) desc;
$$;

revoke all on function public.compter_sites() from public;
grant execute on function public.compter_sites() to anon, authenticated;
