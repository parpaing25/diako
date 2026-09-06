-- ============================================================================
-- 0125 — LE VEILLEUR DES INSCRIPTIONS
--
-- 🔴 POURQUOI. Du 23/08 au 06/09/2026, aucun courriel d'inscription n'a été
--    remis : personne ne pouvait créer de compte par adresse e-mail. Le défaut
--    a duré DEUX SEMAINES sans laisser une seule trace — les comptes étaient
--    bien créés, l'API répondait 200, et les deux seuls comptes confirmés du
--    projet venaient de Google, qui n'envoie aucun courriel. Il a fallu jouer
--    le parcours à la main pour le voir (03-corrections/12).
--
--    Un moniteur d'inscription est le seul garde-fou qui l'aurait vu le premier
--    jour. Le voici, dans sa forme la moins coûteuse : pas de compte de test
--    créé chaque semaine, pas de boîte à lire, aucune écriture — une simple
--    lecture de ce que GoTrue a déjà consigné.
--
-- LA RÈGLE, ET POURQUOI CELLE-LÀ. Alerte si, sur 7 jours glissants, au moins
-- 3 personnes ont reçu un courriel de confirmation et que PAS UNE seule n'a
-- confirmé. À ce volume, une inscription abandonnée est banale ; trois d'affilée
-- sans la moindre confirmation ne l'est pas.
--   • Le seuil de 3 évite l'alerte sur un abandon isolé.
--   • On n'alerte JAMAIS sur « zéro inscription » : un site calme et un
--     expéditeur en panne se ressemblent, et une alerte qui crie pour rien
--     s'apprend à ignorer — c'est ainsi qu'on perd un vrai signal.
--
-- Une fois par jour à 06:00 UTC (09:00 à Madagascar), sur la même chaîne que
-- 0123 : pg_cron → pg_net → `alerte-erreurs` → Telegram. La fonction accepte
-- désormais un `message` tout fait et le transmet tel quel.
--
-- ⚠ Sans TELEGRAM_BOT_TOKEN ni TELEGRAM_CHAT_ID dans les secrets de la
--   fonction, l'alerte est journalisée et rien ne part (09 §2 F).
-- ============================================================================

select cron.unschedule('diako-veille-inscriptions')
 where exists (select 1 from cron.job where jobname = 'diako-veille-inscriptions');

select cron.schedule(
  'diako-veille-inscriptions',
  '0 6 * * *',
  $cron$
  select net.http_post(
    url := 'https://eifrwecaszzqrdwjjjbu.supabase.co/functions/v1/alerte-erreurs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alerte-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'alerte_secret' limit 1), '')
    ),
    body := jsonb_build_object(
      'message',
      '🔴 Diako — ' || v.total || ' inscription(s) par e-mail en 7 jours, AUCUNE confirmée.' || chr(10)
      || 'Le courriel de confirmation ne part probablement plus. C''est le défaut qui a duré deux semaines en août 2026.' || chr(10)
      || 'À vérifier dans cet ordre : Auth → SMTP (hôte mail.fonenako.mg, port 587, JAMAIS 465) ; le hook « Send Email » vers envoyer-courriel ; la limite d''envoi horaire ; les journaux de la fonction.' || chr(10)
      || 'Rappel : l''hébergement mutualisé accepte puis JETTE tout message contenant du HTML — la fonction doit envoyer du texte brut.'
    )
  )
  from (
    select count(*) as total, count(*) filter (where email_confirmed_at is null) as jamais
    from auth.users
    where confirmation_sent_at > now() - interval '7 days'
  ) v
  where v.total >= 3 and v.jamais = v.total;
  $cron$
);

-- ============================================================================
-- CONTRÔLE
-- ============================================================================
do $$
declare v_total int; v_jamais int;
begin
  if not exists (select 1 from cron.job where jobname = 'diako-veille-inscriptions' and active) then
    raise exception '0125 : la tâche cron diako-veille-inscriptions n''est pas planifiée';
  end if;

  -- La requête de décision doit s'exécuter et rester muette aujourd'hui :
  -- 0 inscription sur 7 jours (les comptes de test du 06/09 ont été supprimés).
  select count(*), count(*) filter (where email_confirmed_at is null)
    into v_total, v_jamais
    from auth.users
   where confirmation_sent_at > now() - interval '7 days';

  if v_total >= 3 and v_jamais = v_total then
    raise warning '0125 : la condition d''alerte est DÉJÀ vraie (% inscriptions, 0 confirmée) — vérifier l''envoi de courriels', v_total;
  end if;
end $$;
