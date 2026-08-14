-- ============================================================================
-- 0024 — « LA SAISON EN COURS »
--
-- Le référentiel `place_seasons` porte, mois par mois, si une destination est
-- idéale, correcte ou déconseillée — et POURQUOI. C'est l'information la plus
-- utile du site et elle n'était affichée nulle part : personne ne va à
-- Mahajanga en décembre s'il sait que les pluies commencent.
-- ============================================================================

create or replace function public.saison_du_mois(p_mois integer default null, p_limite integer default 6)
returns table (slug text, nom text, region text, note text, raison text)
language sql stable security definer set search_path = public as $$
  select p.slug, p.name_fr, p.region, ps.rating, ps.reason
    from public.place_seasons ps
    join public.places p on p.id = ps.place_id
   where ps.month = coalesce(p_mois, date_part('month', current_date)::int)
     and ps.rating = 'ideale'
   order by p.nb_posts desc nulls last, p.name_fr
   limit least(greatest(coalesce(p_limite, 6), 1), 20)
$$;

revoke execute on function public.saison_du_mois(integer, integer) from public;
grant  execute on function public.saison_du_mois(integer, integer) to anon, authenticated;
