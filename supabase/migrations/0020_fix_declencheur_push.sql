-- ============================================================================
-- 0020 — DEUX DÉFAUTS DE LA 0019, trouvés en testant l'envoi RÉEL
--
--  ① MAUVAIS SCHÉMA. J'avais écrit `extensions.net.http_post` parce que
--    l'extension est installée « with schema extensions ». Mais pg_net crée
--    TOUJOURS son propre schéma `net`, quel que soit le schéma demandé à
--    l'installation. L'appel n'existait donc pas.
--
--  ② L'ERREUR ÉTAIT AVALÉE EN SILENCE. Le bloc `exception when others then
--    return new` — posé pour que le push ne casse jamais une notification —
--    masquait aussi la panne : la notification était créée, aucune requête
--    n'était émise, et RIEN ne le disait. Un garde-fou qui cache le problème
--    qu'il devrait signaler ne protège plus, il aveugle.
--
--    On garde le garde-fou (une notification doit exister même si le push
--    échoue) mais on TRACE désormais dans les journaux Postgres.
-- ============================================================================

create or replace function public.notifier_push()
returns trigger
language plpgsql
security definer
set search_path = public, net as $$
declare
  v_url text := 'https://eifrwecaszzqrdwjjjbu.supabase.co/functions/v1/send-push';
begin
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('table', tg_table_name, 'record', jsonb_build_object('id', new.id)),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 3000
  );
  return new;
exception when others then
  -- Visible dans les journaux du projet, sans jamais bloquer l'insertion.
  raise warning '[push] envoi impossible pour % % : %', tg_table_name, new.id, sqlerrm;
  return new;
end $$;

revoke execute on function public.notifier_push() from public, anon, authenticated;
