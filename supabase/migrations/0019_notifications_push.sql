-- ============================================================================
-- 0019 — NOTIFICATIONS PUSH
--
-- À quoi ça sert vraiment ici : un voyageur écrit à une agence le soir, le
-- gérant répond le lendemain matin. Sans push, la réponse attend que le
-- voyageur pense à rouvrir le site — et une mise en relation qui prend
-- vingt-quatre heures ne se fait pas.
--
-- ⚠ AUCUNE CLÉ DANS LE DÉCLENCHEUR. Sur le projet frère, la clé service_role
--   se trouve EN CLAIR dans deux fonctions de base : quiconque a accès au
--   catalogue peut la lire, et elle ouvre tout.
--
--   On s'en passe grâce au principe qui protège aussi la fonction d'envoi : le
--   corps transmis ne contient QUE l'identifiant d'une ligne, et tout le
--   contenu (titre, message, destinataire) est relu en base par la fonction.
--   Une requête forgée ne peut donc, au pire, que réexpédier une VRAIE
--   notification à son VRAI destinataire. Il n'y a rien à protéger par un
--   secret, donc rien à fuir.
--
--   C'est le constat SEC-04 de l'audit du projet frère — où la version
--   d'origine lisait titre, message, lien et destinataire dans le corps de la
--   requête : hameçonnage parfait, signé par le site.
-- ============================================================================

create extension if not exists pg_net with schema extensions;

-- Un abonnement est un secret : l'endpoint permet d'écrire sur CE téléphone.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  navigateur text,
  created_at timestamptz not null default now(),
  vu_le      timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists push_moi on public.push_subscriptions;
create policy push_moi on public.push_subscriptions for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon;

-- ⚠ SCHÉMA `net`, PAS `extensions.net`. pg_net crée TOUJOURS son propre schéma
--   `net`, quel que soit celui demandé à l'installation. La première version
--   appelait `extensions.net.http_post` : la fonction n'existait pas, et le
--   bloc `exception when others` — posé pour que le push ne casse jamais une
--   notification — masquait la panne. Un garde-fou qui cache le problème qu'il
--   devrait signaler n'aveugle pas moins qu'il ne protège : on trace désormais
--   dans les journaux.
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
  raise warning '[push] envoi impossible pour % % : %', tg_table_name, new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists trg_push_notification on public.notifications;
create trigger trg_push_notification after insert on public.notifications
  for each row execute function public.notifier_push();

drop trigger if exists trg_push_message on public.messages;
create trigger trg_push_message after insert on public.messages
  for each row execute function public.notifier_push();

revoke execute on function public.notifier_push() from public, anon, authenticated;
