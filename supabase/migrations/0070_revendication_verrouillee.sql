-- ============================================================================
-- 0070 — ON NE PEUT PLUS S'AUTO-DÉLIVRER UN ÉTABLISSEMENT
--
-- 🔴 LA FAILLE. Toutes les règles de la revendication vivaient dans la RPC
--    `revendiquer_page()` : connexion requise, fiche existante, fiche SANS
--    propriétaire. Mais la table restait ouverte en écriture directe :
--
--      create policy page_claims_creer on public.page_claims for insert
--        with check (user_id = (select auth.uid()));
--
--    Une seule condition — « c'est bien moi qui demande ». Rien sur le statut,
--    rien sur la fiche. N'importe quel compte connecté pouvait donc écrire
--    directement dans la table, avec `statut = 'acceptee'`, sur une fiche
--    DÉJÀ possédée par quelqu'un d'autre. La RPC était une porte blindée à
--    côté d'une fenêtre ouverte.
--
-- ⚠ ON FERME L'ÉCRITURE DIRECTE PLUTÔT QUE D'AJOUTER DES CONDITIONS À LA
--   POLICY. Recopier les règles métier dans un `with check` les met à deux
--   endroits : elles divergeront. La RPC est SECURITY DEFINER, elle continue
--   d'écrire ; c'est le client qui perd le droit de le faire sans passer par elle.
--
-- ⚠ ET LA REVENDICATION DEVIENT RÉSERVÉE AUX PROFESSIONNELS. Le contrôle est en
--   BASE, pas seulement dans l'affichage du bouton : cacher un bouton n'a
--   jamais empêché un appel d'API.
-- ============================================================================

revoke insert, update, delete on public.page_claims from authenticated, anon;
drop policy if exists page_claims_creer on public.page_claims;

create or replace function public.revendiquer_page(p_page uuid, p_message text, p_tel text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_moi uuid := (select auth.uid()); v_prop uuid; v_existe boolean; v_type text; v_id uuid;
begin
  if v_moi is null then raise exception 'Connexion requise.'; end if;

  -- ⚠ EN BASE, PAS SEULEMENT DANS L'ECRAN. Le bouton est masque aux voyageurs,
  --   mais un bouton masque n'empeche aucun appel direct.
  select account_type into v_type from public.profiles where id = v_moi;
  if v_type is distinct from 'pro' then
    raise exception 'Seuls les comptes professionnels peuvent revendiquer un etablissement.';
  end if;

  select owner_id, true into v_prop, v_existe from public.pages where id = p_page;
  if v_existe is null then raise exception 'Cet etablissement n''existe pas.'; end if;
  if v_prop is not null then
    raise exception 'Cette fiche a deja un proprietaire. Ecrivez-nous si c''est une erreur.';
  end if;

  insert into public.page_claims (page_id, user_id, message, telephone)
  values (p_page, v_moi,
          nullif(btrim(coalesce(p_message,'')), ''),
          nullif(btrim(coalesce(p_tel,'')), ''))
  on conflict (page_id, user_id) do update
    set message = excluded.message,
        telephone = excluded.telephone,
        -- ⚠ Une nouvelle tentative REPART d'« en attente » : sans cela, une
        --   demande refusee puis modifiee garderait le statut « refusee ».
        statut = 'en_attente',
        created_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- ── L'ACCEPTATION, QUI N'EXISTAIT PAS ───────────────────────────────────────
--
-- 🔴 Rien ne transferait la propriete. Un administrateur pouvait passer une
--    demande a « acceptee » — et `pages.owner_id` restait NULL. La promesse du
--    produit (« le jour ou le proprietaire revendique son lieu, on le lui donne
--    et c'est lui qui le gerera ») n'etait tenue nulle part.
--
-- ⚠ LES DEUX ECRITURES SONT DANS LA MEME TRANSACTION. Accepter la demande sans
--   donner la fiche, ou l'inverse, laisse le systeme dans un etat illisible.
-- ⚠ ON REFUSE LES AUTRES DEMANDES SUR LA MEME FICHE : deux personnes peuvent
--   revendiquer le meme hotel, une seule peut l'obtenir.
create or replace function public.accepter_revendication(p_claim uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_page uuid; v_user uuid; v_prop uuid;
begin
  if not public.is_admin() then
    raise exception 'Reserve a l''administration.';
  end if;

  select page_id, user_id into v_page, v_user
    from public.page_claims where id = p_claim;
  if v_page is null then raise exception 'Demande introuvable.'; end if;

  select owner_id into v_prop from public.pages where id = v_page;
  if v_prop is not null then
    raise exception 'Cette fiche a deja un proprietaire.';
  end if;

  update public.pages set owner_id = v_user where id = v_page;

  update public.page_claims
     set statut = 'acceptee', traite_le = now()
   where id = p_claim;

  update public.page_claims
     set statut = 'refusee', traite_le = now()
   where page_id = v_page and id <> p_claim and statut = 'en_attente';
end $$;

-- ⚠ Les droits definitifs sont poses en 0071 (regle des trois revocations).
revoke all on function public.accepter_revendication(uuid) from public;
grant execute on function public.accepter_revendication(uuid) to authenticated;
