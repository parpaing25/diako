-- ============================================================================
-- 0071 — LA RÈGLE DES TROIS RÉVOCATIONS, APPLIQUÉE AUX NOUVELLES FONCTIONS
--
-- 🔴 CE QUE J'AI OUBLIÉ EN 0069 ET 0070. J'ai écrit `revoke all ... from public`
--    puis `grant execute ... to authenticated`, en croyant fermer la porte à
--    `anon`. Vérifié en production : un appel anonyme à `devenir_pro`
--    S'EXÉCUTAIT et rendait « Connexion requise » — la fonction tournait, elle
--    échouait seulement parce que `auth.uid()` est nul.
--
--    La cause est documentée dans ce projet depuis la migration 0002 : Supabase
--    pose un `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ... TO anon` sur toute
--    fonction créée dans `public`. Ce droit est accordé À `anon` DIRECTEMENT :
--    révoquer `public` ne le retire pas. Il faut révoquer `anon` nommément.
--
-- ⚠ ICI LE RISQUE ÉTAIT NUL — les deux fonctions vérifient la session et le rôle
--   avant d'agir. Mais compter sur le contrôle interne d'une fonction pour
--   rattraper un droit accordé par erreur, c'est n'avoir qu'une seule barrière
--   là où on en a écrit deux. La prochaine fonction n'aura peut-être pas ce
--   contrôle.
--
-- ⚠ ON VÉRIFIE, ON NE SUPPOSE PAS : `has_function_privilege()` en fin de
--   migration, parce que le linter de Supabase met ses résultats en cache et
--   affiche parfois un état périmé.
-- ============================================================================

revoke all on function public.devenir_pro(text) from public, anon;
revoke all on function public.accepter_revendication(uuid) from public, anon;
revoke all on function public.revendiquer_page(uuid, text, text) from public, anon;

grant execute on function public.devenir_pro(text) to authenticated;
grant execute on function public.accepter_revendication(uuid) to authenticated;
grant execute on function public.revendiquer_page(uuid, text, text) to authenticated;

do $$
declare v_reste text;
begin
  select string_agg(f, ', ') into v_reste from (
    select 'devenir_pro' as f
     where has_function_privilege('anon', 'public.devenir_pro(text)', 'execute')
    union all
    select 'accepter_revendication'
     where has_function_privilege('anon', 'public.accepter_revendication(uuid)', 'execute')
    union all
    select 'revendiquer_page'
     where has_function_privilege('anon', 'public.revendiquer_page(uuid,text,text)', 'execute')
  ) s;
  if v_reste is not null then
    raise exception 'anon garde execute sur : %', v_reste;
  end if;
end $$;
