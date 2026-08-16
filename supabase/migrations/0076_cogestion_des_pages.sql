-- ============================================================================
-- 0076 — UN SEUL PROPRIÉTAIRE, PLUSIEURS GESTIONNAIRES
--
-- Demande du propriétaire : « un seul propriétaire par page, mais la gestion
-- peut se faire à plusieurs », et « une même personne peut gérer un hôtel et un
-- restaurant si c'est le même propriétaire ».
--
-- ⚠ ON PASSE PAR `page_a_moi()`, ET C'EST TOUT L'INTÉRÊT. Vingt-neuf policies
--   l'appellent déjà — chambres, carte, activités, circuits, demandes, réponses
--   aux avis. L'étendre donne aux gestionnaires exactement les mêmes droits
--   d'exploitation, d'un seul geste. Recopier une condition dans 29 policies
--   aurait garanti d'en oublier une, et une policy oubliée est un trou.
--
-- ⚠ LA PROPRIÉTÉ NE PASSE PAS PAR LÀ. `pages_gerer` teste `owner_id` en clair,
--   pas `page_a_moi` : un gestionnaire n'hérite donc PAS du droit de modifier
--   la fiche elle-même. On le lui donne explicitement ci-dessous — mais avec
--   `owner_id` gelé, sinon un gestionnaire pourrait s'attribuer la page ou en
--   évincer le propriétaire. C'est la seule escalade que ce modèle doit rendre
--   impossible.
--
-- ⚠ ON INVITE PAR IDENTIFIANT DE COMPTE, PAS PAR E-MAIL. Inviter une adresse
--   qui n'a pas encore de compte obligerait à stocker un e-mail en clair dans
--   une table lisible par le propriétaire, et à faire confiance à une chaîne
--   saisie à la main. La personne crée son compte, donne son nom, le
--   propriétaire la trouve. Un tour de plus, aucune donnée personnelle exposée.
-- ============================================================================

create table if not exists public.page_gestionnaires (
  page_id    uuid not null references public.pages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  ajoute_par uuid references public.profiles(id),
  ajoute_le  timestamptz not null default now(),
  primary key (page_id, user_id)
);

comment on table public.page_gestionnaires is
  'Co-gestion. Le proprietaire (pages.owner_id) reste unique et n''est PAS liste ici : il gere de droit.';

alter table public.page_gestionnaires enable row level security;

-- ⚠ Qui voit la liste : le propriétaire, et les gestionnaires eux-mêmes.
--   Un visiteur n'a pas à savoir qui gère quoi.
create policy pg_lecture on public.page_gestionnaires for select
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.pages g
                where g.id = page_id and g.owner_id = (select auth.uid()))
    or public.is_staff()
  );

-- ⚠ SEUL LE PROPRIÉTAIRE NOMME ET RÉVOQUE. Laisser un gestionnaire en nommer
--   d'autres ouvre une chaîne que le propriétaire ne contrôle plus.
create policy pg_proprietaire on public.page_gestionnaires for all
  using (exists (select 1 from public.pages g
                  where g.id = page_id and g.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.pages g
                       where g.id = page_id and g.owner_id = (select auth.uid())));

-- ⚠ Un gestionnaire peut se RETIRER lui-même : personne ne doit rester
--   responsable d'un établissement contre son gré.
create policy pg_se_retirer on public.page_gestionnaires for delete
  using (user_id = (select auth.uid()));

create index if not exists page_gestionnaires_user_idx
  on public.page_gestionnaires (user_id);

-- ── Le pivot : 29 policies changent de sens en une fonction ─────────────────
create or replace function public.page_a_moi(p uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.pages
                  where id = p and owner_id = (select auth.uid()))
      or exists (select 1 from public.page_gestionnaires
                  where page_id = p and user_id = (select auth.uid()));
$$;

-- ── La fiche elle-même : éditable par un gestionnaire, jamais cessible ──────
drop policy if exists pages_gerer on public.pages;
create policy pages_gerer on public.pages for update
  using (public.page_a_moi(id) or public.is_admin())
  with check (public.page_a_moi(id) or public.is_admin());

create or replace function public.pages_avant_ecriture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_score smallint := 0;
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and not public.is_admin() then
    new.verification_status := old.verification_status;
    new.rating_avg   := old.rating_avg;
    new.rating_count := old.rating_count;
    new.views_count  := old.views_count;
    -- 🔴 LA PROPRIÉTÉ NE SE CÈDE PAS DEPUIS L'ÉCRAN. Sans ce gel, un
    --    gestionnaire — qui peut désormais modifier la fiche — n'aurait qu'à
    --    écrire son propre identifiant dans `owner_id` pour évincer celui qui
    --    l'a nommé. C'est la seule escalade que la co-gestion doit rendre
    --    impossible, et elle se ferme ici, pas dans l'interface.
    new.owner_id := old.owner_id;
    if pg_trigger_depth() <= 1 then
      new.is_published     := old.is_published;
      new.price_min_ar     := old.price_min_ar;
      new.price_min_unit   := old.price_min_unit;
      new.rates_checked_at := old.rates_checked_at;
    end if;
  elsif tg_op = 'INSERT' and not public.is_admin() then
    new.verification_status := 'none';
    new.rating_avg := 0; new.rating_count := 0; new.views_count := 0;
    new.price_min_ar := null; new.price_min_unit := null; new.rates_checked_at := null;
    new.is_published := false;
  end if;

  if coalesce(length(new.short_desc), 0) > 20 then v_score := v_score + 10; end if;
  if coalesce(length(new.long_desc), 0)  > 80 then v_score := v_score + 10; end if;
  if new.place_id  is not null then v_score := v_score + 15; end if;
  if new.cover_url is not null then v_score := v_score + 15; end if;
  if coalesce(new.phone, new.whatsapp) is not null then v_score := v_score + 15; end if;
  if jsonb_array_length(coalesce(new.gallery, '[]'::jsonb)) >= 3 then v_score := v_score + 10; end if;
  if tg_op = 'UPDATE' and (
       exists (select 1 from public.room_types where page_id = new.id)
    or exists (select 1 from public.menu_items where page_id = new.id)
    or exists (select 1 from public.activities where page_id = new.id)
    or exists (select 1 from public.tours      where page_id = new.id)
  ) then v_score := v_score + 25; end if;

  new.completeness := v_score;
  return new;
end $$;

-- ── Ce que « mes établissements » doit rendre : possédés ET gérés ──────────
create or replace function public.mes_etablissements()
returns table (id uuid, slug text, name text, categories text[], cover_url text,
               is_published boolean, completeness smallint, mon_role text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select g.id, g.slug, g.name, g.categories, g.cover_url,
         g.is_published, g.completeness,
         case when g.owner_id = (select auth.uid()) then 'proprietaire'
              else 'gestionnaire' end
    from public.pages g
   where g.owner_id = (select auth.uid())
      or exists (select 1 from public.page_gestionnaires m
                  where m.page_id = g.id and m.user_id = (select auth.uid()))
   order by g.name;
$$;

revoke all on function public.mes_etablissements() from public, anon;
grant execute on function public.mes_etablissements() to authenticated;;
