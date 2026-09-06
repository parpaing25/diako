-- ============================================================================
-- 0122 — TÉLÉCHARGER SES DONNÉES : `mes_donnees()` (RGPD, droit d'accès et
--        portabilité — audit du 05/09/2026, 03-11)
--
-- Rend, pour le compte connecté et lui seul, tout ce que Diako garde à son
-- nom : profil, récits, commentaires, réactions, carnet, plats goûtés,
-- messages envoyés, demandes de voyage. Un seul document JSON, téléchargé
-- depuis Paramètres (composant MesDonnees.tsx).
--
-- ⚠ `security definer` pour lire au-delà des policies de lecture (un récit
--   masqué reste SA donnée), mais chaque sous-requête est filtrée par
--   `auth.uid()` : impossible de demander les données d'un autre.
-- ⚠ `anon` n'a pas le droit d'exécuter : sans session, `auth.uid()` est vide
--   et la fonction rend un objet vide — mais on ferme la porte quand même.
-- ============================================================================

create or replace function public.mes_donnees()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'exporte_le', now(),
    'profil', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'publications', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb) from public.posts x where x.author_id = (select auth.uid())),
    'commentaires', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.comments x where x.author_id = (select auth.uid())),
    'reactions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.reactions x where x.user_id = (select auth.uid())),
    'carnet', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.saves x where x.user_id = (select auth.uid())),
    'fiches_enregistrees', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.page_saves x where x.user_id = (select auth.uid())),
    'plats_goutes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.dish_tastings x where x.user_id = (select auth.uid())),
    'abonnements', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.follows x where x.follower_id = (select auth.uid())),
    'messages_envoyes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb) from public.messages x where x.sender_id = (select auth.uid())),
    'avis', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.reviews x where x.author_id = (select auth.uid())),
    'demandes_de_voyage', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.trip_requests x where x.user_id = (select auth.uid()))
  );
$$;

comment on function public.mes_donnees() is
  'Export RGPD : toutes les données du compte connecté, en un JSON. Filtré par auth.uid() dans chaque sous-requête (0122).';

revoke all on function public.mes_donnees() from public, anon;
grant execute on function public.mes_donnees() to authenticated;

-- ============================================================================
-- CONTRÔLE
-- ============================================================================
do $$
begin
  if has_function_privilege('anon', 'public.mes_donnees()', 'execute') then
    raise exception '0122 : anon peut appeler mes_donnees';
  end if;
  if not has_function_privilege('authenticated', 'public.mes_donnees()', 'execute') then
    raise exception '0122 : un compte connecté ne peut pas appeler mes_donnees';
  end if;
  -- Sans session : profil = JSON null (⚠ un JSON null n'est PAS un SQL NULL —
  -- le premier contrôle testait `is not null` et échouait sur une fonction
  -- juste, 06/09/2026) et toutes les listes vides. La session du connecteur
  -- porte des claims : on les vide LOCALEMENT.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if (public.mes_donnees() -> 'profil') <> 'null'::jsonb then
    raise exception '0122 : mes_donnees rend un profil sans session';
  end if;
  if (public.mes_donnees() -> 'publications') <> '[]'::jsonb then
    raise exception '0122 : mes_donnees rend des publications sans session';
  end if;
end $$;
