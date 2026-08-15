-- ============================================================================
-- 0036 — FERMETURE DE LA SURFACE D'ÉCRITURE
--
-- 🔴 TROIS FAILLES TROUVÉES PAR L'AUDIT DU 15/08/2026, TOUTES DE LA MÊME
--    FAMILLE : une policy RLS a été écrite en croyant qu'elle restreignait une
--    COLONNE. Elle ne le fait pas. PostgreSQL applique les policies à la LIGNE
--    entière ; seul un GRANT par colonne restreint une colonne.
--
--    C'est l'erreur la plus coûteuse du schéma, et elle est répétée. Le dépôt
--    connaît pourtant la bonne méthode : 0001:222-235 l'applique correctement
--    sur `profiles`… mais pour `anon` seulement. La check-list de 0002 ne
--    testait elle aussi qu'`anon` — c'est ce test à un seul rôle qui a laissé
--    passer la faille ① pendant tout le développement.
-- ============================================================================

/* ── ① `profiles.email` et `profiles.phone`, ouverts à tout membre connecté ──
   0001:222-235 révoque bien les colonnes sensibles, mais seulement pour `anon`.
   `authenticated` garde le GRANT de table par défaut, et la policy de lecture
   `profiles_read` est `using (true)`. Donc : n'importe quel inscrit lit
   l'e-mail et le téléphone de TOUS les autres, d'une seule requête.

   Aujourd'hui 1 membre, 1 e-mail. `handle_new_user` écrit `new.email` à chaque
   inscription : le trou grossit tout seul, et les inscriptions sont ouvertes.

   ⚠ ON ÉNUMÈRE LES COLONNES AUTORISÉES, on ne révoque pas colonne par colonne.
     Une colonne ajoutée plus tard serait sinon lisible par défaut — et c'est
     exactement ainsi que cette faille est née.                              */
do $$
declare
  autorisees text[] := array[
    'id','display_name','avatar_url','cover_url','bio','home_place',
    'account_type','verification','language','followers_count',
    'following_count','posts_count','created_at','updated_at'
  ];
  c text;
begin
  revoke select on public.profiles from authenticated;
  foreach c in array autorisees loop
    -- `if exists` : la boucle doit survivre au renommage d'une colonne.
    if exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='profiles' and column_name=c) then
      execute format('grant select (%I) on public.profiles to authenticated', c);
    end if;
  end loop;
end $$;

/* Chacun doit pouvoir relire SES propres coordonnées : sans cela, l'écran de
   compte ne peut plus afficher l'e-mail de la personne connectée. */
create or replace function public.mon_profil()
returns table (id uuid, display_name text, email text, phone text,
               avatar_url text, account_type text, verification text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.email, p.phone,
         p.avatar_url, p.account_type, p.verification
    from public.profiles p
   where p.id = (select auth.uid());
$$;
revoke execute on function public.mon_profil() from public, anon;
grant  execute on function public.mon_profil() to authenticated;

/* ── ② Le destinataire d'un message peut RÉÉCRIRE le message reçu ───────────
   `messages_marquer_lu` (0021:37-53) autorise l'UPDATE dès qu'on est
   participant de la conversation et qu'on n'est pas l'expéditeur. L'intention
   était « il peut marquer comme lu ». La réalité : il peut réécrire `body` et
   même réattribuer `sender_id`.

   Scénario : Alice écrit « je te dois 50 000 Ar ». Bob exécute
     supabase.from('messages').update({ body: 'je te dois 5 000 000 Ar' })
   La ligne passe. Sur un produit qui met en relation des voyageurs et des
   hôteliers autour d'argent, c'est une falsification de preuve.

   ⚠ AUCUNE RÉGRESSION : le client n'émet jamais d'UPDATE direct sur
     `messages`. Il passe par la RPC `marquer_conversation_lue` (SECURITY
     DEFINER, useChatLive.ts:71 et :97), qui ne touche que `read`.           */
drop policy if exists messages_marquer_lu on public.messages;
revoke update on public.messages from authenticated, anon;

/* ── ③ Le gérant peut réécrire la demande qu'il reçoit ──────────────────────
   `bookings_maj_pro` (0033) devait dire « le pro fait avancer le statut ». Il
   peut en fait réécrire `contact_phone`, `message`, et jusqu'à `user_id`.
   Aucun écran ne s'en sert encore — on ferme AVANT de brancher, pas après. */
drop policy if exists bookings_maj_pro on public.bookings;
revoke update on public.bookings from authenticated, anon;

create or replace function public.booking_avancer(p_id uuid, p_statut text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_page uuid;
begin
  if p_statut not in ('vue','repondue','confirmee','honoree','annulee') then
    raise exception 'Statut inconnu.' using errcode = 'check_violation';
  end if;
  select page_id into v_page from public.bookings where id = p_id;
  if v_page is null then raise exception 'Demande introuvable.'; end if;
  if not exists (select 1 from public.pages p
                  where p.id = v_page and p.owner_id = (select auth.uid())) then
    raise exception 'Cette demande ne vous est pas adressée.';
  end if;
  update public.bookings
     set status = p_statut,
         -- La première réponse est MESURÉE, jamais déclarée : c'est elle qui
         -- alimentera « répond en N heures » sur la page publique.
         first_reply_at = coalesce(first_reply_at,
                                   case when p_statut = 'repondue' then now() end)
   where id = p_id;
  return p_statut;
end $$;
revoke execute on function public.booking_avancer(uuid, text) from public, anon;
grant  execute on function public.booking_avancer(uuid, text) to authenticated;

/* ── ④ `website` et `facebook` peuvent porter un `javascript:` ──────────────
   `PagePro.tsx` rend ces deux champs en `href` brut, `ProConsole` ne fait
   qu'un `.trim()`, et le site n'a aucune CSP. N'importe qui peut créer une
   fiche publiée. Les `rel="noopener"` limitent le risque sur un navigateur de
   bureau, mais les webviews Facebook et Messenger — le canal d'acquisition du
   produit — aplatissent `target="_blank"` dans la même origine.
   On ferme en base : c'est le seul endroit que personne ne contourne.      */
update public.pages set website  = null where website  is not null and website  !~* '^https?://';
update public.pages set facebook = null where facebook is not null and facebook !~* '^https?://';

alter table public.pages drop constraint if exists pages_website_http;
alter table public.pages add constraint pages_website_http
  check (website is null or website ~* '^https?://') not valid;
alter table public.pages validate constraint pages_website_http;

alter table public.pages drop constraint if exists pages_facebook_http;
alter table public.pages add constraint pages_facebook_http
  check (facebook is null or facebook ~* '^https?://') not valid;
alter table public.pages validate constraint pages_facebook_http;
