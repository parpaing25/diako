-- ============================================================================
-- 0034 — « QUAND PARTIR OÙ » : le comparateur mois par mois
--
-- ⚠ POURQUOI CETTE RPC PLUTÔT QU'UNE REQUÊTE CÔTÉ CLIENT. Le comparateur croise
--   12 mois × N destinations : en PostgREST, cela fait une requête par
--   destination, ou un select imbriqué que la nullabilité du `types.ts` tenu à
--   la main ne sait pas typer. Une RPC rend le tableau complet en UN
--   aller-retour — sur une 3G malgache, c'est la seule forme acceptable.
--
-- ⚠ ELLE NE REND QUE LES LIEUX RÉELLEMENT RENSEIGNÉS. Cinq destinations sur 178
--   ont leur saisonnalité complète. Rendre les 173 autres avec des mois vides
--   remplirait le tableau de gris, ce qui se lirait « déconseillé toute
--   l'année » — un mensonge par omission. Le compte des documentées est rendu à
--   part, pour que l'écran puisse dire la vérité sur sa propre couverture.
--
-- ⚠ AUCUNE DONNÉE N'EST FABRIQUÉE ICI. La fonction ne fait que retourner ce que
--   `place_seasons` contient déjà — 60 lignes saisies au lot 1, avec leur
--   raison. C'est précisément le fossé défensif du produit : personne d'autre
--   ne publie « pourquoi » un mois est déconseillé.
-- ============================================================================

create or replace function public.quand_partir()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'lieux', coalesce((
      select jsonb_agg(x order by x->>'nom')
        from (
          select jsonb_build_object(
                   'slug', pl.slug,
                   'nom',  pl.name_fr,
                   'region', pl.region,
                   'resume', pl.summary,
                   'mois', (
                     select jsonb_agg(jsonb_build_object(
                              'mois', ps.month,
                              'note', ps.rating,
                              'raison', ps.reason)
                            order by ps.month)
                       from public.place_seasons ps
                      where ps.place_id = pl.id
                   )
                 ) as x
            from public.places pl
           where exists (select 1 from public.place_seasons s where s.place_id = pl.id)
        ) t
    ), '[]'::jsonb),
    'nb_documentes', (select count(distinct place_id) from public.place_seasons),
    'nb_lieux',      (select count(*) from public.places)
  );
$$;

-- Lecture publique : c'est une page d'acquisition, elle ne peut pas être
-- derrière un mur de connexion.
revoke execute on function public.quand_partir() from public;
grant  execute on function public.quand_partir() to anon, authenticated;
