-- ============================================================================
-- 0123 — QUELQU'UN EST PRÉVENU QUAND ÇA CASSE (audit du 05/09/2026, 02-AM1)
--
-- 🔴 L'incident du 05/09 (un visiteur Android, cinq écrans d'erreur en deux
--    minutes) n'a été vu que par l'audit, six heures plus tard. `journal_erreurs`
--    existait ; personne ne le lisait.
--
-- Toutes les 10 minutes, si 3 erreurs ou plus sont arrivées dans les 10
-- dernières minutes, pg_cron appelle l'Edge Function `alerte-erreurs`
-- (pg_net), qui les résume et envoie un message Telegram.
--
-- ⚠ DEUX SECRETS À POSER AVANT QUE ÇA SERVE (tableau de bord ou SQL) :
--   1. vault : `select vault.create_secret('<un mot de passe long>', 'alerte_secret');`
--      — la fonction refuse tout appel sans cet en-tête ;
--   2. secrets de la fonction (Edge Functions → alerte-erreurs → Secrets) :
--      ALERTE_SECRET (le même), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
--   Sans Telegram, la fonction journalise l'alerte dans ses logs et rend 200 :
--   rien ne casse, rien ne prévient non plus.
-- ============================================================================

create extension if not exists pg_cron;
grant usage on schema cron to postgres;

select cron.unschedule('diako-alerte-erreurs')
 where exists (select 1 from cron.job where jobname = 'diako-alerte-erreurs');

select cron.schedule(
  'diako-alerte-erreurs',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := 'https://eifrwecaszzqrdwjjjbu.supabase.co/functions/v1/alerte-erreurs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alerte-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'alerte_secret' limit 1), '')
    ),
    body := jsonb_build_object('depuis', (now() - interval '10 minutes')::text)
  )
  where (select count(*) from public.journal_erreurs where created_at > now() - interval '10 minutes') >= 3;
  $cron$
);

-- ============================================================================
-- CONTRÔLE
-- ============================================================================
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'diako-alerte-erreurs' and active) then
    raise exception '0123 : la tâche cron diako-alerte-erreurs n''est pas planifiée';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception '0123 : pg_net absent';
  end if;
end $$;
