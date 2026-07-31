-- ============================================================================
-- DIAKO — migration 0003 : le socle social RÉEL
--
-- Publications, médias, réactions, commentaires, abonnements, favoris,
-- messagerie et notifications. Transposition du socle éprouvé de Fonenako,
-- avec les correctifs que ce projet a payés en production :
--
--  · aucune contrainte CHECK sur notifications.type — chez Fonenako elle a dû
--    être supprimée DEUX fois pour pouvoir ajouter de nouveaux types ;
--  · auth.uid() toujours enveloppé dans un sous-SELECT, sinon l'authentification
--    est réévaluée LIGNE PAR LIGNE ;
--  · un trigger de notification ne doit JAMAIS faire échouer l'écriture métier
--    qui le déclenche → tout est enveloppé dans EXCEPTION WHEN OTHERS ;
--  · index pensés pour une pagination par CURSEUR, jamais par offset.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. PUBLICATIONS
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles(id) on delete cascade,
  kind          text not null default 'photo'
                  check (kind in ('recit','photo','bon_plan','question','avis','promo','alerte')),
  body          text,
  media         jsonb not null default '[]'::jsonb,   -- [{url,w,h}] — ratio connu = zéro saut
  place         text,                                  -- remplacé par place_id au Lot 1
  dish          text,
  page_name     text,

  reactions_count integer not null default 0,
  comments_count  integer not null default 0,
  saves_count     integer not null default 0,

  status        text not null default 'published'
                  check (status in ('published','hidden','removed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint posts_non_vide check (
    coalesce(trim(body), '') <> '' or jsonb_array_length(media) > 0
  )
);

-- ⭐ L'index qui porte la pagination par curseur du fil.
create index if not exists posts_feed_idx
  on public.posts (created_at desc, id desc) where status = 'published';
create index if not exists posts_author_idx
  on public.posts (author_id, created_at desc);

drop trigger if exists trg_posts_touch on public.posts;
create trigger trg_posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

-- Compteur de publications sur le profil.
create or replace function public.maj_posts_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set posts_count = posts_count + 1 where id = new.author_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set posts_count = greatest(0, posts_count - 1) where id = old.author_id;
  end if;
  return null;
exception when others then
  return null;   -- un compteur ne doit jamais bloquer une publication
end $$;

drop trigger if exists trg_posts_count on public.posts;
create trigger trg_posts_count after insert or delete on public.posts
  for each row execute function public.maj_posts_count();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RÉACTIONS  (une seule par personne et par publication)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.reactions (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null default 'jaime'
               check (type in ('jaime','adore','waouh','utile')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists reactions_post_idx on public.reactions(post_id);
create index if not exists reactions_user_idx on public.reactions(user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. COMMENTAIRES
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  parent_id  uuid references public.comments(id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 2000),
  status     text not null default 'published'
               check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments(post_id, created_at);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. FAVORIS  (une table dédiée : chez Fonenako les favoris étaient dérivés
--    des réactions, ce qui rendait impossible « j'aime » sans « enregistrer »)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.saves (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists saves_user_idx on public.saves(user_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. ABONNEMENTS
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  target_id   uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, target_id),
  check (follower_id <> target_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. NOTIFICATIONS
-- ⚠ AUCUN CHECK sur `type` : chez Fonenako la contrainte a dû être supprimée
--   deux fois pour pouvoir ajouter de nouveaux types de notification.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  message    text,
  data       jsonb not null default '{}'::jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications(user_id) where not read;

create or replace function public.notifier(
  p_user uuid, p_type text, p_titre text, p_message text, p_data jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, type, title, message, data)
  values (p_user, p_type, p_titre, p_message, coalesce(p_data, '{}'::jsonb));
exception when others then
  return;   -- une notification ratée ne casse jamais l'action qui l'a déclenchée
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. COMPTEURS + NOTIFICATIONS (triggers)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.maj_reactions()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_auteur uuid; v_nom text;
begin
  if tg_op = 'INSERT' then
    update public.posts set reactions_count = reactions_count + 1
      where id = new.post_id returning author_id into v_auteur;
    if v_auteur is not null and v_auteur <> new.user_id then
      select display_name into v_nom from public.profiles where id = new.user_id;
      perform public.notifier(v_auteur, 'reaction', 'Nouvelle réaction',
        coalesce(v_nom, 'Quelqu''un') || ' a réagi à votre publication',
        jsonb_build_object('post_id', new.post_id, 'from', new.user_id));
    end if;
  elsif tg_op = 'DELETE' then
    update public.posts set reactions_count = greatest(0, reactions_count - 1)
      where id = old.post_id;
  end if;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists trg_reactions on public.reactions;
create trigger trg_reactions after insert or delete on public.reactions
  for each row execute function public.maj_reactions();

create or replace function public.maj_comments()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_auteur uuid; v_nom text;
begin
  if tg_op = 'INSERT' then
    update public.posts set comments_count = comments_count + 1
      where id = new.post_id returning author_id into v_auteur;
    if v_auteur is not null and v_auteur <> new.author_id then
      select display_name into v_nom from public.profiles where id = new.author_id;
      perform public.notifier(v_auteur, 'commentaire', 'Nouveau commentaire',
        coalesce(v_nom, 'Quelqu''un') || ' a commenté votre publication',
        jsonb_build_object('post_id', new.post_id, 'from', new.author_id));
    end if;
  elsif tg_op = 'DELETE' then
    update public.posts set comments_count = greatest(0, comments_count - 1)
      where id = old.post_id;
  end if;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists trg_comments on public.comments;
create trigger trg_comments after insert or delete on public.comments
  for each row execute function public.maj_comments();

create or replace function public.maj_saves()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set saves_count = saves_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set saves_count = greatest(0, saves_count - 1) where id = old.post_id;
  end if;
  return null;
exception when others then return null;
end $$;

drop trigger if exists trg_saves on public.saves;
create trigger trg_saves after insert or delete on public.saves
  for each row execute function public.maj_saves();

create or replace function public.maj_follows()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nom text;
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set followers_count = followers_count + 1 where id = new.target_id;
    select display_name into v_nom from public.profiles where id = new.follower_id;
    perform public.notifier(new.target_id, 'abonnement', 'Nouvel abonné',
      coalesce(v_nom, 'Quelqu''un') || ' vous suit désormais',
      jsonb_build_object('from', new.follower_id));
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = old.target_id;
  end if;
  return null;
exception when others then return null;
end $$;

drop trigger if exists trg_follows on public.follows;
create trigger trg_follows after insert or delete on public.follows
  for each row execute function public.maj_follows();

-- ────────────────────────────────────────────────────────────────────────────
-- 8. MESSAGERIE
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  a_id       uuid not null references public.profiles(id) on delete cascade,
  b_id       uuid not null references public.profiles(id) on delete cascade,
  last_at    timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (a_id < b_id)        -- paire ordonnée : une seule conversation par duo
);
create unique index if not exists conversations_paire_idx on public.conversations(a_id, b_id);
create index if not exists conversations_a_idx on public.conversations(a_id, last_at desc);
create index if not exists conversations_b_idx on public.conversations(b_id, last_at desc);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  conv_id    uuid not null references public.conversations(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 4000),
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages(conv_id, created_at desc);

-- Ouvre (ou retrouve) la conversation avec quelqu'un. La paire étant ordonnée,
-- il ne peut jamais exister deux conversations pour un même duo.
create or replace function public.ouvrir_conversation(p_autre uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_moi uuid := (select auth.uid()); v_a uuid; v_b uuid; v_id uuid;
begin
  if v_moi is null then raise exception 'Connexion requise.'; end if;
  if p_autre is null or p_autre = v_moi then raise exception 'Destinataire invalide.'; end if;
  if not exists (select 1 from public.profiles where id = p_autre) then
    raise exception 'Ce membre n''existe pas.';
  end if;

  v_a := least(v_moi, p_autre); v_b := greatest(v_moi, p_autre);
  select id into v_id from public.conversations where a_id = v_a and b_id = v_b;
  if v_id is null then
    insert into public.conversations (a_id, b_id) values (v_a, v_b) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.maj_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dest uuid; v_nom text;
begin
  update public.conversations set last_at = new.created_at where id = new.conv_id;
  select case when a_id = new.sender_id then b_id else a_id end into v_dest
    from public.conversations where id = new.conv_id;
  select display_name into v_nom from public.profiles where id = new.sender_id;
  perform public.notifier(v_dest, 'message', coalesce(v_nom, 'Nouveau message'),
    left(new.body, 90), jsonb_build_object('conv_id', new.conv_id, 'from', new.sender_id));
  return null;
exception when others then return null;
end $$;

drop trigger if exists trg_message on public.messages;
create trigger trg_message after insert on public.messages
  for each row execute function public.maj_message();

-- ────────────────────────────────────────────────────────────────────────────
-- 9. MODÉRATION — Fonenako n'en a AUCUNE (les boutons « Signaler » et
--    « Bloquer » y sont de simples entrées de menu branchées sur rien).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post','comment','profile','message')),
  target_id   uuid not null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason      text not null,
  status      text not null default 'nouveau' check (status in ('nouveau','vu','traite','rejete')),
  created_at  timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Masquage automatique au-delà de 3 signalements distincts.
create or replace function public.masquer_si_signale()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  select count(*) into n from public.reports
   where target_type = new.target_type and target_id = new.target_id;
  if n >= 3 then
    if new.target_type = 'post' then
      update public.posts set status = 'hidden' where id = new.target_id;
    elsif new.target_type = 'comment' then
      update public.comments set status = 'hidden' where id = new.target_id;
    end if;
  end if;
  return null;
exception when others then return null;
end $$;

drop trigger if exists trg_report on public.reports;
create trigger trg_report after insert on public.reports
  for each row execute function public.masquer_si_signale();

-- ────────────────────────────────────────────────────────────────────────────
-- 10. LE FIL — pagination par CURSEUR, jamais par offset.
--     L'offset décale tout dès qu'une publication arrive pendant le scroll :
--     doublons et lignes sautées. Fonenako a colmaté avec ~150 lignes de
--     garde-fous ; le curseur supprime le problème à la racine.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.get_feed(
  p_curseur timestamptz default null,
  p_limite  integer default 10
) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id,
      'kind', p.kind,
      'body', p.body,
      'media', p.media,
      'place', p.place,
      'dish', p.dish,
      'page_name', p.page_name,
      'created_at', p.created_at,
      'reactions_count', p.reactions_count,
      'comments_count', p.comments_count,
      'saves_count', p.saves_count,
      'author', jsonb_build_object(
        'id', pr.id, 'name', pr.display_name,
        'avatar', pr.avatar_url, 'verification', pr.verification,
        'account_type', pr.account_type),
      'ma_reaction', (select r.type from public.reactions r
                       where r.post_id = p.id and r.user_id = (select auth.uid())),
      'enregistre', exists (select 1 from public.saves s
                             where s.post_id = p.id and s.user_id = (select auth.uid()))
    ) as x
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
    where p.status = 'published'
      and (p_curseur is null or p.created_at < p_curseur)
      and not exists (
        select 1 from public.blocks b
         where b.blocker_id = (select auth.uid()) and b.blocked_id = p.author_id)
    order by p.created_at desc, p.id desc
    limit least(greatest(p_limite, 1), 30)
  ) s;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. RLS
-- ────────────────────────────────────────────────────────────────────────────
alter table public.posts         enable row level security;
alter table public.reactions     enable row level security;
alter table public.comments      enable row level security;
alter table public.saves         enable row level security;
alter table public.follows       enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.reports       enable row level security;
alter table public.blocks        enable row level security;

drop policy if exists posts_lire   on public.posts;
drop policy if exists posts_creer  on public.posts;
drop policy if exists posts_gerer  on public.posts;
create policy posts_lire  on public.posts for select
  using (status = 'published' or author_id = (select auth.uid()) or public.is_staff());
create policy posts_creer on public.posts for insert
  with check (author_id = (select auth.uid()));
create policy posts_gerer on public.posts for all
  using (author_id = (select auth.uid()) or public.is_staff())
  with check (author_id = (select auth.uid()) or public.is_staff());

drop policy if exists reactions_lire on public.reactions;
drop policy if exists reactions_moi  on public.reactions;
create policy reactions_lire on public.reactions for select using (true);
create policy reactions_moi  on public.reactions for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists comments_lire on public.comments;
drop policy if exists comments_moi  on public.comments;
create policy comments_lire on public.comments for select
  using (status = 'published' or author_id = (select auth.uid()) or public.is_staff());
create policy comments_moi on public.comments for all
  using (author_id = (select auth.uid()) or public.is_staff())
  with check (author_id = (select auth.uid()));

drop policy if exists saves_moi on public.saves;
create policy saves_moi on public.saves for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists follows_lire on public.follows;
drop policy if exists follows_moi  on public.follows;
create policy follows_lire on public.follows for select using (true);
create policy follows_moi  on public.follows for all
  using (follower_id = (select auth.uid())) with check (follower_id = (select auth.uid()));

drop policy if exists notifications_moi on public.notifications;
create policy notifications_moi on public.notifications for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists conversations_participants on public.conversations;
create policy conversations_participants on public.conversations for select
  using (a_id = (select auth.uid()) or b_id = (select auth.uid()));

drop policy if exists messages_lire   on public.messages;
drop policy if exists messages_ecrire on public.messages;
create policy messages_lire on public.messages for select
  using (exists (select 1 from public.conversations c
                  where c.id = conv_id
                    and ((select auth.uid()) in (c.a_id, c.b_id))));
create policy messages_ecrire on public.messages for insert
  with check (sender_id = (select auth.uid())
              and exists (select 1 from public.conversations c
                           where c.id = conv_id
                             and ((select auth.uid()) in (c.a_id, c.b_id))));

drop policy if exists reports_creer on public.reports;
drop policy if exists reports_admin on public.reports;
create policy reports_creer on public.reports for insert
  with check (reporter_id = (select auth.uid()));
create policy reports_admin on public.reports for select using (public.is_staff());

drop policy if exists blocks_moi on public.blocks;
create policy blocks_moi on public.blocks for all
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- 12. PRIVILÈGES
-- ⚠ Rappel de la migration 0002 : fermer une fonction demande TROIS
--   révocations — PUBLIC, puis anon (privilèges par défaut de Supabase).
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.maj_posts_count()', 'public.maj_reactions()', 'public.maj_comments()',
    'public.maj_saves()', 'public.maj_follows()', 'public.maj_message()',
    'public.masquer_si_signale()',
    'public.notifier(uuid,text,text,text,jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

revoke execute on function public.get_feed(timestamptz, integer) from public;
revoke execute on function public.ouvrir_conversation(uuid)      from public;
grant  execute on function public.get_feed(timestamptz, integer) to anon, authenticated;
grant  execute on function public.ouvrir_conversation(uuid)      to authenticated;

-- Un visiteur non connecté peut LIRE le fil public, jamais écrire.
revoke insert, update, delete on public.posts, public.reactions, public.comments,
  public.saves, public.follows, public.notifications, public.conversations,
  public.messages, public.reports, public.blocks from anon;
revoke select on public.notifications, public.conversations, public.messages,
  public.saves, public.reports, public.blocks from anon;
