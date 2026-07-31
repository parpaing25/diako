-- ============================================================================
-- DIAKO — migration 0002 : durcissement des privilèges
--
-- Suite au passage du linter de sécurité Supabase sur la migration 0001.
-- Deux pièges de PostgreSQL/Supabase, tous deux vérifiés en base :
--
--  ① `revoke execute ... from anon, authenticated` NE SUFFIT PAS : PostgreSQL
--    accorde EXECUTE au rôle PUBLIC par défaut sur toute nouvelle fonction,
--    et anon en hérite. Il faut révoquer à PUBLIC.
--
--  ② Révoquer à PUBLIC ne suffit pas NON PLUS : Supabase pose en plus des
--    ALTER DEFAULT PRIVILEGES qui accordent nommément EXECUTE à anon et
--    authenticated. Il faut donc AUSSI révoquer à anon.
--
-- Autrement dit : pour fermer une fonction, les trois révocations sont
-- nécessaires. Vérifier ensuite avec has_function_privilege(), jamais en se
-- fiant au seul linter (qui met son résultat en cache).
-- ============================================================================

-- ① PUBLIC
revoke execute on function public.handle_new_user()            from public;
revoke execute on function public.touch_updated_at()           from public;
revoke execute on function public.prevent_profile_escalation() from public;
revoke execute on function public.is_admin()                   from public;
revoke execute on function public.is_staff()                   from public;

-- ② les rôles nommés par les privilèges par défaut de Supabase
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_staff() from anon;

-- Ce dont le client a réellement besoin, et rien de plus.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;

-- page_views : on ÉCRIT, on ne LIT jamais depuis le client.
revoke select on public.page_views from anon, authenticated;
grant  insert on public.page_views to anon, authenticated;

-- user_roles : le client demande « suis-je admin ? » via is_admin().
-- Il n'a aucune raison de lire la table.
revoke select on public.user_roles from authenticated;

-- ── Deux avertissements du linter sont ASSUMÉS, et documentés comme tels ────
comment on table public.app_flags is
  'Drapeaux de fonctionnalites. Lecture publique ASSUMEE : aucun secret (des booleens du type google_login), et le client doit savoir quels boutons afficher AVANT connexion. Ecriture admin uniquement.';

comment on policy page_views_insert on public.page_views is
  'INSERT ouvert a tous : compteur d audience anonyme. Aucune donnee personnelle (chemin, domaine du referrer, identifiant de session ephemere), longueurs bornees par CHECK, aucune lecture possible.';

-- Vérification (à rejouer après toute modification de privilèges) :
--   select has_function_privilege('anon','public.is_admin()','execute');      -- false
--   select has_column_privilege('anon','public.profiles','email','select');   -- false
--   select has_column_privilege('anon','public.profiles','display_name','select'); -- true
