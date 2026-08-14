-- ============================================================================
-- 0021 — LA MESSAGERIE FONCTIONNE VRAIMENT
--
-- ⚠ DEUX DÉFAUTS TROUVÉS EN VOULANT LA RENDRE « COMME MESSENGER ».
--
--  ① LE TEMPS RÉEL N'ÉTAIT PAS BRANCHÉ. La page ouvrait bien un canal
--    `postgres_changes` sur `messages`, et le code avait l'air juste — mais la
--    publication `supabase_realtime` ne contenait AUCUNE table. Le canal
--    s'abonnait sans jamais rien recevoir : un message n'apparaissait qu'au
--    rechargement de la page. Aucune erreur, aucun symptôme visible dans le
--    code : juste un site qui se comportait comme s'il n'avait pas de temps
--    réel.
--
--  ② PERSONNE NE POUVAIT MARQUER UN MESSAGE COMME LU. Il n'existait aucune
--    policy UPDATE sur `messages` : la colonne `read` était morte. L'audit
--    l'avait relevé comme « structurellement impossible » — c'était exact.
--
-- ⚠ RAPPEL DE LA RÈGLE D'EGRESS DU PROJET : le temps réel est réservé au CHAT
--   et aux NOTIFICATIONS. Sur le projet frère, 17 canaux ouverts ont produit
--   environ 6 Go par mois de battements de cœur sur un quota gratuit de 2 Go.
--   On n'ajoute donc QUE ces deux tables à la publication, et le client
--   n'ouvre un canal que pendant qu'une conversation est affichée.
-- ============================================================================

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;

-- REPLICA IDENTITY FULL : sans elle, un UPDATE ne transporte que les colonnes
-- de la clé primaire, et le client ne verrait jamais passer le changement de
-- `read`. C'est exactement le genre de détail qui fait qu'« il ne se passe
-- rien » sans qu'aucune erreur ne soit levée.
alter table public.messages replica identity full;

-- Le DESTINATAIRE marque comme lu — jamais l'expéditeur, qui ne doit pas
-- pouvoir se déclarer lu tout seul.
drop policy if exists messages_marquer_lu on public.messages;
create policy messages_marquer_lu on public.messages for update
  using (
    sender_id <> (select auth.uid())
    and exists (
      select 1 from public.conversations c
       where c.id = messages.conv_id
         and ((select auth.uid()) = c.a_id or (select auth.uid()) = c.b_id)
    )
  )
  with check (
    sender_id <> (select auth.uid())
    and exists (
      select 1 from public.conversations c
       where c.id = messages.conv_id
         and ((select auth.uid()) = c.a_id or (select auth.uid()) = c.b_id)
    )
  );

-- Marquer toute une conversation en UN appel : ouvrir une conversation de
-- cinquante messages ne doit pas produire cinquante requêtes.
create or replace function public.marquer_conversation_lue(p_conv uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_moi uuid := (select auth.uid()); v_n integer;
begin
  if v_moi is null then return 0; end if;
  if not exists (
    select 1 from public.conversations c
     where c.id = p_conv and (c.a_id = v_moi or c.b_id = v_moi)
  ) then
    raise exception 'Cette conversation n''est pas la votre.';
  end if;

  with m as (
    update public.messages set read = true
     where conv_id = p_conv and sender_id <> v_moi and read = false
     returning 1
  ) select count(*)::int into v_n from m;
  return v_n;
end $$;

-- Le compteur de non-lus, en un appel plutôt qu'un parcours côté client.
create or replace function public.messages_non_lus()
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.messages m
    join public.conversations c on c.id = m.conv_id
   where m.read = false
     and m.sender_id <> (select auth.uid())
     and ((select auth.uid()) = c.a_id or (select auth.uid()) = c.b_id)
$$;

revoke execute on function public.marquer_conversation_lue(uuid) from public, anon, authenticated;
revoke execute on function public.messages_non_lus()             from public, anon, authenticated;
grant  execute on function public.marquer_conversation_lue(uuid) to authenticated;
grant  execute on function public.messages_non_lus()             to authenticated;
