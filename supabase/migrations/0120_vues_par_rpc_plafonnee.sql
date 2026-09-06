-- ============================================================================
-- 0120 — LES VUES S'ENREGISTRENT PAR RPC, PLAFONNÉES ; L'INSERTION DIRECTE FERME
--
-- 🔴 CE QUE ÇA CORRIGE (audit du 05/09/2026, 02-SE8). `page_views` portait une
--    policy INSERT `with_check = true` ouverte à `public` : n'importe quel
--    script pouvait gonfler les vues d'une fiche (le trigger `dk_compter_vue`
--    incrémente des compteurs affichés) ou remplir la table sans limite.
--    1 163 lignes le 05/09, 71 sur 24 h — pas encore de dérive, mais rien ne
--    l'empêchait.
--
-- ⚠ LE CLIENT A DÉJÀ LE REPLI. `src/lib/pageviews.ts` appelle `noter_vue` et,
--   tant que cette migration n'est pas appliquée (404), retombe sur l'ancienne
--   insertion. Une fois appliquée, l'insertion directe répond 42501 et le
--   client ne la tente plus que sur 404 : rien ne se perd entre les deux.
-- ============================================================================

create or replace function public.noter_vue(p_path text, p_ref text default null, p_sid text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  -- Un chemin de page, rien d'autre : pas d'URL absolue, pas de texte libre.
  if p_path is null or length(p_path) > 200 or p_path !~ '^/' then
    return;
  end if;
  -- 60 vues par session et par minute : un humain n'en fait pas dix.
  -- Réutilise le compteur par minute de l'agent (table agent_rate, purgée
  -- à 10 minutes par agent_rate_hit) — même mécanique, même purge.
  insert into public.agent_rate (cle, minute, n)
  values ('vue:' || coalesce(left(p_sid, 63), 'anon'), date_trunc('minute', now()), 1)
  on conflict (cle, minute) do update set n = agent_rate.n + 1
  returning n into v_n;
  if v_n > 60 then
    return;
  end if;
  insert into public.page_views (path, ref, sid)
  values (p_path, left(p_ref, 200), left(p_sid, 63));
end $$;

comment on function public.noter_vue(text, text, text) is
  'Enregistre une page vue (path, domaine d''origine, identifiant de session), plafonnée à 60 par session et par minute. Remplace l''insertion directe dans page_views (0120).';

revoke all on function public.noter_vue(text, text, text) from public;
grant execute on function public.noter_vue(text, text, text) to anon, authenticated;

drop policy if exists page_views_insert on public.page_views;

-- ============================================================================
-- CONTRÔLE
-- ============================================================================
do $$
declare n integer;
begin
  -- ① Plus aucune policy d'insertion : l'écriture ne passe que par la RPC.
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'page_views' and cmd = 'INSERT') then
    raise exception '0120 : une policy INSERT subsiste sur page_views';
  end if;

  -- ② La RPC écrit, sous le rôle anon, avec le délai du site.
  set local role anon;
  set local statement_timeout = '3s';
  perform public.noter_vue('/controle-0120', null, 'controle-0120');
  reset role;

  select count(*) into n from public.page_views where path = '/controle-0120';
  if n <> 1 then
    raise exception '0120 : noter_vue n''a pas écrit (% ligne(s))', n;
  end if;
  delete from public.page_views where path = '/controle-0120';
  delete from public.agent_rate where cle = 'vue:controle-0120';

  -- ③ anon ne peut plus insérer en direct.
  set local role anon;
  begin
    insert into public.page_views (path, ref, sid) values ('/controle-0120-direct', null, null);
    raise exception '0120 : anon insère encore directement dans page_views';
  exception when insufficient_privilege then
    null; -- attendu
  end;
  reset role;
end $$;
