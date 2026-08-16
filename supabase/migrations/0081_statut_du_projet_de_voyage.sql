-- ============================================================================
-- 0081 — LE PROJET DE VOYAGE A UN STATUT, ET IL EXPIRE TOUT SEUL
--
-- 🔴 UN PROJET NE POUVAIT NI SE METTRE EN PAUSE, NI S'ANNULER, NI ABOUTIR. Le
--    statut n'avait que trois valeurs — ouvert / clos / honore — et AUCUN écran
--    ne les changeait. Une fois décrit, un projet restait ouvert pour toujours :
--    des agences continuaient de répondre à quelqu'un qui était déjà parti.
--
-- ⚠ L'EXPIRATION EST AUTOMATIQUE, décision d'Andry : « un projet doit expirer
--   tout seul s'il dépasse déjà la date prévue ». C'est la bonne règle — le
--   voyage a eu lieu ou non, mais dans les deux cas les propositions n'ont plus
--   d'objet. Un projet qu'on oublie de fermer ne doit pas continuer à faire
--   travailler des agences pour rien.
--
-- ⚠ ON N'EXPIRE PAS À LA DATE DE DÉPART, MAIS À LA DATE DE FIN + LA SOUPLESSE.
--   Quelqu'un qui annonce « 30 août → 6 septembre, ± 10 jours » cherche encore
--   le 12 septembre. Expirer au 30 août lui couperait ses offres en pleine
--   recherche.
--
-- ⚠ ET SANS DATE, PAS D'EXPIRATION AUTOMATIQUE. `date_to` est facultatif : un
--   projet « je pars un jour, dites-moi quand » n'a pas de date à dépasser.
--   L'inventer serait fermer un projet vivant.
--
-- ⚠ « EXPIRÉ » N'EST PAS « ANNULÉ ». Le premier est arrivé tout seul et se
--   prolonge d'un clic ; le second est une décision, et les pros en sont
--   informés. Les confondre effacerait la différence entre un oubli et un
--   renoncement.
-- ============================================================================

alter table public.trip_requests drop constraint if exists trip_requests_status_check;
alter table public.trip_requests add constraint trip_requests_status_check
  check (status = any (array['ouvert','pause','expire','annule','honore','clos']));

alter table public.trip_requests add column if not exists expire_le date;
alter table public.trip_requests add column if not exists motif_cloture text;

comment on column public.trip_requests.expire_le is
  'Jour ou le projet cesse de recevoir des propositions. Calcule depuis date_to + date_flex_days, prolongeable a la main. NULL = pas de date de voyage, donc pas d''expiration.';

-- ⚠ RECALCULÉ À CHAQUE ÉCRITURE, jamais saisi : une date d'expiration qui ne
--   suit pas les dates du voyage mentirait dès la première modification.
create or replace function public.trip_expire_le()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.date_to is not null then
    -- La souplesse annoncée fait partie de la recherche : on l'ajoute.
    new.expire_le := new.date_to + coalesce(new.date_flex_days, 0);
  else
    new.expire_le := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_trip_expire on public.trip_requests;
create trigger trg_trip_expire
  before insert or update of date_to, date_flex_days on public.trip_requests
  for each row execute function public.trip_expire_le();

update public.trip_requests
   set expire_le = date_to + coalesce(date_flex_days, 0)
 where date_to is not null and expire_le is null;

-- ── Changer de statut, avec les seules transitions qui ont un sens ──────────
create or replace function public.projet_statut(p_id uuid, p_statut text, p_motif text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_moi uuid := (select auth.uid()); v_prop uuid; v_actuel text;
begin
  if v_moi is null then raise exception 'Connexion requise.'; end if;
  select user_id, status into v_prop, v_actuel from public.trip_requests where id = p_id;
  if v_prop is null then raise exception 'Projet introuvable.'; end if;
  if v_prop <> v_moi then raise exception 'Ce projet n''est pas le votre.'; end if;

  if p_statut not in ('ouvert','pause','annule','honore') then
    raise exception 'Statut inconnu.';
  end if;

  -- ⚠ ON NE RÉOUVRE PAS UN PROJET ABOUTI OU ANNULÉ. Ce sont des fins, pas des
  --   pauses : rouvrir renverrait la demande aux agences qui ont déjà répondu,
  --   et donnerait à celles qui ont perdu l'impression d'une seconde chance
  --   qui n'existe pas. Pour repartir, on en crée un nouveau.
  if v_actuel in ('annule','honore') and p_statut <> v_actuel then
    raise exception 'Ce projet est termine. Creez-en un nouveau.';
  end if;

  update public.trip_requests
     set status = p_statut,
         motif_cloture = case when p_statut in ('annule','honore') then p_motif end,
         closed_at = case when p_statut in ('annule','honore') then now() end
   where id = p_id;
end $$;

-- ── Prolonger : repousse la date de fin, donc l'expiration ─────────────────
create or replace function public.projet_prolonger(p_id uuid, p_jours integer default 30)
returns date
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_moi uuid := (select auth.uid()); v_prop uuid; v_to date;
begin
  if v_moi is null then raise exception 'Connexion requise.'; end if;
  select user_id, date_to into v_prop, v_to from public.trip_requests where id = p_id;
  if v_prop is null or v_prop <> v_moi then raise exception 'Ce projet n''est pas le votre.'; end if;
  if p_jours < 1 or p_jours > 180 then raise exception 'Duree hors limites.'; end if;

  -- ⚠ ON REPOUSSE LA DATE DE VOYAGE, pas seulement l'expiration : une demande
  --   qui expire en novembre pour un voyage annoncé en août ferait travailler
  --   les agences sur des dates que le voyageur ne veut plus.
  update public.trip_requests
     set date_to = coalesce(v_to, current_date) + p_jours,
         status = case when status in ('expire','pause') then 'ouvert' else status end
   where id = p_id
  returning expire_le into v_to;
  return v_to;
end $$;

-- ⚠ L'EXPIRATION EST LUE, PAS ÉCRITE PAR UNE TÂCHE. Un projet dont la date est
--   passée est expiré parce que la date est passée — pas parce qu'un cron a
--   tourné. Aucune fenêtre pendant laquelle l'écran dirait « ouvert » alors
--   qu'il ne l'est plus.
create or replace function public.projet_statut_effectif(p_status text, p_expire date)
returns text
language sql
immutable
as $$
  select case
    when p_status in ('annule','honore','clos','pause') then p_status
    when p_expire is not null and p_expire < current_date then 'expire'
    else p_status
  end;
$$;

revoke all on function public.projet_statut(uuid, text, text) from public, anon;
revoke all on function public.projet_prolonger(uuid, integer) from public, anon;
revoke all on function public.projet_statut_effectif(text, date) from public, anon;
grant execute on function public.projet_statut(uuid, text, text) to authenticated;
grant execute on function public.projet_prolonger(uuid, integer) to authenticated;
grant execute on function public.projet_statut_effectif(text, date) to anon, authenticated;;
