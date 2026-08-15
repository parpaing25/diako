-- ============================================================================
-- 0069 — LE TYPE DE COMPTE N'EST PLUS LIBREMENT MODIFIABLE
--
-- 🔴 LA PROTECTION ÉTAIT ANNONCÉE MAIS PAS ÉCRITE. Le commentaire de
--    `prevent_profile_escalation` (migration 0001) dit : « Un membre ne peut ni
--    s'auto-vérifier, ni changer son type de compte en douce vers un statut à
--    valeur commerciale. » Le corps ne testait QUE `verification`. N'importe
--    quel compte pouvait donc passer `account_type` à `pro` par un simple
--    UPDATE, `authenticated` ayant le droit d'écriture sur la colonne.
--
--    Ça n'avait pas de conséquence tant que rien ne dépendait du type. Ça en a
--    une maintenant : le bouton de revendication est réservé aux
--    professionnels, et la revendication mène à la PROPRIÉTÉ d'un établissement.
--    Un verrou décoratif devant une porte qui donne sur 3 254 fiches sans
--    propriétaire n'est pas un verrou.
--
-- ⚠ ON N'INTERDIT PAS DE DEVENIR PRO — ce serait absurde, c'est le parcours
--   normal. On interdit de le faire EN SILENCE par un UPDATE direct : le
--   passage se fait par `devenir_pro()`, qui impose un métier. La différence
--   est la traçabilité, pas la permission.
--
-- ⚠ LE RETOUR EN ARRIÈRE RESTE LIBRE. Repasser de `pro` à `voyageur` ne donne
--   aucun droit : le refuser enfermerait quelqu'un qui s'est trompé au moment
--   de l'inscription.
-- ============================================================================

alter table public.profiles add column if not exists metier_pro text;
alter table public.profiles drop constraint if exists profiles_metier_pro_check;
alter table public.profiles add constraint profiles_metier_pro_check
  check (metier_pro is null or metier_pro = any (array[
    'hotellerie','restauration','guide','agence','transport','artisanat','autre'
  ]));

comment on column public.profiles.metier_pro is
  'Metier declare par le professionnel. NULL pour un voyageur. Declaratif : il n''ouvre aucun droit a lui seul, seule une revendication acceptee donne la propriete d''une fiche.';

create or replace function public.prevent_profile_escalation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if public.is_admin() then return new; end if;

  if new.verification is distinct from old.verification then
    raise exception 'Le statut de verification ne peut pas etre modifie ici.';
  end if;

  -- 🔴 CE TEST MANQUAIT. Passer a `pro` doit se faire par `devenir_pro()`, qui
  --    exige un metier. Le retour a `voyageur` reste libre : il ne donne
  --    aucun droit.
  if new.account_type is distinct from old.account_type
     and new.account_type = 'pro' then
    raise exception 'Utilisez devenir_pro() pour declarer un compte professionnel.';
  end if;

  -- ⚠ LES COMPTEURS SONT TENUS PAR DES DECLENCHEURS, PAS PAR LEUR PROPRIETAIRE.
  --   `authenticated` avait le droit d'ecrire posts_count, followers_count et
  --   following_count : n'importe qui pouvait s'afficher 900 abonnes.
  if new.followers_count is distinct from old.followers_count
     or new.following_count is distinct from old.following_count
     or new.posts_count   is distinct from old.posts_count then
    raise exception 'Les compteurs ne se modifient pas a la main.';
  end if;

  return new;
end $$;

-- ── Le seul chemin vers « pro » ─────────────────────────────────────────────
create or replace function public.devenir_pro(p_metier text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_moi uuid := (select auth.uid());
begin
  if v_moi is null then raise exception 'Connexion requise.'; end if;
  if p_metier is null or p_metier not in
     ('hotellerie','restauration','guide','agence','transport','artisanat','autre') then
    raise exception 'Metier inconnu.';
  end if;

  -- ⚠ `verification` N'EST PAS TOUCHÉ. Se déclarer professionnel ne vérifie
  --   rien : c'est une déclaration, pas un badge. Le badge vient d'une
  --   revendication acceptée, examinée à la main.
  update public.profiles
     set account_type = 'pro', metier_pro = p_metier
   where id = v_moi;
end $$;

-- ⚠ Les droits definitifs sont poses en 0071 (regle des trois revocations).
revoke all on function public.devenir_pro(text) from public;
grant execute on function public.devenir_pro(text) to authenticated;
